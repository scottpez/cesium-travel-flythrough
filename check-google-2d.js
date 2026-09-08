// Paste into the DevTools console ON http://localhost:8843 (not a blank tab).
// Running it from the page means the request carries the same HTTP referer your
// app sends, so a referrer-restricted key behaves the same way here as it does
// in the app. A curl from a terminal sends no referer and would fail for a
// different reason, which is misleading.
//
// This is the same call Cesium's Google2DImageryProvider makes internally.
// Whatever Google says here is the real answer.
(async () => {
  const key = (await import("./config.js")).GOOGLE_MAPS_API_KEY;
  console.log("key tail:", "…" + key.slice(-6));

  const res = await fetch(`https://tile.googleapis.com/v1/createSession?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mapType: "satellite", language: "en-US", region: "US" }),
  });

  const body = await res.text();
  console.log("HTTP", res.status);
  try {
    console.log(JSON.parse(body));
  } catch {
    console.log(body);
  }

  if (res.ok) {
    console.log("%c2D Tiles ARE enabled — a session token was issued.", "color:#22c55e;font-weight:bold");
  } else {
    console.log("%c2D Tiles refused. The message above says why.", "color:#ef4444;font-weight:bold");
  }
})();
