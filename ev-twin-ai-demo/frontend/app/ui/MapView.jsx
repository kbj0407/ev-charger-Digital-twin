// "use client";

// import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
// import "leaflet/dist/leaflet.css";
// import L from "leaflet";
// import ProcurementSimPanel from "./ProcurementSimPanel";

// delete L.Icon.Default.prototype._getIconUrl;
// L.Icon.Default.mergeOptions({
//   iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
//   iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
//   shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
// });

// function statusColor(health, risk) {
//   if (risk === "CRITICAL") return "#e74c3c";
//   if (risk === "ALERT") return "#f39c12";
//   if (health === "DOWN") return "#d35400";
//   if (health === "DEGRADED") return "#f1c40f";
//   return "#2ecc71";
// }

// function makeDivIcon({ color, pulse }) {
//   const cls = pulse ? "pulse" : "";
//   return L.divIcon({
//     className: "",
//     html: `<div class="${cls}" style="
//       width:14px;height:14px;border-radius:999px;
//       background:${color}; border:2px solid rgba(0,0,0,0.15);
//       box-shadow:0 6px 14px rgba(0,0,0,0.18);
//     "></div>`,
//     iconSize: [14, 14],
//     iconAnchor: [7, 7],
//   });
// }

// export default function MapView({ twins, onSelect, onProcurementRun }) {
//   const center = [37.5665, 126.978];

//   return (
//     <div style={{ position: "relative", height: "100%", width: "100%" }}>
//       {/* ✅ 우측 상단: 선정 시뮬 패널 */}
//       <ProcurementSimPanel onRecommendResult={onProcurementRun} />

//       <MapContainer center={center} zoom={13} style={{ height: "100%", width: "100%" }}>
//         <TileLayer
//           attribution="&copy; OpenStreetMap"
//           url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
//         />

//         {twins.map((t) => {
//           const { health, risk } = t.derived || {};
//           const color = statusColor(health, risk);
//           const pulse = risk === "ALERT" || risk === "CRITICAL";
//           const icon = makeDivIcon({ color, pulse });

//           return (
//             <Marker
//               key={`${t.stationId}_${t.chargerId}`}
//               position={[t.lat, t.lon]}
//               icon={icon}
//               eventHandlers={{ click: () => onSelect(t) }}
//             >
//               <Popup>
//                 <div style={{ minWidth: 220 }}>
//                   <div style={{ fontWeight: 900 }}>{t.name}</div>
//                   <div>
//                     health: <b>{health}</b>
//                   </div>
//                   <div>
//                     risk: <b>{risk}</b>
//                   </div>
//                   <div>
//                     downProb6h: <b>{t.derived?.downProb6h}</b>
//                   </div>
//                 </div>
//               </Popup>
//             </Marker>
//           );
//         })}
//       </MapContainer>
//     </div>
//   );
// }


// "use client";

// import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
// import "leaflet/dist/leaflet.css";
// import L from "leaflet";

// delete L.Icon.Default.prototype._getIconUrl;
// L.Icon.Default.mergeOptions({
//   iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
//   iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
//   shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
// });

// function statusColor(health, risk) {
//   if (risk === "CRITICAL") return "#e74c3c";
//   if (risk === "ALERT") return "#f39c12";
//   if (health === "DOWN") return "#d35400";
//   if (health === "DEGRADED") return "#f1c40f";
//   return "#2ecc71";
// }

// function makeDivIcon({ color, pulse }) {
//   const cls = pulse ? "pulse" : "";
//   return L.divIcon({
//     className: "",
//     html: `<div class="${cls}" style="
//       width:14px;height:14px;border-radius:999px;
//       background:${color}; border:2px solid rgba(0,0,0,0.15);
//       box-shadow:0 6px 14px rgba(0,0,0,0.18);
//     "></div>`,
//     iconSize: [14, 14],
//     iconAnchor: [7, 7],
//   });
// }

// export default function MapView({ twins, onSelect }) {
//   const center = [37.5665, 126.978];

//   return (
//     <div style={{ position: "relative", height: "100%", width: "100%" }}>
//       <MapContainer center={center} zoom={13} style={{ height: "100%", width: "100%" }}>
//         <TileLayer
//           attribution="&copy; OpenStreetMap"
//           url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
//         />

//         {twins.map((t) => {
//           const { health, risk } = t.derived || {};
//           const color = statusColor(health, risk);
//           const pulse = risk === "ALERT" || risk === "CRITICAL";
//           const icon = makeDivIcon({ color, pulse });

//           return (
//             <Marker
//               key={`${t.stationId}_${t.chargerId}`}
//               position={[t.lat, t.lon]}
//               icon={icon}
//               eventHandlers={{ click: () => onSelect(t) }}
//             >
//               <Popup>
//                 <div style={{ minWidth: 220 }}>
//                   <div style={{ fontWeight: 900 }}>{t.name}</div>
//                   <div>
//                     health: <b>{health}</b>
//                   </div>
//                   <div>
//                     risk: <b>{risk}</b>
//                   </div>
//                   <div>
//                     downProb6h: <b>{t.derived?.downProb6h}</b>
//                   </div>
//                 </div>
//               </Popup>
//             </Marker>
//           );
//         })}
//       </MapContainer>
//     </div>
//   );
// }
"use client";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function statusColor(health, risk) {
  if (risk === "CRITICAL") return "#e74c3c";
  if (risk === "ALERT") return "#f39c12";
  if (health === "DOWN") return "#d35400";
  if (health === "DEGRADED") return "#f1c40f";
  return "#2ecc71";
}

// ✅ highlightKeys에 포함된 케이스(오토파일럿 결과)를 더 “세게” 표시
function makeDivIcon({ color, pulse, hot }) {
  const cls = hot ? "pulse-hot" : pulse ? "pulse" : "";

  const size = hot ? 18 : 14;
  const border = hot ? "3px solid rgba(239,68,68,0.95)" : "2px solid rgba(0,0,0,0.15)";
  const shadow = hot
    ? "0 8px 18px rgba(239,68,68,0.22), 0 0 0 8px rgba(239,68,68,0.10)"
    : "0 6px 14px rgba(0,0,0,0.18)";

  return L.divIcon({
    className: "",
    html: `
      <div class="${cls}" style="
        width:${size}px;height:${size}px;border-radius:999px;
        background:${color};
        border:${border};
        box-shadow:${shadow};
      "></div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export default function MapView({ twins, onSelect, highlightKeys }) {
  const center = [37.5665, 126.978];

  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      {/* ✅ hot pulse css (전역 css 건드리기 싫으면 여기서 주입) */}
      <style jsx global>{`
        .pulse {
          animation: pulse 1.4s ease-out infinite;
        }
        .pulse-hot {
          animation: pulseHot 1.1s ease-out infinite;
        }
        @keyframes pulse {
          0% {
            transform: scale(1);
          }
          60% {
            transform: scale(1.35);
          }
          100% {
            transform: scale(1);
          }
        }
        @keyframes pulseHot {
          0% {
            transform: scale(1);
          }
          55% {
            transform: scale(1.55);
          }
          100% {
            transform: scale(1);
          }
        }
      `}</style>

      <MapContainer center={center} zoom={13} style={{ height: "100%", width: "100%" }}>
        <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

        {twins.map((t) => {
          const { health, risk } = t.derived || {};
          const color = statusColor(health, risk);

          const key = `${t.stationId}::${t.chargerId}`;
          const hot = !!highlightKeys?.has?.(key);

          // 기본 pulse: ALERT/CRITICAL
          // hot pulse: highlight 케이스는 더 강하게
          const pulse = risk === "ALERT" || risk === "CRITICAL" || hot;

          const icon = makeDivIcon({ color, pulse, hot });

          return (
            <Marker
              key={`${t.stationId}_${t.chargerId}`}
              position={[t.lat, t.lon]}
              icon={icon}
              eventHandlers={{ click: () => onSelect?.(t) }}
            >
              <Popup>
                <div style={{ minWidth: 240 }}>
                  <div style={{ fontWeight: 900 }}>{t.name}</div>

                  {hot ? (
                    <div style={{ marginTop: 6, fontSize: 12, fontWeight: 900, color: "#ef4444" }}>
                      ✅ Autopilot 추천 케이스
                    </div>
                  ) : null}

                  <div style={{ marginTop: 6 }}>
                    health: <b>{health}</b>
                  </div>
                  <div>
                    risk: <b>{risk}</b>
                  </div>
                  <div>
                    downProb6h: <b>{t.derived?.downProb6h}</b>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
