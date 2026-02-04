# 1) backend/services/autopilot_explain.py  (새 파일)
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
import os, json

class AutopilotExplainRequest(BaseModel):
    cases: List[Dict[str, Any]] = Field(default_factory=list)
    topK: int = 15

class AutopilotExplainResponse(BaseModel):
    summary: str
    top_reasons: List[str]
    risks: List[str]
    suggested_groups: List[Dict[str, Any]]

def explain_autopilot(req: AutopilotExplainRequest) -> AutopilotExplainResponse:
    key = os.getenv("OPENAI_API_KEY", "").strip()
    if not key:
        return AutopilotExplainResponse(
            summary="OPENAI_API_KEY 없음",
            top_reasons=[],
            risks=[],
            suggested_groups=[],
        )

    from openai import OpenAI
    client = OpenAI(api_key=key)

    top = req.cases[: max(1, min(req.topK, len(req.cases)))]

    payload = {
        "cases": [
            {
                "id": f'{c.get("stationId")}/{c.get("chargerId")}',
                "name": c.get("name"),
                "score": c.get("score"),
                "downMinutes": c.get("downMinutes"),
                "downProb6h": c.get("downProb6h"),
                "trafficCongestion": c.get("trafficCongestion"),
                "plan": c.get("plan", [])[:4],
            }
            for c in top
        ]
    }

    system = (
        "너는 EV 충전소 관제 책임자다. 입력된 autopilot 케이스 리스트를 보고 오늘 처리 전략을 요약한다. "
        "반드시 JSON만 출력:\n"
        "{"
        "\"summary\": string,"
        "\"top_reasons\": [string],"
        "\"risks\": [string],"
        "\"suggested_groups\": ["
        " {\"name\": string, \"hint\": string, \"items\": [string]} "
        "]"
        "}"
    )

    r = client.responses.create(
        model="gpt-4o-mini",
        input=[
            {"role": "system", "content": system},
            {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
        ],
    )

    text = getattr(r, "output_text", "") or ""
    text = text.strip()
    # 코드펜스 제거
    if text.startswith("```"):
        nl = text.find("\n")
        if nl != -1:
            text = text[nl + 1 :]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
    # JSON 구간만
    s = text[text.find("{") : text.rfind("}") + 1] if ("{" in text and "}" in text) else text
    try:
        j = json.loads(s)
    except:
        return AutopilotExplainResponse(
            summary="LLM JSON 파싱 실패",
            top_reasons=[],
            risks=[],
            suggested_groups=[{"name":"raw", "hint":"", "items":[text[:500]]}],
        )

    return AutopilotExplainResponse(
        summary=j.get("summary", ""),
        top_reasons=j.get("top_reasons", []) or [],
        risks=j.get("risks", []) or [],
        suggested_groups=j.get("suggested_groups", []) or [],
    )
