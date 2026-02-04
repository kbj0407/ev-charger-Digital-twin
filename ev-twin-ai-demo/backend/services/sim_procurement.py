# services/sim_procurement.py
from typing import List, Literal, Dict, Any, Optional
from pydantic import BaseModel, Field
import random

from .traffic import estimate_eta_min, TrafficMode

class ProviderProfile(BaseModel):
    name: str
    baseLat: float
    baseLon: float
    crews: int = 1
    remoteRecoveryRate: float = Field(default=0.35, ge=0.0, le=1.0)
    slaMinutes: int = 60

class ProcurementSimRequest(BaseModel):
    providers: List[ProviderProfile]
    nIncidents: int = 80
    trafficMode: TrafficMode = "normal"  # congested | normal | free
    seed: Optional[int] = None

def run_procurement_sim(twins: List[Dict[str, Any]], req: ProcurementSimRequest) -> Dict[str, Any]:
    if req.seed is not None:
        random.seed(req.seed)

    # 사건 샘플링 (지금 트윈 기반)
    incidents = []
    for _ in range(req.nIncidents):
        t = random.choice(twins)
        severity = random.choice(["DOWN", "ALERT", "SUSPECT"])
        incidents.append({
            "stationId": t.get("stationId"),
            "chargerId": t.get("chargerId"),
            "lat": float(t.get("lat")),
            "lon": float(t.get("lon")),
            "severity": severity,
        })

    scoreboard = []
    for p in req.providers:
        etas = []
        met = 0
        remote_ok = 0

        for inc in incidents:
            # 원격 복구 (MVP: severity가 DOWN이면 원격 낮게 본다)
            remote_prob = p.remoteRecoveryRate * (0.5 if inc["severity"] == "DOWN" else 1.0)

            if random.random() < remote_prob:
                eta = 0.0
                remote_ok += 1
            else:
                eta = estimate_eta_min(p.baseLat, p.baseLon, inc["lat"], inc["lon"], req.trafficMode)

            etas.append(eta)
            if eta <= p.slaMinutes:
                met += 1

        etas_sorted = sorted(etas)
        n = len(etas_sorted)
        p50 = etas_sorted[int(0.50 * (n - 1))] if n else 0.0
        p90 = etas_sorted[int(0.90 * (n - 1))] if n else 0.0

        scoreboard.append({
            "provider": p.name,
            "sla_minutes": p.slaMinutes,
            "sla_hit_rate": round(met / max(n, 1), 3),
            "eta_p50_min": round(p50, 1),
            "eta_p90_min": round(p90, 1),
            "remote_recovery_count": remote_ok,
        })

    # 정렬: SLA hit rate 높고, p90 낮은 순
    scoreboard.sort(key=lambda x: (-x["sla_hit_rate"], x["eta_p90_min"]))

    return {
        "trafficMode": req.trafficMode,
        "nIncidents": req.nIncidents,
        "scoreboard": scoreboard,
    }
