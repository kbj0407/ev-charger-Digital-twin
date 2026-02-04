# services/agent.py
from typing import Dict, Any, Literal, Optional
from pydantic import BaseModel, Field

from .traffic import estimate_eta_min, TrafficMode

class AgentRunRequest(BaseModel):
    mode: Literal["ops", "procurement"] = "ops"
    twin: Dict[str, Any]                         # 현재 선택된 트윈
    trafficMode: TrafficMode = "normal"
    slaMinutes: int = 60
    baseLat: float = 37.5665                     # 기본 출동 베이스(임시). 나중에 업체/권역별로 교체
    baseLon: float = 126.9780
    remoteRecoveryRate: float = Field(default=0.35, ge=0.0, le=1.0)
    useLLM: bool = False

from .agent_llm import run_llm_agent

def run_agent(req: AgentRunRequest):
    if req.useLLM:
        return run_llm_agent(req.model_dump())
    t = req.twin
    lat = float(t.get("lat"))
    lon = float(t.get("lon"))

    # MVP 위험도 (트윈에 risk 있으면 활용, 없으면 랜덤/0)
    derived = t.get("derived") or {}
    risk = derived.get("risk") or t.get("risk") or "OK"

    eta = estimate_eta_min(req.baseLat, req.baseLon, lat, lon, req.trafficMode)

    plan = []
    reasons = []

    if risk in ["OK", "SAFE"]:
        plan.append({"action": "NO_ACTION"})
        reasons.append("현재 위험도가 낮음(OK)")
    else:
        # 원격조치 먼저
        plan.append({"action": "REMOTE_RESET"})
        reasons.append(f"원격조치 우선 시도(remoteRecoveryRate={req.remoteRecoveryRate})")

        # 출동 여부 판단
        if eta <= req.slaMinutes:
            plan.append({"action": "DISPATCH", "eta_min": round(eta, 1)})
            reasons.append(f"SLA({req.slaMinutes}분) 내 도착 가능 → 출동 병행 권장")
        else:
            plan.append({"action": "ESCALATE", "eta_min": round(eta, 1)})
            reasons.append(f"SLA({req.slaMinutes}분) 초과 예상 → 권역 재배치/대체조치 필요")

    return {
        "risk": risk,
        "eta_min": round(eta, 1),
        "plan": plan,
        "reasons": reasons,
    }
