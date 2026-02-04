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

function makeDivIcon({ color, pulse }) {
  const cls = pulse ? "pulse" : "";
  return L.divIcon({
    className: "",
    html: `<div class="${cls}" style="
      width:14px;height:14px;border-radius:999px;
      background:${color}; border:2px solid rgba(0,0,0,0.15);
      box-shadow:0 6px 14px rgba(0,0,0,0.18);
    "></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

export default function MapView({ twins, onSelect }) {
  const center = [37.5665, 126.978];

  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      <MapContainer center={center} zoom={13} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution="&copy; OpenStreetMap"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {twins.map((t) => {
          const { health, risk } = t.derived || {};
          const color = statusColor(health, risk);
          const pulse = risk === "ALERT" || risk === "CRITICAL";
          const icon = makeDivIcon({ color, pulse });

          return (
            <Marker
              key={`${t.stationId}_${t.chargerId}`}
              position={[t.lat, t.lon]}
              icon={icon}
              eventHandlers={{ click: () => onSelect(t) }}
            >
              <Popup>
                <div style={{ minWidth: 220 }}>
                  <div style={{ fontWeight: 900 }}>{t.name}</div>
                  <div>
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
