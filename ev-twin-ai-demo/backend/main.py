from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from datetime import datetime, timezone
import random
import math
import asyncio
import json
import uuid

from services.sim_procurement import ProcurementSimRequest, run_procurement_sim
from services.agent import AgentRunRequest, run_agent
from services.procurement_agent import ProcurementAgentRequest, recommend_provider
from services.fleet_agent import (
    FleetPrioritizeRequest,
    prioritize_fleet,
    FleetRouteRequest,
    plan_route,
)
from services.autopilot_agent import AutopilotRequest, run_autopilot
from services.autopilot_explain import AutopilotExplainRequest, explain_autopilot


from pathlib import Path
from dotenv import load_dotenv

ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(ENV_PATH)

app = FastAPI(title="EV Twin + AI Demo")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://59.26.60.28:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------
# 한국어 매핑
# -----------------------------
VERDICT_KO = {
    "OK": "정상",
    "SUSPECT": "의심",
    "ALERT": "경고",
    "CRITICAL": "위험",
    "DOWN": "장애",
}

RECOMMEND_KO = {
    "remote_reset": "원격 재부팅/리셋 시도",
    "dispatch_if_no_recovery": "복구 실패 시 현장 출동",
    "dispatch_immediately": "즉시 현장 출동",
    "notify_safety_team": "안전 담당자 즉시 통보",
    "request_sensor_check": "센서/통신 상태 추가 점검 요청",
    "remote_diagnosis": "원격 진단 수행",
    "open_case": "케이스 생성 및 담당 배정",
    "monitor": "모니터링 강화",
}

HEALTH_KO = {
    "OK": "정상",
    "DEGRADED": "저하",
    "DOWN": "장애",
}

RISK_KO = {
    "NONE": "없음",
    "SUSPECT": "의심",
    "ALERT": "경고",
    "CRITICAL": "위험",
}

# -----------------------------
# In-memory "Twin Store" (Demo)
# -----------------------------
def now_iso():
    return datetime.now(timezone.utc).isoformat()

# ✅ 더미 TWINS는 미사용 (실데이터 로딩으로 대체)
TWINS = []

# =============================
# REAL DATA LOADER (replace demo TWINS)
# =============================
import csv

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
STATUS_PATH = DATA_DIR / "260114-1624.jsonl"
CHARGER_PATH = DATA_DIR / "charger.tsv"
STATION_PATH = DATA_DIR / "station.tsv"

LINK_MAP_PATH = DATA_DIR / "link_map.tsv"
LINK_TRAFFIC_PATH = DATA_DIR / "link_traffic.tsv"
BASELINE_SPEED = 30.0  # 기준속도(임시). 필요하면 조정


# ✅ statusCode 4,5만
ALLOWED_STATUS = {4, 5}

_CACHE = {
    "mtime": None,
    "twins": [],
    "station_map": None,
    "charger_map": None,
}

def _read_tsv(path: Path):
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f, delimiter="\t")
        return list(reader)

def _load_station_map():
    rows = _read_tsv(STATION_PATH)
    m = {}
    for r in rows:
        stat_id = (r.get("stat_id") or "").strip()
        if not stat_id:
            continue
        try:
            lat = float(r.get("lat") or 0)
            lon = float(r.get("lng") or 0)
        except:
            lat, lon = 0.0, 0.0
        m[stat_id] = {
            "statId": stat_id,
            "name": (r.get("stat_nm") or stat_id).strip(),
            "addr": (r.get("addr") or "").strip(),
            "lat": lat,
            "lon": lon,
            "zcode": (r.get("zcode") or "").strip(),
            "zscode": (r.get("zscode") or "").strip(),
            "busiId": (r.get("busi_id") or "").strip(),
        }
    return m

def _load_charger_map():
    rows = _read_tsv(CHARGER_PATH)
    m = {}
    for r in rows:
        stat_id = (r.get("stat_id") or "").strip()
        chger_id = (r.get("chger_id") or "").strip()
        if not stat_id or not chger_id:
            continue
        m[(stat_id, chger_id)] = {
            "chgerType": (r.get("chger_type") or "").strip(),
            "method": (r.get("method") or "").strip(),
            "output": (r.get("output") or "").strip(),
            "busiId": (r.get("busi_id") or "").strip() if "busi_id" in r else None,
        }
    return m

def _load_latest_status():
    """
    jsonl 여러 줄 중 (statId, chgerId)별 최신 statUpdDt만 남김
    + statusCode 필터(ALLOWED_STATUS) 적용
    """
    latest = {}
    if not STATUS_PATH.exists():
        return latest

    with open(STATUS_PATH, "r", encoding="utf-8-sig") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                j = json.loads(line)
            except:
                continue

            stat_id = (j.get("statId") or "").strip()
            chger_id = (j.get("chgerId") or "").strip()
            if not stat_id or not chger_id:
                continue

            try:
                status_code = int(j.get("stat"))
            except:
                continue

            # ✅ 4,5만
            if status_code not in ALLOWED_STATUS:
                continue

            upd = (j.get("statUpdDt") or "").strip()
            key = (stat_id, chger_id)

            prev = latest.get(key)
            if (prev is None) or (upd > (prev.get("statUpdDt") or "")):
                latest[key] = j

    return latest

def _load_link_map():
    m = {}
    if not LINK_MAP_PATH.exists():
        return m
    with open(LINK_MAP_PATH, "r", encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f, delimiter="\t"):
            stat_id = (r.get("stat_id") or "").strip()
            link_id = (r.get("link_id") or "").strip()
            if not stat_id or not link_id:
                continue
            try:
                dist_m = float(r.get("dist_m") or 0)
            except:
                dist_m = 0.0
            # dist 너무 크면 매핑 품질 낮으니 제외하고 싶으면 여기서 컷
            if dist_m > 1500:
                continue
            m[stat_id] = {"link_id": link_id, "dist_m": dist_m}
    return m

def _load_link_traffic():
    m = {}
    if not LINK_TRAFFIC_PATH.exists():
        return m
    with open(LINK_TRAFFIC_PATH, "r", encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f, delimiter="\t"):
            link_id = (r.get("link_id") or "").strip()
            if not link_id:
                continue
            spd = r.get("speed")
            trv = r.get("travel_time")
            try:
                spd = float(spd) if spd not in (None, "", "null") else None
            except:
                spd = None
            try:
                trv = float(trv) if trv not in (None, "", "null") else None
            except:
                trv = None
            m[link_id] = {"speed": spd, "travel_time": trv}
    return m


def sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))

def recalc_derived(twin: dict):
    s = twin["signals"]

    x = 0.0
    x += 1.2 if s["statusCode"] in [4, 5] else 0.0
    x += 0.9 * s["commLossRate24h"]
    x += 1.3 * s["sensorRisk"]
    x += 0.8 * s["visionSmoke"]
    downProb = sigmoid(1.2 * (x - 0.55))

    if s["statusCode"] in [4, 5]:
        health = "DOWN"
    elif s["commLossRate24h"] > 0.12 or downProb > 0.55:
        health = "DEGRADED"
    else:
        health = "OK"

    riskScore = max(s["visionFire"], s["visionSmoke"]) * 0.7 + s["sensorRisk"] * 0.8 + (0.2 if health == "DOWN" else 0.0)
    if riskScore > 0.55:
        risk = "CRITICAL"
    elif riskScore > 0.35:
        risk = "ALERT"
    elif riskScore > 0.18:
        risk = "SUSPECT"
    else:
        risk = "NONE"

    twin["derived"] = {
        "health": health,
        "risk": risk,
        "downProb6h": float(round(downProb, 3)),
        "updatedAt": now_iso()
    }

def _build_twins():
    if _CACHE["station_map"] is None:
        _CACHE["station_map"] = _load_station_map()
    if _CACHE["charger_map"] is None:
        _CACHE["charger_map"] = _load_charger_map()

    station_map = _CACHE["station_map"]
    charger_map = _CACHE["charger_map"]

    latest_status = _load_latest_status()

    # ✅ 한 번만 로드
    link_map = _load_link_map()
    link_tr = _load_link_traffic()

    twins = []
    for (stat_id, chger_id), s in latest_status.items():
        st = station_map.get(stat_id)
        if not st:
            continue

        meta = charger_map.get((stat_id, chger_id), {})

        try:
            status_code = int(s.get("stat"))
        except:
            status_code = 9

        twin = {
            "stationId": stat_id,
            "chargerId": chger_id,
            "name": f'{st["name"]} / CH-{chger_id}',
            "lat": st["lat"],
            "lon": st["lon"],
            "signals": {
                "statusCode": status_code,
                "commLossRate24h": 0.0,
                "visionSmoke": 0.0,
                "visionFire": 0.0,
                "sensorRisk": 0.0,
                "lastTsdt": s.get("lastTsdt"),
                "lastTedt": s.get("lastTedt"),
                "statUpdDt": s.get("statUpdDt"),
                "busiId": s.get("busiId"),
                "zcode": s.get("zcode"),
                "zscode": s.get("zscode"),
            },
            "meta": meta,
            "station": {
                "addr": st.get("addr"),
                "zcode": st.get("zcode"),
                "zscode": st.get("zscode"),
                "busiId": st.get("busiId"),
            },
            "derived": {},
        }

        # ✅ 여기서 traffic join
        lm = link_map.get(stat_id)
        if lm:
            lid = lm["link_id"]
            tr = link_tr.get(lid, {})
            spd = tr.get("speed")
            ttime = tr.get("travel_time")

            congestion = None
            if isinstance(spd, (int, float)):
                congestion = max(0.0, min(1.0, 1.0 - (float(spd) / BASELINE_SPEED)))

            twin["signals"]["linkId"] = lid
            twin["signals"]["linkDistM"] = lm.get("dist_m")
            twin["signals"]["trafficSpeed"] = float(spd) if isinstance(spd, (int, float)) else 0.0
            twin["signals"]["trafficTravelTime"] = float(ttime) if isinstance(ttime, (int, float)) else 0.0
            twin["signals"]["trafficCongestion"] = float(round(congestion, 3)) if congestion is not None else 0.0
        else:
            twin["signals"]["trafficCongestion"] = 0.0

        recalc_derived(twin)
        twins.append(twin)

    return twins

def refresh_twins():
    if not STATUS_PATH.exists():
        _CACHE["twins"] = []
        return _CACHE["twins"]

    mtime = STATUS_PATH.stat().st_mtime
    if _CACHE["mtime"] != mtime:
        _CACHE["twins"] = _build_twins()
        _CACHE["mtime"] = mtime
    return _CACHE["twins"]

# -----------------------------
# API
# -----------------------------
@app.get("/twins")
def get_twins():
    items = refresh_twins()
    return {"items": items}

@app.get("/stream/twins")
async def stream_twins():
    async def event_gen():
        while True:
            items = refresh_twins()
            payload = {"items": items}
            yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
            await asyncio.sleep(1.0)

    return StreamingResponse(event_gen(), media_type="text/event-stream")

@app.post("/sim/procurement/run")
def sim_procurement(req: ProcurementSimRequest):
    items = refresh_twins()
    return run_procurement_sim(items, req)

@app.post("/agent/procurement/recommend")
def agent_procurement_recommend(req: ProcurementAgentRequest):
    items = refresh_twins()
    return recommend_provider(items, req)
@app.post("/agent/run")
def agent_run(req: AgentRunRequest):
    return run_agent(req)
@app.post("/agent/fleet/prioritize")
def agent_fleet_prioritize(req: FleetPrioritizeRequest):
    items = refresh_twins()
    return prioritize_fleet(items, req)

@app.post("/agent/fleet/route")
def agent_fleet_route(req: FleetRouteRequest):
    return plan_route(req)

@app.post("/agent/fleet/autopilot")
def agent_fleet_autopilot(req: AutopilotRequest):
    items = refresh_twins()
    return run_autopilot(items, req)


@app.post("/agent/fleet/autopilot/explain")
def agent_fleet_autopilot_explain(req: AutopilotExplainRequest):
    return explain_autopilot(req)