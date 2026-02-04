# backend/services/autopilot_agent.py
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional, Literal
from datetime import datetime, timezone, timedelta
import math

KST = timezone(timedelta(hours=9))

def _safe_float(x, default=0.0) -> float:
    try:
        if x is None: return default
        if isinstance(x, (int, float)): return float(x)
        s = str(x).strip()
        return float(s) if s else default
    except:
        return default

def _parse_yyyymmddhhmmss(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    s = str(s).strip()
    if len(s) != 14 or not s.isdigit():
        return None
    try:
        dt = datetime.strptime(s, "%Y%m%d%H%M%S")
        return dt.replace(tzinfo=KST)
    except:
        return None

def _haversine_km(lat1, lon1, lat2, lon2) -> float:
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2 * R * math.asin(math.sqrt(a))

ActionType = Literal["REMOTE_DIAG", "REMOTE_RESET", "DISPATCH", "ESCALATE", "MONITOR", "OPEN_CASE"]

class AutopilotRequest(BaseModel):
    topN: int = Field(50, ge=1, le=500)

    # ✅ 자동 실행 대상 제한
    autoTopK: int = Field(10, ge=0, le=200)     # TopN 중 실제 자동 플랜 생성(및 실행 대상) K
    minDownMinutes: int = Field(30, ge=0, le=7*24*60)

    # ✅ 자동 액션 레벨
    # safe  : REMOTE_DIAG/RESET까지만 자동(추천)
    # assist: DISPATCH는 "제안"만, 자동 실행은 하지 않음
    autoLevel: Literal["safe", "assist"] = "safe"

    # ✅ 가중치(우선순위 점수)
    w_duration: float = 0.45
    w_prob: float = 0.35
    w_congestion: float = 0.15
    w_importance: float = 0.05

    useTraffic: bool = True
    statusCodes: List[int] = Field(default_factory=lambda: [4, 5])

    # ✅ 작업 거점(동선/ETA 근사용)
    baseLat: float = 37.5665
    baseLon: float = 126.9780
    slaMinutes: int = 90

    # ✅ 원격복구 확률(테스트용)
    remoteRecoveryRate: float = 0.35

class AutopilotPlanItem(BaseModel):
    action: ActionType
    priority: int
    eta_min: Optional[int] = None
    reason: str

class AutopilotCase(BaseModel):
    stationId: str
    chargerId: str
    name: str
    score: float
    downMinutes: Optional[int] = None
    statusCode: int = 9
    downProb6h: float = 0.0
    trafficCongestion: float = 0.0
    outputKw: float = 0.0
    plan: List[AutopilotPlanItem] = []
    reasons: List[str] = []

class AutopilotResponse(BaseModel):
    totalCandidates: int
    pickedK: int
    cases: List[AutopilotCase]

def _priority_score(t: Dict[str, Any], req: AutopilotRequest, now: datetime) -> Optional[Dict[str, Any]]:
    sig = t.get("signals", {}) or {}
    der = t.get("derived", {}) or {}
    meta = t.get("meta", {}) or {}

    status_code = int(_safe_float(sig.get("statusCode"), 9))
    health = der.get("health")

    is_down = (status_code in req.statusCodes) or (health == "DOWN")
    if not is_down:
        return None

    upd = _parse_yyyymmddhhmmss(sig.get("statUpdDt"))
    down_min = None
    if upd:
        down_min = max(0, int((now - upd).total_seconds() // 60))
        if down_min < req.minDownMinutes:
            return None

    prob = _safe_float(der.get("downProb6h"), 0.0)
    cong = _safe_float(sig.get("trafficCongestion"), 0.0) if req.useTraffic else 0.0
    output_kw = _safe_float(meta.get("output"), 0.0)

    dur_norm = 0.0
    if down_min is not None:
        dur_norm = min(1.0, down_min / (24 * 60))
    prob_norm = max(0.0, min(1.0, prob))
    cong_norm = max(0.0, min(1.0, cong))
    imp_norm = max(0.0, min(1.0, output_kw / 100.0))

    score = (
        req.w_duration * dur_norm
        + req.w_prob * prob_norm
        + req.w_congestion * cong_norm
        + req.w_importance * imp_norm
    )

    reasons = []
    if down_min is not None:
        reasons.append(f"장애 지속 {down_min}분")
    reasons.append(f"downProb6h {prob_norm:.3f}")
    if req.useTraffic:
        reasons.append(f"혼잡도 {cong_norm:.3f}")
    if output_kw:
        reasons.append(f"출력 {output_kw:g}kW")

    return {
        "t": t,
        "score": float(round(score, 6)),
        "downMinutes": down_min,
        "statusCode": status_code,
        "downProb6h": float(round(prob_norm, 3)),
        "trafficCongestion": float(round(cong_norm, 3)),
        "outputKw": float(output_kw),
        "reasons": reasons,
    }

def _make_plan(item: Dict[str, Any], req: AutopilotRequest) -> List[AutopilotPlanItem]:
    t = item["t"]
    lat = _safe_float(t.get("lat"), 0.0)
    lon = _safe_float(t.get("lon"), 0.0)

    dist_km = _haversine_km(req.baseLat, req.baseLon, lat, lon)
    # ETA 근사(테스트): 30km/h 기준 + 혼잡도 가중
    cong = float(item.get("trafficCongestion", 0.0))
    eta_min = int((dist_km / 30.0) * 60.0 * (1.0 + 0.6 * cong))

    status_code = int(item.get("statusCode", 9))
    prob = float(item.get("downProb6h", 0.0))
    down_min = item.get("downMinutes")

    plan: List[AutopilotPlanItem] = []

    # 1) 케이스 오픈(항상)
    plan.append(AutopilotPlanItem(action="OPEN_CASE", priority=1, eta_min=None, reason="장애 후보 자동 케이스 생성"))

    # 2) 원격 진단/리셋(안전 자동)
    plan.append(AutopilotPlanItem(action="REMOTE_DIAG", priority=2, eta_min=None, reason="원격 진단으로 통신/상태 확인"))
    plan.append(AutopilotPlanItem(action="REMOTE_RESET", priority=3, eta_min=None, reason="원격 리셋 시도(저위험 자동)"))

    # 3) 출동/에스컬레이션은 자동 실행하지 않음(assist일 때도 '제안'만)
    if status_code in (4, 5) or (prob >= 0.8) or (down_min is not None and down_min >= 6 * 60):
        if eta_min <= req.slaMinutes:
            plan.append(AutopilotPlanItem(action="DISPATCH", priority=4, eta_min=eta_min, reason="SLA 내 출동 가능(제안)"))
        else:
            plan.append(AutopilotPlanItem(action="ESCALATE", priority=4, eta_min=eta_min, reason="SLA 초과 예상 → 상위 담당 에스컬레이션(제안)"))
    else:
        plan.append(AutopilotPlanItem(action="MONITOR", priority=4, eta_min=None, reason="현재는 모니터링 강화(제안)"))

    # safe 레벨이면 DISPATCH/ESCALATE는 '제안'으로만 남기고 실행은 안 한다는 의미(여기선 실행 로직 자체가 없음)
    return plan

def run_autopilot(twins: List[Dict[str, Any]], req: AutopilotRequest) -> AutopilotResponse:
    now = datetime.now(KST)

    scored = []
    for t in twins:
        it = _priority_score(t, req, now)
        if it:
            scored.append(it)

    scored.sort(key=lambda x: x["score"], reverse=True)

    picked = scored[: max(0, min(req.autoTopK, len(scored)))]
    cases: List[AutopilotCase] = []

    for it in picked:
        t = it["t"]
        plan = _make_plan(it, req)

        cases.append(
            AutopilotCase(
                stationId=t.get("stationId", ""),
                chargerId=t.get("chargerId", ""),
                name=t.get("name", ""),
                score=it["score"],
                downMinutes=it.get("downMinutes"),
                statusCode=it.get("statusCode", 9),
                downProb6h=it.get("downProb6h", 0.0),
                trafficCongestion=it.get("trafficCongestion", 0.0),
                outputKw=it.get("outputKw", 0.0),
                plan=plan,
                reasons=it.get("reasons", []),
            )
        )

    return AutopilotResponse(
        totalCandidates=len(scored),
        pickedK=len(cases),
        cases=cases,
    )
