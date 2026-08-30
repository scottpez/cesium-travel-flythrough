// ============================================================================
// ENGINE — Kuwait → USA journey animation.
// All trip facts live in itinerary.js. This file is the generic playback
// machine: it stitches legs into one timeline, drives two Cesium viewers
// (cinematic main view + seatback-style minimap), and updates the HUD/DOM.
// ============================================================================

import { ION_ACCESS_TOKEN, USE_PHOTOREALISTIC_TILES } from "./config.js";
import { LEGS, FLAGS, BRAND_BADGES, CREDITS } from "./itinerary.js";
import { VEHICLE_DEFS, applyVehicleStyle } from "./vehicles.js";
import { applyFlagSwatch } from "./flags.js";

Cesium.Ion.defaultAccessToken = ION_ACCESS_TOKEN;

// ---- On-screen error banner ------------------------------------------------
// Registered before anything else runs so it catches viewer-construction
// failures too. If something throws silently (a bad model, a rejected
// promise, a null-ref somewhere in the render loop), this puts the actual
// error message on screen instead of it only existing in devtools — much
// faster to diagnose "I can't see X" reports without a back-and-forth over
// whether the browser console has anything in it.
function showFatalError(msg) {
  let banner = document.getElementById("fatalErrorBanner");
  if (!banner) {
    banner = document.createElement("pre");
    banner.id = "fatalErrorBanner";
    banner.style.cssText =
      "position:fixed;top:0;left:0;right:0;z-index:99999;background:#7f1d1d;color:#fff;" +
      "padding:14px 18px;font-family:'JetBrains Mono',monospace;font-size:12px;" +
      "white-space:pre-wrap;max-height:45vh;overflow:auto;margin:0;border-bottom:3px solid #ef4444;";
    document.body.appendChild(banner);
  }
  banner.textContent += (banner.textContent ? "\n---\n" : "⚠ RUNTIME ERROR (copy this to Claude)\n") + msg;
}
window.addEventListener("error", (e) => {
  showFatalError(`${e.message}\nat ${e.filename}:${e.lineno}:${e.colno}`);
});
window.addEventListener("unhandledrejection", (e) => {
  showFatalError(String((e.reason && e.reason.stack) || e.reason));
});

// Non-fatal, auto-dismissing notice — for things that aren't errors but are
// worth knowing, like "photorealistic tiles didn't load, fell back to OSM
// Buildings" — so which renderer is actually active is never a guessing game.
function showNotice(msg) {
  const el = document.createElement("div");
  el.style.cssText =
    "position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:99998;background:#78350f;color:#fff;" +
    "padding:10px 18px;border-radius:10px;font-family:'JetBrains Mono',monospace;font-size:12px;" +
    "border:1px solid #f59e0b;box-shadow:0 8px 24px rgba(0,0,0,0.5);max-width:80vw;text-align:center;";
  el.textContent = `ℹ ${msg}`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 9000);
}

// ---------------------------------------------------------------- DOM refs
const $ = (id) => document.getElementById(id);
const el = {
  clockTime: $("clockTime"), clockTz: $("clockTz"),
  flagChip: $("flagChip"), flagSwatch: $("flagSwatch"), flagText: $("flagText"),
  poiLabel: $("poiLabel"), poiCode: $("poiCode"), poiFull: $("poiFull"),
  stateLabel: $("stateLabel"),
  chapterCard: $("chapterCard"), chapterEyebrow: $("chapterEyebrow"),
  chapterTitle: $("chapterTitle"), chapterSubtitle: $("chapterSubtitle"),
  stampOverlay: $("stampOverlay"), stampFlagFrom: $("stampFlagFrom"),
  stampFlagTo: $("stampFlagTo"), stampText: $("stampText"),
  celebration: $("celebration"), confettiLayer: $("confettiLayer"),
  celebEmoji: $("celebEmoji"), celebTitle: $("celebTitle"), celebSub: $("celebSub"),
  brandBadge: $("brandBadge"), brandDot: $("brandDot"), brandLogo: $("brandLogo"), brandText: $("brandText"),
  photoMemory: $("photoMemory"), photoMemoryImg: $("photoMemoryImg"), photoMemoryCaption: $("photoMemoryCaption"),
  statDistance: $("statDistance"), statElapsed: $("statElapsed"),
  statAlt: $("statAlt"), statSpeed: $("statSpeed"), statWarp: $("statWarp"),
  progressTrack: $("progressTrack"),
  btnPlay: $("btnPlay"), btnPrevLeg: $("btnPrevLeg"), btnNextLeg: $("btnNextLeg"),
  speedDial: $("speedDial"), speedLabel: $("speedLabel"), legName: $("legName"),
  btnRecordSpeed: $("btnRecordSpeed"),
  bookend: $("bookend"), bookendOpen: $("bookendOpen"), bookendClose: $("bookendClose"),
  btnStart: $("btnStart"), btnReplay: $("btnReplay"),
  sumDistance: $("sumDistance"), sumDuration: $("sumDuration"),
  sumCountries: $("sumCountries"), sumStates: $("sumStates"),
  factTicker: $("factTicker"), factText: $("factText"),
  speedNeedle: $("speedNeedle"), speedUnitLabel: $("speedUnitLabel"),
  creditsRoute: $("creditsRoute"), creditsBy: $("creditsBy"), creditsLogo: $("creditsLogo"),
  debugPanel: $("debugPanel"), btnWarmup: $("btnWarmup"),
};

// ============================================================== VIEWERS ===
const mainViewer = new Cesium.Viewer("cesiumMain", {
  useDefaultRenderLoop: false, // we drive rendering manually in one rAF loop below
  shouldAnimate: false,
  animation: false,
  timeline: false,
  baseLayerPicker: false,
  geocoder: false,
  homeButton: false,
  navigationHelpButton: false,
  sceneModePicker: false,
  infoBox: false,
  selectionIndicator: false,
  fullscreenButton: false,
});
mainViewer.clock.shouldAnimate = false;
// Slightly relaxed detail + a bigger tile cache: this app moves across huge
// distances quickly (whole continents in seconds during time-warped flight
// legs), so favoring fast-arriving tiles over maximum sharpness avoids the
// "gray/missing ground" look of tiles that never caught up to the camera.
mainViewer.scene.globe.maximumScreenSpaceError = 2.2;
mainViewer.scene.globe.tileCacheSize = 3000;
mainViewer.scene.globe.enableLighting = true;
mainViewer.scene.skyAtmosphere.show = true;
mainViewer.scene.fog.enabled = true;
mainViewer.scene.globe.depthTestAgainstTerrain = true;
mainViewer.scene.screenSpaceCameraController.enableCollisionDetection = true;
mainViewer.scene.postProcessStages.fxaa.enabled = true;

const miniViewer = new Cesium.Viewer("cesiumMini", {
  useDefaultRenderLoop: false,
  shouldAnimate: false,
  animation: false,
  timeline: false,
  baseLayerPicker: false,
  geocoder: false,
  homeButton: false,
  navigationHelpButton: false,
  sceneModePicker: false,
  infoBox: false,
  selectionIndicator: false,
  fullscreenButton: false,
  terrainProvider: new Cesium.EllipsoidTerrainProvider(),
});
miniViewer.scene.globe.enableLighting = false;
miniViewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#0a1220");
miniViewer.scene.skyAtmosphere.show = false;
miniViewer.scene.sun.show = false;
miniViewer.scene.moon.show = false;
miniViewer.scene.skyBox.show = false;
miniViewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#030509");
miniViewer.scene.screenSpaceCameraController.enableInputs = false;

// The minimap had no real basemap — just a flat dark color — so the trail
// had no coastlines/landmasses to read against and was easy to miss,
// especially once zoomed out to fit the transatlantic leg. Natural Earth II
// (bundled with CesiumJS, no Ion auth needed) was the first fix, but it only
// ships 3 zoom levels — about 19.6km/pixel at its finest, per its
// tilemapresource.xml — which reads fine zoomed out to the whole trip but
// turns into an unreadable blur once the minimap zooms in tight around a
// single driving leg (camera height as low as ~35km there). Ion World
// Imagery (real satellite/aerial coverage, sharp to city-block level) fixes
// that; since the app already requires a working Ion token for terrain/
// photorealistic tiles, this isn't a new dependency. OpenStreetMap raster
// tiles are the no-auth fallback if that token lacks imagery scope — still
// far sharper than Natural Earth II. Darkened/desaturated either way to
// keep the stylized "seatback map" look instead of a busy, literal basemap.
async function setupMinimapImagery() {
  miniViewer.imageryLayers.removeAll();
  let layer = null;
  try {
    const provider = await Cesium.createWorldImageryAsync();
    layer = miniViewer.imageryLayers.addImageryProvider(provider);
  } catch (e) {
    console.warn("Ion World Imagery unavailable for minimap, falling back to OpenStreetMap.", e);
    try {
      const provider = new Cesium.OpenStreetMapImageryProvider({ url: "https://tile.openstreetmap.org/" });
      layer = miniViewer.imageryLayers.addImageryProvider(provider);
    } catch (e2) {
      console.warn("Minimap basemap imagery unavailable, minimap will stay a flat dark void.", e2);
      return;
    }
  }
  layer.brightness = 0.55;
  layer.saturation = 0.55;
  layer.contrast = 1.15;
  window.__miniLayer = layer; // debug visibility
}

async function setupTerrainAndBuildings() {
  if (USE_PHOTOREALISTIC_TILES) {
    try {
      // Verified against the actual 1.121 bundle: the exported name is
      // createGooglePhotorealistic3DTileset (no "Async" suffix), unlike most
      // other Cesium docs/examples floating around. Wrapping in Promise.resolve
      // handles it whether or not it returns a promise.
      const tileset = await Promise.resolve(Cesium.createGooglePhotorealistic3DTileset());
      mainViewer.scene.primitives.add(tileset);
      return;
    } catch (e) {
      console.warn("Photorealistic 3D Tiles unavailable, falling back to World Terrain + OSM Buildings.", e);
      showNotice("Photorealistic 3D Tiles unavailable (check your Ion token's scopes) — using World Terrain + OSM Buildings instead.");
    }
  }
  try {
    mainViewer.terrainProvider = await Cesium.createWorldTerrainAsync();
  } catch (e) {
    console.warn("World terrain unavailable, using flat ellipsoid.", e);
  }
  try {
    const osm = await Cesium.createOsmBuildingsAsync();
    osm.maximumScreenSpaceError = 24; // cheaper/faster than the 16 default, same reasoning as the globe setting above
    mainViewer.scene.primitives.add(osm);
  } catch (e) {
    console.warn("OSM Buildings unavailable.", e);
  }
}

// ============================================================ TIMELINE ===
const R = Cesium.Math;
const J = Cesium.JulianDate;

function easeOutCubic(t) { t = R.clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); }
function easeInCubic(t) { t = R.clamp(t, 0, 1); return Math.pow(t, 3); }

for (const leg of LEGS) {
  leg.realStart = J.fromIso8601(leg.startUTC);
  leg.realEnd = J.fromIso8601(leg.endUTC);
  leg.realDurationSec = J.secondsDifference(leg.realEnd, leg.realStart);

  if (leg.waypoints) {
    leg._carts = leg.waypoints.map(([lon, lat]) => Cesium.Cartographic.fromDegrees(lon, lat));
    leg._elevs = leg.waypoints.map(([, , elev]) => elev ?? 0);
    leg._geodesics = [];
    const cum = [0];
    for (let i = 1; i < leg._carts.length; i++) {
      const geo = new Cesium.EllipsoidGeodesic(leg._carts[i - 1], leg._carts[i]);
      leg._geodesics.push(geo);
      cum.push(cum[i - 1] + geo.surfaceDistance);
    }
    leg._cumDist = cum;
    leg._totalDist = cum[cum.length - 1];
    leg.avgSpeedMps = leg._totalDist / leg.realDurationSec;
  } else {
    leg._totalDist = 0;
    leg.avgSpeedMps = 0;
  }

  // Non-uniform sim-time -> route-fraction table (lets a leg "dwell" longer,
  // in screen-time, around an interesting moment like a mid-flight sunrise).
  const N = 300;
  const weights = [];
  for (let i = 0; i <= N; i++) {
    const f = i / N;
    let w = 1;
    if (leg.sunriseMoment != null) {
      const width = 0.05;
      const d = (f - leg.sunriseMoment) / width;
      w += 4.5 * Math.exp(-d * d);
    }
    weights.push(w);
  }
  const cumW = [0];
  for (let i = 1; i <= N; i++) cumW.push(cumW[i - 1] + ((weights[i - 1] + weights[i]) / 2) * (1 / N));
  const total = cumW[N];
  leg._fracTable = cumW.map((c, i) => ({ frac: i / N, simFrac: c / total }));
}

let cumSim = 0;
for (const leg of LEGS) {
  leg.simStart = cumSim;
  leg.simEnd = cumSim + leg.simDuration;
  cumSim += leg.simDuration;
}
const TOTAL_SIM = cumSim;
const TRIP_START_JD = LEGS[0].realStart;
const TRIP_END_JD = LEGS[LEGS.length - 1].realEnd;
const TOTAL_REAL_SEC = J.secondsDifference(TRIP_END_JD, TRIP_START_JD);
const TOTAL_DIST_M = LEGS.reduce((s, l) => s + (l._totalDist || 0), 0);

// ---- Fun facts, computed from the real data (not hand-typed, so they never
// go stale if the itinerary is edited) --------------------------------------
function buildFunFacts() {
  const miles = TOTAL_DIST_M / 1609.34;
  const earthPct = (TOTAL_DIST_M / 40075000) * 100; // Earth's circumference ~40,075km
  const flightSec = LEGS.filter((l) => l.type === "flight").reduce((s, l) => s + l.realDurationSec, 0);
  const flightHours = flightSec / 3600;
  const tripDays = TOTAL_REAL_SEC / 86400;
  const countryCount = new Set(LEGS.map((l) => l.countryCode).filter(Boolean)).size;

  const facts = [
    `🌍 ${Math.round(miles).toLocaleString()} miles traveled — about ${earthPct.toFixed(0)}% of the way around the Earth`,
    `🕐 ${Math.round(flightHours)} hours in the air out of ${tripDays.toFixed(1)} days on the road`,
    `🗺️ ${countryCount} countries crossed on this single trip home`,
  ];

  const detourLeg = LEGS.find((l) => l.id === "flight1");
  if (detourLeg) {
    const start = detourLeg._carts[0], end = detourLeg._carts[detourLeg._carts.length - 1];
    const directM = new Cesium.EllipsoidGeodesic(start, end).surfaceDistance;
    const detourMiles = (detourLeg._totalDist - directM) / 1609.34;
    if (detourMiles > 5) {
      facts.push(`✈️ The Dammam→Doha reroute added about ${Math.round(detourMiles)} extra miles to avoid the conflict zone below`);
    }
  }

  // The original flight out of Kuwait was cancelled because of the war's
  // impact on Kuwait International Airport, so the family drove to Dammam,
  // Saudi Arabia to fly out from there instead — distance computed from the
  // actual drive legs so it never goes stale if that route changes.
  const kuwaitDetourMiles = LEGS
    .filter((l) => l.id === "drive1" || l.id === "drive2")
    .reduce((s, l) => s + (l._totalDist || 0), 0) / 1609.34;
  if (kuwaitDetourMiles > 0) {
    facts.push(`🇰🇼 The war's impact on Kuwait International Airport cancelled our flight out of Kuwait — so we drove ${Math.round(kuwaitDetourMiles)} miles to Dammam, Saudi Arabia to fly out instead`);
  }

  const borderCrossings = LEGS.filter((l) => l.flagFrom && l.flagTo).length;
  if (borderCrossings > 0) {
    facts.push(`🛂 ${borderCrossings} international border crossings on this single journey home`);
  }

  let peak = null;
  for (const leg of LEGS) {
    if (!leg._elevs) continue;
    for (const e of leg._elevs) {
      if (!peak || e > peak.elev) peak = { elev: e, legLabel: leg.label };
    }
  }
  if (peak) {
    facts.push(`🏔️ ${Math.round(peak.elev * 3.28084).toLocaleString()} ft — the highest point of the whole trip, crossed during the ${peak.legLabel} drive`);
  }

  facts.push(`🕰️ Kuwait sits 7 hours ahead of State College, PA`);
  facts.push(`🏠 It had been 2 years since my family was last home in the United States`);
  if (LEGS.some((l) => l.sunriseMoment != null)) {
    facts.push(`🌅 Somewhere over the Atlantic, the sun rose mid-flight on the long way to JFK`);
  }

  return facts;
}

function fracFromSimFrac(leg, simFrac) {
  const table = leg._fracTable;
  if (simFrac <= 0) return 0;
  if (simFrac >= 1) return 1;
  let lo = 0, hi = table.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (table[mid].simFrac < simFrac) lo = mid; else hi = mid;
  }
  const a = table[lo], b = table[hi];
  const t = (simFrac - a.simFrac) / (b.simFrac - a.simFrac || 1);
  return a.frac + t * (b.frac - a.frac);
}

// Shared segment lookup for both position (geodesic) and baked elevation.
function findSegment(leg, frac) {
  const cum = leg._cumDist;
  const target = R.clamp(frac, 0, 1) * leg._totalDist;
  let i = 1;
  while (i < cum.length - 1 && cum[i] < target) i++;
  const segLen = cum[i] - cum[i - 1];
  const segFrac = segLen > 0 ? (target - cum[i - 1]) / segLen : 0;
  return { i, segFrac: R.clamp(segFrac, 0, 1) };
}
function cartoAtFrac(leg, frac) {
  const { i, segFrac } = findSegment(leg, frac);
  return leg._geodesics[i - 1].interpolateUsingFraction(segFrac);
}
function bakedGroundElevAtFrac(leg, frac) {
  const { i, segFrac } = findSegment(leg, frac);
  const a = leg._elevs[i - 1], b = leg._elevs[i];
  return a + (b - a) * segFrac;
}

function bearingBetween(c1, c2) {
  const y = Math.sin(c2.longitude - c1.longitude) * Math.cos(c2.latitude);
  const x = Math.cos(c1.latitude) * Math.sin(c2.latitude) -
    Math.sin(c1.latitude) * Math.cos(c2.latitude) * Math.cos(c2.longitude - c1.longitude);
  return Math.atan2(y, x);
}

function climbProfile(leg, frac) {
  if (leg.type !== "flight") return 0;
  const cruise = leg.cruiseAltitude || 10000;
  const climbEnd = 0.10, descentStart = 0.88;
  if (frac < climbEnd) return cruise * easeOutCubic(frac / climbEnd);
  if (frac > descentStart) return cruise * easeInCubic(Math.max(0, 1 - (frac - descentStart) / (1 - descentStart)));
  return cruise + Math.sin(frac * 47.0) * 12;
}

// Baked, always-available ground/altitude estimate. This is what the camera
// targets — it never depends on a terrain tile having arrived yet, which is
// what previously put the camera underground (or aimed at empty space,
// making the vehicle invisible) whenever a tile hadn't loaded in time.
function bakedHeightAtFrac(leg, frac) {
  if (leg.type === "stay" || leg.type === "transfer") return (leg.groundElev || 0) + 12;
  return bakedGroundElevAtFrac(leg, frac) + climbProfile(leg, frac);
}

function computeState(leg, legSimFrac) {
  const frac = fracFromSimFrac(leg, R.clamp(legSimFrac, 0, 1));
  const realTime = J.addSeconds(leg.realStart, frac * leg.realDurationSec, new J());

  if (leg.type === "stay" || leg.type === "transfer") {
    const [lon, lat] = leg.position;
    return { lon, lat, height: bakedHeightAtFrac(leg, frac), heading: 0, pitchDeg: 0, frac, realTime, isStatic: true, leg };
  }

  const eps = 0.0015;
  const carto = cartoAtFrac(leg, frac);
  const carto2 = cartoAtFrac(leg, Math.min(1, frac + eps));
  const heading = bearingBetween(carto, carto2);
  const height = bakedHeightAtFrac(leg, frac);
  const height2 = bakedHeightAtFrac(leg, Math.min(1, frac + eps));
  const groundDist = leg._totalDist * eps;
  const pitchDeg = groundDist > 0 ? R.toDegrees(Math.atan2(height2 - height, Math.max(groundDist, 1))) : 0;

  return {
    lon: R.toDegrees(carto.longitude), lat: R.toDegrees(carto.latitude),
    height, heading, pitchDeg: R.clamp(pitchDeg, -18, 18),
    frac, realTime, isStatic: false, leg,
  };
}

function findLegAt(simSeconds) {
  for (const leg of LEGS) {
    if (simSeconds <= leg.simEnd || leg === LEGS[LEGS.length - 1]) return leg;
  }
  return LEGS[LEGS.length - 1];
}

// ============================================================ ENTITIES ===
let currentVehicleKey = null;
const mainVehicle = mainViewer.entities.add({
  position: Cesium.Cartesian3.fromDegrees(LEGS[0].waypoints[0][0], LEGS[0].waypoints[0][1], 0),
  billboard: {
    image: VEHICLE_DEFS.van.icon,
    width: VEHICLE_DEFS.van.width,
    height: VEHICLE_DEFS.van.height,
    verticalOrigin: Cesium.VerticalOrigin.CENTER,
    horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
    disableDepthTestDistance: Number.POSITIVE_INFINITY, // never let terrain hide it — guarantees visibility
    scaleByDistance: new Cesium.NearFarScalar(200, 1.0, 20000, 0.4),
  },
});
const miniMarker = miniViewer.entities.add({
  position: Cesium.Cartesian3.fromDegrees(LEGS[0].waypoints[0][0], LEGS[0].waypoints[0][1], 0),
  point: { pixelSize: 10, color: Cesium.Color.fromCssColorString("#38bdf8"), outlineColor: Cesium.Color.WHITE, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
});

// Comet trail (main view) — short, recent-history glow behind the vehicle.
// Points are only appended when the vehicle has actually moved, so pausing
// (e.g. to line up an OBS shot) doesn't grow these arrays forever.
const TRAIL_MIN_STEP_M = 2.0;
let lastTrailPos = null;
let trailPositions = [];
const TRAIL_MAX = 46;
mainViewer.entities.add({
  polyline: {
    positions: new Cesium.CallbackProperty(() => trailPositions, false),
    width: 7,
    material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.32, color: Cesium.Color.fromCssColorString("#38bdf8") }),
    clampToGround: false,
  },
});

// Full trip route-so-far (minimap) — grows for the whole journey, drawn
// bright and thick so the "path being traced out" reads clearly at a glance.
let miniTrail = [];
miniViewer.entities.add({
  polyline: {
    positions: new Cesium.CallbackProperty(() => miniTrail, false),
    width: 6,
    material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.55, color: Cesium.Color.fromCssColorString("#fbbf24") }),
    clampToGround: false,
  },
});

// No pre-drawn route preview by design — the only path ever visible is the
// growing trail below (trailPositions / miniTrail), so the route is only
// revealed as it's actually traveled, both in the main view and on the
// minimap. (Previously this block drew the whole route faintly from the
// start; removed per explicit request — the path should follow the vehicle,
// not precede it.)

// ============================================================= STATES ====
let statesGeo = null;
fetch("data/states-ny-nj-pa.geojson").then((r) => r.json()).then((j) => (statesGeo = j)).catch((e) => console.warn("state boundaries failed to load", e));

function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    const intersect = (yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
function findStateName(lon, lat) {
  if (!statesGeo) return null;
  for (const f of statesGeo.features) {
    const rings = f.geometry.coordinates;
    if (pointInRing(lon, lat, rings[0])) return f.properties.name;
  }
  return null;
}

// ============================================================ PLAYBACK ===
let simSeconds = 0;
let playing = false;
let hasStartedOnce = false;
let warmingUp = false;
// The dial's displayed label is a RELATIVE value (0.25x-4x, same as before);
// the actual playback rate is that times BASE_SPEED_SCALE, so the whole
// range plays slower — dial-center ("1.0x" label) now runs at what used to
// be the dial's slowest (0.25x) setting, and the new slowest setting is
// four times slower again.
const BASE_SPEED_SCALE = 0.25;
let playbackMultiplier = BASE_SPEED_SCALE;
// On-screen linger durations below (chapter card, stamp, POI, celebration,
// photo memory, state label, fact ticker) are tuned for dial-center ("1.0x")
// viewing. When recording at a slower dial setting to let tiles load in,
// stretch those same durations by how much slower than dial-center we're
// running — so once the footage is sped back up in an editor to roughly
// normal pace, everything reads on screen for its originally-tuned length
// instead of flashing by. Never shrinks below the tuned duration, so normal
// and fast-forward playback are unaffected.
function overlayDurationScale() {
  const relative = playbackMultiplier / BASE_SPEED_SCALE;
  return Math.max(1, 1 / relative);
}
let lastFrameMs = null;
let lastLegId = null;
let lastStateName = null;
let chapterTimer = null;
// Suppresses the leg-transition block's automatic chapter-card display for
// one upcoming transition — set right before (re)starting the journey so the
// opening leg's card shows a beat after playback begins (via the explicit
// delayed call in startJourney()/btnReplay) instead of instantly, which is
// what happened at page load: render() runs every frame even before Play is
// hit (for the idle camera preview), so leg 0's card was firing at boot.
let suppressNextChapterCard = false;
let stampTimer = null;
let stateTimer = null;
let poiTimer = null;
const visitedCountries = new Set();
const visitedStates = new Set();

function fmtMMSS(totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Every timed on-screen moment, as a downloadable text file, so sound design
// in a video editor can be lined up to the frame instead of guessed at.
function buildCueSheet() {
  const rows = [];
  for (const leg of LEGS) {
    if (leg.chapterTitle) rows.push({ t: leg.simStart, type: "CHAPTER CARD", text: leg.chapterTitle });
    if (leg.flagFrom && leg.flagTo) rows.push({ t: leg.simStart, type: "BORDER STAMP", text: leg.stampText || `${leg.flagFrom} -> ${leg.flagTo}` });
    if (leg.poiStart) rows.push({ t: leg.simStart, type: "LOCATION LABEL", text: leg.poiStart });
    if (leg.poi) rows.push({ t: leg.simStart, type: "LOCATION LABEL", text: leg.poi });
    if (leg.logo) rows.push({ t: leg.simStart, type: "BRAND BADGE", text: BRAND_BADGES[leg.logo]?.text || leg.logo });
    if (leg.celebration) rows.push({ t: leg.simStart + (leg.celebration.delay || 0) / 1000, type: "CELEBRATION", text: leg.celebration.title });
    if (leg.celebrationAt) rows.push({ t: leg.simStart + leg.celebrationAt.triggerFrac * leg.simDuration, type: "CELEBRATION", text: leg.celebrationAt.title });
    if (leg.photoAt) rows.push({ t: leg.simStart + leg.photoAt.triggerFrac * leg.simDuration, type: "PHOTO MEMORY", text: leg.photoAt.caption || leg.photoAt.src });
  }
  rows.sort((a, b) => a.t - b.t);
  const lines = [
    "SFX / MUSIC CUE SHEET — Kuwait to USA journey",
    `Assumes 1.0x playback speed (speed dial centered). Total runtime: ${fmtMMSS(TOTAL_SIM)}`,
    "If you used the speed dial while recording, scale these timestamps accordingly.",
    "",
    ...rows.map((r) => `${fmtMMSS(r.t)}   [${r.type}]   ${r.text}`),
  ];
  return lines.join("\n");
}

function fmtHMS(totalSec) {
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function showChapterCard(leg) {
  if (!leg.chapterTitle) return;
  el.chapterEyebrow.textContent = `LEG ${String(LEGS.indexOf(leg) + 1).padStart(2, "0")}`;
  el.chapterTitle.textContent = leg.chapterTitle;
  el.chapterSubtitle.textContent = leg.chapterSubtitle || "";
  el.chapterCard.classList.add("show");
  clearTimeout(chapterTimer);
  chapterTimer = setTimeout(() => el.chapterCard.classList.remove("show"), 3200 * overlayDurationScale());
}

function showStamp(leg) {
  if (!leg.flagFrom || !leg.flagTo) return;
  applyFlagSwatch(el.stampFlagFrom, leg.flagFrom);
  applyFlagSwatch(el.stampFlagTo, leg.flagTo);
  el.stampText.textContent = leg.stampText || `${FLAGS[leg.flagTo]?.name || leg.flagTo}`;
  el.stampOverlay.classList.remove("stamp-hit");
  void el.stampOverlay.offsetWidth; // restart animation
  el.stampOverlay.classList.add("stamp-hit");
  clearTimeout(stampTimer);
  stampTimer = setTimeout(() => el.stampOverlay.classList.remove("stamp-hit"), 2600 * overlayDurationScale());
}

function updateFlagChip(code, animate) {
  if (!code) return;
  applyFlagSwatch(el.flagSwatch, code);
  el.flagText.textContent = FLAGS[code]?.name || code;
  if (animate) {
    el.flagChip.classList.remove("show");
    void el.flagChip.offsetWidth;
  }
  el.flagChip.classList.add("show");
}

function showPoi(text, sub) {
  if (!text) return;
  el.poiCode.textContent = text;
  el.poiFull.textContent = sub || "";
  el.poiLabel.classList.add("show");
  clearTimeout(poiTimer);
  poiTimer = setTimeout(() => el.poiLabel.classList.remove("show"), 3400 * overlayDurationScale());
}

let celebTimer = null;
function triggerCelebration({ emoji, title, sub, colors, confetti = true }) {
  el.celebEmoji.textContent = emoji || "🎉";
  el.celebTitle.textContent = title || "";
  el.celebSub.textContent = sub || "";

  el.confettiLayer.innerHTML = "";
  if (confetti) {
    const palette = colors && colors.length ? colors : ["#38bdf8", "#fbbf24", "#ffffff"];
    const pieceCount = 70;
    for (let i = 0; i < pieceCount; i++) {
      const piece = document.createElement("div");
      piece.className = "confetti-piece";
      const left = Math.random() * 100;
      const dx = (Math.random() - 0.5) * 220;
      const duration = 2.6 + Math.random() * 1.6;
      const delay = Math.random() * 0.5;
      const size = 6 + Math.random() * 7;
      piece.style.left = `${left}%`;
      piece.style.setProperty("--dx", `${dx}px`);
      piece.style.setProperty("--c", palette[i % palette.length]);
      piece.style.width = `${size}px`;
      piece.style.height = `${size * 1.6}px`;
      piece.style.animationDuration = `${duration}s`;
      piece.style.animationDelay = `${delay}s`;
      el.confettiLayer.appendChild(piece);
    }
  }

  el.celebration.classList.remove("show");
  void el.celebration.offsetWidth;
  el.celebration.classList.add("show");
  clearTimeout(celebTimer);
  celebTimer = setTimeout(() => {
    el.celebration.classList.remove("show");
    el.confettiLayer.innerHTML = "";
  }, 4200 * overlayDurationScale());
}

let photoTimer = null;
function showPhotoMemory({ src, caption, duration = 10000 }) {
  el.photoMemoryImg.src = src;
  el.photoMemoryCaption.textContent = caption || "";
  el.photoMemory.classList.remove("show");
  void el.photoMemory.offsetWidth; // restart zoom animation
  el.photoMemory.classList.add("show");
  clearTimeout(photoTimer);
  photoTimer = setTimeout(() => el.photoMemory.classList.remove("show"), duration * overlayDurationScale());
}

function showBrandBadge(logoKey) {
  const brand = BRAND_BADGES[logoKey];
  if (!brand) { el.brandBadge.classList.remove("show"); return; }
  if (brand.img) {
    el.brandLogo.src = brand.img;
    el.brandLogo.style.display = "block";
    el.brandDot.style.display = "none";
  } else {
    el.brandLogo.style.display = "none";
    el.brandDot.style.display = "block";
    el.brandDot.style.background = brand.color;
  }
  el.brandText.textContent = brand.text;
  el.brandBadge.classList.add("show");
}

function showStateLabel(name) {
  if (!name) return;
  el.stateLabel.textContent = name.toUpperCase();
  el.stateLabel.classList.add("show");
  clearTimeout(stateTimer);
  stateTimer = setTimeout(() => el.stateLabel.classList.remove("show"), 2800 * overlayDurationScale());
}

// ---- rotating fun facts ------------------------------------------------
const FUN_FACTS = buildFunFacts();
let factIndex = -1;
let factRotateTimer = null;
function rotateFact() {
  factIndex = (factIndex + 1) % FUN_FACTS.length;
  el.factText.textContent = FUN_FACTS[factIndex];
  el.factTicker.classList.remove("show");
  void el.factTicker.offsetWidth;
  el.factTicker.classList.add("show");
}
function startFactTicker() {
  if (factRotateTimer) return;
  rotateFact();
  factRotateTimer = setInterval(rotateFact, 7000 * overlayDurationScale());
}

// ---- progress bar ----------------------------------------------------
function buildProgressBar() {
  el.progressTrack.innerHTML = "";
  for (const leg of LEGS) {
    const seg = document.createElement("div");
    seg.className = "progress-seg";
    seg.title = `${leg.label} — click to jump here`;
    seg.style.flexGrow = String(Math.max(leg.simDuration, 3));
    const fill = document.createElement("div");
    fill.className = "fill";
    seg.appendChild(fill);
    // Clicking anywhere in a leg's segment jumps to the START of that leg
    // (not the clicked-through fraction) — matches how the ⏮/⏭ buttons
    // already jump to leg boundaries, so the whole timeline behaves one way.
    seg.addEventListener("click", () => {
      clearPendingCelebrations();
      simSeconds = leg.simStart;
      render();
    });
    leg._segEl = seg;
    el.progressTrack.appendChild(seg);
  }
}
buildProgressBar();

function updateProgressBar(currentLeg, legFrac) {
  for (const leg of LEGS) {
    const fillEl = leg._segEl.firstChild;
    leg._segEl.classList.toggle("active", leg === currentLeg);
    if (leg.simEnd <= simSeconds) {
      leg._segEl.classList.add("done");
      fillEl.style.width = "100%";
    } else if (leg === currentLeg) {
      leg._segEl.classList.remove("done");
      fillEl.style.width = `${legFrac * 100}%`;
    } else {
      leg._segEl.classList.remove("done");
      fillEl.style.width = "0%";
    }
  }
}

// ---- local clock (rolls through real timezones along the route) ------
function tzOffsetHoursFor(lon) {
  if (lon > 44) return 3;      // Gulf (AST)
  return -4;                    // US East coast in July (EDT)
}
function updateLocalClock(realTime, lon) {
  const offsetH = tzOffsetHoursFor(lon);
  const shifted = J.addSeconds(realTime, offsetH * 3600, new J());
  const gDate = J.toGregorianDate(shifted);
  const hh = String(gDate.hour).padStart(2, "0");
  const mm = String(gDate.minute).padStart(2, "0");
  el.clockTime.textContent = `${hh}:${mm}`;
  el.clockTz.textContent = `LOCAL TIME · UTC${offsetH >= 0 ? "+" : ""}${offsetH}`;
}

// ============================================================= CAMERA ====
let idleAngle = 0;
let orbitAngle = 0;
// Real road data has actual sharp turns and tightly-spaced points at
// intersections/interchanges — computing heading fresh every frame from
// instantaneous position deltas (as before) makes the camera visibly snap
// around at those spots. Smoothing the heading the camera actually uses
// (separately from state.heading, which the vehicle icon still follows
// exactly) fixes that without softening how sharply the vehicle itself turns.
let smoothedHeadingRad = null;
let lastChaseLegId = null;

// Extra clearance added to the camera's baked target height on top of the
// per-waypoint estimate. Real terrain has local roughness (road cuts, small
// hills) our hand-estimated per-waypoint elevation can't capture exactly —
// this margin, combined with a steeper look-down angle below, keeps the
// camera comfortably clear of that roughness instead of relying on the
// baked number being exactly right.
// Tuned so the camera clears at least 100m above the baked ground estimate
// on driving/border legs, and well beyond that everywhere else.
const CAMERA_HEIGHT_MARGIN = { flight: 60, other: 70 };
let lastCameraDebug = {};

function updateMainCamera(state, leg) {
  const margin = leg.type === "flight" ? CAMERA_HEIGHT_MARGIN.flight : CAMERA_HEIGHT_MARGIN.other;
  const targetHeight = state.height + margin;
  const target = Cesium.Cartesian3.fromDegrees(state.lon, state.lat, targetHeight);

  if (leg.cameraStyle === "orbit" || state.isStatic) {
    orbitAngle += 0.0028;
    lastChaseLegId = null; // next chase leg should snap fresh, not smooth in from a stale heading
    const pitch = R.toRadians(-36);
    const range = leg.type === "stay" ? 550 : 450;
    mainViewer.camera.lookAt(target, new Cesium.HeadingPitchRange(orbitAngle, pitch, range));
    lastCameraDebug = { style: "orbit", headingDeg: R.toDegrees(orbitAngle) % 360, pitchDeg: -36, targetHeight, range };
    return;
  }

  // Chase camera: behind the vehicle, looking forward in the direction of
  // travel. See the heading comment below for how that's actually derived.
  const isFlight = leg.type === "flight";
  // Previously an oscillating ±18° "cruise drift" was added to the camera's
  // heading here for a subtle cinematic sway during flight cruise — but it
  // was never applied to the plane model's own orientation (which points
  // exactly along the true travel path via alignedAxis below), so the two
  // diverged: the camera panned side to side while the plane held its real
  // heading, making the plane look like it was crabbing/turning sideways
  // relative to the frame. Removed — the camera now always matches the
  // vehicle's actual heading, so it stays locked directly behind it.
  // HeadingPitchRange's heading is the compass direction the CAMERA FACES,
  // not the bearing from target to camera (traced this through the actual
  // shipped rotation math with concrete heading values — heading=0 puts the
  // camera south of target looking north — rather than assume from docs).
  // So matching the travel heading directly, with no +180 offset, makes the
  // camera look the same way the vehicle is moving — which places it behind
  // the vehicle looking forward, since lookAt backs the camera off along the
  // view direction by `range` before pointing it at the target.
  // Smoothing exists to stop the camera snapping around at sharp road
  // intersections in real driving data — flight waypoints are sparse and the
  // great-circle path curves gradually, so there's no jitter to smooth away,
  // and the filter's lag (however small per frame) only ever pulls the
  // camera OFF the plane's true heading with nothing to gain. Flights use
  // the exact instantaneous heading; only driving legs still smooth it.
  if (isFlight) {
    smoothedHeadingRad = state.heading;
    lastChaseLegId = leg.id;
  } else if (lastChaseLegId !== leg.id) {
    smoothedHeadingRad = state.heading; // fresh leg (or coming out of an orbit shot) — snap, don't sweep in
    lastChaseLegId = leg.id;
  } else {
    let diff = state.heading - smoothedHeadingRad;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff)); // shortest signed angular distance, handles 0/360 wrap
    smoothedHeadingRad += diff * 0.10;
  }
  const headingDeg = R.toDegrees(smoothedHeadingRad);
  const heading = R.toRadians(headingDeg);
  // Shallower look-down angle than before so more of the horizon/road ahead
  // is in frame, not just the ground right under the vehicle. Range bumped
  // up to compensate so ground clearance stays comfortably over 100m even
  // at the shallower angle (height above target = range * sin(|pitch|)).
  const pitchDeg = isFlight ? -9 - state.pitchDeg * 0.3 : -14;
  const pitch = R.toRadians(pitchDeg);
  const range = isFlight ? 990 : 475; // shallower angle than before, range increased to hold clearance: driving 475*sin(14°)+55 ≈ 170m

  mainViewer.camera.lookAt(target, new Cesium.HeadingPitchRange(heading, pitch, range));
  lastCameraDebug = { style: "chase", headingDeg: ((headingDeg % 360) + 360) % 360, travelHeadingDeg: ((R.toDegrees(state.heading) % 360) + 360) % 360, pitchDeg, targetHeight, range };
}

// Minimap camera zooms to fit the WHOLE route traveled so far (like a flight
// tracker), instead of tightly hugging the current position — that's what
// makes the drawn path itself the star of the minimap as it grows.
let boundsMinLon = null, boundsMaxLon, boundsMinLat, boundsMaxLat;
function expandBounds(lon, lat) {
  if (boundsMinLon === null) { boundsMinLon = boundsMaxLon = lon; boundsMinLat = boundsMaxLat = lat; return; }
  boundsMinLon = Math.min(boundsMinLon, lon);
  boundsMaxLon = Math.max(boundsMaxLon, lon);
  boundsMinLat = Math.min(boundsMinLat, lat);
  boundsMaxLat = Math.max(boundsMaxLat, lat);
}

let miniLon = null, miniLat = null, miniHeight = 700000;
function updateMiniCamera(state) {
  expandBounds(state.lon, state.lat);
  const centerLon = (boundsMinLon + boundsMaxLon) / 2;
  const centerLat = (boundsMinLat + boundsMaxLat) / 2;
  const midLatRad = R.toRadians(centerLat);
  const metersPerDegLon = 111320 * Math.max(Math.cos(midLatRad), 0.05);
  const metersPerDegLat = 110540;
  const wMeters = Math.max(boundsMaxLon - boundsMinLon, 0.01) * metersPerDegLon;
  const hMeters = Math.max(boundsMaxLat - boundsMinLat, 0.01) * metersPerDegLat;
  const neededSpan = Math.max(wMeters, hMeters) * 1.35; // padding so the route never touches the edge
  const targetHeight = Math.max(neededSpan * 0.87, 35000);

  if (miniLon == null) { miniLon = centerLon; miniLat = centerLat; miniHeight = targetHeight; }
  const k = 0.03; // slow, deliberate "zooming out to reveal more" easing
  miniLon += (centerLon - miniLon) * k;
  miniLat += (centerLat - miniLat) * k;
  miniHeight += (targetHeight - miniHeight) * k;
  miniViewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(miniLon, miniLat, miniHeight),
    orientation: { heading: 0, pitch: R.toRadians(-90), roll: 0 },
  });
  miniMarker.position = Cesium.Cartesian3.fromDegrees(state.lon, state.lat, state.height + 500);
}

// idle establishing shot before playback starts
function updateIdleCamera() {
  idleAngle += 0.0006;
  const first = LEGS[0];
  const [lon, lat] = first.waypoints[0];
  mainViewer.camera.lookAt(
    Cesium.Cartesian3.fromDegrees(lon, lat, 0),
    new Cesium.HeadingPitchRange(idleAngle, R.toRadians(-32), 3200000)
  );
}

// ============================================================ MAIN LOOP ==
function render() {
  const leg = findLegAt(simSeconds);
  const legFrac = leg.simDuration > 0 ? R.clamp((simSeconds - leg.simStart) / leg.simDuration, 0, 1) : 1;
  const state = computeState(leg, legFrac);

  // -- leg transition side-effects --
  if (leg.id !== lastLegId) {
    lastLegId = leg.id;
    leg._celebFired = false;
    leg._photoFired = false;
    // A leg's own photo trigger fires later (mid-leg, not at frac 0), so it's
    // always safe to clear whatever the previous leg was showing right here —
    // otherwise a photo could persist past its 5s display window into an
    // unrelated leg if legs advance faster than that (e.g. spamming skip).
    clearTimeout(photoTimer);
    el.photoMemory.classList.remove("show");
    if (hasStartedOnce && !suppressNextChapterCard) showChapterCard(leg);
    suppressNextChapterCard = false;
    if (leg.flagFrom && leg.flagTo) showStamp(leg);
    if (leg.countryCode) { updateFlagChip(leg.countryCode, hasStartedOnce); visitedCountries.add(leg.countryCode); }
    if (leg.logo) showBrandBadge(leg.logo); else el.brandBadge.classList.remove("show");
    if (leg.poiStart) showPoi(leg.poiStart, "");
    else if (leg.poi) showPoi(leg.poi, "");
    el.legName.textContent = leg.label;
    if (leg.celebration && hasStartedOnce) {
      clearTimeout(leg._celebScheduled);
      leg._celebScheduled = setTimeout(() => triggerCelebration(leg.celebration), leg.celebration.delay || 0);
    }
  }
  if (leg.poiEnd && legFrac > 0.86 && legFrac < 0.998) {
    if (el.poiCode.textContent !== leg.poiEnd) showPoi(leg.poiEnd, "");
  }
  if (leg.celebrationAt && !leg._celebFired && legFrac >= leg.celebrationAt.triggerFrac) {
    leg._celebFired = true;
    triggerCelebration(leg.celebrationAt);
  }
  if (leg.photoAt && !leg._photoFired && legFrac >= leg.photoAt.triggerFrac) {
    leg._photoFired = true;
    showPhotoMemory(leg.photoAt);
  }

  // -- vehicle icon / visibility --
  if (leg.vehicle) {
    if (currentVehicleKey !== leg.vehicle) {
      applyVehicleStyle(mainVehicle.billboard, leg.vehicle);
      currentVehicleKey = leg.vehicle;
    }
    mainVehicle.show = true;
    // Always use the baked height with HeightReference.NONE — for every leg
    // type, not just flights. RELATIVE_TO_GROUND clamps against the classic
    // scene.globe terrain, which stays a bare flat ellipsoid at sea level
    // when Google Photorealistic 3D Tiles is active (it's a separate
    // primitive, not assigned as the globe's terrain provider) — a real
    // screenshot test confirmed the billboard's own state was all correct
    // (entity.show, position, image) yet nothing rendered, which is exactly
    // what you'd see if it were silently clamping to sea level while the
    // camera looks at the baked ~80m target far above it. Using the same
    // baked height for both keeps them always looking at the same point.
    const pos = Cesium.Cartesian3.fromDegrees(state.lon, state.lat, state.height);
    mainVehicle.billboard.heightReference = Cesium.HeightReference.NONE;
    mainVehicle.position = pos;

    // Orient the plan-view icon along the direction of travel: take a point
    // a short distance ahead (in the already-known heading direction) and
    // use the world-space vector toward it as alignedAxis. This sidesteps
    // any question of local-frame/model-orientation conventions entirely —
    // it's just "which way is the vehicle actually moving in 3D space."
    const eps2 = 0.0006;
    const aheadLon = state.lon + (Math.sin(state.heading) * eps2) / Math.max(Math.cos(R.toRadians(state.lat)), 0.05);
    const aheadLat = state.lat + Math.cos(state.heading) * eps2;
    const posAhead = Cesium.Cartesian3.fromDegrees(aheadLon, aheadLat, state.height);
    const diff = Cesium.Cartesian3.subtract(posAhead, pos, new Cesium.Cartesian3());
    const diffLen = Cesium.Cartesian3.magnitude(diff);
    window.__lastAlignedAxisDiffLen = diffLen; // debug-panel visibility into whether this ever degenerates
    mainVehicle.billboard.alignedAxis = diffLen > 1e-6
      ? Cesium.Cartesian3.normalize(diff, new Cesium.Cartesian3())
      : Cesium.Cartesian3.UNIT_Z; // degenerate direction — skip rather than risk NaN

    if (lastTrailPos === null || Cesium.Cartesian3.distance(pos, lastTrailPos) > TRAIL_MIN_STEP_M) {
      lastTrailPos = pos;
      trailPositions.push(pos);
      if (trailPositions.length > TRAIL_MAX) trailPositions.shift();
      miniTrail.push(pos);
    }
  } else {
    mainVehicle.show = false;
  }

  // -- state boundary detection (US driving legs) --
  if (statesGeo && !state.isStatic && leg.countryCode === "US") {
    const name = findStateName(state.lon, state.lat);
    if (name && name !== lastStateName) { showStateLabel(name); lastStateName = name; visitedStates.add(name); }
    if (!name) lastStateName = null;
  }

  // -- cameras --
  if (!warmingUp) {
    if (hasStartedOnce) {
      updateMainCamera(state, leg);
    } else {
      updateIdleCamera();
    }
  }
  updateMiniCamera(state);
  updateLocalClock(state.realTime, state.lon);

  // -- clock / lighting --
  // Verified against the shipped Cesium source: Viewer.render() -> CesiumWidget.render()
  // -> clock.tick() -> fires the clock's onTick event -> Viewer's dataSourceDisplay.update()
  // -> THEN scene.render(). dataSourceDisplay.update() is what converts entities.add()
  // graphics (billboards, polylines, points) into actual renderable primitives each
  // frame. Calling scene.render() directly (as this code did until now) skips clock.tick()
  // entirely, so that update never ran — every entity was configured correctly and simply
  // never got synced to anything the GPU could draw. This is the real root cause of the
  // vehicle/minimap-trail invisibility, confirmed via a headless screenshot test where a
  // maximally simple test billboard, tracking the exact live position of the (also
  // correctly-configured) real vehicle, still didn't render — ruling out every
  // billboard-specific property and pointing at the render call itself.
  mainViewer.clock.currentTime = state.realTime;
  mainViewer.render();
  miniViewer.render();

  // -- HUD --
  const distSoFarM = LEGS.filter((l) => l.simEnd <= simSeconds).reduce((s, l) => s + (l._totalDist || 0), 0)
    + (leg._totalDist || 0) * state.frac;
  el.statDistance.textContent = Math.round(distSoFarM / 1609.34).toLocaleString();
  const elapsedRealSec = J.secondsDifference(state.realTime, TRIP_START_JD);
  el.statElapsed.textContent = fmtHMS(Math.max(0, elapsedRealSec));
  el.statAlt.textContent = Math.round(state.height * 3.28084).toLocaleString();
  // Real-world avg speed (distance / gate-to-gate real duration) reads as
  // absurdly slow — it bakes in border waits, taxiing, boarding, etc. Legs
  // instead carry a `speedOverride` with a plausible cruising/highway figure
  // in the unit actually used in that region (km/h for Kuwait/Saudi driving,
  // mph for US driving and for the flight legs' displayed cruise speed).
  const isStaticLeg = leg.type === "stay" || leg.type === "transfer";
  const override = leg.speedOverride;
  const displaySpeed = isStaticLeg ? 0 : (override ? override.value : (leg.avgSpeedMps || 0) * 2.23694);
  el.statSpeed.textContent = Math.round(displaySpeed).toLocaleString();
  if (!isStaticLeg && override) el.speedUnitLabel.textContent = override.unit;
  // Gauge needle is normalized to an mph-equivalent regardless of the
  // displayed unit, so a km/h leg still deflects the needle sensibly.
  const speedMphEquivalent = isStaticLeg ? 0
    : override ? (override.unit === "km/h" ? override.value * 0.621371 : override.value)
    : (leg.avgSpeedMps || 0) * 2.23694;
  const gaugeMax = leg.type === "flight" ? 600 : 100; // separate scales so driving speeds still read as meaningful needle deflection
  const gaugePct = R.clamp(speedMphEquivalent / gaugeMax, 0, 1);
  el.speedNeedle.style.transform = `rotate(${-90 + gaugePct * 180}deg)`;
  // How many real-world trip-seconds pass for every one wall-clock second
  // the viewer watches. leg.realDurationSec/leg.simDuration is this leg's
  // own fixed cinematic compression (baked into the itinerary, e.g. a long
  // flight squeezed into a short watch-time); playbackMultiplier is the
  // live speed-dial setting. Previously this stat only showed the fixed
  // per-leg ratio and never moved when the dial did, despite sitting right
  // next to it — multiplying by playbackMultiplier ties it to the control.
  const warpX = leg.simDuration > 0 ? (leg.realDurationSec / leg.simDuration) * playbackMultiplier : playbackMultiplier;
  const dwelling = leg.sunriseMoment != null && Math.abs(state.frac - leg.sunriseMoment) < 0.06;
  el.statWarp.textContent = dwelling ? "SLOW-MO" : `${warpX >= 100 ? Math.round(warpX) : warpX.toFixed(1)}×`;

  updateProgressBar(leg, legFrac);

  if (document.body.classList.contains("debug")) {
    const cam = mainViewer.camera.positionCartographic;
    const vPos = mainVehicle.position?.getValue?.(mainViewer.clock.currentTime);
    const posValid = vPos && Number.isFinite(vPos.x) && Number.isFinite(vPos.y) && Number.isFinite(vPos.z);
    el.debugPanel.textContent =
      `leg          ${leg.id}  (${leg.type})\n` +
      `frac         ${state.frac.toFixed(3)}\n` +
      `--- vehicle ---\n` +
      `vehicle key  ${currentVehicleKey ?? "none"}\n` +
      `entity.show  ${mainVehicle.show}\n` +
      `icon len     ${mainVehicle.billboard?.image?.getValue?.()?.length ?? "-"}\n` +
      `icon prefix  ${(mainVehicle.billboard?.image?.getValue?.() ?? "").slice(0, 24)}\n` +
      `bb width/h   ${mainVehicle.billboard?.width?.getValue?.()}/${mainVehicle.billboard?.height?.getValue?.()}\n` +
      `bb show      ${mainVehicle.billboard?.show?.getValue?.() ?? mainVehicle.billboard?.show}\n` +
      `bb scale     ${mainVehicle.billboard?.scale?.getValue?.() ?? "(unset=1)"}\n` +
      `bb heightRef ${mainVehicle.billboard?.heightReference?.getValue?.()}\n` +
      `position OK  ${leg.vehicle ? posValid : "n/a (no vehicle this leg)"}\n` +
      `lon,lat      ${state.lon.toFixed(4)}, ${state.lat.toFixed(4)}\n` +
      `--- camera ---\n` +
      `travel hdg   ${lastCameraDebug.travelHeadingDeg?.toFixed(1) ?? "-"}°\n` +
      `camera hdg   ${lastCameraDebug.headingDeg?.toFixed(1) ?? "-"}°\n` +
      `camera pitch ${lastCameraDebug.pitchDeg?.toFixed(1) ?? "-"}°\n` +
      `target h     ${lastCameraDebug.targetHeight?.toFixed(1) ?? "-"} m\n` +
      `vehicle h    ${state.height.toFixed(1)} m\n` +
      `cam actual h ${cam ? cam.height.toFixed(1) : "-"} m\n` +
      `range        ${lastCameraDebug.range ?? "-"} m\n` +
      `--- minimap ---\n` +
      `trail pts    ${miniTrail.length}\n` +
      `mini height  ${miniHeight?.toFixed(0) ?? "-"} m\n` +
      `mini layers  ${miniViewer.imageryLayers.length}\n` +
      `mini l.show  ${window.__miniLayer?.show} alpha=${window.__miniLayer?.alpha}\n` +
      `mini l.ready ${window.__miniLayer?.imageryProvider?.ready ?? window.__miniLayer?.ready}\n` +
      `alignAxisLen ${window.__lastAlignedAxisDiffLen?.toExponential(2) ?? "-"}\n` +
      `billboards   ${mainViewer.scene.primitives.length} primitives, entities=${mainViewer.entities.values.length}`;
  }
}

let fatalErrorReported = false;
function tick(nowMs) {
  try {
    if (lastFrameMs == null) lastFrameMs = nowMs;
    const dtMs = Math.min(nowMs - lastFrameMs, 100);
    lastFrameMs = nowMs;
    if (playing && hasStartedOnce) {
      simSeconds += (dtMs / 1000) * playbackMultiplier;
      if (simSeconds >= TOTAL_SIM) {
        simSeconds = TOTAL_SIM;
        onJourneyComplete();
      }
    }
    render();
    requestAnimationFrame(tick); // only re-schedule if this frame actually succeeded
  } catch (err) {
    if (!fatalErrorReported) {
      fatalErrorReported = true;
      showFatalError(`tick()/render() threw — the render loop has stopped.\n${err.stack || err}`);
    }
  }
}

function onJourneyComplete() {
  playing = false;
  el.btnPlay.textContent = "▶";
  el.sumDistance.textContent = `${Math.round(TOTAL_DIST_M / 1609.34).toLocaleString()} mi`;
  el.sumDuration.textContent = fmtHMS(TOTAL_REAL_SEC);
  el.sumCountries.textContent = String(visitedCountries.size);
  el.sumStates.textContent = String(visitedStates.size);
  el.creditsRoute.textContent = LEGS.map((l) => l.label).join("  ·  ");
  el.creditsBy.textContent = `Filmed by ${CREDITS.filmedBy} · ${CREDITS.website}`;
  if (CREDITS.logo) {
    el.creditsLogo.onload = () => el.creditsLogo.classList.add("show");
    el.creditsLogo.onerror = () => el.creditsLogo.classList.remove("show");
    el.creditsLogo.src = CREDITS.logo;
  }
  el.bookendOpen.classList.add("hidden");
  el.bookendClose.classList.remove("hidden");
  el.bookend.classList.remove("hidden");
}

// ---- tile pre-cache warm-up ---------------------------------------------
// Sweeps the camera briefly over every waypoint in the whole route BEFORE
// real playback, so Cesium's tile requests for those regions go out with a
// head start instead of exactly when the animated camera arrives — that gap
// is what reads as low-res/missing ground during fast, time-warped legs.
// This doesn't change how much data has to download; it just front-loads
// the wait into one deliberate pass instead of scattering it through the
// recording. See also: the strategy notes for reducing that download load
// in the first place (config.js / README-style comments near the top).
async function warmUpTiles() {
  if (warmingUp) return;
  warmingUp = true;
  const wasPlaying = playing;
  playing = false;
  el.btnWarmup.disabled = true;

  const points = [];
  for (const leg of LEGS) {
    if (leg.waypoints) {
      for (const [lon, lat] of leg.waypoints) points.push({ lon, lat, isFlight: leg.type === "flight" });
    } else if (leg.position) {
      points.push({ lon: leg.position[0], lat: leg.position[1], isFlight: false });
    }
  }

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    mainViewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.isFlight ? 6000 : 900),
      orientation: { heading: 0, pitch: R.toRadians(-90), roll: 0 },
    });
    mainViewer.render();
    el.btnWarmup.textContent = `🔥 ${Math.round(((i + 1) / points.length) * 100)}%`;
    await new Promise((resolve) => setTimeout(resolve, 90));
  }

  el.btnWarmup.textContent = "✓ Warmed Up";
  warmingUp = false;
  playing = wasPlaying;
  setTimeout(() => {
    el.btnWarmup.textContent = "🔥 Warm Up";
    el.btnWarmup.disabled = false;
  }, 2000);
}

// ============================================================== CONTROLS =
el.btnWarmup.addEventListener("click", warmUpTiles);
el.btnPlay.addEventListener("click", () => {
  if (!hasStartedOnce) { startJourney(); return; }
  playing = !playing;
  el.btnPlay.textContent = playing ? "⏸" : "▶";
});
function clearPendingCelebrations() {
  for (const leg of LEGS) clearTimeout(leg._celebScheduled);
  clearTimeout(celebTimer);
  el.celebration.classList.remove("show");
  el.confettiLayer.innerHTML = "";
}
el.btnPrevLeg.addEventListener("click", () => {
  clearPendingCelebrations();
  const leg = findLegAt(simSeconds);
  const idx = LEGS.indexOf(leg);
  const target = simSeconds - leg.simStart < 0.6 ? Math.max(0, idx - 1) : idx;
  simSeconds = LEGS[Math.max(0, target)].simStart;
  render();
});
el.btnNextLeg.addEventListener("click", () => {
  clearPendingCelebrations();
  const leg = findLegAt(simSeconds);
  const idx = Math.min(LEGS.length - 1, LEGS.indexOf(leg) + 1);
  simSeconds = LEGS[idx].simStart;
  render();
});
// Dial position -3.3..2 maps exponentially to a relative speed of ~0.1x-4x
// (2^-3.3 ≈ 0.10x is the record-speed preset below; 2^0 = 1x is dial-center,
// matching the original 0.25x-4x range before the record preset extended it).
const RECORD_SPEED_DIAL_VALUE = -3.3;
function setSpeedDialValue(v) {
  v = R.clamp(v, parseFloat(el.speedDial.min), parseFloat(el.speedDial.max));
  el.speedDial.value = v;
  const relative = Math.pow(2, v); // what the label shows
  playbackMultiplier = BASE_SPEED_SCALE * relative; // what actually drives playback
  el.speedLabel.textContent = `${relative.toFixed(relative < 1 ? 2 : 1)}×`;
  el.btnRecordSpeed.classList.toggle("active", Math.abs(v - RECORD_SPEED_DIAL_VALUE) < 0.01);
}
el.speedDial.addEventListener("input", () => setSpeedDialValue(parseFloat(el.speedDial.value)));
el.btnRecordSpeed.addEventListener("click", () => setSpeedDialValue(RECORD_SPEED_DIAL_VALUE));
// The Cinematic FX / Cue Sheet / Debug / Presentation Mode buttons were
// removed from the control bar to declutter it. The underlying features
// still work, reachable via URL param for anyone who wants them (recording
// setup, troubleshooting) without them cluttering the everyday UI:
//   ?cinematic    letterbox + film grain
//   ?presentation hides the HUD/controls entirely
//   ?debug        the on-screen diagnostic readout
//   ?autostart, ?fast=N  see boot() below
function downloadCueSheet() {
  const blob = new Blob([buildCueSheet()], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "journey-cue-sheet.txt";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
el.btnStart.addEventListener("click", startJourney);
el.btnReplay.addEventListener("click", () => {
  clearPendingCelebrations();
  simSeconds = 0;
  lastLegId = null;
  lastStateName = null;
  visitedCountries.clear();
  visitedStates.clear();
  trailPositions = [];
  miniTrail = [];
  lastTrailPos = null;
  boundsMinLon = null;
  miniLon = miniLat = null;
  el.bookend.classList.add("hidden");
  playing = true;
  el.btnPlay.textContent = "⏸";
  suppressNextChapterCard = true;
  setTimeout(() => showChapterCard(findLegAt(simSeconds)), CHAPTER_CARD_START_DELAY_MS);
});

const CHAPTER_CARD_START_DELAY_MS = 1500;

function startJourney() {
  hasStartedOnce = true;
  playing = true;
  el.btnPlay.textContent = "⏸";
  el.bookend.classList.add("hidden");
  startFactTicker();
  setTimeout(() => showChapterCard(findLegAt(simSeconds)), CHAPTER_CARD_START_DELAY_MS);
}

// ================================================================= BOOT ==
// Exposes internals for console-based debugging (window.__DEBUG__ in devtools).
window.__DEBUG__ = { mainViewer, miniViewer, mainVehicle, miniMarker, LEGS, startJourney, downloadCueSheet };

// Quietly warms the browser image cache for every photo-memory asset so the
// first appearance of each polaroid is instant, not a stutter while an 8MB+
// phone photo decodes mid-recording.
function preloadPhotoMemories() {
  for (const leg of LEGS) {
    if (leg.photoAt) new Image().src = leg.photoAt.src;
  }
}

(async function boot() {
  try {
    preloadPhotoMemories();
    await Promise.all([setupTerrainAndBuildings(), setupMinimapImagery()]);
    render();
    requestAnimationFrame(tick);
    // Debug-only URL params, for automated/headless troubleshooting:
    // ?autostart begins playback immediately, ?debug shows the debug panel,
    // ?fast=N sets the speed dial's underlying multiplier directly (bypasses
    // the dial UI) so a short headless capture window covers more ground.
    // ?record is the real-world-useful one: pre-engages the Record Speed
    // preset so a recording setup doesn't need to click it by hand once the
    // page is up — pair with ?autostart to have it both loaded and playing.
    // ?warmup kicks off tile pre-fetching immediately, still on the opening
    // bookend screen (warmUpTiles() only pans the hidden main camera behind
    // it — it doesn't touch hasStartedOnce or the bookend at all, so this is
    // safe to fire before the journey starts). Lets a recording setup have
    // tiles already cached by the time "Begin the Journey" actually gets
    // clicked, instead of needing that click-then-wait-then-click dance.
    const qs = new URLSearchParams(location.search);
    if (qs.has("debug")) document.body.classList.add("debug");
    if (qs.has("cinematic")) document.body.classList.add("cinematic");
    if (qs.has("presentation")) document.body.classList.add("presentation");
    if (qs.has("record")) setSpeedDialValue(RECORD_SPEED_DIAL_VALUE);
    if (qs.has("warmup")) warmUpTiles();
    if (qs.has("fast")) playbackMultiplier = parseFloat(qs.get("fast")) || playbackMultiplier;
    if (qs.has("autostart")) startJourney();
  } catch (err) {
    showFatalError(`boot() threw — nothing will render.\n${err.stack || err}`);
  }
})();
