# backend/services/fleet_agent.py
from typing import List, Optional, Dict, Any, Literal
from pydantic import BaseModel, Field
from datetime import datetime, timedelta, timezone
import math
import os
import json

# ========= time / utils =========
KST = timezone(timedelta(hours=9))

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

def _safe_float(x, default=0.0) -> float:
    try:
        if x is None:
            return default
        if isinstance(x, (int, float)):
            return float(x)
        s = str(x).strip()
        return float(s) if s else default
    except:
        return default

def _haversine_km(lat1, lon1, lat2, lon2) -> float:
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2 * R * math.asin(math.sqrt(a))

# ========= LLM helper =========
def _strip_code_fences(s: str) -> str:
    s = (s or "").strip()
    if s.startswith("```"):
        first_nl = s.find("\n")
        if first_nl != -1:
            s = s[first_nl + 1 :]
        if s.endswith("```"):
            s = s[:-3]
    return s.strip()

def _extract_json_object(s: str) -> str:
    s = _strip_code_fences(s)
    start = s.find("{")
    end = s.rfind("}")
    if start != -1 and end != -1 and end > start:
        return s[start : end + 1]
    return s

def _llm_explain_fleet(payload: Dict[str, Any]) -> Dict[str, Any]:
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        return {"note": "OPENAI_API_KEY missing"}

    try:
        from openai import OpenAI
        client = OpenAI(api_key=key)
    except Exception as e:
        return {"note": "openai_import_or_client_error", "error": str(e)}

    system = (
        "너는 전기차 충전소 관제 책임자다. "
        "입력된 '장애 후보 Top 리스트'를 보고 오늘의 처리 우선순위 전략을 제안한다. "
        "반드시 아래 JSON만 출력(코드블록/설명 금지): "
        "{"
        "\"summary\": string, "
        "\"top_reasons\": [string], "
        "\"risks\": [string], "
        "\"suggested_groups\": ["
        "  {\"name\": string, \"hint\": string, \"items\": [string]}"
        "]"
        "}"
    )

    resp = client.responses.create(
        model="gpt-4o-mini",
        input=[
            {"role": "system", "content": system},
            {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
        ],
    )

    text = getattr(resp, "output_text", None)
    if not text:
        try:
            text = resp.output[0].content[0].text
        except Exception:
            return {"note": "cannot_extract_llm_text", "raw": str(resp)}

    try:
        clean = _extract_json_object(text)
        return json.loads(clean)
    except Exception:
        return {"note": "llm_not_json", "raw": text}

# ========= Models =========
class FleetPrioritizeRequest(BaseModel):
    topN: int = Field(50, ge=1, le=500)
    statusCodes: List[int] = Field(default_factory=lambda: [4, 5])
    minDownMinutes: int = Field(0, ge=0, le=7 * 24 * 60)

    w_duration: float = 0.45
    w_prob: float = 0.35
    w_congestion: float = 0.15
    w_importance: float = 0.05

    useTraffic: bool = True
    nowTs: Optional[str] = None  # YYYYMMDDHHMMSS (테스트용)

    # ✅ LLM
    useLLM: bool = False
    llmTopK: int = 20  # LLM에 넘길 상위 K개만(토큰 절약)

class FleetPrioritizeItem(BaseModel):
    stationId: str
    chargerId: str
    name: str
    lat: float
    lon: float
    score: float

    downMinutes: Optional[int] = None
    downProb6h: float = 0.0
    statusCode: int = 9
    trafficCongestion: float = 0.0
    outputKw: float = 0.0
    reasons: List[str] = []

class FleetPrioritizeResponse(BaseModel):
    topN: int
    totalCandidates: int
    items: List[FleetPrioritizeItem]
    llm: Optional[Dict[str, Any]] = None

class FleetRouteRequest(BaseModel):
    items: List[FleetPrioritizeItem]
    baseLat: float
    baseLon: float
    congestionAlpha: float = 0.4

    # ✅ LLM
    useLLM: bool = False

class FleetRouteStep(BaseModel):
    idx: int
    stationId: str
    chargerId: str
    name: str
    lat: float
    lon: float
    score: float
    eta_like_km: float
    trafficCongestion: float = 0.0

class FleetRouteResponse(BaseModel):
    totalKm: float
    steps: List[FleetRouteStep]
    llm: Optional[Dict[str, Any]] = None

# ========= Logic =========
def prioritize_fleet(twins: List[Dict[str, Any]], req: FleetPrioritizeRequest) -> FleetPrioritizeResponse:
    now = _parse_yyyymmddhhmmss(req.nowTs) if req.nowTs else datetime.now(KST)

    candidates: List[FleetPrioritizeItem] = []

    for t in twins:
        sig = t.get("signals", {}) or {}
        der = t.get("derived", {}) or {}
        meta = t.get("meta", {}) or {}

        status_code = int(_safe_float(sig.get("statusCode"), 9))
        health = der.get("health")

        is_down = (status_code in req.statusCodes) or (health == "DOWN")
        if not is_down:
            continue

        upd = _parse_yyyymmddhhmmss(sig.get("statUpdDt"))
        down_min = None
        if upd:
            down_min = max(0, int((now - upd).total_seconds() // 60))
            if down_min < req.minDownMinutes:
                continue

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

        candidates.append(
            FleetPrioritizeItem(
                stationId=t.get("stationId", ""),
                chargerId=t.get("chargerId", ""),
                name=t.get("name", ""),
                lat=_safe_float(t.get("lat"), 0.0),
                lon=_safe_float(t.get("lon"), 0.0),
                score=round(float(score), 6),
                downMinutes=down_min,
                downProb6h=round(float(prob_norm), 3),
                statusCode=status_code,
                trafficCongestion=round(float(cong_norm), 3),
                outputKw=float(output_kw),
                reasons=reasons,
            )
        )

    candidates.sort(key=lambda x: x.score, reverse=True)
    items = candidates[: req.topN]

    resp = FleetPrioritizeResponse(
        topN=req.topN,
        totalCandidates=len(candidates),
        items=items,
        llm=None,
    )

    if req.useLLM and items:
        topk = items[: max(1, min(req.llmTopK, len(items)))]
        compact = {
            "now": now.isoformat(),
            "weights": {
                "w_duration": req.w_duration,
                "w_prob": req.w_prob,
                "w_congestion": req.w_congestion,
                "w_importance": req.w_importance,
            },
            "totalCandidates": len(candidates),
            "top": [
                {
                    "id": f'{x.stationId}/{x.chargerId}',
                    "name": x.name,
                    "score": x.score,
                    "downMinutes": x.downMinutes,
                    "downProb6h": x.downProb6h,
                    "trafficCongestion": x.trafficCongestion,
                    "outputKw": x.outputKw,
                    "zscode": None,  # 필요하면 t에서 꺼내 넣어도 됨
                }
                for x in topk
            ],
        }
        resp.llm = _llm_explain_fleet(compact)

    return resp

def plan_route(req: FleetRouteRequest) -> FleetRouteResponse:
    remaining = [i.model_dump() for i in req.items]
    cur_lat, cur_lon = req.baseLat, req.baseLon

    steps: List[FleetRouteStep] = []
    total_km = 0.0

    for k in range(len(remaining)):
        best_j = None
        best_cost = None
        best_dist = None

        for j, it in enumerate(remaining):
            d = _haversine_km(cur_lat, cur_lon, it["lat"], it["lon"])
            cong = float(it.get("trafficCongestion", 0.0))
            cost = d * (1.0 + req.congestionAlpha * cong)

            if best_cost is None or cost < best_cost:
                best_cost = cost
                best_j = j
                best_dist = d

        pick = remaining.pop(best_j)
        total_km += float(best_dist)

        steps.append(
            FleetRouteStep(
                idx=k + 1,
                stationId=pick["stationId"],
                chargerId=pick["chargerId"],
                name=pick["name"],
                lat=float(pick["lat"]),
                lon=float(pick["lon"]),
                score=float(pick["score"]),
                eta_like_km=round(float(best_dist), 3),
                trafficCongestion=float(pick.get("trafficCongestion", 0.0)),
            )
        )

        cur_lat, cur_lon = float(pick["lat"]), float(pick["lon"])

    resp = FleetRouteResponse(totalKm=round(total_km, 3), steps=steps, llm=None)

    if req.useLLM and steps:
        compact = {
            "base": {"lat": req.baseLat, "lon": req.baseLon},
            "congestionAlpha": req.congestionAlpha,
            "totalKm": resp.totalKm,
            "steps": [
                {
                    "idx": s.idx,
                    "id": f"{s.stationId}/{s.chargerId}",
                    "name": s.name,
                    "eta_like_km": s.eta_like_km,
                    "trafficCongestion": s.trafficCongestion,
                }
                for s in steps[:30]
            ],
        }
        resp.llm = _llm_explain_fleet(compact)

    return resp
