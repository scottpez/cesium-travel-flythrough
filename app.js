// ============================================================================
// ENGINE — Kuwait → USA journey animation.
// All trip facts live in itinerary.js. This file is the generic playback
// machine: it stitches legs into one timeline, drives two Cesium viewers
// (cinematic main view + seatback-style minimap), and updates the HUD/DOM.
// ============================================================================

import { ION_ACCESS_TOKEN, GOOGLE_MAPS_API_KEY, USE_PHOTOREALISTIC_TILES } from "./config.js";

import { LEGS, FLAGS, BRAND_BADGES, CREDITS } from "./itinerary.js";
import { VEHICLE_DEFS, applyVehicleStyle } from "./vehicles.js";
import { applyFlagSwatch } from "./flags.js";

Cesium.Ion.defaultAccessToken = ION_ACCESS_TOKEN;
Cesium.GoogleMaps.defaultApiKey = GOOGLE_MAPS_API_KEY;

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
// Notices stack downward instead of all sitting at the same fixed offset.
// Previously every notice was pinned to top:14px, so two failures in the same
// boot (terrain AND imagery, which share a cause) drew exactly on top of each
// other and only the last one was ever readable — which made a two-asset
// outage look like a one-asset outage.
let noticeCount = 0;
function showNotice(msg, err) {
  const slot = noticeCount++;
  const el = document.createElement("div");
  el.style.cssText =
    `position:fixed;top:${14 + slot * 58}px;left:50%;transform:translateX(-50%);z-index:99998;background:#78350f;color:#fff;` +
    "padding:10px 18px;border-radius:10px;font-family:'JetBrains Mono',monospace;font-size:12px;" +
    "border:1px solid #f59e0b;box-shadow:0 8px 24px rgba(0,0,0,0.5);max-width:80vw;text-align:center;";
  // Carry the underlying error text when there is one. A notice saying only
  // "unavailable" can't distinguish an expired token from a bad scope from a
  // network failure — the status code in the real message is the whole answer.
  const detail = err ? `\n${err.message || err}` : "";
  el.textContent = `ℹ ${msg}${detail}`;
  el.style.whiteSpace = "pre-wrap";
  document.body.appendChild(el);
  setTimeout(() => {
    el.remove();
    noticeCount--;
  }, 9000);
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
  // The base imagery layer is added explicitly in setupTerrainAndBuildings()
  // rather than here, so its failure is caught and reported like everything
  // else. It is NOT disabled: it's the surface that shows through wherever
  // Google Photorealistic 3D Tiles has no coverage. With no base layer the
  // globe renders as `globe.baseColor` — "the color of the globe when no
  // imagery is available" — so a coverage gap read as a blank sphere rather
  // than as lower-detail ground.
  baseLayer: false,
});
mainViewer.clock.shouldAnimate = false;
// The globe is a BACKDROP, not the main surface. It exists only to fill the
// holes where Google Photorealistic 3D Tiles has no coverage, so it should be
// cheap: every terrain/imagery request it makes competes with the tileset for
// the same connection pool and bandwidth.
//
// These were previously 1.0 / 15000, chosen to make the photorealistic tiles
// crisper. They never did — the globe and a Cesium3DTileset are separate
// subsystems and the tileset ignores both. They were harmless only because
// the globe had no terrain or imagery assigned. Now that it does, SSE 1.0
// (vs. the 2.0 default) demands roughly 4x the tile density, and all of it is
// bandwidth taken away from the tiles you actually want.
mainViewer.scene.globe.maximumScreenSpaceError = 3.0;
// 1000 imagery tiles is up to ~250MB of 256x256 RGBA sitting alongside the
// tileset's own 512MB budget — and this globe is only ever a backdrop for
// coverage gaps, seen through a camera that never stops moving forward, so a
// large retained cache buys almost nothing. Anything scrolled off the back of
// the route will not be looked at again on a one-way journey.
mainViewer.scene.globe.tileCacheSize = 200;
mainViewer.scene.globe.enableLighting = true;
mainViewer.scene.skyAtmosphere.show = true;
mainViewer.scene.fog.enabled = true;
mainViewer.scene.fog.density = 0.0002; // Reduce fog for better tile visibility
mainViewer.scene.globe.depthTestAgainstTerrain = true;
mainViewer.scene.screenSpaceCameraController.enableCollisionDetection = true;
// Post-processing: TAA for smoother rendering + brightness boost
mainViewer.scene.postProcessStages.fxaa.enabled = false;
if (Cesium.PostProcessStageLibrary.createTemporalAntiAliasingStage) {
  mainViewer.scene.postProcessStages.add(Cesium.PostProcessStageLibrary.createTemporalAntiAliasingStage());
}

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
  baseLayer: false,
});
miniViewer.scene.globe.enableLighting = false;
// Shows through until basemap tiles arrive, and at the very edges of the
// globe. Kept a shade under the lightened basemap so the load-in reads as
// tiles filling in rather than as the map flashing brighter.
miniViewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#16212f");
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
// Basemap candidates for the minimap, best-looking first.
//
// Each carries a `probe`: a real tile URL. Before a provider is used it is
// tested with an actual cross-origin fetch of that tile, because Cesium gives
// no usable signal when a basemap fails. A provider constructs fine and adds
// its layer fine, then its tile requests fail asynchronously — 403, CORS,
// blocked host, rate limit — and the globe silently renders `baseColor`. That
// looks identical to a working dark basemap, which is how two different
// basemaps in a row appeared to load while showing nothing. A fetch of the
// same URL Cesium would request, under the same CORS rules Cesium needs for
// WebGL textures, is the only thing that answers the question directly.
//
// NOT Natural Earth II. It is bundled with CesiumJS and needs no auth, which
// makes it a tempting default, but it ships only 3 zoom levels — 19.6km per
// pixel at its finest, per its own tilemapresource.xml. updateMiniCamera()
// floors the minimap camera at 35km, framing roughly 40km of ground, so NE2
// resolves to about two pixels of texture stretched across the whole inset:
// it loads without error and renders a featureless smudge. Any basemap here
// must hold up at 35km, not just at trip scale.
// One knob for overall minimap basemap brightness, applied on top of each
// candidate's own tuned baseline below. The candidates start at very
// different exposures — the dark canvas basemap is already dark by design,
// while satellite imagery is bright and gets pulled down hard — so a single
// absolute brightness value can't serve all of them. Scaling their baselines
// keeps their relative look intact while letting one number lift the lot.
// 1.0 = each candidate's own baseline. Raise to lighten.
const MINIMAP_BRIGHTNESS = 2.5;

// Shared basemap catalogue, used by BOTH the minimap and the main globe's
// gap-filling backdrop. Each entry carries a `probe`: a real tile URL fetched
// before the source is used, because Cesium gives no usable signal when a
// basemap fails — a provider constructs fine, its layer adds fine, and then
// tile requests fail asynchronously and the globe silently paints baseColor,
// which is indistinguishable from a working dark basemap. Fetching the same
// URL Cesium would request, under the same CORS rules WebGL texturing needs,
// is the only thing that answers the question directly.
//
// Two style baselines per source because the two consumers want opposite
// things: the minimap is a stylized seatback graphic, while the main globe
// has to sit beside Google photogrammetry without looking like a different
// map stitched in.
const BASEMAP_SOURCES = {
  "esri-world-imagery": {
    // Satellite, no key. Best match for the main globe since it has to blend
    // with photogrammetry. Note the {z}/{y}/{x} ordering — Esri's REST tile
    // scheme puts row before column, unlike every other entry here.
    probe: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/4/6/8",
    miniStyle: { brightness: 0.55, contrast: 1.2, saturation: 0.35 },
    globeStyle: { brightness: 1.05, contrast: 1.0, saturation: 0.70, gamma: 1.10, hue: 0.0 },
    create: () => new Cesium.UrlTemplateImageryProvider({
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      credit: new Cesium.Credit("Esri, Maxar, Earthstar Geographics"),
      maximumLevel: 19,
    }),
  },
  "esri-dark-gray": {
    // Dark grey cartographic canvas — landmasses, coastlines and muted
    // labels, which is exactly the stylized seatback look the minimap wants,
    // and it needs no key. Replaces CARTO's dark_all, which now requires an
    // API key: CARTO still answers unkeyed requests with HTTP 200 and a
    // valid PNG, but the PNG itself says "API key required". The probe below
    // checks status codes, so it passed that source cleanly while the map
    // rendered as an error notice. Any source added here must be genuinely
    // keyless, not merely returning 200.
    probe: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/4/6/8",
    miniStyle: { brightness: 1.0, contrast: 1.1, saturation: 0.8 },
    globeStyle: { brightness: 1.2, contrast: 1.0, saturation: 0.55, gamma: 1.1, hue: 0.0 },
    create: () => new Cesium.UrlTemplateImageryProvider({
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
      credit: new Cesium.Credit("Esri, HERE, Garmin, © OpenStreetMap contributors"),
      maximumLevel: 16,
    }),
  },
  "openstreetmap": {
    // Raster map tiles only — NOT OSM Buildings. Last everywhere because
    // OSM's tile usage policy actively blocks bulk and non-browser-looking
    // clients, so it is the likeliest of these to hard-fail.
    probe: "https://tile.openstreetmap.org/4/8/6.png",
    miniStyle: { brightness: 0.6, contrast: 1.2, saturation: 0.3 },
    globeStyle: { brightness: 1.1, contrast: 1.0, saturation: 0.5, gamma: 1.1, hue: 0.0 },
    create: () => new Cesium.OpenStreetMapImageryProvider({ url: "https://tile.openstreetmap.org/" }),
  },
};

// Preference order differs by consumer. The globe wants satellite first so
// gaps blend into the surrounding photogrammetry; a cartographic basemap
// beside real aerial imagery reads as an obvious seam, which is why the dark
// canvas is deliberately absent from the globe's list.
const GLOBE_BASEMAP_ORDER = ["esri-world-imagery", "openstreetmap"];
// The minimap wants the stylized dark cartography first.
const MINIMAP_BASEMAP_ORDER = ["esri-dark-gray", "esri-world-imagery", "openstreetmap"];

// Fetch one tile the way Cesium would. Resolves to a short status string
// rather than throwing, so one dead host can't abort the whole probe.
async function probeTile(url, timeoutMs = 6000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { mode: "cors", cache: "no-store", signal: ctl.signal });
    return { ok: res.ok, detail: `HTTP ${res.status}` };
  } catch (e) {
    // A CORS rejection surfaces here as an opaque TypeError. That is itself
    // the answer: if fetch can't read it, WebGL can't texture from it either.
    return { ok: false, detail: ctl.signal.aborted ? "timeout" : `blocked/CORS (${e.name})` };
  } finally {
    clearTimeout(timer);
  }
}

// Probe results are cached per URL: the minimap and the globe draw from the
// same catalogue, and probing each host twice on every boot would double the
// startup latency for no new information.
const probeCache = new Map();
function probeTileCached(url) {
  if (!probeCache.has(url)) probeCache.set(url, probeTile(url));
  return probeCache.get(url);
}

// Walk a preference order, probing each source, and return the first that
// actually serves a tile. Returns { name, source, results } or null.
async function pickBasemap(order) {
  const results = [];
  for (const name of order) {
    const source = BASEMAP_SOURCES[name];
    const r = await probeTileCached(source.probe);
    results.push({ name, ok: r.ok, detail: r.detail });
    if (r.ok) return { name, source, results };
  }
  return { name: null, source: null, results };
}

async function setupMinimapImagery() {
  miniViewer.imageryLayers.removeAll();

  // Ion World Imagery first when the token actually works — sharpest option,
  // no third-party host. Unlike the probed sources this one rejects on
  // failure, so a try/catch is sufficient.
  try {
    const provider = await Cesium.createWorldImageryAsync();
    const layer = miniViewer.imageryLayers.addImageryProvider(provider);
    window.__miniBaseBrightness = 0.55;
    layer.brightness = 0.55 * MINIMAP_BRIGHTNESS; layer.contrast = 1.2; layer.saturation = 0.35;
    window.__miniLayer = layer;
    window.__miniSource = "ion-world-imagery";
    window.__miniProbe = [{ name: "ion-world-imagery", ok: true, detail: "asset 2 OK" }];
    console.info("Minimap basemap: ion-world-imagery");
    return;
  } catch (e) {
    console.warn("Ion World Imagery unavailable for minimap, probing no-auth basemaps.", e);
  }

  const { name, source, results } = await pickBasemap(MINIMAP_BASEMAP_ORDER);
  window.__miniProbe = results;
  window.__miniSource = name;

  if (!source) {
    // Say so loudly and say WHY for each source — a silent return here is
    // what made this look like a rendering bug for three rounds of debugging
    // rather than a network one.
    const summary = results.map((r) => `${r.name}: ${r.detail}`).join(" · ");
    console.error("No minimap basemap reachable.", results);
    showNotice(`Minimap basemap unreachable — every source failed. ${summary}`);
    return;
  }

  const layer = miniViewer.imageryLayers.addImageryProvider(source.create());
  window.__miniBaseBrightness = source.miniStyle.brightness;
  layer.brightness = source.miniStyle.brightness * MINIMAP_BRIGHTNESS;
  layer.contrast = source.miniStyle.contrast;
  layer.saturation = source.miniStyle.saturation;
  window.__miniLayer = layer;
  console.info(`Minimap basemap: ${name}`, results);
}

// Set once the photorealistic tileset loads; stays null if it's unavailable
// or disabled. Used by the per-leg coverage toggle in render().
let photoTileset = null;

// LOD skipping: fast descents, but visible popping as tiles swap levels.
// See the note at the tileset options for the trade.
const SKIP_LEVEL_OF_DETAIL = false;

// Google Photorealistic 3D Tiles is not global — coverage is dense over the
// US/Europe/Japan and much thinner elsewhere, and there is none at all over
// open ocean. Those gaps used to render as a bare untextured ellipsoid,
// because the globe had no imagery (baseLayer: false) and World Terrain was
// only ever assigned in this function's failure path — the success path
// returned before reaching it. So the globe is now always set up FIRST, as
// the floor the photorealistic tiles sit on top of. Where Google has
// coverage you never see it; where it doesn't, the gap degrades to real
// terrain under satellite imagery instead of to nothing.
// Whether the gap-filling globe uses real 3D terrain or stays a flat
// ellipsoid at sea level.
//
// FALSE (flat) is the default, and it is what fixes the blotchiness. Cesium
// World Terrain and Google's photogrammetry are two independent measurements
// of the same ground and disagree by several metres. Wherever World Terrain
// happens to sit higher, the globe surface pushes up THROUGH the photorealistic
// tiles in irregular patches — satellite imagery erupting through the middle
// of a city. That is a geometric intersection, not a shading artifact, so no
// amount of colour matching touches it.
//
// A flat ellipsoid sits at sea level, which is below the photogrammetry
// essentially everywhere on land, so it can never poke through. Coverage gaps
// still get filled, just with flat imagery instead of 3D terrain — and the
// ocean, which is the longest gap on this route, is at sea level anyway so it
// loses nothing. It also stops terrain tile requests competing with the
// photorealistic tiles for bandwidth.
//
// Set true to get 3D terrain back in gaps, at the cost of the blotching
// wherever the two surfaces overlap.
const GLOBE_USES_3D_TERRAIN = false;

// Colour match for the gap-filling imagery. Satellite basemaps are more
// saturated and cooler than Google's photogrammetry, so an untuned globe
// reads as a visibly different map stitched in beside the tiles. Tune live
// with __DEBUG__.setBaseImageryStyle({...}), then paste the result here.
// Live-tunable style for the gap-filling imagery. Initialised from whichever
// source wins the probe (each carries its own baseline, since satellite and
// cartographic basemaps need very different treatment to sit beside
// photogrammetry). Tune with __DEBUG__.setBaseImageryStyle({...}), then paste
// the result into that source's globeStyle so it sticks.
const BASE_IMAGERY_STYLE = {
  brightness: 1.05,
  saturation: 0.70, // pull toward the photogrammetry's more muted palette
  gamma: 1.10,
  hue: 0.0,
  contrast: 1.0,
};

function applyBaseImageryStyle(layer, style) {
  layer.brightness = style.brightness;
  layer.saturation = style.saturation;
  layer.gamma = style.gamma;
  layer.hue = style.hue;
  layer.contrast = style.contrast;
}

async function setupTerrainAndBuildings() {
  if (GLOBE_USES_3D_TERRAIN) {
    try {
      mainViewer.terrainProvider = await Cesium.createWorldTerrainAsync();
    } catch (e) {
      console.warn("World terrain unavailable, using flat ellipsoid.", e);
      showNotice("Cesium World Terrain unavailable — gaps in photorealistic coverage will render flat.", e);
    }
  }

  // Gap-filling backdrop. Ion World Imagery when the token works, otherwise
  // fall through to the same probed no-auth sources the minimap uses — so a
  // dead or invalid Ion token degrades the look slightly instead of leaving
  // coverage gaps as untextured globe.baseColor.
  let baseLayer = null;
  let baseSource = null;
  try {
    baseLayer = mainViewer.imageryLayers.addImageryProvider(await Cesium.createWorldImageryAsync());
    baseSource = "ion-world-imagery";
    window.__baseProbe = [{ name: "ion-world-imagery", ok: true, detail: "asset 2 OK" }];
  } catch (e) {
    console.warn("Ion World Imagery unavailable for globe, probing no-auth basemaps.", e);
    const { name, source, results } = await pickBasemap(GLOBE_BASEMAP_ORDER);
    window.__baseProbe = results;
    if (source) {
      baseLayer = mainViewer.imageryLayers.addImageryProvider(source.create());
      baseSource = name;
      Object.assign(BASE_IMAGERY_STYLE, source.globeStyle);
    } else {
      const summary = results.map((r) => `${r.name}: ${r.detail}`).join(" · ");
      console.error("No globe basemap reachable.", results);
      showNotice(`Gaps in photorealistic coverage will render untextured — every basemap failed. ${summary}`);
    }
  }
  if (baseLayer) {
    applyBaseImageryStyle(baseLayer, BASE_IMAGERY_STYLE);
    window.__baseLayer = baseLayer;
    window.__baseSource = baseSource;
    console.info(`Globe backdrop: ${baseSource}`);
  }

  if (!USE_PHOTOREALISTIC_TILES) return;
  try {
    const tileset = await Promise.resolve(Cesium.createGooglePhotorealistic3DTileset(
      GOOGLE_MAPS_API_KEY, // <-- 1st argument: The key string
      {                    // <-- 2nd argument: The options object
        // Memory ceiling. `maximumMemoryUsage` and `maximumCachedBytes` were
        // tried here first and are silently ignored: the former was removed
        // from Cesium3DTileset (it survives only on PointCloudShading), and
        // the latter has never been an option. These two are the real names,
        // both in bytes; the hard ceiling is their sum.
        // Memory ceiling, deliberately conservative. This was 1GB + 256MB,
        // which is a 1.25GB working set of decoded photogrammetry inside a
        // single renderer process that is ALSO holding the V8 heap, two
        // scene graphs and a TAA history buffer. Dense city coverage (NYC)
        // on a low chase camera is where that budget actually gets claimed,
        // and that is exactly where the tab died. Trading re-fetches for
        // headroom is the right side of this trade for an unattended
        // 30-minute recording: a re-fetch costs a blurry second, running out
        // of memory costs the whole take.
        cacheBytes: 402653184,                // 384 MB steady state
        maximumCacheOverflowBytes: 134217728, // + 128 MB headroom (512 MB hard cap)

        // The tileset's OWN detail knob (default 16). scene.globe's
        // maximumScreenSpaceError has no effect here — different subsystem.
        // This is the single biggest lever on how much photogrammetry has to
        // arrive before a frame looks finished. A camera moving this fast
        // cannot resolve 16 anyway.
        maximumScreenSpaceError: 24,

        // Descend straight to the LOD we need instead of loading every level
        // on the way down. Essential when a flight leg drops from 10,000m to
        // ground in a few seconds — but it is also the classic cause of
        // visible LOD popping, because it renders a coarse tile and then
        // swaps in a much finer one with no intermediate step. Turned off by
        // default now that the heap log has shown memory is not the binding
        // constraint (226MB used against a 4192MB limit): smooth refinement
        // matters more here than descent speed. Set true to trade flicker
        // back for faster descents.
        skipLevelOfDetail: SKIP_LEVEL_OF_DETAIL,

        // NOT immediatelyLoadDesiredLevelOfDetail. That flag means "only
        // tiles that meet the maximum screen space error will ever be
        // downloaded" — no coarse tile is loaded first, so the ground stays
        // empty until the full-resolution tile arrives, with nothing shown in
        // between. It reads as exactly the slow, late-loading ground it was
        // meant to prevent.

        // Put a rough layer down fast, then refine, rather than waiting for
        // full resolution before drawing anything.
        progressiveResolutionHeightFraction: 0.5,

        // Coarsen tiles with distance. This is the tileset's own equivalent of
        // fog's terrain optimisation, and it is the right complement to the
        // narrower lens: the lens decides how much ground is in frame, this
        // decides how much detail the far part of it gets. Factor is raised
        // well above the default 24 because even a bounded view still reaches
        // several kilometres, and nothing at that range survives being
        // resampled down to 1080p at driving speed.
        dynamicScreenSpaceError: true,
        dynamicScreenSpaceErrorFactor: 96,
        dynamicScreenSpaceErrorDensity: 0.0003,

        // Discard requests the camera has already flown past instead of
        // paying to fetch and decode ground we've left behind.
        cullRequestsWhileMoving: true,
        cullRequestsWhileMovingMultiplier: 120.0,

        // Tiles outside the centre cone are normally deferred until the
        // camera has been still for foveatedTimeDelay seconds. This camera is
        // never still, so with the 0.2s default the edges of frame would
        // never fill in at all.
        foveatedTimeDelay: 0.0,

        loadSiblings: false,
      }
    ));
    mainViewer.scene.primitives.add(tileset);
    photoTileset = tileset;
  } catch (e) {
    console.warn("Photorealistic 3D Tiles unavailable, falling back to World Terrain.", e);
    showNotice("Photorealistic 3D Tiles unavailable (check your API key/scopes) — using World Terrain instead.", e);
  }
}

// ============================================================ TIMELINE ===
const R = Cesium.Math;
const J = Cesium.JulianDate;

function easeOutCubic(t) { t = R.clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); }
function easeInCubic(t) { t = R.clamp(t, 0, 1); return Math.pow(t, 3); }
// Slow out of the turn and slow into the stop, so the single orbit at each
// stop reads as a deliberate camera move that settles, rather than a loop
// that was cut off when the timer ran out.
function easeInOutCubic(t) {
  t = R.clamp(t, 0, 1);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

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

// Exclusive prefix sum of leg distances: legDistancePrefix[i] is the total
// distance of every leg BEFORE leg i. Built once here so the HUD's
// distance-travelled readout is an array index per frame rather than a
// filter + reduce over the whole itinerary. `_index` is cached for the same
// reason — LEGS.indexOf() in the render loop is a linear scan per frame.
const legDistancePrefix = [];
{
  let running = 0;
  for (let i = 0; i < LEGS.length; i++) {
    LEGS[i]._index = i;
    legDistancePrefix.push(running);
    running += LEGS[i]._totalDist || 0;
  }
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
// Entity properties are PROPERTY SLOTS, not plain fields. Assigning a raw
// Cartesian3 to `entity.position` makes Cesium construct a brand-new
// ConstantPositionProperty to wrap it and raise definitionChanged, which
// walks every listener on EntityCollection and DataSourceDisplay. Doing that
// once per frame is ~5 property objects plus 5 event raises per frame; across
// a 30-minute recording at 60fps that is over half a million throwaway
// objects arriving as a steady stream — precisely the allocation pattern a
// generational GC handles worst, and it ratchets the heap upward instead of
// sawtoothing flat.
//
// Holding the properties and calling setValue() mutates them in place: no new
// wrapper, and definitionChanged only fires when the value actually differs.
// Combined with the scratch Cartesians below (every Cesium math function takes
// a `result` out-parameter) the per-frame allocation here drops to zero.
const vehiclePosition = new Cesium.ConstantPositionProperty(
  Cesium.Cartesian3.fromDegrees(LEGS[0].waypoints[0][0], LEGS[0].waypoints[0][1], 0)
);
const vehicleAlignedAxis = new Cesium.ConstantProperty(Cesium.Cartesian3.UNIT_Z);
const markerPosition = new Cesium.ConstantPositionProperty(
  Cesium.Cartesian3.fromDegrees(LEGS[0].waypoints[0][0], LEGS[0].waypoints[0][1], 0)
);
const scratchPos = new Cesium.Cartesian3();
const scratchAhead = new Cesium.Cartesian3();
const scratchDiff = new Cesium.Cartesian3();
const scratchAxis = new Cesium.Cartesian3();
const scratchMarker = new Cesium.Cartesian3();

const mainVehicle = mainViewer.entities.add({
  position: vehiclePosition,
  billboard: {
    image: VEHICLE_DEFS.van.icon,
    alignedAxis: vehicleAlignedAxis,
    // Constant for the life of the app — it was being reassigned every frame
    // purely out of habit. See the note above on why that is not free.
    heightReference: Cesium.HeightReference.NONE,
    width: VEHICLE_DEFS.van.width,
    height: VEHICLE_DEFS.van.height,
    verticalOrigin: Cesium.VerticalOrigin.CENTER,
    horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
    disableDepthTestDistance: Number.POSITIVE_INFINITY, // never let terrain hide it — guarantees visibility
    scaleByDistance: new Cesium.NearFarScalar(200, 1.0, 20000, 0.4),
  },
});
const miniMarker = miniViewer.entities.add({
  position: markerPosition,
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
// Bounding boxes, computed once per feature on first use. A full ray-cast
// against a multi-thousand-vertex state outline costs far more than four
// float comparisons, and for all but one state the box rejects immediately.
function featureBBox(f) {
  if (f._bbox) return f._bbox;
  const ring = f.geometry.coordinates[0];
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (let i = 0; i < ring.length; i++) {
    const lon = ring[i][0], lat = ring[i][1];
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  f._bbox = { minLon, maxLon, minLat, maxLat };
  return f._bbox;
}

function findStateName(lon, lat) {
  if (!statesGeo) return null;
  for (const f of statesGeo.features) {
    const b = featureBBox(f);
    if (lon < b.minLon || lon > b.maxLon || lat < b.minLat || lat > b.maxLat) continue;
    if (pointInRing(lon, lat, f.geometry.coordinates[0])) return f.properties.name;
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
// ~4x/second at 60fps. Fast enough that a border crossing still reads as
// instant, cheap enough that the polygon test stops being a hot path.
const STATE_CHECK_INTERVAL_FRAMES = 15;
let stateCheckCounter = 0;
// Minimap renders every Nth frame (see the render call for why).
const MINI_RENDER_EVERY_N_FRAMES = 3;
let miniFrameCounter = 0;
// Rolling tile release. Cesium only trims the tile cache when it needs room
// for the current view, so on a one-way route the cache drifts up to its
// ceiling and stays pinned there, holding ground that is now hundreds of
// miles behind us. Trimming on a timer turns that into the moving window this
// route actually wants: load what's ahead through the normal frustum, drop
// what's behind on a schedule. Leg boundaries alone were too coarse — the
// NYC-to-Stroudsburg drive is a single long leg.
// Measured in WALL-CLOCK seconds, not sim seconds. Sim time is scaled by
// playbackMultiplier, which at record speed is ~0.025 — so a 4 sim-second
// interval was actually firing once every 2.6 real minutes, not every 4
// seconds. Memory pressure is a wall-clock phenomenon; pace against the clock
// the browser lives in.
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
// Fraction of a stop's screen time spent completing the single revolution.
// The remainder is held still, facing the way the journey is about to leave.
const ORBIT_SWEEP_FRAC = 0.65;

// The heading the orbit settles on: the direction of travel at the START of
// the next leg that actually moves. Landing on that means the held shot is
// already pointing the way the journey departs, and the cut into the chase
// camera has no rotation in it at all.
//
// Skips forward past any further static legs (a border stop followed by a
// hotel, say) to find the next one with real waypoints, and caches the result
// on the leg — computeState() is not free and this answer never changes.
function orbitEndHeadingFor(leg) {
  if (leg._orbitEndHeading !== undefined) return leg._orbitEndHeading;
  let heading = 0;
  for (let i = leg._index + 1; i < LEGS.length; i++) {
    const next = LEGS[i];
    if (next.waypoints && next.waypoints.length > 1) {
      heading = computeState(next, 0).heading;
      break;
    }
  }
  leg._orbitEndHeading = heading;
  return heading;
}
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

// ---- Camera lens profiles -------------------------------------------------
// Cesium's frustum.fov is the HORIZONTAL angle for a landscape canvas, and it
// defaults to 60°. At 16:9 that makes the vertical FOV 36°, so the half-angle
// is 18°. The drive camera sits at pitch -14°, which puts the TOP OF THE FRAME
// at +4° — above the horizon. Ground in frame therefore runs all the way to
// the geometric horizon, about 48km out, sweeping roughly 1,230 km² of
// territory into the view frustum every single frame.
//
// Over the Atlantic that is free, because there is no photogrammetry to load.
// Over New York it is thousands of tile requests per frame, which is what
// saturates the request scheduler and stalls the render loop.
//
// The load collapses non-linearly once the top of the frame drops below the
// horizon, and narrowing the lens gets there while also narrowing the wedge:
//
//   hFOV 60° -> top +4.0°, far 48.5km, 1234 km²  (100%)
//   hFOV 45° -> top -0.9°, far 12.0km,   56 km²  (4.6%)
//   hFOV 42° -> top -1.8°, far  5.9km,   12 km²  (1.0%)
//   hFOV 40° -> top -2.4°, far  4.4km,  6.6 km²  (0.5%)
//
// A 42° lens is also a longer, more compressed, more cinematic look than 60°,
// which is wide enough to read as slightly fisheyed. The real cost is that
// the sky leaves the frame — the vista IS the expense.
//
// `far` is left at Cesium's default unless a profile sets it. Clamping the far
// plane keeps the sky but makes distant ground simply stop being drawn, which
// needs haze to disguise; it is available per profile rather than on by
// default.
const CAMERA_PROFILES = {
  // Bounded lens for dense photogrammetry. No sky, ~6km of visible ground.
  tight: { fovDeg: 42, farM: null },
  // Wide vista. Only affordable where coverage is sparse or absent — open
  // desert, mid-ocean, rural stretches — where a 48km view costs nothing
  // because there is nothing out there to load.
  vista: { fovDeg: 60, farM: null },
};

// Per-leg override wins; otherwise drive legs get the bounded lens and
// everything else keeps the wide one. Orbit shots at stops sit at pitch -36°,
// which already puts the top of frame well below the horizon, so they are
// bounded regardless of lens.
function cameraProfileFor(leg) {
  if (leg.cameraProfile && CAMERA_PROFILES[leg.cameraProfile]) return CAMERA_PROFILES[leg.cameraProfile];
  if (leg.type === "drive") return CAMERA_PROFILES.tight;
  return CAMERA_PROFILES.vista;
}

const DEFAULT_CAMERA_FAR = mainViewer.camera.frustum.far;
let currentCameraProfileName = null;

function applyCameraProfile(leg) {
  const p = cameraProfileFor(leg);
  const frustum = mainViewer.camera.frustum;
  // Orthographic frustums have no fov; guard rather than assume perspective.
  if (frustum && frustum.fov !== undefined) frustum.fov = R.toRadians(p.fovDeg);
  if (frustum && frustum.far !== undefined) frustum.far = p.farM ?? DEFAULT_CAMERA_FAR;
  currentCameraProfileName = Object.keys(CAMERA_PROFILES).find((k) => CAMERA_PROFILES[k] === p) ?? "custom";
}

function updateMainCamera(state, leg) {
  const margin = leg.type === "flight" ? CAMERA_HEIGHT_MARGIN.flight : CAMERA_HEIGHT_MARGIN.other;
  const targetHeight = state.height + margin;
  const target = Cesium.Cartesian3.fromDegrees(state.lon, state.lat, targetHeight);

  if (leg.cameraStyle === "orbit" || state.isStatic) {
    lastChaseLegId = null; // next chase leg should snap fresh, not smooth in from a stale heading
    const pitch = R.toRadians(-36);
    const range = leg.type === "stay" ? 550 : 450;

    // Exactly one revolution, then hold.
    //
    // This used to accumulate a fixed angle per FRAME, which meant the stop
    // spun for as long as the leg lasted, at a speed that depended on the
    // frame rate and not at all on the speed dial — so at record speed it
    // became a very long, very slow, unmotivated rotation, and it stopped
    // wherever it happened to be when the leg ended.
    //
    // Driving it from state.frac instead makes it deterministic: one full
    // turn regardless of frame rate or playback speed, finishing on the
    // heading the next leg departs on and holding there for the rest of the
    // stop. Starting a revolution behind that heading (endHeading - 2pi) is
    // the same orientation modulo a full turn, so the sweep begins and ends
    // pointing the same way while still travelling all the way round.
    const endHeading = orbitEndHeadingFor(leg);
    const sweep = easeInOutCubic(R.clamp(state.frac / ORBIT_SWEEP_FRAC, 0, 1));
    const heading = endHeading - 2 * Math.PI * (1 - sweep);

    mainViewer.camera.lookAt(target, new Cesium.HeadingPitchRange(heading, pitch, range));
    lastCameraDebug = {
      style: "orbit",
      headingDeg: ((R.toDegrees(heading) % 360) + 360) % 360,
      endHeadingDeg: ((R.toDegrees(endHeading) % 360) + 360) % 360,
      sweep: sweep >= 1 ? "held" : `${(sweep * 100).toFixed(0)}%`,
      pitchDeg: -36, targetHeight, range,
    };
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
  markerPosition.setValue(
    Cesium.Cartesian3.fromDegrees(state.lon, state.lat, state.height + 500, undefined, scratchMarker)
  );
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
    // Swap the lens for this leg. Done on transition rather than per frame so
    // it never fights the camera flight during the intro descent.
    applyCameraProfile(leg);
    // The globe (terrain + imagery) stays visible by default so it is always
    // there to fill photorealistic coverage gaps — that default is the whole
    // point, and forgetting to flag a leg costs a little z-fighting rather
    // than an empty sky. Where the tiles and the globe both draw ground the
    // two surfaces can shimmer against each other; set `hideGlobe: true` on
    // a leg in itinerary.js to suppress the globe there. Only do that for
    // legs with complete photorealistic coverage — there is no coverage over
    // open ocean, so the transatlantic leg must never carry this flag.
    // Per-leg data rather than runtime coverage detection: the route is
    // fixed, and there's no coverage API worth polling 60 times a second to
    // rediscover something the itinerary can simply state.
    mainViewer.scene.globe.show = !(photoTileset && leg.hideGlobe);
    // Force the tile cache back down to cacheBytes at every leg boundary.
    // Cesium only trims when it needs room, so on a continuous one-way route
    // the cache sits pinned at its ceiling holding cities we will never fly
    // over again. A leg change is the one moment we know the previous
    // region is behind us for good. Unloads happen on the next frame, inside
    // the render loop, so the WebGL deletes stay on the right thread.
    if (photoTileset) photoTileset.trimLoadedTiles();
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
    // setValue() into the held property instead of `mainVehicle.position = …`,
    // and into a reused scratch Cartesian instead of a fresh one. See the note
    // at the entity definitions. heightReference is set once, at definition.
    const pos = Cesium.Cartesian3.fromDegrees(state.lon, state.lat, state.height, undefined, scratchPos);
    vehiclePosition.setValue(pos);

    // Orient the plan-view icon along the direction of travel: take a point
    // a short distance ahead (in the already-known heading direction) and
    // use the world-space vector toward it as alignedAxis. This sidesteps
    // any question of local-frame/model-orientation conventions entirely —
    // it's just "which way is the vehicle actually moving in 3D space."
    const eps2 = 0.0006;
    const aheadLon = state.lon + (Math.sin(state.heading) * eps2) / Math.max(Math.cos(R.toRadians(state.lat)), 0.05);
    const aheadLat = state.lat + Math.cos(state.heading) * eps2;
    const posAhead = Cesium.Cartesian3.fromDegrees(aheadLon, aheadLat, state.height, undefined, scratchAhead);
    const diff = Cesium.Cartesian3.subtract(posAhead, pos, scratchDiff);
    const diffLen = Cesium.Cartesian3.magnitude(diff);
    window.__lastAlignedAxisDiffLen = diffLen; // debug-panel visibility into whether this ever degenerates
    vehicleAlignedAxis.setValue(diffLen > 1e-6
      ? Cesium.Cartesian3.normalize(diff, scratchAxis)
      : Cesium.Cartesian3.UNIT_Z); // degenerate direction — skip rather than risk NaN

    if (lastTrailPos === null || Cesium.Cartesian3.distance(pos, lastTrailPos) > TRAIL_MIN_STEP_M) {
      // The trails must hold their OWN copies. `pos` is now a scratch object
      // overwritten every frame, so storing the reference would collapse every
      // trail point onto the live position and the trail would vanish.
      // When a buffer is full, recycle the Cartesian being shifted off rather
      // than allocating a replacement — a fixed-size ring, zero steady-state
      // garbage, where before this allocated a Cartesian per point forever.
      const slot = trailPositions.length >= TRAIL_MAX ? trailPositions.shift() : new Cesium.Cartesian3();
      trailPositions.push(Cesium.Cartesian3.clone(pos, slot));
      const miniSlot = miniTrail.length >= TRAIL_MAX ? miniTrail.shift() : new Cesium.Cartesian3();
      miniTrail.push(Cesium.Cartesian3.clone(pos, miniSlot));
      lastTrailPos = Cesium.Cartesian3.clone(pos, lastTrailPos || new Cesium.Cartesian3());
    }
  } else {
    mainVehicle.show = false;
  }

  // -- state boundary detection (US driving legs) --
  // Throttled: state borders do not move, and at driving speed the vehicle
  // covers a few metres between frames, so testing 60 times a second buys
  // nothing but CPU. This ran full point-in-polygon against every state
  // outline on every frame of every US driving leg — which is exactly the
  // leg type, and the part of the route, where the tab was dying.
  stateCheckCounter++;
  if (statesGeo && !state.isStatic && leg.countryCode === "US"
      && stateCheckCounter % STATE_CHECK_INTERVAL_FRAMES === 0) {
    const name = findStateName(state.lon, state.lat);
    if (name && name !== lastStateName) { showStateLabel(name); lastStateName = name; visitedStates.add(name); }
    if (!name) lastStateName = null;
  }

  // -- cameras --
  // flyingToStart suppresses this the same way warmingUp does: Cesium's camera
  // flight drives the camera itself from inside scene.render(), so a per-frame
  // lookAt() here would overwrite each tween step and the flight would look
  // like a hard cut.
  if (!warmingUp && !flyingToStart) {
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
  // Release ground we've already passed. Unloads are queued and executed on
  // the next frame inside the render loop, so the WebGL deletes stay on the
  // right thread — this is safe to call from here.
  // NO periodic trimLoadedTiles() here. It was added on the assumption that
  // the tile cache would grow without bound, which turned out to be false:
  // Cesium already caps the tileset at cacheBytes + maximumCacheOverflowBytes
  // and lowers effective screen-space error to stay inside it. Forcing a trim
  // back down to cacheBytes on a timer therefore evicts the overflow working
  // set the CURRENT view legitimately needs, which is immediately re-requested
  // — an unload/reload cycle on a fixed period, seen as the whole scene
  // flickering. It was fighting Cesium's own memory manager for no benefit.
  // Trimming now happens only at leg boundaries, where the region really is
  // behind us and a pop is masked by the transition.

  mainViewer.clock.currentTime = state.realTime;
  mainViewer.render();
  // The minimap is a second full scene render — its own globe, imagery tiles,
  // entities and GPU work — and it eases toward its target at k=0.03, so it
  // is very nearly static. Rendering it at a third of the main view's rate is
  // visually indistinguishable and hands the main view back a large share of
  // the frame budget and the tile pipeline.
  miniFrameCounter++;
  if (miniFrameCounter % MINI_RENDER_EVERY_N_FRAMES === 0) miniViewer.render();

  // -- HUD --
  // Prefix sum instead of filter().reduce(): the old form allocated a new
  // array and rescanned all 13 legs on every one of the ~108,000 frames in a
  // recording, to compute a number that only changes at leg boundaries.
  const distSoFarM = legDistancePrefix[leg._index]
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
      (lastCameraDebug.style === "orbit"
        ? `orbit sweep  ${lastCameraDebug.sweep} → settles ${lastCameraDebug.endHeadingDeg?.toFixed(1)}°\n`
        : "") +
      `target h     ${lastCameraDebug.targetHeight?.toFixed(1) ?? "-"} m\n` +
      `vehicle h    ${state.height.toFixed(1)} m\n` +
      `cam actual h ${cam ? cam.height.toFixed(1) : "-"} m\n` +
      `range        ${lastCameraDebug.range ?? "-"} m\n` +
      // Lens and its consequence. `top of frame` above 0° means the horizon is
      // in shot and the ground runs to it — the condition that pulls a
      // thousand square kilometres of tiles per frame.
      (() => {
        const f = mainViewer.camera.frustum;
        if (!f || f.fov === undefined) return "";
        const hFov = f.fov;
        const vHalf = Math.atan(Math.tan(hFov / 2) / (f.aspectRatio || 16 / 9));
        const camH = cam ? Math.max(cam.height - state.height, 1) : 1;
        const topEl = R.toRadians(lastCameraDebug.pitchDeg ?? 0) + vHalf;
        const horizon = Math.sqrt(2 * 6371000 * camH + camH * camH);
        const dFar = topEl >= 0 ? horizon : Math.min(camH / Math.tan(-topEl), horizon);
        const area = 0.5 * hFov * (dFar * dFar) / 1e6;
        return `lens         ${currentCameraProfileName ?? "-"} · ${R.toDegrees(hFov).toFixed(0)}° hFOV\n` +
          `top of frame ${R.toDegrees(topEl) >= 0 ? "+" : ""}${R.toDegrees(topEl).toFixed(1)}°` +
          `${R.toDegrees(topEl) >= 0 ? "  ** HORIZON IN SHOT **" : ""}\n` +
          `ground ahead ${(dFar / 1000).toFixed(1)} km  (~${area.toFixed(1)} km² in frame)\n`;
      })() +
      `--- memory ---\n` +
      // performance.memory is Chrome-only and reports the V8 heap only — GPU
      // and tile texture memory live outside it. Watch both: a flat heap with
      // a climbing tile budget means the ceiling below is still too high.
      `js heap      ${performance.memory
        ? `${(performance.memory.usedJSHeapSize / 1048576).toFixed(0)}/${(performance.memory.jsHeapSizeLimit / 1048576).toFixed(0)} MB`
        : "n/a (non-Chrome)"}\n` +
      `tile mem     ${photoTileset ? `${(photoTileset.totalMemoryUsageInBytes / 1048576).toFixed(0)} MB` : "-"}\n` +
      `tiles loaded ${photoTileset?.statistics?.numberOfTilesTotal ?? "-"} pending=${photoTileset?.statistics?.numberOfPendingRequests ?? "-"}\n` +
      `globe base   ${window.__baseSource ?? "NONE — gaps untextured"}\n` +
      `--- minimap ---\n` +
      `trail pts    ${miniTrail.length}\n` +
      `mini height  ${miniHeight?.toFixed(0) ?? "-"} m\n` +
      `mini layers  ${miniViewer.imageryLayers.length}\n` +
      `mini source  ${window.__miniSource ?? "NONE — every basemap failed"}\n` +
      `mini l.show  ${window.__miniLayer?.show} alpha=${window.__miniLayer?.alpha}\n` +
      // `.ready` was removed from ImageryProvider in Cesium's async refactor,
      // so the old readout here was always undefined and told us nothing.
      // The probe table below is the real diagnostic: it says, per source,
      // whether the browser can actually fetch a tile and why not if it can't.
      `mini l.bright ${window.__miniLayer?.brightness} sat=${window.__miniLayer?.saturation}\n` +
      (window.__miniProbe ?? []).map((r) => `  probe ${r.ok ? "OK  " : "FAIL"} ${r.name}: ${r.detail}\n`).join("") +
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

    // ADD THIS LINE HERE:
    logMemoryUsage(simSeconds);

    if (playing && hasStartedOnce) {
      simSeconds += (dtMs / 1000) * playbackMultiplier;
      if (simSeconds >= TOTAL_SIM) {
        simSeconds = TOTAL_SIM;
        onJourneyComplete();
      }
    }
    render();
    requestAnimationFrame(tick);
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

  // Warm the OPENING SHOT ONLY, not the whole route.
  //
  // The full-route sweep was actively harmful once the tile cache got a real
  // ceiling. It visited 466 waypoints, far more photogrammetry than the
  // 512MB cap can hold, so everything loaded early was evicted before the
  // sweep finished — the only tiles surviving to playback were from the END
  // of the route, which is the last thing needed. It also sampled from
  // straight overhead at 900m/6000m while playback watches obliquely from
  // 475m at pitch -14°, a different frustum that asks for different tiles at
  // a different LOD. And it performed a full allocate-and-evict churn of the
  // entire cache immediately before a 30-minute recording began, leaving the
  // heap and the GPU pool fragmented before the take even started.
  //
  // What a warmup can genuinely buy is a sharp first shot. So sample only the
  // opening leg, and sample it through the REAL playback camera so the tiles
  // fetched are exactly the tiles the first seconds of playback will request.
  const leg = LEGS[0];
  const samples = 24;
  for (let i = 0; i <= samples; i++) {
    const legFrac = i / samples;
    updateMainCamera(computeState(leg, legFrac), leg);
    mainViewer.render();
    // Fewer views held for longer, not more renders. Re-rendering a view
    // whose requests are already in flight does not make the network faster;
    // only waiting does. This was 3 renders x 20ms per point, which tripled
    // the render cost while shortening the actual wait.
    await new Promise((resolve) => setTimeout(resolve, 150));
    el.btnWarmup.textContent = `🔥 ${Math.round((i / samples) * 100)}%`;
  }
  // updateMainCamera() carries smoothing state across calls. Reset it so the
  // first real frame snaps to the true heading instead of easing in from
  // wherever the warmup sweep left it.
  smoothedHeadingRad = null;
  lastChaseLegId = null;

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
  // Cut the opening hold short rather than swallowing the click for ten
  // seconds. holdAtStart() sets playing = true when it returns.
  if (holdingAtStart) { holdingAtStart = false; return; }
  playing = !playing;
  el.btnPlay.textContent = playing ? "⏸" : "▶";
});
function clearPendingCelebrations() {
  for (const leg of LEGS) clearTimeout(leg._celebScheduled);
  clearTimeout(celebTimer);
  clearInterval(factRotateTimer);
  factRotateTimer = null;
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
  el.btnPlay.textContent = "⏸";
  suppressNextChapterCard = true;
  // Same opening hold as the first run, so a replayed take is framed and
  // paced identically to the original rather than starting on blurry ground.
  // startFactTicker() is called here too because clearPendingCelebrations()
  // above kills the interval, and only startJourney() used to restart it —
  // so before this, the fun facts stopped forever after one replay.
  playing = false;
  render();
  (async () => {
    const qs = new URLSearchParams(location.search);
    await holdAtStart(qs.has("hold") ? parseFloat(qs.get("hold")) * 1000 : START_HOLD_MS);
    playing = true;
    startFactTicker();
    setTimeout(() => showChapterCard(findLegAt(simSeconds)), CHAPTER_CARD_START_DELAY_MS);
  })();
});

const CHAPTER_CARD_START_DELAY_MS = 1500;

// Beat between arriving at the starting point and the clock starting to run,
// so the photogrammetry around and ahead of the opening position has time to
// resolve before anything moves. Without it the first seconds of every take
// are the ground sharpening on camera. Override with ?hold=N (seconds).
const START_HOLD_MS = 10000;
// Set while holding, so the play button can cut the hold short instead of
// being ignored for ten seconds.
let holdingAtStart = false;

// ---- ?autostart intro sequence -------------------------------------------
// Title card over the orbiting world view, then a descent to the opening
// shot, then the tile hold, then drive. Hands-off, so a recording can be
// started and left alone, and every take opens identically.
const INTRO_TITLE_MS = 10000; // ?intro=N
const INTRO_FLY_MS = 5000;    // ?flyto=N
let flyingToStart = false;

// Fly from wherever the idle camera is down to the exact pose the chase
// camera will hold at the start of leg 1.
//
// The destination has to be derived rather than guessed: updateMainCamera()
// positions via lookAt(target, HeadingPitchRange), so the only reliable way
// to know where that lands is to put the camera there and read it back. Note
// the lookAtTransform(IDENTITY) calls — lookAt() leaves the camera in a
// target-relative reference frame, and both `positionWC` reads and flyTo()
// itself need it cleared or they operate in the wrong frame.
async function flyToStartShot(durationMs) {
  const leg = LEGS[0];
  const state = computeState(leg, 0);

  mainViewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  const fromPos = Cesium.Cartesian3.clone(mainViewer.camera.positionWC, new Cesium.Cartesian3());
  const fromOrientation = {
    heading: mainViewer.camera.heading,
    pitch: mainViewer.camera.pitch,
    roll: mainViewer.camera.roll,
  };

  updateMainCamera(state, leg); // lands the camera on the opening chase shot
  mainViewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  const toPos = Cesium.Cartesian3.clone(mainViewer.camera.positionWC, new Cesium.Cartesian3());
  const toOrientation = {
    heading: mainViewer.camera.heading,
    pitch: mainViewer.camera.pitch,
    roll: mainViewer.camera.roll,
  };

  // Put it back where it was, then animate across.
  mainViewer.camera.setView({ destination: fromPos, orientation: fromOrientation });

  flyingToStart = true;
  await new Promise((resolve) => {
    mainViewer.camera.flyTo({
      destination: toPos,
      orientation: toOrientation,
      duration: durationMs / 1000,
      complete: resolve,
      cancel: resolve,
    });
  });
  flyingToStart = false;

  // The chase camera smooths its heading between frames. Clear that state so
  // the first real frame snaps to the true travel heading rather than easing
  // in from whatever the descent ended on.
  smoothedHeadingRad = null;
  lastChaseLegId = null;
}

async function runIntroSequence() {
  const qs = new URLSearchParams(location.search);
  const titleMs = qs.has("intro") ? parseFloat(qs.get("intro")) * 1000 : INTRO_TITLE_MS;
  const flyMs = qs.has("flyto") ? parseFloat(qs.get("flyto")) * 1000 : INTRO_FLY_MS;

  // Phase 1 — title card over the world. hasStartedOnce is still false, so
  // render() keeps driving updateIdleCamera() and the bookend stays up.
  if (titleMs > 0) await new Promise((r) => setTimeout(r, titleMs));

  // Phase 2 — drop the title and descend to the opening shot.
  el.bookend.classList.add("hidden");
  hasStartedOnce = true; // so the post-flight frames use the chase camera
  if (flyMs > 0) await flyToStartShot(flyMs);

  // Phases 3 and 4 — tile hold on the opening shot, then drive.
  await startJourney();
}

async function startJourney() {
  hasStartedOnce = true;
  // playing stays FALSE through the hold: the render loop keeps running, so
  // tiles keep streaming and the camera sits at the start position, but
  // simSeconds does not advance and no leg-timed overlay fires yet.
  playing = false;
  el.btnPlay.textContent = "⏸";
  el.bookend.classList.add("hidden");
  // One immediate render so the camera is ON the opening shot before the
  // hold begins — otherwise the first frames of the hold are spent loading
  // tiles for wherever the idle establishing camera happened to be pointing.
  render();

  const qs = new URLSearchParams(location.search);
  const holdMs = qs.has("hold") ? parseFloat(qs.get("hold")) * 1000 : START_HOLD_MS;
  await holdAtStart(holdMs);

  playing = true;
  startFactTicker();
  setTimeout(() => showChapterCard(findLegAt(simSeconds)), CHAPTER_CARD_START_DELAY_MS);
}

// Holds for the full duration rather than exiting as soon as tilesLoaded goes
// true. A fixed beat keeps every take the same length, which matters more for
// cutting the footage than shaving a few seconds off a pre-roll — and
// tilesLoaded only covers the CURRENT view, so it can flip true while the
// ground the camera is about to move over is still empty.
async function holdAtStart(ms) {
  if (!(ms > 0)) return;
  holdingAtStart = true;
  const started = performance.now();
  while (holdingAtStart && performance.now() - started < ms) {
    await new Promise((r) => setTimeout(r, 200));
  }
  const waited = ((performance.now() - started) / 1000).toFixed(1);
  console.info(`Start hold: ${waited}s` +
    (photoTileset ? ` · tilesLoaded=${photoTileset.tilesLoaded} pending=${photoTileset.statistics?.numberOfPendingRequests}` : ""));
  holdingAtStart = false;
}

// ================================================================= BOOT ==
// Exposes internals for console-based debugging (window.__DEBUG__ in devtools).
// `photoTileset` is a getter because the tileset is assigned asynchronously
// during boot — a plain property would capture the null it starts as. Handy
// in devtools for checking coverage and memory against a live leg:
//   __DEBUG__.photoTileset.totalMemoryUsageInBytes
//   __DEBUG__.photoTileset.statistics
window.__DEBUG__ = {
  mainViewer, miniViewer, mainVehicle, miniMarker, LEGS, startJourney, downloadCueSheet,
  get photoTileset() { return photoTileset; },
  // Dial minimap brightness live in devtools instead of edit-build-reload:
  //   __DEBUG__.setMinimapBrightness(1.8)
  // Once it looks right, put that number in MINIMAP_BRIGHTNESS so it sticks.
  // Colour-match the gap-filling globe imagery to the Google tiles live:
  //   __DEBUG__.setBaseImageryStyle({ saturation: 0.6, gamma: 1.2 })
  // Only the keys you pass change. Paste the final object into
  // BASE_IMAGERY_STYLE once it matches.
  setBaseImageryStyle(partial) {
    if (!window.__baseLayer) return "no base imagery layer — Ion asset 2 failed to load";
    Object.assign(BASE_IMAGERY_STYLE, partial);
    applyBaseImageryStyle(window.__baseLayer, BASE_IMAGERY_STYLE);
    return { ...BASE_IMAGERY_STYLE };
  },
  setMinimapBrightness(v) {
    if (!window.__miniLayer) return "no minimap basemap layer — check __miniProbe";
    // Multiply the stored baseline, never the live value: back-computing the
    // baseline from the current brightness compounds on every repeat call.
    window.__miniLayer.brightness = window.__miniBaseBrightness * v;
    return `minimap brightness ${window.__miniLayer.brightness.toFixed(2)} (multiplier ${v})`;
  },
};

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
    if (qs.has("hidecontrols")) document.getElementById("controls").style.display = "none";
    if (qs.has("record")) setSpeedDialValue(RECORD_SPEED_DIAL_VALUE);
    if (qs.has("fast")) playbackMultiplier = parseFloat(qs.get("fast")) || playbackMultiplier;

    // ?intro=N  seconds the title card holds over the orbiting world view
    //           before the descent begins (?autostart only, default 10)
    // ?flyto=N  seconds for the descent from world view to the opening shot
    //           (?autostart only, default 5; 0 makes it a hard cut)
    // ?hold=N sets how many seconds the journey sits on the opening shot,
    // letting photogrammetry around and ahead of the start position resolve
    // before the clock starts. Default 10; ?hold=0 disables it. Applies to
    // Begin the Journey, Replay and ?autostart alike, so every take opens the
    // same way.
    const shouldWarmUp = qs.has("warmup");
    const shouldAutostart = qs.has("autostart");

    if (shouldWarmUp) {
      await warmUpTiles();
    }
    if (shouldAutostart) {
      // Not startJourney() directly — ?autostart runs the full hands-off
      // intro: title card over the world view, descent to the opening shot,
      // tile hold, then drive. Tune with ?intro=N and ?flyto=N.
      runIntroSequence();
    }
  } catch (err) {
    showFatalError(`boot() threw — nothing will render.\n${err.stack || err}`);
  }
})();

let memoryLogBuffer = [];
let lastLogTime = 0;

function logMemoryUsage(currentSimSeconds) {
  if (window.performance && window.performance.memory) {
    const usedMB = Math.round(window.performance.memory.usedJSHeapSize / (1024 * 1024));
    const totalMB = Math.round(window.performance.memory.totalJSHeapSize / (1024 * 1024));
    const limitMB = Math.round(window.performance.memory.jsHeapSizeLimit / (1024 * 1024));

    const timestamp = Math.round(currentSimSeconds);
    const entry = `SimTime: ${timestamp}s | Used Heap: ${usedMB} MB | Total Heap: ${totalMB} MB | Limit: ${limitMB} MB`;

    if (timestamp - lastLogTime >= 60) {
      console.log(`[MEMORY LOG] ${entry}`);
      memoryLogBuffer.push(entry);
      lastLogTime = timestamp;
    }
  }
}

function downloadMemoryLog() {
  if (memoryLogBuffer.length === 0) return;
  const blob = new Blob([memoryLogBuffer.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "memory-usage-log.txt";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

window.addEventListener("beforeunload", downloadMemoryLog);