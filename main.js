// main.js — SGR Demo (frontend-only, simulated trains with rotation)

const map = L.map('map', { zoomControl: true }).setView([-2.6, 38.3], 7);

// --- Base layers: Street (OSM) and Satellite (Esri World Imagery) ---
const street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 18,
  attribution: '© OpenStreetMap contributors'
});

const satellite = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  {
    maxZoom: 18,
    attribution:
      'Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, and others'
  }
);

// --- Overlay for borders, roads, and place labels ---
const boundaries = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
  {
    maxZoom: 18,
    attribution: '© Esri — Boundaries and place names'
  }
);

// Add the satellite + boundaries layers by default
satellite.addTo(map);
boundaries.addTo(map);

// Layer control for toggling
L.control.layers(
  { "Street Map": street, "Satellite": satellite },
  { "Labels & Borders": boundaries },
  { position: 'topright' }
).addTo(map);

/*
  Straight-line demo route between:
  - Nairobi Terminus (approx) -> [-1.292066, 36.821945]
  - Mombasa Terminus (approx) -> [-4.043477, 39.668206]
*/
const route = [
  [-1.292066, 36.821945],
  [-1.8, 37.5],
  [-2.3, 38.3],
  [-3.0, 38.9],
  [-3.6, 39.3],
  [-4.043477, 39.668206]
];

// Draw route
const routeLine = L.polyline(route, { color: '#1e40af', weight: 4 }).addTo(map);
map.fitBounds(routeLine.getBounds(), { padding: [40, 40] });

// Haversine helper
function haversine([lat1, lon1], [lat2, lon2]) {
  const R = 6371;
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Interpolate smooth path
function expandRoute(points, stepsPerSegment = 100) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [lat1, lon1] = points[i];
    const [lat2, lon2] = points[i + 1];
    for (let s = 0; s < stepsPerSegment; s++) {
      const t = s / stepsPerSegment;
      const lat = lat1 + (lat2 - lat1) * t;
      const lon = lon1 + (lon2 - lon1) * t;
      out.push([lat, lon]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

const path = expandRoute(route, 200);

// Simulated trains
const trains = [
  { id: 'ENG-101', name: 'Madaraka Express 101', color: 'blue', idx: 0, speedKmph: 110 },
  { id: 'ENG-102', name: 'Inter-County 102', color: 'red', idx: Math.floor(path.length * 0.2), speedKmph: 95 }
];

// --- Custom image icon (rotatable) ---
function makeIcon(label, color, rotation = 0) {
  return L.divIcon({
    className: 'train-icon',
    html: `
      <div style="text-align:center; transform: rotate(${rotation}deg);">
        <img src="assets/train-icon.jpeg" style="width:30px;height:30px;" />
        <div style="font-size:11px;margin-top:2px;color:${color};font-weight:bold">${label}</div>
      </div>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });
}

// Create markers
trains.forEach((t) => {
  const latlng = path[t.idx];
  t.marker = L.marker(latlng, { icon: makeIcon(t.id, t.color) }).addTo(map);
  t.marker.bindPopup(`<strong>${t.name}</strong><br>ID: ${t.id}`).openPopup();
});

let running = true;
const tickMs = 1000;
const metersPerStep = (() => {
  const totalKm = route.reduce((acc, cur, i) => {
    if (i === 0) return 0;
    return acc + haversine(route[i - 1], route[i]);
  }, 0);
  return (totalKm * 1000) / path.length;
})();

function kmphToStepsPerSecond(kmph) {
  const mPerSec = (kmph * 1000) / 3600;
  return mPerSec / metersPerStep;
}

function formatETA(remainingKm, speedKmph) {
  if (speedKmph <= 0) return '—';
  const hours = remainingKm / speedKmph;
  const totalMin = Math.round(hours * 60);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h} h ${m} min`;
}

function updateStatusText() {
  const s = document.getElementById('status');
  s.innerHTML = trains
    .map((t) => {
      const remainingKm = (path.length - 1 - t.idx) * (metersPerStep / 1000);
      return `<strong>${t.name}</strong>: ${Math.round(remainingKm)} km left • ETA ${formatETA(remainingKm, t.speedKmph)}`;
    })
    .join(' &nbsp; | &nbsp; ');
}

// --- Rotation helper ---
function getBearing(p1, p2) {
  const [lat1, lon1] = p1.map((d) => (d * Math.PI) / 180);
  const [lat2, lon2] = p2.map((d) => (d * Math.PI) / 180);
  const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
  const brng = Math.atan2(y, x);
  return ((brng * 180) / Math.PI + 360) % 360;
}

function tick() {
  if (!running) return;
  trains.forEach((t) => {
    const stepsToMove = kmphToStepsPerSecond(t.speedKmph) * (tickMs / 1000);
    const prevIdx = t.idx;
    t.idx = Math.min(path.length - 1, t.idx + stepsToMove);

    const latlng = path[Math.floor(t.idx)];
    const prevLatLng = path[Math.floor(prevIdx)];
    const bearing = getBearing(prevLatLng, latlng);

    t.marker.setLatLng(latlng);
    t.marker.setIcon(makeIcon(t.id, t.color, bearing));

    const remainingKm = (path.length - 1 - t.idx) * (metersPerStep / 1000);
    const popupHtml =
      `<strong>${t.name}</strong><br>ID: ${t.id}<br>` +
      `Speed: ${t.speedKmph} km/h<br>` +
      `Remaining: ${remainingKm.toFixed(1)} km<br>` +
      `ETA: ${formatETA(remainingKm, t.speedKmph)}`;
    t.marker.getPopup().setContent(popupHtml);

    if (Math.floor(t.idx) >= path.length - 1) {
      t.marker.bindPopup(`${t.name} — Arrived`).openPopup();
    }
  });

  updateStatusText();
}

// Start loop
updateStatusText();
let interval = setInterval(tick, tickMs);

// Buttons
document.getElementById('pauseBtn').addEventListener('click', function () {
  running = !running;
  this.textContent = running ? 'Pause' : 'Resume';
});

document.getElementById('resetBtn').addEventListener('click', function () {
  trains[0].idx = 0;
  trains[1].idx = Math.floor(path.length * 0.2);
  trains.forEach((t) => t.marker.setLatLng(path[Math.floor(t.idx)]));
  updateStatusText();
});
