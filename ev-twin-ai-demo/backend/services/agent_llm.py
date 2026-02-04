# services/agent_llm.py
import os
import json
from typing import Dict, Any

from openai import OpenAI

def _get_client() -> OpenAI:
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        raise RuntimeError("OPENAI_API_KEY not set")
    return OpenAI(api_key=key)

SYSTEM_PROMPT = """
너는 전기차 충전소 관제 에이전트다.
입력(state)을 보고 실행 가능한 plan과 reasons를 만든다.

반드시 아래 JSON 스키마로만 출력:
{
  "risk": "OK|ALERT|CRITICAL|UNKNOWN",
  "eta_min": number,
  "plan": [{"action": "NO_ACTION|REMOTE_RESET|DISPATCH|ESCALATE", "eta_min"?: number}],
  "reasons": [string]
}

규칙:
- risk가 OK면 plan은 NO_ACTION만.
- ALERT/CRITICAL이면 REMOTE_RESET을 우선 포함.
- eta_min이 slaMinutes 이하면 DISPATCH 포함, 초과면 ESCALATE 포함.
- reasons는 사람이 읽을 수 있게 짧고 명확하게.
""".strip()

def run_llm_agent(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    payload는 AgentRunRequest(model_dump()) 같은 dict를 받는다고 가정.
    """
    try:
        client = _get_client()
    except RuntimeError as e:
        return {
            "error": str(e),
            "hint": "D:\\DigitalTwin\\.env에 OPENAI_API_KEY=... 넣고, main.py에서 load_dotenv 했는지 확인 후 FastAPI 재시작"
        }

    # LLM이 참고할 핵심만 추려서 전달(길이/잡음 줄이기)
    twin = payload.get("twin", {})
    compact = {
        "mode": payload.get("mode", "ops"),
        "trafficMode": payload.get("trafficMode", "normal"),
        "slaMinutes": payload.get("slaMinutes", 60),
        "base": {"lat": payload.get("baseLat"), "lon": payload.get("baseLon")},
        "remoteRecoveryRate": payload.get("remoteRecoveryRate", 0.35),
        "twin": {
            "stationId": twin.get("stationId"),
            "chargerId": twin.get("chargerId"),
            "name": twin.get("name"),
            "lat": twin.get("lat"),
            "lon": twin.get("lon"),
            "health": (twin.get("derived") or {}).get("health") if isinstance(twin.get("derived"), dict) else twin.get("health"),
            "risk": (twin.get("derived") or {}).get("risk") if isinstance(twin.get("derived"), dict) else twin.get("risk"),
            "downProb6h": (twin.get("derived") or {}).get("downProb6h") if isinstance(twin.get("derived"), dict) else twin.get("downProb6h"),
        },
    }

    # OpenAI Responses API로 JSON만 받기
    resp = client.responses.create(
        model="gpt-4o-mini",
        input=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(compact, ensure_ascii=False)}
        ],
    )

    text = getattr(resp, "output_text", None)

    if not text:
        # SDK 버전에 따라 구조가 달라서 fallback
        try:
            text = resp.output[0].content[0].text
        except Exception:
            return {"error": "cannot_extract_text_from_response", "raw": str(resp)}

    try:
        return json.loads(text)
    except Exception:
        return {"error": "LLM did not return valid JSON", "raw": text}

