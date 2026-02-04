"use client";

import { useMemo, useState } from "react";

const API = "http://localhost:8000";

export default function ProcurementSimPanel({ onRecommendResult }) {
  const [useLLM, setUseLLM] = useState(true);
  const [nIncidents, setNIncidents] = useState(60);
  const [loading, setLoading] = useState(false);

  // ✅ 예시 providers (원래 값 있으면 바꿔도 됨)
  const [providers] = useState([
    { name: "A사", baseLat: 37.5665, baseLon: 126.978, remoteRecoveryRate: 0.35 },
    { name: "B사", baseLat: 37.55, baseLon: 126.99, remoteRecoveryRate: 0.25 },
    { name: "C사", baseLat: 37.58, baseLon: 126.96, remoteRecoveryRate: 0.45 },
  ]);

  const canRun = useMemo(() => providers?.length > 0 && Number(nIncidents) > 0, [providers, nIncidents]);

  const runRecommend = async () => {
    if (!canRun || loading) return;

    setLoading(true);
    try {
      const res = await fetch(`${API}/agent/procurement/recommend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          useLLM,
          nIncidents: Number(nIncidents),
          providers,
          trafficModes: ["free", "normal", "congested"],
          weights: { w_sla: 0.55, w_p90: 0.25, w_remote: 0.2 },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail ?? JSON.stringify(data));

      onRecommendResult?.({
        params: {
          useLLM,
          nIncidents: Number(nIncidents),
          providersCount: providers.length,
        },
        result: data,
      });
    } catch (e) {
      console.error(e);
      alert("선정 에이전트 실행 실패 (백엔드 연결/요청 payload 확인)");
    } finally {
      setLoading(false);
    }
  };

  // ✅ 핵심: position absolute/fixed 제거! (레이아웃 흐름을 타게)
  return (
    <div
      style={{
        width: "100%",
        background: "transparent",
      }}
    >
      <div style={{ fontWeight: 900, marginBottom: 10 }}>사업수행기관 선정</div>

      <div style={{ display: "grid", gap: 8 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={useLLM} onChange={(e) => setUseLLM(e.target.checked)} />
          LLM 설명 포함
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 8, alignItems: "center" }}>
          <div style={{ fontSize: 13, color: "#555" }}>incident 수</div>
          <input
            value={nIncidents}
            onChange={(e) => setNIncidents(e.target.value)}
            type="number"
            min={1}
            style={{
              height: 34,
              borderRadius: 10,
              border: "1px solid #e6e8ee",
              padding: "0 10px",
              outline: "none",
              background: "white",
            }}
          />
        </div>

        <button
          onClick={runRecommend}
          disabled={!canRun || loading}
          style={{
            height: 40,
            borderRadius: 12,
            border: 0,
            background: !canRun || loading ? "#9aa3b2" : "#1f2430",
            color: "white",
            fontWeight: 900,
            cursor: !canRun || loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "선정중..." : "선정 에이전트 실행"}
        </button>

        <div style={{ fontSize: 12, color: "#666", lineHeight: 1.4 }}>
          • 실행 결과는 오른쪽 로그(카드)에 기록됨
        </div>
      </div>
    </div>
  );
}
