# services/procurement_agent.py
from typing import Dict, Any, List, Optional, Literal
from pydantic import BaseModel

from .sim_procurement import ProcurementSimRequest, ProviderProfile, run_procurement_sim
import os, json


TrafficMode = Literal["free", "normal", "congested"]


class ProcurementAgentRequest(BaseModel):
    providers: List[ProviderProfile]
    scenarios: Optional[List[Dict[str, Any]]] = None
    nIncidents: int = 80
    seed: Optional[int] = 42

    w_sla: float = 0.55
    w_p90: float = 0.25
    w_remote: float = 0.20

    useLLM: bool = False


def _score_one_row(row: Dict[str, Any], w_sla: float, w_p90: float, w_remote: float) -> float:
    sla = float(row.get("sla_hit_rate", 0.0))
    p90 = float(row.get("eta_p90_min", 9999.0))
    remote = float(row.get("remote_recovery_count", 0))

    # p90 -> 0~1 점수(낮을수록 좋음). 120분 이상이면 0점
    p90_score = max(0.0, min(1.0, 1.0 - (p90 / 120.0)))

    # remote count -> 비율(대략 nIncidents=80 가정)
    remote_rate = max(0.0, min(1.0, remote / 80.0))

    return (w_sla * sla) + (w_p90 * p90_score) + (w_remote * remote_rate)


def _strip_code_fences(s: str) -> str:
    s = (s or "").strip()
    if s.startswith("```"):
        # ```json\n...\n``` or ```\n...\n```
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


def _llm_explain(summary_payload: Dict[str, Any]) -> Dict[str, Any]:
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        return {"note": "OPENAI_API_KEY missing"}

    try:
        from openai import OpenAI
        client = OpenAI(api_key=key)
    except Exception as e:
        return {"note": "openai_import_or_client_error", "error": str(e)}

    system = (
        "너는 사업수행기관 선정 평가위원이다. "
        "입력된 시뮬레이션 결과를 바탕으로 1순위 업체와 근거를 간단명료하게 작성하라. "
        "반드시 아래 JSON만 출력하라(코드블록/설명 금지): "
        "{"
        "\"winner\": string, "
        "\"reasons\": [string], "
        "\"risks\": [string], "
        "\"what_to_verify\": [string]"
        "}"
    )

    resp = client.responses.create(
        model="gpt-4o-mini",
        input=[
            {"role": "system", "content": system},
            {"role": "user", "content": json.dumps(summary_payload, ensure_ascii=False)},
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


def recommend_provider(twins: List[Dict[str, Any]], req: ProcurementAgentRequest) -> Dict[str, Any]:
    scenarios = req.scenarios or [
        {"name": "free", "trafficMode": "free"},
        {"name": "normal", "trafficMode": "normal"},
        {"name": "congested", "trafficMode": "congested"},
    ]

    agg: Dict[str, Dict[str, Any]] = {}

    for sc in scenarios:
        traffic_mode = sc.get("trafficMode") or sc.get("traffic_mode") or sc.get("name") or "normal"
        scenario_name = sc.get("name") or traffic_mode

        sim_req = ProcurementSimRequest(
            providers=req.providers,
            nIncidents=req.nIncidents,
            trafficMode=traffic_mode,
            seed=req.seed,
        )
        out = run_procurement_sim(twins, sim_req)

        for row in out["scoreboard"]:
            name = row["provider"]
            s = _score_one_row(row, req.w_sla, req.w_p90, req.w_remote)
            if name not in agg:
                agg[name] = {"provider": name, "total_score": 0.0, "by_scenario": []}

            agg[name]["total_score"] += s
            agg[name]["by_scenario"].append(
                {
                    "scenario": scenario_name,
                    "score": round(s, 4),
                    "sla_hit_rate": row["sla_hit_rate"],
                    "eta_p90_min": row["eta_p90_min"],
                    "remote_recovery_count": row["remote_recovery_count"],
                }
            )

    ranking = sorted(agg.values(), key=lambda x: -x["total_score"])
    for r in ranking:
        r["total_score"] = round(r["total_score"], 4)

    winner = ranking[0]["provider"] if ranking else None

    result: Dict[str, Any] = {
        "winner": winner,
        "ranking": ranking,
        "scenarios": scenarios,
        "weights": {"w_sla": req.w_sla, "w_p90": req.w_p90, "w_remote": req.w_remote},
    }

    if req.useLLM:
        summary_payload = {
            "winner": winner,
            "weights": result["weights"],
            "ranking_top3": ranking[:3],
        }
        result["llm"] = _llm_explain(summary_payload)

    return result
