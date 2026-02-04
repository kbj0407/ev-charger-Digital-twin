"use client";

import { useState } from "react";

const API = "http://localhost:8000";

export default function AgentPanel({ selectedTwin }) {
  const [trafficMode, setTrafficMode] = useState("normal");
  const [useLLM, setUseLLM] = useState(true);
  const [loading, setLoading] = useState(false);
  const [agentResult, setAgentResult] = useState(null);
  const [error, setError] = useState(null);

  const runAgent = async () => {
    if (!selectedTwin) return;

    setLoading(true);
    setError(null);
    setAgentResult(null);

    const risk = selectedTwin?.derived?.risk ?? selectedTwin?.risk ?? "OK";
    const health = selectedTwin?.derived?.health ?? selectedTwin?.health;

    try {
      console.log("calling /agent/run", { useLLM, trafficMode, risk, health });

      const res = await fetch(`${API}/agent/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          useLLM,
          mode: "ops",
          trafficMode,
          slaMinutes: 60,
          baseLat: 37.5665,
          baseLon: 126.978,
          remoteRecoveryRate: 0.35,
          twin: {
            ...selectedTwin,
            risk,
            health,
          },
        }),
      });

      console.log("agent response status:", res.status);

      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail ?? JSON.stringify(data));

      setAgentResult(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: "absolute",
        left: 12,
        bottom: 12,
        width: 420,
        background: "rgba(255,255,255,0.95)",
        borderRadius: 12,
        padding: 12,
        boxShadow: "0 6px 18px rgba(0,0,0,0.12)",
        zIndex: 9999,
        pointerEvents: "auto", // ✅ 지도 클릭 먹힘 방지
      }}
    >
      <div style={{ fontWeight: 800, marginBottom: 8 }}>에이전트 결과</div>

      {!selectedTwin && (
        <div style={{ fontSize: 13, color: "#666" }}>
          지도에서 마커를 클릭해서 Twin을 선택해줘.
        </div>
      )}

      {selectedTwin && (
        <>
          <div style={{ fontSize: 12, color: "#333", marginBottom: 8 }}>
            <b>{selectedTwin.name ?? `${selectedTwin.stationId}_${selectedTwin.chargerId}`}</b>
            {" · "}
            risk: <b>{selectedTwin?.derived?.risk ?? selectedTwin?.risk ?? "?"}</b>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <select value={trafficMode} onChange={(e) => setTrafficMode(e.target.value)}>
              <option value="free">원활</option>
              <option value="normal">보통</option>
              <option value="congested">혼잡</option>
            </select>

            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
              <input type="checkbox" checked={useLLM} onChange={(e) => setUseLLM(e.target.checked)} />
              LLM 사용
            </label>

            <button
              onClick={() => {
                console.log("AGENT BUTTON CLICK");
                runAgent();
              }}
              disabled={loading}
              style={{ marginLeft: "auto" }}
            >
              {loading ? "실행중..." : "Agent Run"}
            </button>
          </div>

          {error && <div style={{ color: "crimson", fontSize: 12 }}>{error}</div>}

          {/* ✅ 결과가 오면 무조건 보이게: RAW 출력 포함 */}
          {agentResult && (
            <div style={{ fontSize: 12 }}>
              <div style={{ marginBottom: 6 }}>
                eta_min: <b>{agentResult.eta_min ?? "-"}</b>
              </div>

              <div style={{ marginBottom: 6 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>plan</div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {(agentResult.plan ?? []).map((p, idx) => (
                    <li key={idx}>
                      {p.action}
                      {p.eta_min !== undefined ? ` (eta=${p.eta_min})` : ""}
                    </li>
                  ))}
                </ul>
              </div>

              <div style={{ marginBottom: 6 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>reasons</div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {(agentResult.reasons ?? []).map((r, idx) => (
                    <li key={idx}>{r}</li>
                  ))}
                </ul>
              </div>

              <div style={{ fontWeight: 700, marginBottom: 4 }}>raw</div>
              <pre
                style={{
                  margin: 0,
                  padding: 10,
                  background: "#f7f8fb",
                  borderRadius: 10,
                  border: "1px solid #eceef4",
                  maxHeight: 180,
                  overflow: "auto",
                  fontSize: 11,
                }}
              >
                {JSON.stringify(agentResult, null, 2)}
              </pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}
