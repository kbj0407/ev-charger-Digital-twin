"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import ProcurementSimPanel from "./ui/ProcurementSimPanel";

const MapView = dynamic(() => import("./ui/MapView"), { ssr: false });

const API = "http://localhost:8000";

/* =========================
   공통 유틸
========================= */
const fmt = (v, d = "-") => (v === null || v === undefined ? d : v);

function Badge({ type }) {
  const map = {
    autopilot: { bg: "#2d3a8c", label: "autopilot" },
    explain: { bg: "#0f766e", label: "explain" },
    procurement: { bg: "#7c3aed", label: "procurement" },
    error: { bg: "#b91c1c", label: "error" },
  };
  const x = map[type] ?? { bg: "#334155", label: type };
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 900,
        padding: "3px 8px",
        borderRadius: 999,
        color: "white",
        background: x.bg,
      }}
    >
      {x.label}
    </span>
  );
}

/* =========================
   로그 카드: 타입별 렌더
========================= */
function LogCard({ item, onRemove }) {
  return (
    <div
      style={{
        background: "white",
        borderRadius: 14,
        padding: 14,
        border: "1px solid #e6e8ee",
      }}
    >
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ fontWeight: 900, flex: 1 }}>{item.title}</div>
        <Badge type={item.type} />
        <button
          onClick={() => onRemove(item.id)}
          style={{
            border: 0,
            background: "transparent",
            cursor: "pointer",
            fontSize: 12,
            color: "#64748b",
          }}
          title="이 로그 삭제"
        >
          ✕
        </button>
      </div>

      <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
        {item.ts}
      </div>

      {/* =========================
         AUTOPILOT
      ========================= */}
      {item.type === "autopilot" && (
        <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.55 }}>
          {/* 숫자는 LLM 말고 autopilot 원본 */}
          <div>
            • candidates: <b>{fmt(item.payload?.totalCandidates)}</b> / picked:{" "}
            <b>{fmt(item.payload?.pickedK)}</b> / cases:{" "}
            <b>{fmt(item.payload?.cases?.length)}</b>
          </div>

          {/* Top cases */}
          {Array.isArray(item.payload?.cases) && item.payload.cases.length ? (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>Top 케이스</div>

              {item.payload.cases.slice(0, 5).map((c, i) => (
                <div
                  key={`${c.stationId}_${c.chargerId}_${i}`}
                  style={{
                    paddingTop: 10,
                    marginTop: 10,
                    borderTop: "1px solid #f0f2f6",
                  }}
                >
                  <div style={{ fontWeight: 800 }}>
                    {i + 1}. {c.stationId}/{c.chargerId} • score {fmt(c.score)}
                  </div>
                  <div style={{ color: "#475569" }}>{fmt(c.name, "")}</div>

                  <div style={{ marginTop: 6, color: "#334155" }}>
                    <div>
                      • downMinutes: <b>{fmt(c.downMinutes)}</b> / statusCode:{" "}
                      <b>{fmt(c.statusCode)}</b> / downProb6h:{" "}
                      <b>{fmt(c.downProb6h)}</b> / congestion:{" "}
                      <b>{fmt(c.trafficCongestion)}</b>
                    </div>
                  </div>

                  {/* plan 4개 정도 */}
                  {Array.isArray(c.plan) && c.plan.length ? (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontWeight: 800, marginBottom: 4 }}>
                        플랜
                      </div>
                      {c.plan.slice(0, 4).map((p, k) => (
                        <div key={k} style={{ color: "#334155" }}>
                          • <b>{p.action}</b>
                          {p.eta_min != null ? ` (eta ${p.eta_min}m)` : ""}
                          {p.reason ? ` — ${p.reason}` : ""}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {/* reasons */}
                  {Array.isArray(c.reasons) && c.reasons.length ? (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontWeight: 800, marginBottom: 4 }}>
                        근거(요약)
                      </div>
                      {c.reasons.slice(0, 4).map((r, k) => (
                        <div key={k} style={{ color: "#334155" }}>
                          • {r}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ marginTop: 10, color: "#64748b" }}>
              케이스가 없습니다.
            </div>
          )}

          {/* LLM 요약: autopilot payload 안에 explain을 붙여서 저장 */}
          {item.payload?.explain ? (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>LLM 요약</div>

              {item.payload.explain.summary ? (
                <div style={{ color: "#334155" }}>
                  {item.payload.explain.summary}
                </div>
              ) : null}

              {Array.isArray(item.payload.explain.top_reasons) &&
              item.payload.explain.top_reasons.length ? (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontWeight: 800, marginBottom: 4 }}>
                    핵심 근거
                  </div>
                  {item.payload.explain.top_reasons.map((r, i) => (
                    <div key={i}>• {r}</div>
                  ))}
                </div>
              ) : null}

              {Array.isArray(item.payload.explain.risks) &&
              item.payload.explain.risks.length ? (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontWeight: 800, marginBottom: 4 }}>
                    리스크/주의
                  </div>
                  {item.payload.explain.risks.map((r, i) => (
                    <div key={i}>• {r}</div>
                  ))}
                </div>
              ) : null}

              {Array.isArray(item.payload.explain.suggested_groups) &&
              item.payload.explain.suggested_groups.length ? (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontWeight: 800, marginBottom: 4 }}>
                    작업 묶음
                  </div>
                  {item.payload.explain.suggested_groups.map((g, i) => (
                    <div key={i} style={{ marginBottom: 10 }}>
                      <div style={{ fontWeight: 800 }}>• {g.name}</div>
                      {g.hint ? (
                        <div style={{ color: "#64748b" }}>{g.hint}</div>
                      ) : null}
                      {Array.isArray(g.items)
                        ? g.items.map((it, k) => (
                            <div key={k} style={{ color: "#334155" }}>
                              - {it}
                            </div>
                          ))
                        : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div style={{ marginTop: 12, color: "#64748b" }}>
              ※ 아직 LLM 요약이 없습니다. “Autopilot LLM 요약”을 눌러 붙이세요.
            </div>
          )}
        </div>
      )}

      {/* =========================
         PROCUREMENT
      ========================= */}
      {item.type === "procurement" && (
        <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.55 }}>
          <div>
            • incident: <b>{fmt(item.payload?.params?.nIncidents)}</b> / LLM:{" "}
            <b>{String(fmt(item.payload?.params?.useLLM))}</b> / providers:{" "}
            <b>{fmt(item.payload?.params?.providersCount)}</b>
          </div>

          <div style={{ marginTop: 6 }}>
            • winner: <b>{fmt(item.payload?.result?.winner)}</b>
          </div>

          {Array.isArray(item.payload?.result?.ranking) &&
          item.payload.result.ranking.length ? (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>랭킹</div>
              {item.payload.result.ranking.slice(0, 5).map((r, i) => (
                <div key={r.provider} style={{ marginTop: 6 }}>
                  <div style={{ fontWeight: 800 }}>
                    {i + 1}. {r.provider} (score {r.total_score})
                  </div>

                  {/* scenario별 요약 */}
                  {Array.isArray(r.by_scenario) && r.by_scenario.length ? (
                    <div style={{ color: "#334155", marginTop: 4 }}>
                      {r.by_scenario.map((s) => (
                        <div key={s.scenario}>
                          - {s.scenario}: score {s.score} / SLA{" "}
                          {Math.round(s.sla_hit_rate * 100)}% / p90{" "}
                          {s.eta_p90_min}m / remote {s.remote_recovery_count}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {/* LLM 설명 */}
          {item.payload?.result?.llm ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>LLM 설명</div>

              {Array.isArray(item.payload.result.llm.reasons) &&
              item.payload.result.llm.reasons.length ? (
                <div>
                  <div style={{ fontWeight: 800, marginBottom: 4 }}>근거</div>
                  {item.payload.result.llm.reasons.map((r, i) => (
                    <div key={i}>• {r}</div>
                  ))}
                </div>
              ) : null}

              {Array.isArray(item.payload.result.llm.risks) &&
              item.payload.result.llm.risks.length ? (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontWeight: 800, marginBottom: 4 }}>리스크</div>
                  {item.payload.result.llm.risks.map((r, i) => (
                    <div key={i}>• {r}</div>
                  ))}
                </div>
              ) : null}

              {Array.isArray(item.payload.result.llm.what_to_verify) &&
              item.payload.result.llm.what_to_verify.length ? (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontWeight: 800, marginBottom: 4 }}>
                    확인할 것
                  </div>
                  {item.payload.result.llm.what_to_verify.map((r, i) => (
                    <div key={i}>• {r}</div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      {/* =========================
         ERROR
      ========================= */}
      {item.type === "error" && (
        <div style={{ marginTop: 10, color: "#b91c1c", fontSize: 13 }}>
          {item.summary}
        </div>
      )}
    </div>
  );
}

export default function Page() {
  const [twins, setTwins] = useState([]);
  const [selected, setSelected] = useState(null);

  // ✅ 마지막 autopilot 실행 묶음 id
  const [lastAutoGroupId, setLastAutoGroupId] = useState(null);

  // 로그는 하나로 통합
  const [logs, setLogs] = useState([]);

  // 공통 push (최근 30개)
  const pushLog = ({ type, title, payload, summary, groupId }) => {
    const entry = {
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      groupId: groupId ?? null,
      ts: new Date().toLocaleString(),
      type,
      title,
      payload,
      summary,
    };
    setLogs((prev) => [entry, ...prev].slice(0, 30));
  };

  const removeLog = (id) => setLogs((prev) => prev.filter((x) => x.id !== id));

  /* =========================
     1) SSE
  ========================= */
  useEffect(() => {
    const es = new EventSource(`${API}/stream/twins`);

    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        setTwins(data.items || []);
      } catch (e) {
        console.error("SSE 파싱 오류", e, ev.data);
      }
    };

    es.onerror = (err) => {
      console.error("SSE 오류", err);
    };

    return () => es.close();
  }, []);

  /* =========================
     2) Autopilot 실행
  ========================= */
  const onRunAutopilot = async () => {
    const gid = `${Date.now()}_auto`; // ✅ 이 실행 묶음 id
    setLastAutoGroupId(gid);

    try {
      const res = await fetch(`${API}/agent/fleet/autopilot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topN: 50,
          autoTopK: 10,
          minDownMinutes: 30,
          autoLevel: "safe",
          useTraffic: true,
          statusCodes: [4, 5],
          baseLat: 37.5665,
          baseLon: 126.978,
          slaMinutes: 90,
          remoteRecoveryRate: 0.35,
        }),
      });

      const j = await res.json();
      if (!res.ok) throw new Error(j?.detail ?? JSON.stringify(j));

      // autopilot 로그를 하나 생성 (여기에 나중에 explain 붙임)
      pushLog({
        type: "autopilot",
        title: "Autopilot 실행",
        payload: j, // { totalCandidates, pickedK, cases, ... }
        groupId: gid,
        summary: `candidates ${j?.totalCandidates ?? "-"} / picked ${j?.pickedK ?? "-"} / cases ${
          j?.cases?.length ?? "-"
        }`,
      });
    } catch (e) {
      console.error(e);
      pushLog({
        type: "error",
        title: "Autopilot 실패",
        payload: { error: String(e) },
        summary: String(e),
      });
      alert("Autopilot 호출 실패");
    }
  };

  /* =========================
     3) Autopilot LLM 요약
     - ✅ 새 로그를 만들지 않고,
       마지막 autopilot 로그(가능하면 같은 groupId)에 explain을 "붙인다"
  ========================= */
  const onExplainAutopilot = async () => {
    // 1) 요청 보낼 대상 autopilot 선택 (가장 최근 + groupId 우선)
    const target =
      (lastAutoGroupId
        ? logs.find((x) => x.type === "autopilot" && x.groupId === lastAutoGroupId)
        : null) || logs.find((x) => x.type === "autopilot");

    if (!target) return alert("먼저 Autopilot 실행하세요.");

    const autoPayload = target.payload;
    if (!autoPayload?.cases?.length) return alert("Autopilot cases가 없습니다.");

    try {
      const res = await fetch(`${API}/agent/fleet/autopilot/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cases: autoPayload.cases, topK: 15 }),
      });

      const explain = await res.json();
      if (!res.ok) throw new Error(explain?.detail ?? JSON.stringify(explain));

      // 2) 같은 autopilot 카드에 explain 붙이기 (id로 정확히 갱신)
      setLogs((prev) =>
        prev.map((it) => {
          if (it.id !== target.id) return it;
          return {
            ...it,
            payload: {
              ...it.payload,
              explain, // { summary, top_reasons, risks, suggested_groups }
            },
          };
        })
      );
    } catch (e) {
      console.error(e);
      pushLog({
        type: "error",
        title: "Autopilot LLM 요약 실패",
        payload: { error: String(e) },
        summary: String(e),
      });
      alert("LLM 요약 호출 실패");
    }
  };

  /* =========================
     4) Procurement 콜백
  ========================= */
  const onProcurementRun = (payload) => {
    pushLog({
      type: "procurement",
      title: "사업수행기관 선정 결과",
      payload, // { params, result{ winner, ranking, llm... } }
      summary: `winner ${payload?.result?.winner ?? "-"}`,
    });
  };

  const header = useMemo(() => {
    return `트윈 수: ${twins.length}   선택됨: ${selected ? selected.name : "-"}`;
  }, [twins, selected]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", height: "100vh" }}>
      {/* ================= 왼쪽 ================= */}
      <div style={{ padding: 16, display: "grid", gridTemplateRows: "56px 1fr 320px", gap: 12 }}>
        {/* 헤더 */}
        <div
          style={{
            background: "#1f2430",
            color: "white",
            borderRadius: 14,
            padding: "14px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ fontWeight: 700 }}>{header}</div>
          <div style={{ fontSize: 12, opacity: 0.9 }}>백엔드: {API}</div>
        </div>

        {/* 지도 */}
        <div
          style={{
            height: "100%",
            minHeight: 400,
            background: "white",
            borderRadius: 14,
            overflow: "hidden",
            border: "1px solid #e6e8ee",
          }}
        >
          <MapView twins={twins} onSelect={(t) => setSelected(t)} />
        </div>

        {/* 하단 컨트롤 */}
        <div
          style={{
            background: "white",
            borderRadius: 14,
            border: "1px solid #e6e8ee",
            padding: 14,
            display: "grid",
            gridTemplateColumns: "1fr 360px",
            gap: 12,
          }}
        >
          {/* 선택된 트윈 */}
          <div>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>선택된 트윈</div>
            {!selected ? (
              <div style={{ color: "#666" }}>지도에서 마커를 클릭하여 선택하세요.</div>
            ) : (
              <div style={{ fontSize: 12, color: "#334155", lineHeight: 1.5 }}>
                <div>
                  <b>{selected.name}</b>
                </div>
                <div>
                  stationId: {selected.stationId} / chargerId: {selected.chargerId}
                </div>
                <div>health: {selected?.derived?.health ?? selected?.health ?? "-"}</div>
                <div>risk: {selected?.derived?.risk ?? selected?.risk ?? "-"}</div>
                <div>downProb6h: {selected?.derived?.downProb6h ?? "-"}</div>
              </div>
            )}
          </div>

          {/* Autopilot + Procurement */}
          <div style={{ display: "grid", gap: 10 }}>
            <button
              onClick={onRunAutopilot}
              style={{
                height: 44,
                borderRadius: 12,
                border: 0,
                background: "#2d3a8c",
                color: "white",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              Autopilot 실행
            </button>

            <button
              onClick={onExplainAutopilot}
              style={{
                height: 44,
                borderRadius: 12,
                border: 0,
                background: "#0f766e",
                color: "white",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              Autopilot LLM 요약
            </button>

            <div style={{ padding: 12, borderRadius: 12, background: "#f7f8fb", border: "1px solid #eceef4" }}>
              <ProcurementSimPanel onRecommendResult={onProcurementRun} />
            </div>
          </div>
        </div>
      </div>

      {/* ================= 오른쪽 ================= */}
      <div style={{ padding: 16, background: "#f4f6fb", borderLeft: "1px solid #e6e8ee", overflow: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <div style={{ fontWeight: 900 }}>실행 로그</div>
          <div style={{ fontSize: 12, color: "#64748b" }}>최근 {logs.length}건</div>

          <button
            onClick={() => {
              if (confirm("로그를 전부 지울까?")) setLogs([]);
            }}
            style={{
              marginLeft: "auto",
              height: 32,
              borderRadius: 10,
              border: "1px solid #e6e8ee",
              background: "white",
              fontWeight: 800,
              cursor: "pointer",
              padding: "0 10px",
              fontSize: 12,
            }}
          >
            전체 지우기
          </button>
        </div>

        {logs.length === 0 ? (
          <div style={{ color: "#666" }}>아직 실행 로그가 없습니다.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {logs.map((item) => (
              <LogCard key={item.id} item={item} onRemove={removeLog} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
