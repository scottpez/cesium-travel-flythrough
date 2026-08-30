function o(i,e="0 0 300 200"){const f=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${e}">${i}</svg>`;return`url("data:image/svg+xml,${encodeURIComponent(f)}")`}function l(){return o(`
    <rect width="300" height="200" fill="#fff"/>
    <rect width="300" height="66.6" y="0" fill="#007A3D"/>
    <rect width="300" height="66.6" y="133.3" fill="#CE1126"/>
    <polygon points="0,0 85,100 0,200" fill="#111"/>
  `)}function c(){return o(`
    <rect width="300" height="200" fill="#006C35"/>
    <rect x="55" y="152" width="190" height="9" rx="4.5" fill="#fff"/>
    <polygon points="248,148 274,156.5 248,165" fill="#fff"/>
    <rect x="90" y="60" width="120" height="6" rx="3" fill="#ffffff55"/>
    <rect x="90" y="78" width="90" height="6" rx="3" fill="#ffffff55"/>
  `)}function s(){const f=22.22222222222222;let t=["0,0"];for(let n=0;n<9;n++){const r=n*f,h=r+f/2;t.push(`83,${r}`),t.push(`105,${h}`)}return t.push("83,200"),t.push("0,200"),o(`
    <rect width="300" height="200" fill="#8D1B3D"/>
    <polygon points="${t.join(" ")}" fill="#fff"/>
  `)}function g(){const i=[];for(let t=0;t<7;t++)t%2===0&&i.push(`<rect x="0" y="${t*200/7}" width="300" height="${200/7}" fill="#B22234"/>`);const f=[];for(let t=0;t<4;t++)for(let n=0;n<5;n++)f.push(`<circle cx="${14+n*22}" cy="${14+t*22}" r="3.4" fill="#fff"/>`);return o(`
    <rect width="300" height="200" fill="#fff"/>
    ${i.join("")}
    <rect width="128" height="107" fill="#3C3B6E"/>
    ${f.join("")}
  `)}export const FLAG_BG={KW:l(),SA:c(),QA:s(),US:g()};export function applyFlagSwatch(i,e){i&&(i.style.backgroundImage=FLAG_BG[e]||"none",i.style.backgroundSize="cover",i.style.backgroundPosition="center")}
