"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import ProcurementSimPanel from "./ui/ProcurementSimPanel";

const MapView = dynamic(() => import("./ui/MapView"), { ssr: false });

const API = "http://localhost:8000";

/* =========================
   util
========================= */
const fmt = (v, d = "-") => (v === null || v === undefined ? d : v);
const nowId = (p = "") => `${Date.now()}_${Math.random().toString(16).slice(2)}${p}`;

function TabButton({ active, children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        height: 34,
        borderRadius: 999,
        border: `1px solid ${active ? "#1f2430" : "#e6e8ee"}`,
        background: active ? "#1f2430" : "white",
        color: active ? "white" : "#334155",
        fontWeight: 900,
        cursor: "pointer",
        padding: "0 12px",
        fontSize: 12,
      }}
    >
      {children}
    </button>
  );
}

function Pill({ bg, children }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 900,
        padding: "3px 8px",
        borderRadius: 999,
        color: "white",
        background: bg,
      }}
    >
      {children}
    </span>
  );
}

/* =========================
   cards
========================= */
function Card({ title, right, children }) {
  return (
    <div
      style={{
        background: "white",
        border: "1px solid #e6e8ee",
        borderRadius: 14,
        padding: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontWeight: 900, flex: 1 }}>{title}</div>
        {right}
      </div>
      <div style={{ marginTop: 10 }}>{children}</div>
    </div>
  );
}

function MiniInfo({ label, value }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: 10, fontSize: 12 }}>
      <div style={{ color: "#64748b" }}>{label}</div>
      <div style={{ color: "#334155", fontWeight: 800 }}>{value}</div>
    </div>
  );
}

/* =========================
   main
========================= */
export default function Page() {
  const [twins, setTwins] = useState([]);
  const [selected, setSelected] = useState(null);

  // UI 탭
  const [tab, setTab] = useState("overview"); // overview | autopilot | details

  // 실행 결과들
  const [autoRuns, setAutoRuns] = useState([]); // [{id, ts, payload, explain?}]
  const [procRuns, setProcRuns] = useState([]); // [{id, ts, payload}] payload={params,result}
  const [events, setEvents] = useState([]); // details용 간단 이벤트 로그(문자열)

  // 지도 필터
  const [mapMode, setMapMode] = useState("all"); // all | autopilot
  const [activeAutoId, setActiveAutoId] = useState(null); // 지도 필터에 사용할 autopilot run id

  const pushEvent = (msg) => {
    const line = `${new Date().toLocaleString()}  ·  ${msg}`;
    setEvents((prev) => [line, ...prev].slice(0, 50));
  };

  /* =========================
     SSE
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
      // 백엔드가 안 켜져 있거나 /stream/twins가 없으면 여기로 떨어짐
      console.error("SSE 오류", err);
    };

    return () => es.close();
  }, []);

  /* =========================
     Autopilot 실행
  ========================= */
  const onRunAutopilot = async () => {
    try {
      pushEvent("Autopilot 실행 요청");

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

      const entry = {
        id: nowId("_auto"),
        ts: new Date().toLocaleString(),
        payload: j, // { totalCandidates, pickedK, cases:[] }
        explain: null,
      };

      setAutoRuns((prev) => [entry, ...prev].slice(0, 10));
      setActiveAutoId(entry.id);
      setMapMode("autopilot");
      setTab("autopilot");

      pushEvent(`Autopilot 완료 (candidates ${j.totalCandidates}, picked ${j.pickedK})`);
    } catch (e) {
      console.error(e);
      pushEvent(`Autopilot 실패: ${String(e)}`);
      alert("Autopilot 호출 실패");
    }
  };

  /* =========================
     Autopilot LLM 요약
     - ✅ “오토파일럿 실행”과 “요약”은 분리되지만
       동일 run 카드 안에 'LLM 요약' 섹션으로 붙여서
       중간에 다른 로그가 끼지 않게 함
  ========================= */
  const onExplainAutopilot = async (runId) => {
    try {
      const run = autoRuns.find((r) => r.id === runId);
      if (!run?.payload?.cases?.length) return alert("Autopilot cases가 없습니다.");

      pushEvent("Autopilot LLM 요약 요청");

      const res = await fetch(`${API}/agent/fleet/autopilot/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cases: run.payload.cases, topK: 15 }),
      });

      const explain = await res.json();
      if (!res.ok) throw new Error(explain?.detail ?? JSON.stringify(explain));

      setAutoRuns((prev) =>
        prev.map((x) => (x.id === runId ? { ...x, explain } : x))
      );

      pushEvent("Autopilot LLM 요약 완료");
    } catch (e) {
      console.error(e);
      pushEvent(`Autopilot LLM 요약 실패: ${String(e)}`);
      alert("LLM 요약 호출 실패");
    }
  };

  /* =========================
     Procurement 콜백
  ========================= */
  const onProcurementRun = (payload) => {
    const entry = {
      id: nowId("_proc"),
      ts: new Date().toLocaleString(),
      payload, // { params, result }
    };
    setProcRuns((prev) => [entry, ...prev].slice(0, 10));
    setTab("overview");

    const winner = payload?.result?.winner ?? "-";
    pushEvent(`사업수행기관 선정 완료 (winner: ${winner})`);
  };

  /* =========================
     지도 표시 twins (필터링)
  ========================= */
  const filteredTwins = useMemo(() => {
    if (mapMode !== "autopilot") return twins;

    const active = autoRuns.find((r) => r.id === activeAutoId);
    const cases = active?.payload?.cases;
    if (!Array.isArray(cases) || !cases.length) return twins;

    const keySet = new Set(cases.map((c) => `${c.stationId}::${c.chargerId}`));
    return twins.filter((t) => keySet.has(`${t.stationId}::${t.chargerId}`));
  }, [twins, mapMode, autoRuns, activeAutoId]);

  const header = useMemo(() => {
    return `트윈 수: ${filteredTwins.length}   선택됨: ${selected ? selected.name : "-"}`;
  }, [filteredTwins, selected]);

  const highlightKeys = useMemo(() => {
  const active = autoRuns.find((r) => r.id === activeAutoId);
  const cases = active?.payload?.cases;
  if (!Array.isArray(cases) || !cases.length) return new Set();
  return new Set(cases.map((c) => `${c.stationId}::${c.chargerId}`));
}, [autoRuns, activeAutoId]);


  /* =========================
     Overview 데이터 만들기
  ========================= */
  const latestAuto = autoRuns[0] ?? null;
  const latestExplain = latestAuto?.explain ?? null;
  const latestProc = procRuns[0] ?? null;

  const riskyTop = useMemo(() => {
    const cases = latestAuto?.payload?.cases ?? [];
    return cases.slice(0, 5);
  }, [latestAuto]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", height: "100vh" }}>
      {/* ================= LEFT ================= */}
      <div style={{ padding: 16, display: "grid", gridTemplateRows: "56px 1fr 320px", gap: 12 }}>
        {/* header */}
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
          <div style={{ fontWeight: 800 }}>{header}</div>
          <div style={{ fontSize: 12, opacity: 0.9 }}>백엔드: {API}</div>
        </div>

        {/* map */}
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
          <MapView twins={filteredTwins} onSelect={(t) => setSelected(t)} />
        </div>

        {/* bottom controls */}
        <div
          style={{
            background: "white",
            borderRadius: 14,
            border: "1px solid #e6e8ee",
            padding: 14,
            display: "grid",
            gridTemplateColumns: "1fr 380px",
            gap: 12,
          }}
        >
          {/* selected */}
          <div>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>현재 선택</div>
            {!selected ? (
              <div style={{ color: "#666" }}>지도에서 마커를 클릭하세요.</div>
            ) : (
              <div style={{ fontSize: 12, color: "#334155", lineHeight: 1.55 }}>
                <div style={{ fontWeight: 900 }}>{selected.name}</div>
                <div>stationId: {selected.stationId} / chargerId: {selected.chargerId}</div>
                <div>health: {selected?.derived?.health ?? selected?.health ?? "-"}</div>
                <div>risk: {selected?.derived?.risk ?? selected?.risk ?? "-"}</div>
                <div>downProb6h: {selected?.derived?.downProb6h ?? "-"}</div>
              </div>
            )}
          </div>

          {/* actions */}
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

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
              }}
            >
              <button
                onClick={() => {
                  if (!latestAuto) return alert("먼저 Autopilot 실행하세요.");
                  onExplainAutopilot(latestAuto.id);
                }}
                style={{
                  height: 40,
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

              <button
                onClick={() => {
                  setMapMode((m) => (m === "autopilot" ? "all" : "autopilot"));
                }}
                style={{
                  height: 40,
                  borderRadius: 12,
                  border: "1px solid #e6e8ee",
                  background: "white",
                  color: "#334155",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
                title="Autopilot 결과 케이스만 지도에 표시 / 전체 표시"
              >
                {mapMode === "autopilot" ? "지도: 결과만" : "지도: 전체"}
              </button>
            </div>

            <div style={{ padding: 12, borderRadius: 12, background: "#f7f8fb", border: "1px solid #eceef4" }}>
              <ProcurementSimPanel onRecommendResult={onProcurementRun} />
            </div>

            <button
              onClick={() => {
                if (confirm("전체 초기화할까? (지도 전체 + 실행결과 유지)")) {
                  setMapMode("all");
                  setActiveAutoId(null);
                }
              }}
              style={{
                height: 36,
                borderRadius: 12,
                border: "1px solid #e6e8ee",
                background: "white",
                fontWeight: 900,
                cursor: "pointer",
                color: "#334155",
              }}
            >
              지도 초기화
            </button>
          </div>
        </div>
      </div>

      {/* ================= RIGHT ================= */}
      <div style={{ padding: 16, background: "#f4f6fb", borderLeft: "1px solid #e6e8ee", overflow: "auto" }}>
        {/* Tabs */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <div style={{ fontWeight: 900, marginRight: 6 }}>결과 패널</div>
          <TabButton active={tab === "overview"} onClick={() => setTab("overview")}>
            요약
          </TabButton>
          <TabButton active={tab === "autopilot"} onClick={() => setTab("autopilot")}>
            오토파일럿
          </TabButton>
          <TabButton active={tab === "details"} onClick={() => setTab("details")}>
            상세(기록)
          </TabButton>

          <button
            onClick={() => {
              if (confirm("실행 결과(오토파일럿/선정/기록)를 전부 지울까?")) {
                setAutoRuns([]);
                setProcRuns([]);
                setEvents([]);
                setMapMode("all");
                setActiveAutoId(null);
              }
            }}
            style={{
              marginLeft: "auto",
              height: 32,
              borderRadius: 10,
              border: "1px solid #e6e8ee",
              background: "white",
              fontWeight: 900,
              cursor: "pointer",
              padding: "0 10px",
              fontSize: 12,
            }}
          >
            전체 지우기
          </button>
        </div>

        {/* =========================
           TAB: OVERVIEW
        ========================= */}
        {tab === "overview" && (
          <div style={{ display: "grid", gap: 12 }}>
            <Card
              title="서비스 사용 방법"
              right={<Pill bg="#334155">guide</Pill>}
            >
              <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.55 }}>
                1) <b>Autopilot 실행</b> → 위험 케이스 TopK 자동 선정<br />
                2) <b>지도: 결과만</b>으로 전환 → 점검 대상만 한눈에 확인<br />
                3) <b>Autopilot LLM 요약</b> → “왜 위험/무엇을 할지” 요약 확인<br />
                4) <b>사업수행기관 선정</b> → 업체별 성능 비교 후 winner 추천
              </div>
            </Card>

            <Card
              title="오늘의 요약"
              right={<Pill bg="#1f2430">overview</Pill>}
            >
              {!latestAuto ? (
                <div style={{ color: "#64748b", fontSize: 13 }}>아직 Autopilot 결과가 없습니다.</div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  <MiniInfo
                    label="후보/선정"
                    value={`${fmt(latestAuto.payload?.totalCandidates)} 후보 중 ${fmt(latestAuto.payload?.pickedK)}건 선정`}
                  />

                  {/* LLM 요약(있으면) */}
                  {latestExplain?.summary ? (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ fontWeight: 900, marginBottom: 6 }}>요약(LLM)</div>
                      <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.55 }}>
                        {latestExplain.summary}
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginTop: 6, color: "#64748b", fontSize: 13 }}>
                      LLM 요약이 없습니다. 아래 버튼으로 생성하세요: <b>Autopilot LLM 요약</b>
                    </div>
                  )}

                  {/* Top 케이스 5개만 보여주기 */}
                  {riskyTop?.length ? (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontWeight: 900, marginBottom: 8 }}>점검 우선 Top 5</div>
                      {riskyTop.map((c, i) => (
                        <div
                          key={`${c.stationId}::${c.chargerId}::ov::${i}`}
                          style={{
                            padding: 10,
                            borderRadius: 12,
                            border: "1px solid #eef2f7",
                            background: "#fbfcfe",
                            marginBottom: 8,
                          }}
                        >
                          <div style={{ fontWeight: 900, color: "#0f172a" }}>
                            {i + 1}. {c.stationId}/{c.chargerId} · score {fmt(c.score)}
                          </div>
                          <div style={{ fontSize: 13, color: "#334155", marginTop: 4 }}>{fmt(c.name, "")}</div>
                          <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>
                            down {fmt(c.downMinutes)}m · prob {fmt(c.downProb6h)} · congestion {fmt(c.trafficCongestion)} · {fmt(c.outputKw)}kW
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </Card>

            <Card
              title="사업수행기관 선정 결과"
              right={<Pill bg="#7c3aed">procurement</Pill>}
            >
              {!latestProc ? (
                <div style={{ color: "#64748b", fontSize: 13 }}>아직 선정 결과가 없습니다.</div>
              ) : (
                <div style={{ display: "grid", gap: 10, fontSize: 13, color: "#334155", lineHeight: 1.55 }}>
                  <div>
                    • 장애 케이스 수: <b>{fmt(latestProc.payload?.params?.nIncidents)}</b> · 업체 수:{" "}
                    <b>{fmt(latestProc.payload?.params?.providersCount)}</b> · LLM:{" "}
                    <b>{String(fmt(latestProc.payload?.params?.useLLM))}</b>
                  </div>
                  <div>
                    • winner: <b style={{ fontSize: 15 }}>{fmt(latestProc.payload?.result?.winner)}</b>
                  </div>

                  {Array.isArray(latestProc.payload?.result?.ranking) && latestProc.payload.result.ranking.length ? (
                    <div>
                      <div style={{ fontWeight: 900, marginBottom: 6 }}>Top 3 랭킹</div>
                      {latestProc.payload.result.ranking.slice(0, 3).map((r, i) => (
                        <div key={r.provider} style={{ marginTop: 6 }}>
                          <div style={{ fontWeight: 900 }}>
                            {i + 1}. {r.provider} (총점 {r.total_score})
                          </div>

                          {Array.isArray(r.by_scenario) && r.by_scenario.length ? (
                            <div style={{ color: "#475569", fontSize: 12, marginTop: 4 }}>
                              {r.by_scenario.map((s) => (
                                <div key={s.scenario}>
                                  - {s.scenario}: score {s.score} / SLA {Math.round(s.sla_hit_rate * 100)}% / p90 {s.eta_p90_min}m / remote {s.remote_recovery_count}
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {latestProc.payload?.result?.llm ? (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ fontWeight: 900, marginBottom: 6 }}>LLM 설명</div>

                      {Array.isArray(latestProc.payload.result.llm.reasons) && latestProc.payload.result.llm.reasons.length ? (
                        <div>
                          <div style={{ fontWeight: 900, marginBottom: 4 }}>근거</div>
                          {latestProc.payload.result.llm.reasons.map((x, idx) => (
                            <div key={idx}>• {x}</div>
                          ))}
                        </div>
                      ) : null}

                      {Array.isArray(latestProc.payload.result.llm.risks) && latestProc.payload.result.llm.risks.length ? (
                        <div style={{ marginTop: 8 }}>
                          <div style={{ fontWeight: 900, marginBottom: 4 }}>리스크</div>
                          {latestProc.payload.result.llm.risks.map((x, idx) => (
                            <div key={idx}>• {x}</div>
                          ))}
                        </div>
                      ) : null}

                      {Array.isArray(latestProc.payload.result.llm.what_to_verify) && latestProc.payload.result.llm.what_to_verify.length ? (
                        <div style={{ marginTop: 8 }}>
                          <div style={{ fontWeight: 900, marginBottom: 4 }}>확인할 것</div>
                          {latestProc.payload.result.llm.what_to_verify.map((x, idx) => (
                            <div key={idx}>• {x}</div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )}
            </Card>
          </div>
        )}

        {/* =========================
           TAB: AUTOPILOT (실행/요약을 분리해서 보여줌)
        ========================= */}
        {tab === "autopilot" && (
          <div style={{ display: "grid", gap: 12 }}>
            {autoRuns.length === 0 ? (
              <div style={{ color: "#64748b" }}>아직 Autopilot 실행 결과가 없습니다.</div>
            ) : (
              autoRuns.map((run, idx) => (
                <div key={run.id} style={{ display: "grid", gap: 10 }}>
                  {/* (A) Autopilot 실행 카드 */}
                  <Card
                    title={`Autopilot 실행 #${autoRuns.length - idx}`}
                    right={<Pill bg="#2d3a8c">autopilot</Pill>}
                  >
                    <div style={{ fontSize: 12, color: "#64748b" }}>{run.ts}</div>

                    <div style={{ marginTop: 10, fontSize: 13, color: "#334155", lineHeight: 1.55 }}>
                      • candidates: <b>{fmt(run.payload?.totalCandidates)}</b> / picked:{" "}
                      <b>{fmt(run.payload?.pickedK)}</b> / cases: <b>{fmt(run.payload?.cases?.length)}</b>
                    </div>

                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      <button
                        onClick={() => {
                          setActiveAutoId(run.id);
                          setMapMode("autopilot");
                          pushEvent("지도: Autopilot 결과만 보기 적용");
                        }}
                        style={{
                          height: 34,
                          borderRadius: 10,
                          border: "1px solid #e6e8ee",
                          background: "white",
                          fontWeight: 900,
                          cursor: "pointer",
                          padding: "0 10px",
                          fontSize: 12,
                        }}
                      >
                        이 실행결과로 지도 필터
                      </button>

                      <button
                        onClick={() => onExplainAutopilot(run.id)}
                        style={{
                          height: 34,
                          borderRadius: 10,
                          border: 0,
                          background: "#0f766e",
                          color: "white",
                          fontWeight: 900,
                          cursor: "pointer",
                          padding: "0 10px",
                          fontSize: 12,
                        }}
                      >
                        LLM 요약 생성/갱신
                      </button>
                    </div>

                    {/* Top 케이스 */}
                    {Array.isArray(run.payload?.cases) && run.payload.cases.length ? (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontWeight: 900, marginBottom: 8 }}>Top 케이스 (최대 5개)</div>
                        {run.payload.cases.slice(0, 5).map((c, i) => (
                          <div
                            key={`${run.id}::${c.stationId}::${c.chargerId}::${i}`}
                            style={{
                              paddingTop: 10,
                              marginTop: 10,
                              borderTop: "1px solid #f0f2f6",
                              fontSize: 13,
                              color: "#334155",
                              lineHeight: 1.55,
                            }}
                          >
                            <div style={{ fontWeight: 900 }}>
                              {i + 1}. {c.stationId}/{c.chargerId} · score {fmt(c.score)}
                            </div>
                            <div style={{ color: "#475569" }}>{fmt(c.name, "")}</div>

                            <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>
                              down {fmt(c.downMinutes)}m · prob {fmt(c.downProb6h)} · congestion {fmt(c.trafficCongestion)} · {fmt(c.outputKw)}kW
                            </div>

                            {Array.isArray(c.plan) && c.plan.length ? (
                              <div style={{ marginTop: 8 }}>
                                <div style={{ fontWeight: 900, marginBottom: 4 }}>플랜(상위 4)</div>
                                {c.plan.slice(0, 4).map((p, k) => (
                                  <div key={k} style={{ fontSize: 13 }}>
                                    • <b>{p.action}</b>
                                    {p.eta_min != null ? ` (eta ${p.eta_min}m)` : ""}
                                    {p.reason ? ` — ${p.reason}` : ""}
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </Card>

                  {/* (B) Autopilot LLM 요약 카드 (분리) */}
                  <Card
                    title="Autopilot LLM 요약"
                    right={<Pill bg="#0f766e">explain</Pill>}
                  >
                    <div style={{ fontSize: 12, color: "#64748b" }}>
                      {run.explain ? `생성됨 · ${run.ts}` : "아직 요약이 없습니다. 위에서 'LLM 요약 생성/갱신'을 누르세요."}
                    </div>

                    {run.explain ? (
                      <div style={{ marginTop: 10, fontSize: 13, color: "#334155", lineHeight: 1.55 }}>
                        {run.explain.summary ? (
                          <>
                            <div style={{ fontWeight: 900, marginBottom: 6 }}>요약</div>
                            <div>{run.explain.summary}</div>
                          </>
                        ) : null}

                        {Array.isArray(run.explain.top_reasons) && run.explain.top_reasons.length ? (
                          <div style={{ marginTop: 10 }}>
                            <div style={{ fontWeight: 900, marginBottom: 6 }}>핵심 근거</div>
                            {run.explain.top_reasons.map((x, i) => (
                              <div key={i}>• {x}</div>
                            ))}
                          </div>
                        ) : null}

                        {Array.isArray(run.explain.risks) && run.explain.risks.length ? (
                          <div style={{ marginTop: 10 }}>
                            <div style={{ fontWeight: 900, marginBottom: 6 }}>리스크/주의</div>
                            {run.explain.risks.map((x, i) => (
                              <div key={i}>• {x}</div>
                            ))}
                          </div>
                        ) : null}

                        {Array.isArray(run.explain.suggested_groups) && run.explain.suggested_groups.length ? (
                          <div style={{ marginTop: 10 }}>
                            <div style={{ fontWeight: 900, marginBottom: 6 }}>작업 묶음</div>
                            {run.explain.suggested_groups.map((g, i) => (
                              <div key={i} style={{ marginBottom: 10 }}>
                                <div style={{ fontWeight: 900 }}>• {g.name}</div>
                                {g.hint ? <div style={{ color: "#64748b" }}>{g.hint}</div> : null}
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
                    ) : null}
                  </Card>
                </div>
              ))
            )}
          </div>
        )}

        {/* =========================
           TAB: DETAILS (기록)
        ========================= */}
        {tab === "details" && (
          <div style={{ display: "grid", gap: 12 }}>
            <Card title="실행 기록" right={<Pill bg="#334155">details</Pill>}>
              {events.length === 0 ? (
                <div style={{ color: "#64748b", fontSize: 13 }}>아직 기록이 없습니다.</div>
              ) : (
                <div style={{ display: "grid", gap: 6, fontSize: 12, color: "#334155" }}>
                  {events.map((x, i) => (
                    <div key={i} style={{ borderBottom: "1px solid #f1f5f9", paddingBottom: 6 }}>
                      {x}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card title="선정 결과(최근)" right={<Pill bg="#7c3aed">proc</Pill>}>
              {procRuns.length === 0 ? (
                <div style={{ color: "#64748b", fontSize: 13 }}>없음</div>
              ) : (
                <div style={{ display: "grid", gap: 8, fontSize: 13, color: "#334155" }}>
                  {procRuns.slice(0, 3).map((p) => (
                    <div key={p.id} style={{ padding: 10, borderRadius: 12, border: "1px solid #eef2f7", background: "#fbfcfe" }}>
                      <div style={{ fontWeight: 900 }}>{p.ts}</div>
                      <div style={{ marginTop: 6 }}>
                        winner: <b>{fmt(p.payload?.result?.winner)}</b> · incidents:{" "}
                        <b>{fmt(p.payload?.params?.nIncidents)}</b> · providers:{" "}
                        <b>{fmt(p.payload?.params?.providersCount)}</b>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
