// ============================================================================
// CONFIG — edit this file only; nothing else needs touching for deployment.
//
// 1. Get a fresh token at https://ion.cesium.com/tokens (the one below is old
//    and may be rate-limited or revoked). Scope it to `assets:read` +
//    `geocode`, and restrict it to your domain (scottpez.tech) once deployed.
// 2. Google Photorealistic 3D Tiles requires that token to have Google Geocoder
//    / Photorealistic Tiles access enabled on ion.cesium.com.
// ============================================================================

export const ION_ACCESS_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6Im4wYXdvcF9SdlA0b0N4OHYiLCJqdGkiOiJhNTM5OWJhYy1hNjY4LTRjMGEtYWU1NS0wZTAxNmMyNGQ4OWIiLCJpZCI6MjM2OTQ3LCJzdWIiOiJzY29wZXoiLCJpc3MiOiJodHRwczovL2FwaS5jZXNpdW0uY29tIiwiYXVkIjoic2NvdHRwZXotdHJhdmVsLWFwcCIsImlhdCI6MTc4ODA2MzE4N30.ZzrhwwR6wOznxOsi2TfJBIjJpd_INCBO7YTliKVFPVIs";

  

// Google Photorealistic 3D Tiles: real photogrammetry (actual textured
// building facades, trees, terrain) instead of Cesium OSM Buildings' plain
// gray extruded boxes. This is the visual upgrade — turned on by default.
//
// Tradeoff: these tiles are heavy and can lag behind the camera during fast
// time-warped flight legs. Mitigations already in the app: the 🔥 Warm Up
// button pre-fetches the route before you hit Play, and for final recording
// it's still worth using a low speed-dial setting and speeding the footage
// up in post (see the strategy notes from earlier — that guarantees full
// resolution regardless of network speed). If the app can't load these
// tiles (token not entitled, network issue), it silently falls back to
// World Terrain + OSM Buildings — watch for the on-screen notice the app
// shows when that happens, so you always know which one is actually active.
//
// REQUIRES: your Ion token must have Google Photorealistic 3D Tiles access
// enabled. Go to https://ion.cesium.com/tokens, open your token's scopes,
// and confirm "Google Photorealistic 3D Tiles" is checked — first use may
// prompt you to accept Google's terms of service on ion.cesium.com. The
// token below is from 2021 and almost certainly needs this enabled or
// needs replacing entirely.
export const USE_PHOTOREALISTIC_TILES = true;
