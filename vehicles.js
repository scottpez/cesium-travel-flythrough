// ============================================================================
// VEHICLE MANIFEST — canvas-rendered PNG icons, guaranteed to render.
//
// History: this used to load CesiumMilkTruck.glb / a318.glb as 3D models —
// root-caused to a318.glb being an invalid glTF 1.0 binary. Switched to SVG
// data-URI billboards — root-caused THAT to a documented Cesium/Firefox bug
// where an SVG billboard with only a viewBox (no explicit width/height)
// renders at 0×0 (CesiumGS/cesium#4068, #12559). Fixed the SVG, but a
// headless Chrome screenshot with the debug panel showing entity.show=true,
// icon set=true, position OK=true STILL rendered nothing visible — so
// something about SVG-as-billboard-texture is still unreliable here even
// with correct dimensions. Eliminating the whole format risk: these icons
// are now drawn with the Canvas 2D API and exported as PNG data URIs, the
// most universally-supported raster format for texture loading — a PNG's
// dimensions are unambiguous, encoded directly in its IHDR header, no XML
// parsing or SVG-in-Image() quirks possible.
//
// Also switched to high-contrast saturated colors (was tan/silver, which
// nearly vanished against actual sandy/gray terrain in a real screenshot).
//
// TO SWAP IN REAL 3D MODELS LATER: give a vehicle def a `modelUri` pointing
// at a verified glTF 2.0 .glb (check the header: bytes 4-7 as a little-endian
// uint32 must read 2, not 1) and switch app.js back to model graphics for
// that vehicle. Until then, these icons are the reliable default.
// ============================================================================

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Plan-view (top-down) icons, nose pointing UP — matches billboard
// alignedAxis's "heading 0 = north = up" convention so rotation reads right.
function drawVan(ctx, w, h, fill) {
  ctx.lineJoin = "round";
  ctx.fillStyle = fill;
  ctx.strokeStyle = "#12141a";
  ctx.lineWidth = 3;
  roundRectPath(ctx, w * 0.30, h * 0.08, w * 0.40, h * 0.86, w * 0.11);
  ctx.fill();
  ctx.stroke();
  // windshield
  ctx.fillStyle = "rgba(20,28,38,0.9)";
  roundRectPath(ctx, w * 0.37, h * 0.16, w * 0.26, h * 0.15, w * 0.03);
  ctx.fill();
  // side/rear glass
  ctx.fillStyle = "rgba(20,28,38,0.45)";
  roundRectPath(ctx, w * 0.35, h * 0.37, w * 0.30, h * 0.40, w * 0.03);
  ctx.fill();
  // headlights
  ctx.fillStyle = "#ffe066";
  roundRectPath(ctx, w * 0.27, h * 0.22, w * 0.06, h * 0.11, w * 0.02);
  ctx.fill();
  roundRectPath(ctx, w * 0.67, h * 0.22, w * 0.06, h * 0.11, w * 0.02);
  ctx.fill();
}

function drawPlane(ctx, w, h, body, accent) {
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#12141a";
  ctx.lineWidth = 2;
  // fuselage
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(w * 0.50, h * 0.04);
  ctx.lineTo(w * 0.59, h * 0.30);
  ctx.lineTo(w * 0.59, h * 0.64);
  ctx.lineTo(w * 0.50, h * 0.95);
  ctx.lineTo(w * 0.41, h * 0.64);
  ctx.lineTo(w * 0.41, h * 0.30);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // wings
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(w * 0.02, h * 0.53); ctx.lineTo(w * 0.41, h * 0.40); ctx.lineTo(w * 0.41, h * 0.57); ctx.lineTo(w * 0.02, h * 0.67);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(w * 0.98, h * 0.53); ctx.lineTo(w * 0.59, h * 0.40); ctx.lineTo(w * 0.59, h * 0.57); ctx.lineTo(w * 0.98, h * 0.67);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // tail
  ctx.beginPath();
  ctx.moveTo(w * 0.30, h * 0.82); ctx.lineTo(w * 0.70, h * 0.82); ctx.lineTo(w * 0.59, h * 0.95); ctx.lineTo(w * 0.41, h * 0.95);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // cockpit window
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  roundRectPath(ctx, w * 0.445, h * 0.14, w * 0.11, h * 0.20, w * 0.02);
  ctx.fill();
}

function makeIcon(width, height, draw) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  draw(ctx, width, height);
  return canvas.toDataURL("image/png");
}

export const VEHICLE_DEFS = {
  van: {
    icon: makeIcon(64, 64, (ctx, w, h) => drawVan(ctx, w, h, "#ff5a36")),
    width: 60, height: 110,
    label: "Rental Van",
  },
  minivan: {
    icon: makeIcon(64, 64, (ctx, w, h) => drawVan(ctx, w, h, "#22c1ff")),
    width: 60, height: 110,
    label: "Budget Rental — Honda Odyssey",
    badge: "budget",
  },
  plane: {
    icon: makeIcon(64, 64, (ctx, w, h) => drawPlane(ctx, w, h, "#F5F1E8", "#8D1B3D")),
    width: 84, height: 116,
    label: "Qatar Airways",
    badge: "qatarairways",
  },
};

export function applyVehicleStyle(billboard, defKey) {
  const def = VEHICLE_DEFS[defKey];
  if (!def) return;
  billboard.image = def.icon;
  billboard.width = def.width;
  billboard.height = def.height;
}
