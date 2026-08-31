# Blog Post Reference Notes — "Flying Kuwait → Pennsylvania in the Browser"

**Source material:** `app.js` @ commit `425a594` (HEAD), plus `index.html`, `config.js`, `itinerary.js`, `build.js`, and the git history from `3b9e581` → `425a594`.
**Purpose:** Foundational reference doc. Hand this to an AI (or write from it directly) to produce the BrightWorld Labs post.
**Audience of the eventual post:** geospatial developers, front-end/graphics engineers, researchers who need to record long WebGL sequences.

---

## 0. Provenance and gaps — READ THIS FIRST

Everything in §2–§7 and §9–§10 is **verified against the code and git history** in this repo. I traced each claim to a line number or a commit diff.

**The chat history was not attached to this session.** I only had the repo. That affects three things:

1. **§8 (recording pipeline) is reconstructed from general OBS/Chrome knowledge, not from your transcript.** The steps are correct as general practice and match what your brief describes, but I could not verify *your* specific settings (bitrate, encoder, exact dial position, monitor count). Items needing your input are marked **[FILL IN]**.
2. **Three specific fixes your brief mentions do not exist in this repo.** They may have been discussed and never committed, or committed elsewhere:
   - `ConstantPositionProperty` → `.setValue()` — **not applied.** The code still reassigns `.position` every frame ([app.js:967](app.js#L967), [app.js:892](app.js#L892)). Full detail in §4.1. *This is good news for the post: you have a live "before," and the "after" is a two-line change.*
   - `showNotice` unbounded-DOM fix — **already correct from the initial commit.** `git log -S"showNotice"` shows no fix commit; the auto-removal has always been there. There *is* a real unbounded-DOM problem in the file, but it's in `showFatalError`, not `showNotice`. See §4.3 — reframe this section rather than dropping it.
   - `maximumMemoryUsage` / `skipLevelOfDetail` / `cullRequestsWhileMoving` on the tileset — **not present anywhere in `app.js`.** The tileset is added with zero configuration ([app.js:187-188](app.js#L187-L188)). And `maximumMemoryUsage` **no longer exists** on `Cesium3DTileset` in any modern Cesium. See §5, which is the most important correction in this document.
3. **The "30-minute recording" number.** I derived from the code that ~30 minutes corresponds to a speed dial around `0.34×` (see §10 runtime table). Confirm which setting you actually used. **[FILL IN]**

> **⚠️ Before you publish anything that links to this repo:** your Cesium Ion access token is committed in plaintext at [config.js:12-13](config.js#L12-L13) and again in the built output at `docs/config.js`, which is live on `demo.scottpez.tech` via GitHub Pages. It is already public, so the post won't make it worse — but rotate it at ion.cesium.com, scope it to `assets:read` + the Google Photorealistic 3D Tiles entitlement, and restrict it to your domain before you drive traffic at the repo. Consider making "here's how I handled the token, and what I'd do differently" a short honest sidebar rather than something readers discover themselves.

---

## 1. The story spine

The post has a natural three-act shape. Suggested framing:

**Act I — The ambition.** A family's real evacuation route (Rawda, Kuwait → Dammam → Doha → JFK → Stroudsburg → State College, PA), rendered as a continuous cinematic flythrough over Google Photorealistic 3D Tiles. 13 legs, 7 with real waypoint geometry, stitched into one timeline.

**Act II — The wall.** Photorealistic 3D Tiles is photogrammetry. Moving a camera across continents through it, for tens of minutes without pause, is a fundamentally different workload from the "orbit one city block" demos the API is designed around. Two distinct failure modes:
- V8 heap exhaustion (the JS side: unbounded arrays, per-frame allocations, timers that never die)
- WebGL context loss (the GPU side: tile memory, geometry rebuilds, a render loop that dies silently)

**Act III — The capture.** Even with a stable app, getting 30 minutes of heavy WebGL onto disk is its own engineering problem. OBS's browser source is the obvious answer and the wrong one.

**Recurring motif that ties it together:** *every single fix is about bounding something.* Bound the trail. Bound the tile cache. Bound the allocation rate. Bound what the capture pipeline is asked to do. The whole post is one idea applied at five layers.

**Second motif worth pulling out:** the code is unusually heavily commented, and the comments are *forensic* — they record what was tried and why it failed, not what the code does. E.g. [app.js:1015-1025](app.js#L1015-L1025) documents a headless-screenshot experiment that ruled out every billboard property before fingering the render call itself. That's a defensible thesis on its own: "comments should record the search, not the destination."

---

## 2. Architecture and stack

| Layer | Choice | Notes / line refs |
|---|---|---|
| Renderer | CesiumJS **1.121**, from the Cesium CDN | [index.html:7](index.html#L7). A `1.138` copy sits unused in `cesiumjs/releases/` — worth mentioning as a version-drift footgun, since the tileset factory signature changed between them (§5.4) |
| Basemap | Google Photorealistic 3D Tiles via `Cesium.createGooglePhotorealistic3DTileset()` | [app.js:187](app.js#L187) |
| Fallback basemap | Cesium World Terrain + OSM Buildings | [app.js:195-206](app.js#L195-L206); auto-engaged on any tileset failure, with an on-screen notice so the active renderer is never a guess |
| Auth | Cesium Ion token | [config.js](config.js) — token must carry the Google Photorealistic 3D Tiles entitlement |
| Second viewer | Separate `Cesium.Viewer` for a seatback-style minimap, on a flat `EllipsoidTerrainProvider` | [app.js:120-142](app.js#L120-L142) |
| Minimap imagery | Ion World Imagery → OpenStreetMap raster fallback | [app.js:158-178](app.js#L158-L178) |
| Data | Hand-authored itinerary (`itinerary.js`, 13 legs), GeoJSON state boundaries, route waypoint JSON | |
| Build | esbuild minify → `docs/` → GitHub Pages | [build.js](build.js), `CNAME` → `demo.scottpez.tech` |
| Modules | Native ES modules, no bundler for dev | `<script type="module">` at [index.html:153](index.html#L153) |

**The one architectural decision that everything else depends on** — and the post should open the technical section with it:

```js
const mainViewer = new Cesium.Viewer("cesiumMain", {
  useDefaultRenderLoop: false,   // app.js:89
  shouldAnimate: false,
  // ...all widgets off
});
```

Cesium's default render loop is disabled on **both** viewers. A single hand-written `requestAnimationFrame` loop ([app.js:1106-1126](app.js#L1106-L1126)) drives simulation time, then explicitly calls `mainViewer.render()` and `miniViewer.render()`.

Why it matters for the whole post: it makes frame timing deterministic and recordable, but it also means **every performance and memory sin lands in one function** — `render()` at [app.js:907](app.js#L907), ~200 lines, executed 60 times a second for 30 straight minutes. That's ~108,000 executions per recording. Any allocation in there is an allocation ×108,000.

---

## 3. The routing / timeline engine (brief, but it sets up §4)

Worth a short section because the memory story doesn't land without it.

**Two clocks.** Every leg carries both a *real* duration (`startUTC`/`endUTC`, actual trip time) and a *sim* duration (`simDuration`, screen time). The engine interpolates between them, which is what lets a 13-hour transatlantic flight take 34 seconds of screen time. [app.js:216-268](app.js#L216-L268).

**Precomputation at load, not per frame.** For each leg with waypoints ([app.js:221-233](app.js#L221-L233)):
- `Cesium.EllipsoidGeodesic` per segment, cached in `leg._geodesics`
- Cumulative distance table `leg._cumDist`, total `leg._totalDist`
- Baked elevation array `leg._elevs`

**Non-uniform time warping.** [app.js:239-256](app.js#L239-L256) builds a 300-entry weight table so a leg can "dwell" in screen time around an interesting moment — a Gaussian bump at `leg.sunriseMoment` makes the mid-Atlantic sunrise play in near-slow-motion while the rest of the flight compresses. Inverted into a `simFrac → frac` lookup, resolved per frame by binary search ([app.js:333-345](app.js#L333-L345)). *This is a genuinely nice bit of craft and deserves its own snippet — it's the kind of thing readers will steal.*

**Baked elevation, deliberately not terrain-sampled.** [app.js:387-390](app.js#L387-L390):

> "This is what the camera targets — it never depends on a terrain tile having arrived yet, which is what previously put the camera underground (or aimed at empty space, making the vehicle invisible) whenever a tile hadn't loaded in time."

This is a **key thesis for the post**: at high speed over streamed 3D tiles, *anything that reads back from loaded geometry is a race condition.* The fix isn't to wait for tiles; it's to make the camera path independent of them. Async `sampleTerrainMostDetailed` would have been the "correct" answer and would have been unusable.

**Related trap, same theme** ([app.js:955-964](app.js#L955-L964)): `HeightReference.RELATIVE_TO_GROUND` silently clamps to sea level when Photorealistic 3D Tiles is active, because the tileset is a *primitive*, not the globe's terrain provider. The billboard's own state reads as perfectly correct (`show: true`, valid position, valid image) and nothing renders. Diagnosed by headless screenshot. Fix: `HeightReference.NONE` + the same baked height the camera uses, so both always target the same point.

---

## 4. The memory traps — code level

Five distinct traps. Present them in escalating order of subtlety; the last two are the ones readers won't have seen before.

### 4.1 Reassigning Entity properties inside a 60fps loop

**This is your headline trap, and it is still live in the repo.**

**The code as shipped** ([app.js:965-967](app.js#L965-L967)):

```js
const pos = Cesium.Cartesian3.fromDegrees(state.lon, state.lat, state.height);
mainVehicle.billboard.heightReference = Cesium.HeightReference.NONE;
mainVehicle.position = pos;
```

and ([app.js:892](app.js#L892)):

```js
miniMarker.position = Cesium.Cartesian3.fromDegrees(state.lon, state.lat, state.height + 500);
```

and ([app.js:981-983](app.js#L981-L983)):

```js
mainVehicle.billboard.alignedAxis = diffLen > 1e-6
  ? Cesium.Cartesian3.normalize(diff, new Cesium.Cartesian3())
  : Cesium.Cartesian3.UNIT_Z;
```

**The mechanism — explain this carefully, it's the crux of the section.**

`Entity.position` is not a plain field. It is a *property slot* backed by Cesium's `Property` interface. When you assign a raw `Cartesian3` to it, Cesium's setter does not store your `Cartesian3` — it **constructs a brand-new `ConstantPositionProperty` wrapper around it**. Same for `billboard.heightReference` and `billboard.alignedAxis`, which get wrapped in `ConstantProperty`.

So each of those three lines, per frame, produces:
- a new `Cartesian3` (the value)
- a new `ConstantProperty` / `ConstantPositionProperty` (the wrapper)
- a `definitionChanged` **Event raise** — Cesium's `Event` class walks its listener array and invokes each one

That last item is the part people miss. It isn't just garbage; it's *signalling*. `EntityCollection` and `DataSourceDisplay` are subscribed. Every assignment tells the entity graph "this property was structurally replaced," which is a heavier notification than "this property's value changed."

**Rough arithmetic for the post** (label it as an estimate, it's order-of-magnitude):
- 5 property reassignments per frame across both entities
- × 60 fps × 1,800 seconds = **~540,000 property objects + 540,000 event raises per 30-minute recording**
- Each is small and each is collectable — but they arrive in a steady stream, which is exactly the allocation pattern that keeps V8's scavenger running hot and eventually promotes survivors into old space. On a long unattended recording, that's the difference between a flat heap graph and a sawtooth that ratchets upward.

**The fix — the "after" snippet:**

```js
// once, at setup
const vehiclePosition = new Cesium.ConstantPositionProperty(
  Cesium.Cartesian3.fromDegrees(lon0, lat0, 0)
);
const vehicleAlignedAxis = new Cesium.ConstantProperty(Cesium.Cartesian3.UNIT_Z);
const mainVehicle = mainViewer.entities.add({
  position: vehiclePosition,
  billboard: { alignedAxis: vehicleAlignedAxis, /* ... */ },
});

// scratch objects, allocated once, reused forever
const scratchPos = new Cesium.Cartesian3();
const scratchAhead = new Cesium.Cartesian3();
const scratchDiff = new Cesium.Cartesian3();

// in render(), every frame:
Cesium.Cartesian3.fromDegrees(state.lon, state.lat, state.height, undefined, scratchPos);
vehiclePosition.setValue(scratchPos);           // mutates in place, no new wrapper
vehicleAlignedAxis.setValue(normalizedDirection);
```

`setValue()` mutates the existing property in place and raises `definitionChanged` **only if the value actually differs**. Zero allocation for the wrapper. Combined with Cesium's `result` out-parameter convention (every `Cartesian3` math function takes one), the per-frame allocation for vehicle positioning drops to **zero**.

**Also worth showing:** `heightReference` is assigned every frame at [app.js:966](app.js#L966) but *never changes*. Hoist it out of the loop entirely. Good "look for the constants hiding in your hot path" beat.

**Generalizable rule for the post:** *In Cesium, `entity.foo = value` is a structural edit. `entity.foo.setValue(value)` is a data edit. In a render loop you always want the second.* If a value genuinely changes every frame and you want to skip the property system entirely, use a `CallbackProperty` — with the caveat in §4.4.

---

### 4.2 Unbounded arrays feeding a per-frame geometry rebuild

**Commit:** `25ae4e8` — "Cap miniTrail length to prevent memory accumulation at record speed"

**Before:**
```js
trailPositions.push(pos);
if (trailPositions.length > TRAIL_MAX) trailPositions.shift();
miniTrail.push(pos);                       // ← no cap. grows for the entire journey.
```

**After** ([app.js:985-991](app.js#L985-L991)):
```js
if (lastTrailPos === null || Cesium.Cartesian3.distance(pos, lastTrailPos) > TRAIL_MIN_STEP_M) {
  lastTrailPos = pos;
  trailPositions.push(pos);
  if (trailPositions.length > TRAIL_MAX) trailPositions.shift();
  miniTrail.push(pos);
  if (miniTrail.length > TRAIL_MAX) miniTrail.shift();   // ← the fix
}
```

`TRAIL_MAX = 46`, `TRAIL_MIN_STEP_M = 2.0` ([app.js:446-448](app.js#L446-L448)).

**The naive read of this bug is wrong, and correcting it is the most valuable paragraph in this section.**

Naive read: "the array grew unboundedly and ate memory." The array itself is almost harmless — one point per frame max, so 108,000 `Cartesian3` objects over 30 minutes, maybe 8–10 MB. Annoying, not fatal.

**The actual killer is what the array is attached to** ([app.js:462-469](app.js#L462-L469)):

```js
miniViewer.entities.add({
  polyline: {
    positions: new Cesium.CallbackProperty(() => miniTrail, false),
    //                                                      ^^^^^ isConstant = false
    width: 6,
    material: new Cesium.PolylineGlowMaterialProperty({ ... }),
  },
});
```

`isConstant: false` tells Cesium **this value may change every frame — re-evaluate it every frame.** So on every single frame, the geometry pipeline:
1. calls the callback, gets the array
2. decides the polyline geometry is dirty
3. **re-tessellates the entire polyline** — a glow-material polyline is not a line strip, it's a screen-space-extruded triangle ribbon with per-vertex attributes
4. **re-uploads the whole vertex buffer to the GPU**

At 46 points that's trivial. At 40,000 points, you are rebuilding and re-uploading a ~40,000-segment ribbon **sixty times per second**. That is:
- sustained multi-megabyte-per-frame GPU buffer churn → driver-level allocation pressure → **this is the mechanism behind WebGL context loss**, not "using too much VRAM" in the abstract
- large short-lived typed arrays on the JS side → straight into V8's large-object space, which the scavenger doesn't handle gracefully

**And the "record speed" detail in the commit message is the punchline.** Slowing playback down to let tiles load *makes this strictly worse*: the sim advances slower but the frame rate doesn't, so a fixed stretch of route is sampled over far more frames. Recording slowly to protect the tile loader is exactly the condition under which the trail grows longest and the per-frame rebuild is most expensive. **The mitigation for one problem was the trigger for another** — that's a great beat.

**Alternative fix worth mentioning:** for a genuinely full-journey trail, don't use a `CallbackProperty` polyline at all. Freeze completed legs into static `PolylineCollection` primitives (uploaded once, never touched again) and keep only the current leg live. Or set `isConstant: true` and manually mark dirty on a throttle.

---

### 4.3 Unbounded DOM growth from dynamically created elements

**Reframe needed:** `showNotice` ([app.js:45-54](app.js#L45-L54)) is the *correct pattern*, present since the initial commit — not a bug that was fixed. Use it as the exemplar, then show the two places in the same file where the pattern isn't followed.

**The correct pattern** ([app.js:45-54](app.js#L45-L54)):
```js
function showNotice(msg) {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;top:14px;left:50%;...";
  el.textContent = `ℹ ${msg}`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 9000);   // ← every create paired with a remove
}
```

Three properties worth naming: create → append → **guaranteed removal on a timer**. No accumulation, no reference retained, no listener attached (so nothing to leak through the listener).

**Violation #1 — `showFatalError`** ([app.js:22-34](app.js#L22-L34)). This is the real unbounded-growth bug in the file:

```js
banner.textContent += (banner.textContent ? "\n---\n" : "⚠ RUNTIME ERROR...") + msg;
```

It appends forever, and it's wired to `window.onerror` and `unhandledrejection` ([app.js:35-40](app.js#L35-L40)). A recurring async failure — a tile request rejecting once per second across a 30-minute recording, say — appends 1,800 stack traces into a single text node. String concatenation on an ever-growing string is O(n²) in total work, the node is `white-space:pre-wrap` so the browser re-lays-out an ever-taller element, and it's `position:fixed; z-index:99999` so **it lands on top of your recording.** The `render()` path is guarded by a `fatalErrorReported` latch ([app.js:1105](app.js#L1105), [1121-1124](app.js#L1121-L1124)) — but the global handlers are not. Fix: dedupe by message, cap at N entries, or latch the whole thing.

**Violation #2 — confetti** ([app.js:628-648](app.js#L628-L648)). 70 `<div>` elements created per celebration, each with 6 inline style writes and a CSS animation:

```js
el.confettiLayer.innerHTML = "";
for (let i = 0; i < pieceCount; i++) {   // pieceCount = 70
  const piece = document.createElement("div");
  // ...6 style property writes
  el.confettiLayer.appendChild(piece);
}
```

Cleanup is correct-ish — `innerHTML = ""` at the top of each call and again in the 4.2s dismiss timer ([app.js:655-658](app.js#L655-L658)) — but it is **entirely dependent on timers surviving**. That dependency is what §4.5 is about. Also note: 70 simultaneously animating positioned elements composited on top of a full-screen WebGL canvas is a real compositor cost at exactly the moment you least want a frame drop. Suggested aside: canvas-render the confetti, or accept the cost knowingly.

**Generalizable rule:** *Anything appended to the DOM from inside a long-running loop needs its removal written in the same function that created it, and that removal must not depend on a timer that something else can cancel.*

---

### 4.4 Timers and intervals that outlive their owner

**Commit:** `ed3aae3` — "Fix memory leak: clear factRotateTimer on journey end/replay"

**The fix** ([app.js:1203-1210](app.js#L1203-L1210)):
```js
function clearPendingCelebrations() {
  for (const leg of LEGS) clearTimeout(leg._celebScheduled);
  clearTimeout(celebTimer);
  clearInterval(factRotateTimer);   // ← added
  factRotateTimer = null;           // ← added
  el.celebration.classList.remove("show");
  el.confettiLayer.innerHTML = "";
}
```

The app runs **eight** independent timer handles: `chapterTimer`, `stampTimer`, `stateTimer`, `poiTimer`, `celebTimer`, `photoTimer`, `factRotateTimer`, and a per-leg `leg._celebScheduled`. Each closure retains its DOM refs. A `setInterval` that is never cleared retains its closure **for the lifetime of the page** and keeps firing — including after the journey has ended and the end-card is showing.

**Honest post-mortem — include this, it's the best part of the section.** The commit message says "on journey end/replay." Verified against the code, it delivers **neither cleanly**:

- **Journey end doesn't clear it.** `onJourneyComplete()` ([app.js:1128-1145](app.js#L1128-L1145)) never calls `clearPendingCelebrations()` and never touches `factRotateTimer`. The interval keeps firing over the credits.
- **Replay clears it and never restarts it.** `startFactTicker()` is called from exactly one place — `startJourney()` at [app.js:1286](app.js#L1286). The replay handler ([app.js:1260-1277](app.js#L1260-L1277)) calls `clearPendingCelebrations()` and then never restarts the ticker. **After one replay, the fun-fact ticker is dead for the rest of the session.**
- **Worse:** `clearPendingCelebrations()` is also called by ⏮ ([app.js:1212](app.js#L1212)), ⏭ ([app.js:1220](app.js#L1220)), and every progress-bar click ([app.js:728](app.js#L728)). **Touching any navigation control once, mid-recording, permanently kills the fact ticker.** For a recording workflow where you scrub to line up a shot before hitting record, this is a live footgun.

That's a strong, specific, honest beat: *a leak fix that traded an unbounded resource for a silently dead feature.* Readers trust a post that shows this. The correct fix is a single `startFactTicker()` call added to the replay path, plus a `stopFactTicker()` that `onJourneyComplete()` actually calls — and making `startFactTicker` idempotent rather than guarded by `if (factRotateTimer) return;` ([app.js:708](app.js#L708)).

**Sub-trap worth one line:** the interval period is `7000 * overlayDurationScale()` and is captured **once** at `setInterval` time ([app.js:710](app.js#L710)). Change the speed dial mid-run and the ticker keeps its old cadence.

---

### 4.5 CPU bottlenecks in the hot path (not leaks, but they share the section)

All inside `render()`, all executing 60×/sec:

| Line | What it does | Why it's expensive |
|---|---|---|
| [1031-1032](app.js#L1031-L1032) | `LEGS.filter(...).reduce(...)` to compute distance-so-far | Allocates a new array every frame and rescans all 13 legs. Trivially replaced by a running accumulator or a precomputed prefix-sum array — the same `_cumDist` trick already used per-leg at [app.js:225-231](app.js#L225-L231) |
| [997-1001](app.js#L997-L1001) | `findStateName()` → `pointInRing()` ray-cast over every ring of every GeoJSON feature | Full point-in-polygon against multi-thousand-vertex state boundaries, every frame, for the entire US portion of the trip. Fix: bounding-box reject first, and only test every N frames — state borders don't move |
| [738-753](app.js#L738-L753) | `updateProgressBar` loops all legs, writing `style.width` and toggling classes | Forced style recalculation on a positioned element sitting above the WebGL canvas. Write only on change |
| [1068-1102](app.js#L1068-L1102) | Debug panel builds a ~25-line template string with ~20 `.getValue()` calls | Gated behind `document.body.classList.contains("debug")` — correct — but the gate is a DOM query per frame. Cache the boolean |
| [1027-1028](app.js#L1027-L1028) | `mainViewer.render(); miniViewer.render();` | **Two full scene renders per frame.** The minimap eases at `k = 0.03` ([app.js:884](app.js#L884)) — it is visually near-static. Rendering it at 10fps instead of 60 is a ~free 30–40% GPU saving. *This is probably the single highest-leverage unmade optimization in the file.* |
| [854](app.js#L854) | `camera.lookAt()` every frame | Sets a camera reference-frame transform each frame. Cesium gotcha worth a footnote: `lookAt` locks the camera into a target-relative frame until you call `camera.lookAtTransform(Matrix4.IDENTITY)`. Fine here because it's re-set every frame, but it silently breaks anything that reads world-space camera state |

**Allocation census for one frame of `render()`** — useful as a callout box. Per frame the code allocates roughly: 2 `JulianDate` ([app.js:394](app.js#L394), [762](app.js#L762)), 2 `Cartographic` from `interpolateUsingFraction` ([app.js:403](app.js#L403)), 3–4 `Cartesian3` ([app.js:796](app.js#L796), [965](app.js#L965), [977-978](app.js#L977-L978), [892](app.js#L892)), 1 `HeadingPitchRange` ([app.js:854](app.js#L854)), 1 array from `filter` ([app.js:1031](app.js#L1031)), plus the §4.1 property wrappers, plus several template-literal strings for HUD text. Call it **~15 objects per frame → ~900/second → ~1.6 million per 30-minute recording.** Every one is individually trivial. Together they are a constant-pressure allocation stream, and that is precisely what a generational GC handles worst.

**The framing sentence for the whole of §4:** *None of these are leaks in the classic "forgot to free" sense. They're leaks in the "steady-state allocation rate exceeds what the collector can quietly absorb" sense — which is the only kind of leak that matters in a 30-minute render loop.*

---

## 5. The 3D Tiles configuration — **the biggest correction in this document**

### 5.1 What the code actually does

```js
// app.js:187-188
const tileset = await Promise.resolve(Cesium.createGooglePhotorealistic3DTileset());
mainViewer.scene.primitives.add(tileset);
```

**The tileset is added with zero configuration.** No memory cap, no LOD tuning, no request culling. Every performance knob in this app is set on `scene.globe` instead:

```js
// app.js:106-107 (current, from commit 843571e)
mainViewer.scene.globe.maximumScreenSpaceError = 1.0;
mainViewer.scene.globe.tileCacheSize = 15000;
```

### 5.2 The trap: those two lines do essentially nothing for photorealistic tiles

This is the finding to build the section around, because it's counterintuitive and it's *verifiable from the Cesium type definitions in this very repo*.

`Globe.tileCacheSize` is documented as **"The size of the terrain tile cache, expressed as a number of tiles."** `Globe.maximumScreenSpaceError` drives **terrain and imagery** LOD refinement. Google Photorealistic 3D Tiles is a **`Cesium3DTileset` added to `scene.primitives`** — a completely separate traversal, a separate cache, a separate memory budget. It does not consult `scene.globe` at all.

The code even documents its own contradiction. The comment at [app.js:103-105](app.js#L103-L105) says the massive cache "ensures photorealistic tiles are crisp throughout." Meanwhile the comment at [app.js:955-962](app.js#L955-L962) correctly states that when Photorealistic 3D Tiles is active, the globe "stays a bare flat ellipsoid at sea level." **Both comments are in the same file. The second one is right, which means the first one describes a knob turned on a system that isn't rendering anything.**

So `843571e` — "Optimize photorealistic tiles rendering: aggressive LOD, larger cache" — tuned the wrong subsystem. And it wasn't inert: `tileCacheSize = 15000` (up from 3000) tells the *globe* to retain 15,000 terrain tiles, and `maximumScreenSpaceError = 1.0` (down from 2.2, against a default of 2.0) demands ~4× the terrain tile density. In the **fallback** path (World Terrain + OSM Buildings, [app.js:195-206](app.js#L195-L206)), those settings are very live and very expensive.

**Great beat for the post:** *"I spent an evening tuning a cache that wasn't in the render path, and the tuning was only ever active in the code path I was trying not to use."* Then: how to catch this class of error — `tileset.totalMemoryUsageInBytes`, `tileset.statistics`, and Cesium's `scene.debugShowFramesPerSecond`, checked *before* touching a knob.

### 5.3 What the tileset options actually are

Verified against `cesiumjs/releases/1.138/Build/Cesium/Cesium.d.ts` in this repo (`Cesium3DTileset.ConstructorOptions`). Defaults shown are Cesium's.

**⚠️ `maximumMemoryUsage` does not exist on `Cesium3DTileset`.** It was deprecated and removed; the only `maximumMemoryUsage` left in the API is on `PointCloudShading` (d.ts line 44052, "maximum amount of memory in MB that can be used by the point cloud"). Any blog post or Stack Overflow answer telling you to set `tileset.maximumMemoryUsage` is describing a dead API. **This correction alone is worth a paragraph** — it's the exact kind of stale advice that sends people in circles.

The replacement is a pair:

| Option | Default | What it does | Why it matters here |
|---|---|---|---|
| `cacheBytes` | `536870912` (512 MB) | *"The size (in bytes) to which the tile cache will be trimmed, if the cache contains tiles not needed for the current view."* | **The actual memory ceiling.** This is the knob `843571e` was reaching for. Raise it if you have headroom; **lower it** if you're hitting context loss |
| `maximumCacheOverflowBytes` | `536870912` (512 MB) | *"The maximum additional memory to allow for cache headroom, if more than `cacheBytes` are needed for the current view."* | Real hard ceiling is `cacheBytes + maximumCacheOverflowBytes` = **1 GB by default.** For a continent-crossing camera, overflow is hit constantly. Bounding this is a direct lever on context loss |

Other options that genuinely matter for a fast-moving camera:

| Option | Default | Effect |
|---|---|---|
| `maximumScreenSpaceError` | 16 | The **tileset's own** LOD knob — the one the app never sets. Raising it to 24–32 is the single biggest lever on how much photogrammetry gets downloaded |
| `cullRequestsWhileMoving` | `true` | *"Don't request tiles that will likely be unused when they come back because of the camera's movement."* Already on by default. **Critical caveat from the d.ts: "This optimization only applies to stationary tilesets."** Fine here (Google's tileset is stationary), but the naming misleads — it's about the *tileset* being stationary, not the camera |
| `cullRequestsWhileMovingMultiplier` | 60.0 | *"Larger is more aggressive culling."* **The most under-appreciated knob for this exact use case.** A camera crossing an ocean at time-warp issues requests for tiles it will have passed before they arrive. Raising this discards those requests instead of paying for them |
| `skipLevelOfDetail` | `false` | *"Determines if level of detail skipping should be applied during the traversal."* Jump straight to the needed LOD instead of loading every intermediate level. For a camera descending from 10,000 m to 900 m in seconds, this avoids downloading 3–4 whole pyramids you'll never see. Tuned with `baseScreenSpaceError` (1024), `skipScreenSpaceErrorFactor` (16), `skipLevels` (1) |
| `foveatedScreenSpaceError` | `true` | Prioritizes screen-center tiles by raising SSE at the edges. Already on |
| `foveatedTimeDelay` | 0.2 | *"How long in seconds to wait after the camera stops moving before deferred tiles start loading in."* **For a camera that never stops moving, edge tiles are effectively never requested.** Set to 0 for a fly-through if you want the frame edges filled |
| `progressiveResolutionHeightFraction` | 0.3 | Gets a fast low-res layer down while full-res loads. Directly addresses "gray missing ground" |
| `dynamicScreenSpaceError` | `true` | Lower-res tiles far from camera in horizon views. Tune `dynamicScreenSpaceErrorFactor` (24) and `dynamicScreenSpaceErrorDensity` (2e-4) |
| `preloadWhenHidden` | `false` | *"Loads tiles as if the tileset is visible but does not render them."* An honest alternative to the hand-rolled warm-up in §6.2 |

**The "after" snippet the post should feature** (clearly labelled as the recommended config, not what's currently committed):

```js
const tileset = await Cesium.createGooglePhotorealistic3DTileset(
  { onlyUsingWithGoogleGeocoder: true },
  {
    // Hard memory ceiling — the real fix for WebGL context loss.
    // Total budget = cacheBytes + maximumCacheOverflowBytes.
    cacheBytes: 512 * 1024 * 1024,
    maximumCacheOverflowBytes: 256 * 1024 * 1024,

    // Photogrammetry is expensive; a moving camera can't resolve 16 SSE anyway.
    maximumScreenSpaceError: 24,

    // Jump to the LOD we need instead of loading every level on the way down.
    skipLevelOfDetail: true,
    baseScreenSpaceError: 1024,
    skipScreenSpaceErrorFactor: 16,
    skipLevels: 1,

    // A time-warped camera outruns its own tile requests. Throw them away
    // harder rather than paying to decode tiles for a place we've left.
    cullRequestsWhileMoving: true,
    cullRequestsWhileMovingMultiplier: 120.0,

    // Camera never stops, so don't gate edge tiles behind a "stopped" timer.
    foveatedTimeDelay: 0.0,

    // Get *something* on screen fast, refine after.
    progressiveResolutionHeightFraction: 0.5,
  }
);
mainViewer.scene.primitives.add(tileset);
```

**And the sentence that makes the section land:** *the instinct under memory pressure is to make the cache bigger so tiles stop disappearing. The correct move is the opposite — make the cache smaller and the tiles cheaper, so the browser never reaches the ceiling where the GPU driver takes your context away.* `843571e` went 3000 → 15000 and 2.2 → 1.0. Both moves were in the wrong direction, on the wrong subsystem, for the right-sounding reason ("I have a 47 GB GPU, I can afford it" — [app.js:103](app.js#L103)). **The browser's WebGL memory budget is not your GPU's memory.** That's the lesson.

### 5.4 Version drift footgun

The app pins CesiumJS **1.121** from the CDN ([index.html:7](index.html#L7)) while a **1.138** copy sits unused in the repo. The factory signature differs across that range — in 1.138 it is `createGooglePhotorealistic3DTileset(apiOptions?, tilesetOptions?)` where `apiOptions` is `{ key?, onlyUsingWithGoogleGeocoder? }`; earlier versions took a bare API-key string as the first argument. **Verify the argument shape against 1.121 before publishing the snippet above,** or bump the CDN pin. The code comment at [app.js:183-186](app.js#L183-L186) already flags that the exported name itself contradicts most published examples (no `Async` suffix) — same class of problem, and it makes a nice "the docs you find are not the docs you're running" aside.

---

## 6. Two failed optimizations — the debugging narrative

The best section in the post, because it's specific, dated, and self-critical. Three commits inside 30 minutes on 2026-08-30: `843571e` (21:18) → `2913c60` → `d4a864e` (21:44).

### 6.1 The lookahead prefetch that killed the render loop

**Attempt 1** (`843571e`): every 30 sim-seconds, teleport the camera 10 minutes ahead, render one frame to trigger tile requests, teleport back.

```js
if (playing && hasStartedOnce && simSeconds - lastPrefetchTime > 30) {
  lastPrefetchTime = simSeconds;
  const prefetchState = interpolateRoute(prefetchSim);   // ← function does not exist
  ...
}
```

`interpolateRoute` was never defined anywhere in the file. `ReferenceError` on the first trigger.

**Attempt 2** (`2913c60`, "use computeState for lookahead prefetch instead of undefined interpolateRoute"): swapped in the real function — and introduced a second bug in the same block.

```js
const prefetchState = computeState(prefetchLeg, prefetchLegFrac);
if (prefetchState) {
  prefetchCam.setView({
    destination: prefetchState.pos,                            // ← undefined
    orientation: {
      heading: R.toRadians(prefetchState.heading),             // ← already radians
      pitch: R.toRadians(prefetchState.pitch),                 // ← undefined
      roll: 0
    },
  });
```

`computeState()` returns `{ lon, lat, height, heading, pitchDeg, frac, realTime, isStatic, leg }` ([app.js:410-414](app.js#L410-L414)). There is **no `.pos`** and **no `.pitch`**. And `.heading` is already in radians ([app.js:404](app.js#L404)), so `R.toRadians()` converts it a second time. `setView({ destination: undefined })` throws a `DeveloperError`.

**Attempt 3** (`d4a864e`): "Remove lookahead prefetch that was causing render crash; keep other optimizations." Reverted.

**Why the failure was catastrophic instead of noisy — this is the real lesson.** The prefetch block sat inside `render()`, which is called from `tick()`:

```js
// app.js:1106-1126
function tick(nowMs) {
  try {
    ...
    render();
    requestAnimationFrame(tick);   // ← only re-scheduled if this frame succeeded
  } catch (err) {
    if (!fatalErrorReported) {
      fatalErrorReported = true;
      showFatalError(`tick()/render() threw — the render loop has stopped.\n${err.stack || err}`);
    }
  }
}
```

`requestAnimationFrame(tick)` is **inside the `try`, after `render()`**. One throw and the next frame is never scheduled. **The app doesn't drop a frame — it stops forever, mid-recording, with the last good frame frozen on screen.** And because the throw only fired every 30 sim-seconds, it looked like a random freeze rather than a deterministic bug.

That design is deliberate ([app.js:1119](app.js#L1119): *"only re-schedule if this frame actually succeeded"*) and it's a legitimate trade — fail loud rather than spew 60 identical errors per second. But for a 30-minute unattended recording it is exactly backwards. **Discuss both sides.** The version that fits a recording workflow:

```js
function tick(nowMs) {
  try {
    ...
    render();
  } catch (err) {
    reportOnce(err);          // dedupe, don't accumulate (see §4.3)
  } finally {
    requestAnimationFrame(tick);   // the loop survives a bad frame
  }
}
```

**Third bug in the same block, worth a sentence** because it's a genuine Cesium gotcha: the restore path did

```js
prefetchCam.position = savedPos;
prefetchCam.direction = savedDir;
prefetchCam.up = savedUp;
```

Direct assignment to `Camera.position` does **not** reliably restore camera state when a `lookAt` reference-frame transform is active — which it always is here ([app.js:854](app.js#L854)). The correct restore is `camera.setView({ destination, orientation })` or saving/restoring via `camera.lookAtTransform`. **Even if the undefined-property bugs had been fixed, the camera would have drifted.**

**Closing beat:** the idea wasn't wrong. Cesium has a supported way to do it — `preloadWhenHidden`, or a second hidden tileset, or simply raising `cullRequestsWhileMovingMultiplier` so in-flight requests aren't discarded. *Hand-rolling a camera teleport inside the render loop was the wrong shape of solution to a real problem.*

### 6.2 The warm-up pass that got slower

**Before** (`843571e^`): one render per waypoint, `await sleep(90)`.
**After** ([app.js:1178-1183](app.js#L1178-L1183)): three renders per waypoint, `await sleep(20)` between each.

```js
for (let f = 0; f < 3; f++) {
  mainViewer.render();
  await new Promise((resolve) => setTimeout(resolve, 20));
}
```

Per waypoint: 90 ms + 1 render → 60 ms + 3 renders. Marginally faster wall-clock, **3× the render cost**, and — the part that matters — *rendering a frame does not make the network faster.* Tile requests are issued on the first render; renders two and three re-traverse a tileset whose requests are already in flight. What was actually needed was more *wait*, not more *frames*.

`warmUpTiles()` ([app.js:1156-1194](app.js#L1156-L1194)) sweeps every waypoint in the itinerary — and here's the punchline: **the whole exercise is bounded by `cacheBytes`.** With a 1 GB default ceiling and a transcontinental route, tiles warmed at the start of the sweep are evicted before the sweep reaches the end. **A warm-up pass longer than your cache is a no-op with a progress bar.** That is a genuinely good line and ties §5 and §6 together.

Reachable via `?warmup` at boot ([app.js:1330-1335](app.js#L1330-L1335)), which is the right call for a recording workflow — one URL instead of a click-wait-click dance.

---

## 7. Things still broken / caveats to disclose

Being upfront about these makes the post more credible, not less. All verified.

1. **`.position` reassignment is still live** — §4.1. Frame the post as "here's what I found and what the fix is," not "here's what I fixed," unless you land the change first. *(Recommended: land it. It's ~10 lines and gives you a real before/after profile screenshot.)*
2. **Fact ticker dies on replay or any navigation click** — §4.4.
3. **`onJourneyComplete()` doesn't stop the fact ticker** despite the commit message claiming it does — §4.4.
4. **Globe LOD/cache settings tune the wrong subsystem** — §5.2.
5. **The cue sheet timestamps are wrong by 4×.** [buildCueSheet()](app.js#L549-L570) emits `leg.simStart` values and labels the file *"Assumes 1.0x playback speed (speed dial centered). Total runtime: 2:33."* But at dial-center the playback multiplier is `BASE_SPEED_SCALE = 0.25` ([app.js:510-511](app.js#L510-L511)), so 153 sim-seconds take **612 wall-clock seconds (10:12)**, not 2:33. The cue sheet is only accurate at the dial's *maximum* setting (labelled "4.0×"). **Every SFX cue you hand a video editor is off by a factor of four.** This belongs in the recording section — it's a great "the tooling I built to help me lied to me" beat, and it's a two-line fix (divide by `playbackMultiplier`, or emit wall-clock seconds directly).
6. **Ion token committed in plaintext** — see §0 warning.
7. **TAA with a teleporting camera.** [app.js:115-118](app.js#L115-L118) disables FXAA and enables temporal anti-aliasing. TAA accumulates across frames; the warm-up pass and (formerly) the prefetch teleport the camera between frames, which is the classic TAA ghosting/smearing case. It also adds a full-screen history buffer to GPU memory — in a section about GPU memory pressure. Worth a caveat.
8. **Timezone handling is a two-branch guess.** [app.js:756-759](app.js#L756-L759): `lon > 44 ? +3 : -4`. Honest and fine for this route; say so rather than letting a reader discover it.

---

## 8. The recording pipeline

**⚠️ Reconstructed from the brief and general practice — the chat transcript wasn't available. Verify against your actual setup before publishing. [FILL IN] markers indicate things only you know.**

### 8.1 Why OBS Browser Source fails for heavy WebGL

The OBS Browser Source embeds **CEF (Chromium Embedded Framework)**. It looks like Chrome and is not Chrome for this workload:

- **GPU path is different and weaker.** OBS ships a CEF build configured for compositing overlays and video, not for sustained 3D. Depending on OBS version and settings, WebGL in the browser source may run through a software rasterizer (SwiftShader) or a constrained ANGLE path. A scene Chrome renders at 60fps can run at single-digit fps, or fail to get a WebGL context at all.
- **No practical way to raise the V8 heap.** You can't pass `--js-flags` per-source the way you can launch Chrome with a flag. Given §4's allocation story, the heap ceiling is the exact constraint you need control over.
- **Failure mode is silent.** The source renders black, or renders the first frame and freezes. No console, no error banner — [app.js:22-34](app.js#L22-L34)'s on-screen error banner exists precisely because of this class of invisible failure, and it's the thing that makes debugging *inside* a browser source even possible.
- **Hardware acceleration in the browser source is off by default in many OBS builds**, and turning it on has historically been a known source of instability with GPU-heavy pages.
- **It competes with the encoder for the same GPU.** Rendering photogrammetry and encoding 1080p60 in the same process tree, on the same GPU, with one memory budget.

**The reframe for the post:** the browser source is designed for lower-thirds and alert overlays — light, mostly-2D, mostly-static DOM. Asking it to be a photogrammetry renderer is a category error, not a configuration problem. **Stop trying to fix it. Render in real Chrome and capture the window.**

### 8.2 The native Chrome setup

- **Lock the system display to 1920×1080 before launching Chrome.** Not the OBS canvas — the actual OS display resolution. This guarantees the WebGL drawing buffer, the window, and the capture are all 1:1. Any mismatch means a resample somewhere, and resampling photogrammetry costs you exactly the detail you fought the tile loader for.
- **Set Windows display scaling to 100%.** At 125% or 150%, `devicePixelRatio > 1`, so Cesium allocates a drawing buffer 1.56–2.25× the pixel count you asked for. That's a large, direct increase in GPU memory and fill rate — the same budget §5 is trying to protect — for zero visible benefit in a 1080p recording. **This is the highest-leverage single setting in the whole pipeline and the one most people miss.** *(Alternative if you can't change system scaling: `Cesium.Viewer`'s `resolutionScale`, or launch Chrome with `--force-device-scale-factor=1`.)*
- **`F11` for true fullscreen.** Removes tab strip, address bar, and bookmarks — no cropping needed in OBS, and the page gets the full 1080p buffer.
- **Use the app's URL params instead of clicking** ([app.js:1309-1338](app.js#L1309-L1338)) — this is the part that's specific to *this* project and worth showing:
  ```
  ?presentation   hide HUD and controls entirely
  ?hidecontrols   hide just the control bar
  ?cinematic      letterbox + film grain
  ?record         pre-engage the Record Speed preset (dial -3.3)
  ?warmup         run the tile pre-fetch pass before playback
  ?autostart      begin playback immediately
  ?fast=N         set the playback multiplier directly
  ?debug          on-screen diagnostics
  ```
  So a recording run is one URL: `...?presentation&warmup&autostart&record`. **No mouse in frame, no click timing to get right, reproducible between takes.** That's a genuinely good workflow argument and it generalizes — *if you're going to record it, make every setting reachable from the URL.*
- **Chrome launch flags worth naming** — [FILL IN which you used]:
  - `--js-flags="--max-old-space-size=8192"` — raises the V8 old-space ceiling. **This is the direct counter to the heap-crash half of the story.** Given §4's ~1.6M allocations per recording, headroom buys you the run.
  - `--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows` — **critical for window capture.** Chrome throttles `requestAnimationFrame` in windows it believes are occluded or backgrounded. Click into OBS to start recording and Chrome may quietly drop to a fraction of its frame rate. These three flags are the difference between a smooth take and mystery stutter.
  - `--disable-gpu-vsync` — uncaps frame rate; only useful if you're not frame-locked to 60.
  - `--autoplay-policy=no-user-gesture-required` — if audio is involved.
- **Close everything else.** Other tabs share the GPU process and its memory budget.

### 8.3 OBS capture method — the black screen fix

**Use Window Capture, and set Capture Method to "Windows 10 (1903 and up)".**

- The legacy method is **BitBlt**, which reads back from the window's GDI surface. A hardware-accelerated Chrome window composites via the GPU and never writes to that surface — so BitBlt returns **black**. That's the black screen. It is not a permissions issue, not a bug, and not fixed by running OBS as administrator.
- The modern method is the **Windows Graphics Capture API (WGC)**, added in Windows 10 version 1903. It captures the composited GPU output directly, which is exactly what a hardware-accelerated Chrome window produces. **A one-dropdown fix for a problem that reads like a catastrophic one.**
- The classic wrong turn — disabling Chrome's hardware acceleration to make BitBlt work — "fixes" the black screen by making Cesium unusable. **Name this trap explicitly; it's the one readers will have already tried.**
- **Game Capture does not work for Chrome** (it hooks D3D/OpenGL in games, not browser windows). Don't send readers down that path.
- **Display Capture** is a valid fallback and also uses WGC on modern Windows, but it captures notifications, cursor, and everything else on the monitor. Window Capture is the right default.

**Other OBS settings worth stating** — [FILL IN your actual values]:
- Base and output resolution both **1920×1080**, no rescale (any rescale reintroduces the resampling §8.2 avoided)
- **60 fps** output to match the rAF loop
- **Hardware encoder (NVENC / AMF / QuickSync), never x264.** x264 puts encoding on the CPU, competing with the same main thread running `render()`. NVENC uses a dedicated encoder block that doesn't contend with the 3D pipeline
- CQP ~18–20 or a high CBR bitrate — photogrammetry has enormous high-frequency detail and shows compression artifacts readily
- Capture Cursor **off**
- Record to a **fast local disk**, not a network drive; **[FILL IN container — `mkv` is the safe choice** since it survives a crash, then remux to `mp4`. Given that a bad frame could stop the render loop 25 minutes in, this matters more than usual.]

### 8.4 The record-slow, speed-up-in-post strategy

The strategy the app is explicitly built around — see [config.js](config.js) and [app.js:512-523](app.js#L512-L523).

**The core insight:** you cannot make tiles download faster, but you can give them more wall-clock time per unit of route. Playing back at a fraction of normal speed and speeding the footage up in an editor means the tile loader gets ~10× the time to reach full resolution for the same finished output. **The tile pipeline experiences a slow flight; the viewer sees a fast one.**

**The complication this creates — and the reason `overlayDurationScale()` exists** ([app.js:520-523](app.js#L520-L523)):

```js
function overlayDurationScale() {
  const relative = playbackMultiplier / BASE_SPEED_SCALE;
  return Math.max(1, 1 / relative);
}
```

Every on-screen overlay duration (chapter card 3200 ms, stamp 2600 ms, POI 3400 ms, celebration 4200 ms, state label 2800 ms, photo memory 10000 ms, fact ticker 7000 ms) is multiplied by this. Record at 0.10× and a chapter card stays up for 31.5 seconds — so that when the footage is sped 10× in post, it reads for its originally-tuned 3.2 seconds. `Math.max(1, ...)` means normal and fast playback are untouched.

**This is a really elegant idea and deserves to be a highlighted snippet.** Frame it as: *the recording strategy leaks into the UI layer, and the fix is to make every duration a function of playback rate rather than a constant.* Most people discover this the hard way, in an editor, after the take.

**The gap to be honest about:** `overlayDurationScale()` handles overlay *durations* but the **cue sheet doesn't do the equivalent conversion** for its *timestamps* (§7.5). The abstraction was applied in one place and missed in the adjacent one.

### 8.5 Runtime math for the recording — [VERIFY]

`TOTAL_SIM` = 153 sim-seconds (sum of all 13 legs' `simDuration`). Wall-clock runtime = `153 / playbackMultiplier`, where `playbackMultiplier = 0.25 × 2^dial`:

| Dial position | Displayed label | Multiplier | Wall-clock runtime |
|---|---|---|---|
| +2.0 (max) | 4.00× | 1.000 | 2m 33s |
| 0.0 (center) | 1.00× | 0.250 | 10m 12s |
| −1.0 | 0.50× | 0.125 | 20m 24s |
| **−1.56** | **0.34×** | **0.085** | **≈30m 05s** ← matches your stated 30-minute recording |
| −2.0 | 0.25× | 0.063 | 40m 48s |
| −3.3 (`?record` preset) | 0.10× | 0.025 | 100m 28s |

**Note the discrepancy:** the built-in Record Speed preset ([app.js:1229](app.js#L1229)) produces a **100-minute** take, not 30. So either you didn't use the preset, or you used a different dial position. **[FILL IN — this is a factual claim the post will make, worth getting right.]** Either way, the table is useful content: it shows readers the actual trade curve between tile-load headroom and how long they'll be sitting there.

---

## 9. Code snippet candidates

Ranked by how much they earn their space. GitHub permalinks: use `https://github.com/<user>/cesium-travel-flythrough/blob/425a594/app.js#L<start>-L<end>` so links survive future edits.

### Tier 1 — must include

| # | Lines | What | Why |
|---|---|---|---|
| 1 | [app.js:965-967](app.js#L965-L967) + [892](app.js#L892) | Per-frame `.position =` reassignment | The `ConstantPositionProperty` trap. Pair "before" with the `setValue()` "after" from §4.1 |
| 2 | [app.js:985-991](app.js#L985-L991) | Trail cap (`25ae4e8` diff) | Two-line diff, huge consequence. Show the diff, not the file |
| 3 | [app.js:462-469](app.js#L462-L469) | `CallbackProperty(..., false)` on the trail polyline | **Show this immediately after #2** — it's the reason #2 mattered. The `isConstant: false` flag is the whole story |
| 4 | [app.js:103-107](app.js#L103-L107) | Globe LOD + `tileCacheSize` | The wrong-subsystem trap. Show the `843571e` diff (2.2→1.0, 3000→15000) with the "47GB GPU" comment intact — the reasoning is the point |
| 5 | [app.js:187-188](app.js#L187-L188) | Bare `createGooglePhotorealistic3DTileset()` | The "before": zero configuration. Pair with the recommended config from §5.3 |
| 6 | §5.3 config block | Recommended tileset options | The takeaway artifact. Readers will copy-paste this one |
| 7 | [app.js:1106-1126](app.js#L1106-L1126) | `tick()` with `rAF` inside the `try` | One throw = permanent stop. Pair with the `finally` fix |

### Tier 2 — strong supporting material

| # | Lines | What | Why |
|---|---|---|---|
| 8 | `2913c60` → `d4a864e` diff | The lookahead prefetch, both versions | The debugging narrative. Show attempt 2 with the three bugs annotated inline |
| 9 | [app.js:520-523](app.js#L520-L523) | `overlayDurationScale()` | Genuinely novel; short; ties code to the recording workflow |
| 10 | [app.js:45-54](app.js#L45-L54) | `showNotice` | The correct create/append/remove pattern, as the exemplar |
| 11 | [app.js:22-34](app.js#L22-L34) | `showFatalError` | The unbounded `textContent +=` counter-example. Show 10 and 11 side by side |
| 12 | [app.js:239-256](app.js#L239-L256) | Non-uniform sim-time weight table | The sunrise dwell. Best pure-craft snippet in the file |
| 13 | [app.js:1203-1210](app.js#L1203-L1210) | `clearPendingCelebrations()` | Eight timer handles; the `ed3aae3` fix and the regression it caused |
| 14 | [app.js:1178-1183](app.js#L1178-L1183) | Warm-up 3-renders-per-waypoint loop | "More frames ≠ more network time" |
| 15 | [app.js:1015-1025](app.js#L1015-L1025) | The `clock.tick()` / `viewer.render()` root-cause comment | Not a memory issue, but the single best comment in the codebase. Strong candidate for the post's closing section on forensic commenting |

### Tier 3 — link, don't inline

| Lines | What |
|---|---|
| [app.js:387-390](app.js#L387-L390) | Baked height ("never depends on a tile having arrived") |
| [app.js:955-964](app.js#L955-L964) | `HeightReference.RELATIVE_TO_GROUND` clamping to sea level under photorealistic tiles |
| [app.js:793-856](app.js#L793-L856) | Chase camera + heading smoothing (only driving legs smooth; flights don't — [app.js:826-843](app.js#L826-L843)) |
| [app.js:158-178](app.js#L158-L178) | Minimap imagery fallback chain, with the Natural Earth II zoom-level reasoning |
| [app.js:1031-1032](app.js#L1031-L1032) | Per-frame `filter().reduce()` |
| [app.js:549-570](app.js#L549-L570) | Cue sheet generator (and its 4× timestamp bug) |

---

## 10. Numbers, facts, and pull-quotes

**Verified from the repo:**
- 13 legs; 7 with real waypoint geometry
- `TOTAL_SIM` = **153 sim-seconds** of screen time
- Route: Rawda, Kuwait → Dammam → Doha → JFK → Stroudsburg → State College, PA
- 3 countries, 3 US states, 3 flags
- Trip dates: **July 26–30, 2026**; 7-hour time difference
- CesiumJS **1.121** (CDN), unused 1.138 in-repo
- `TRAIL_MAX` = 46 points; `TRAIL_MIN_STEP_M` = 2.0 m
- `BASE_SPEED_SCALE` = 0.25; dial range −3.3…+2 (exponential, `2^v`)
- Record Speed preset = dial −3.3 → **100-minute** runtime
- Globe settings: SSE 2.2 → **1.0**; tileCacheSize 3000 → **15000** (commit `843571e`)
- Cesium 3D Tiles default memory budget: `cacheBytes` 512 MB + `maximumCacheOverflowBytes` 512 MB = **1 GB**
- Three commits in 26 minutes on 2026-08-30 to add, fix, and revert the prefetch (21:18 → 21:44)
- ~108,000 `render()` calls per 30-minute recording; **~1.6 million object allocations**

**Estimated / to verify — [FILL IN]:** peak heap before and after; actual frames-per-second during recording; the dial position actually used; OBS bitrate and encoder; total tile data downloaded; number of failed takes before a clean one.

**Pull-quote candidates:**
> The browser's WebGL memory budget is not your GPU's memory.

> A warm-up pass longer than your cache is a no-op with a progress bar.

> In Cesium, `entity.foo = value` is a structural edit. `entity.foo.setValue(value)` is a data edit. In a render loop you always want the second.

> `requestAnimationFrame(tick)` was inside the `try`. One throw and the app didn't drop a frame — it stopped forever, twenty-five minutes into a take.

> I spent an evening tuning a cache that wasn't in the render path.

> The instinct under memory pressure is to make the cache bigger. The correct move is to make the cache smaller and the tiles cheaper.

> At high speed over streamed 3D tiles, anything that reads back from loaded geometry is a race condition.

> Recording slowly to protect the tile loader was exactly the condition that made the trail longest and the per-frame rebuild most expensive. The mitigation for one problem was the trigger for another.

---

## 11. Proposed post outline

**Title candidates:**
- "30 Minutes of Photorealistic 3D Tiles Without Crashing the Browser"
- "Every Allocation, Times 108,000: Recording a Transcontinental Cesium Flythrough"
- "The Cache I Tuned Wasn't in the Render Path"

**Structure** (target ~3,500–4,500 words):

1. **Cold open** — the route, the family, why it existed. Two paragraphs. Screenshot or GIF. Earn the technical section.
2. **What I built** — §2 stack table, the two-clock timeline (§3), the `useDefaultRenderLoop: false` decision and why it matters for everything after. *Short.*
3. **Where it broke** — the two failure modes (V8 heap, context loss), what they look like from the user's chair. Set up that these are different problems with different fixes.
4. **Trap 1: property reassignment in a hot loop** — §4.1. Snippets 1 + the `setValue` fix.
5. **Trap 2: the unbounded array that wasn't really about memory** — §4.2. Snippets 2, 3. The `isConstant: false` reveal. The record-speed inversion.
6. **Trap 3: DOM you create must be DOM you destroy** — §4.3. Snippets 10, 11.
7. **Trap 4: eight timers and the fix that broke a feature** — §4.4. Snippet 13, plus the honest post-mortem.
8. **Trap 5: the wrong subsystem** — §5. Snippets 4, 5, 6. **This is the centerpiece.** Include the `maximumMemoryUsage` API correction and the globe-vs-primitive distinction.
9. **Two optimizations that made things worse** — §6. Snippets 8, 14, 7. The `try`/`finally` lesson.
10. **Getting it on disk** — §8. Browser source → native Chrome → WGC window capture. The 100%-scaling insight. The record-slow strategy and `overlayDurationScale()` (snippet 9).
11. **What's still broken** — §7, condensed to 4–5 honest bullets.
12. **What I'd do differently** — the generalizable rules, pulled from each section:
    - Bound everything: arrays, caches, DOM, allocation rate
    - Know which subsystem your knob belongs to before you turn it
    - Never let one bad frame end the loop
    - Make every recording setting reachable from the URL
    - Comment the search, not the destination (snippet 15)
13. **Links** — repo, live demo at demo.scottpez.tech, Cesium 3D Tiles performance docs.

**Tone notes:** the code's own comments are candid and self-correcting — several explicitly document what was tried and rejected. Match that register. The post is stronger for admitting §7 than it would be pretending the repo is clean, and it's much stronger for correcting §5 than for repeating the `maximumMemoryUsage` advice that's already all over the internet.
