// ============================================================================
// FLAGS — small stylized SVGs generated in-code (no external image fetches,
// no attempt at rendering script/calligraphy). Recognizable by color +
// silhouette, good enough for a passport-stamp motion graphic.
// ============================================================================

function svgUri(inner, viewBox = "0 0 300 200") {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${inner}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function kuwait() {
  return svgUri(`
    <rect width="300" height="200" fill="#fff"/>
    <rect width="300" height="66.6" y="0" fill="#007A3D"/>
    <rect width="300" height="66.6" y="133.3" fill="#CE1126"/>
    <polygon points="0,0 85,100 0,200" fill="#111"/>
  `);
}

function saudiArabia() {
  // Stylized: solid field + abstract sword motif. No script rendered.
  return svgUri(`
    <rect width="300" height="200" fill="#006C35"/>
    <rect x="55" y="152" width="190" height="9" rx="4.5" fill="#fff"/>
    <polygon points="248,148 274,156.5 248,165" fill="#fff"/>
    <rect x="90" y="60" width="120" height="6" rx="3" fill="#ffffff55"/>
    <rect x="90" y="78" width="90" height="6" rx="3" fill="#ffffff55"/>
  `);
}

function qatar() {
  const teeth = 9;
  const bandW = 105;
  const stepH = 200 / teeth;
  let pts = [`0,0`];
  for (let i = 0; i < teeth; i++) {
    const yTop = i * stepH;
    const yMid = yTop + stepH / 2;
    pts.push(`${bandW - 22},${yTop}`);
    pts.push(`${bandW},${yMid}`);
  }
  pts.push(`${bandW - 22},200`);
  pts.push(`0,200`);
  return svgUri(`
    <rect width="300" height="200" fill="#8D1B3D"/>
    <polygon points="${pts.join(" ")}" fill="#fff"/>
  `);
}

function usa() {
  const stripes = [];
  const n = 7;
  for (let i = 0; i < n; i++) {
    if (i % 2 === 0) stripes.push(`<rect x="0" y="${(i * 200) / n}" width="300" height="${200 / n}" fill="#B22234"/>`);
  }
  const stars = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 5; c++) {
      stars.push(`<circle cx="${14 + c * 22}" cy="${14 + r * 22}" r="3.4" fill="#fff"/>`);
    }
  }
  return svgUri(`
    <rect width="300" height="200" fill="#fff"/>
    ${stripes.join("")}
    <rect width="128" height="107" fill="#3C3B6E"/>
    ${stars.join("")}
  `);
}

export const FLAG_BG = {
  KW: kuwait(),
  SA: saudiArabia(),
  QA: qatar(),
  US: usa(),
};

export function applyFlagSwatch(el, code) {
  if (!el) return;
  el.style.backgroundImage = FLAG_BG[code] || "none";
  el.style.backgroundSize = "cover";
  el.style.backgroundPosition = "center";
}
