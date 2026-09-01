// ============================================================================
// ITINERARY CONFIG — Kuwait to USA, July 26-30, 2026
// All timestamps are real UTC (ISO 8601). Cesium's clock runs on these values
// directly so the sun/lighting are astronomically correct at every moment.
// Screen-time pacing is independent (see `simDuration`) — the engine warps
// real elapsed time to fit a watchable animation while keeping true sun state.
// Edit this file to adjust facts, timing, or route shape. No other file
// should need real-world knowledge baked into it.
// ============================================================================

// ---- Waypoint helper -------------------------------------------------------
// Each waypoint is [longitude, latitude, elevationMeters]. The elevation is a
// hand-estimated ASL figure (not surveyed) baked in so the camera always has
// a reasonable ground reference to aim at *immediately*, instead of depending
// on a live terrain-tile query that may not have loaded yet at high speed —
// that mismatch is what put the camera underground/vehicle out of frame.
// The vehicle's own visual height still uses live terrain clamping when
// available, so it's more accurate than this estimate whenever tiles arrive
// in time; this value is purely the camera's fallback reference.

export const PLACES = {
  rawda: { name: "Rawda, Kuwait", lon: 47.9772, lat: 29.333247 },
  border_kw: { name: "Al-Nuwaiseeb Border (KW)", lon: 48.4130, lat: 28.5450 },
  border_sa: { name: "Khafji Border (SA)", lon: 48.4900, lat: 28.4300 },
  dammamHotel: { name: "Dammam", lon: 50.0930, lat: 26.4260 },
  dmm: { name: "DMM", full: "King Fahd Intl", lon: 49.7979, lat: 26.4712 },
  doh: { name: "DOH", full: "Hamad Intl", lon: 51.6067, lat: 25.2732 },
  jfk: { name: "JFK", full: "John F. Kennedy Intl", lon: -73.7789, lat: 40.6413 },
  stroudsburg: { name: "Stroudsburg, PA", lon: -75.2211096, lat: 40.9820132 },
  stateCollege: { name: "State College, PA", lon: -77.8600, lat: 40.7982 },
};

export const LEGS = [
  // ------------------------------------------------------------------ DAY 1
  {
    id: "drive1",
    type: "drive",
    vehicle: "van",
    label: "Rawda, Kuwait",
    chapterTitle: "THE JOURNEY BEGINS",
    chapterSubtitle: "Our flight from Kuwait was cancelled due to the war — so we drove to Dammam instead · July 26",
    poiStart: "Rawda, Kuwait",
    poiEnd: "Kuwait / Saudi Border",
    flagAt: "start", // shows KW flag
    countryCode: "KW",
    startUTC: "2026-07-26T11:00:00Z",
    endUTC: "2026-07-26T13:00:00Z",
    simDuration: 14,
    cameraStyle: "chase",
    speedOverride: { value: 120, unit: "km/h" },
    photoAt: { src: "assets/kuwait.jpg", caption: "Leaving Rawda, Kuwait", triggerFrac: 0.35 },
    // Road-snapped via OSRM's public routing API (router.project-osrm.org),
    // not hand-traced — actual highway 40 south to the Al-Nuwaiseeb crossing.
    waypoints: [
      [47.977200, 29.333247, 10],
      [47.980350, 29.333022, 10],
      [47.992596, 29.336602, 10],
      [47.998904, 29.339461, 10],
      [48.001210, 29.339036, 10],
      [48.013190, 29.321243, 10],
      [48.015057, 29.318930, 10],
      [48.019589, 29.312803, 11],
      [48.026960, 29.295543, 12],
      [48.036167, 29.277359, 12],
      [48.042465, 29.264347, 13],
      [48.045236, 29.255125, 13],
      [48.051239, 29.234789, 14],
      [48.061063, 29.201287, 15],
      [48.068156, 29.177779, 15],
      [48.080886, 29.150500, 16],
      [48.086496, 29.140685, 17],
      [48.090582, 29.133025, 17],
      [48.093359, 29.120496, 18],
      [48.097131, 29.097823, 19],
      [48.099347, 29.083897, 19],
      [48.099523, 29.074110, 20],
      [48.097530, 29.060882, 21],
      [48.092514, 29.035280, 21],
      [48.091658, 29.023609, 22],
      [48.092828, 29.013627, 23],
      [48.098600, 28.997169, 23],
      [48.122092, 28.959425, 24],
      [48.134410, 28.948471, 25],
      [48.148413, 28.940392, 25],
      [48.161286, 28.935667, 26],
      [48.187751, 28.929048, 27],
      [48.199608, 28.923383, 27],
      [48.210511, 28.913869, 28],
      [48.218766, 28.900383, 28],
      [48.225164, 28.888004, 29],
      [48.230870, 28.876893, 30],
      [48.240967, 28.857449, 30],
      [48.246893, 28.845583, 31],
      [48.257991, 28.823977, 32],
      [48.267110, 28.806241, 32],
      [48.272447, 28.793510, 33],
      [48.279209, 28.762505, 34],
      [48.283273, 28.743952, 34],
      [48.288658, 28.719196, 35],
      [48.293031, 28.699426, 34],
      [48.298969, 28.671952, 34],
      [48.300678, 28.665218, 33],
      [48.305908, 28.654876, 32],
      [48.319217, 28.632729, 32],
      [48.322513, 28.627168, 31],
      [48.327549, 28.618757, 30],
      [48.330135, 28.613868, 30],
      [48.332730, 28.606858, 28],
      [48.334311, 28.598558, 27],
      [48.334866, 28.591531, 26],
      [48.337244, 28.583172, 24],
      [48.341996, 28.575497, 23],
      [48.345808, 28.571528, 22],
      [48.359943, 28.562197, 20],
      [48.385960, 28.546278, 20],
      [48.387698, 28.545359, 19],
      [48.388511, 28.544432, 18],
      [48.389348, 28.543282, 18],
      [48.390844, 28.542356, 17],
      [48.391710, 28.541740, 16],
      [48.393671, 28.539672, 16],
      [48.404704, 28.524440, 15],
    ],
  },
  {
    // A static customs stop, not a drive — it used to be a 2-waypoint "drive"
    // with an orbit camera, which meant the vehicle was actually moving while
    // the camera circled it: looked misaligned, sideways, like a wrong/circular
    // route. Positioned exactly at drive1's last / drive2's first waypoint so
    // there's zero gap; driving resumes seamlessly straight through to Dammam.
    //
    // Position corrected: the previous coordinate (48.4898, 28.4301) was ~13km
    // south of the actual crossing, landing in an ordinary residential part of
    // Khafji town — that's the "small urban area with houses" that got flagged.
    // This is the real facility, geocoded by name: منفذ الخفجي الحدودي
    // (Khafji Border Crossing/Outlet), confirmed via OpenStreetMap.
    id: "border1",
    type: "transfer",
    vehicle: "van",
    label: "Border Crossing",
    chapterTitle: "CROSSING INTO SAUDI ARABIA",
    chapterSubtitle: "Customs at Al-Nuwaiseeb / Khafji · ~30 min",
    poi: "Kuwait / Saudi Border",
    position: [48.404704, 28.524440],
    groundElev: 15,
    flagFrom: "KW",
    flagTo: "SA",
    countryCode: "SA",
    stampText: "ENTERING SAUDI ARABIA",
    startUTC: "2026-07-26T13:00:00Z",
    endUTC: "2026-07-26T13:30:00Z",
    simDuration: 5,
    cameraStyle: "orbit",
  },
  {
    id: "drive2",
    type: "drive",
    vehicle: "van",
    label: "Drive to Dammam",
    chapterTitle: null,
    // No poiStart — we didn't actually stop in Khafji, just drove through;
    // the border1 stop already announced "Kuwait / Saudi Border".
    poiEnd: "Dammam, Saudi Arabia",
    countryCode: "SA",
    startUTC: "2026-07-26T13:30:00Z",
    endUTC: "2026-07-26T17:00:00Z",
    simDuration: 12,
    cameraStyle: "chase",
    speedOverride: { value: 120, unit: "km/h" },
    // Road-snapped via OSRM — real Route 95 south along the coast to Dammam.
    waypoints: [
      [48.404704, 28.524440, 15],
      [48.403369, 28.527046, 15],
      [48.414860, 28.517983, 15],
      [48.418602, 28.516517, 15],
      [48.432363, 28.504043, 15],
      [48.441776, 28.455908, 15],
      [48.442773, 28.419494, 15],
      [48.441020, 28.384536, 15],
      [48.443987, 28.346193, 15],
      [48.460044, 28.303316, 15],
      [48.581372, 28.047365, 15],
      [48.606448, 27.996945, 16],
      [48.661213, 27.887073, 16],
      [48.701202, 27.806674, 17],
      [48.735069, 27.738490, 17],
      [48.764192, 27.679761, 18],
      [48.776043, 27.661018, 18],
      [48.793109, 27.635556, 19],
      [48.848832, 27.552335, 19],
      [48.876628, 27.510971, 20],
      [48.913626, 27.468704, 20],
      [48.931530, 27.424576, 19],
      [48.957717, 27.357392, 19],
      [48.976778, 27.309017, 18],
      [48.983788, 27.290970, 18],
      [48.995626, 27.270613, 17],
      [49.029302, 27.248279, 17],
      [49.043371, 27.235423, 16],
      [49.059443, 27.219177, 16],
      [49.093640, 27.191594, 15],
      [49.143860, 27.155561, 15],
      [49.157582, 27.144438, 14],
      [49.176403, 27.127169, 14],
      [49.203064, 27.108667, 13],
      [49.213151, 27.098862, 13],
      [49.249444, 27.076931, 12],
      [49.264103, 27.057728, 12],
      [49.284233, 27.037880, 11],
      [49.313437, 27.016441, 11],
      [49.338117, 26.994688, 10],
      [49.359992, 26.979226, 10],
      [49.382695, 26.961427, 11],
      [49.429790, 26.924475, 11],
      [49.464313, 26.899488, 12],
      [49.483056, 26.889402, 12],
      [49.498986, 26.873808, 13],
      [49.509702, 26.862473, 13],
      [49.537035, 26.845784, 14],
      [49.553961, 26.837907, 14],
      [49.594593, 26.813452, 15],
      [49.629366, 26.798635, 15],
      [49.658084, 26.776165, 14],
      [49.704127, 26.759875, 14],
      [49.732315, 26.741753, 13],
      [49.760241, 26.702438, 13],
      [49.776434, 26.692114, 12],
      [49.787324, 26.680368, 12],
      [49.799446, 26.659561, 11],
      [49.811772, 26.644506, 11],
      [49.824925, 26.613192, 10],
      [49.837506, 26.587588, 10],
      [49.855630, 26.575228, 10],
      [49.875875, 26.561027, 9],
      [49.890014, 26.544844, 9],
      [49.906474, 26.533760, 9],
      [49.924683, 26.520962, 9],
      [49.935324, 26.507843, 9],
      [49.946109, 26.499106, 8],
      [49.959246, 26.493181, 8],
      [49.992419, 26.477956, 8],
      [50.001464, 26.469744, 8],
      [50.007868, 26.459372, 8],
      [50.011400, 26.445801, 7],
      [50.024482, 26.448159, 7],
      [50.031566, 26.439903, 7],
      [50.034452, 26.436535, 7],
      [50.038395, 26.431874, 7],
      [50.041814, 26.430657, 6],
      [50.050089, 26.437508, 6],
      [50.053244, 26.439610, 6],
      [50.056051, 26.440070, 6],
      [50.064569, 26.440780, 6],
      [50.070824, 26.441277, 6],
      [50.078865, 26.441949, 6],
      [50.083217, 26.438295, 6],
      [50.085023, 26.434072, 5],
      [50.085352, 26.428941, 5],
      [50.085694, 26.426227, 5],
      [50.089174, 26.427583, 5],
      [50.092914, 26.425999, 5],
    ],
  },
  {
    id: "hotel1",
    type: "stay",
    label: "Park Inn by Radisson, Dammam",
    chapterTitle: "OVERNIGHT IN DAMMAM",
    chapterSubtitle: "Park Inn by Radisson · July 26–27",
    logo: "parkinn",
    poi: "Dammam, Saudi Arabia",
    position: [50.0930, 26.4260],
    groundElev: 5,
    startUTC: "2026-07-26T17:00:00Z",
    endUTC: "2026-07-27T14:00:00Z",
    simDuration: 6,
    cameraStyle: "orbit",
  },

  // ------------------------------------------------------------------ DAY 2
  {
    id: "drive3",
    type: "drive",
    vehicle: "van",
    label: "Drive to Dammam Airport",
    chapterTitle: null,
    poiStart: "Dammam",
    poiEnd: "DMM",
    countryCode: "SA",
    startUTC: "2026-07-27T14:00:00Z",
    endUTC: "2026-07-27T15:00:00Z",
    simDuration: 6,
    cameraStyle: "chase",
    speedOverride: { value: 120, unit: "km/h" },
    // Road-snapped via OSRM — real road out to King Fahd International.
    waypoints: [
      [50.092914, 26.425999, 5],
      [50.094277, 26.424445, 5],
      [50.092440, 26.422615, 6],
      [50.084356, 26.418524, 6],
      [50.079984, 26.416320, 6],
      [50.072574, 26.412588, 7],
      [50.067430, 26.410086, 7],
      [50.063713, 26.408202, 7],
      [50.052613, 26.402559, 7],
      [50.043180, 26.397735, 8],
      [50.034369, 26.393306, 8],
      [50.030569, 26.390681, 9],
      [50.026465, 26.387421, 10],
      [50.019330, 26.383572, 10],
      [50.012955, 26.380336, 11],
      [50.004806, 26.376988, 12],
      [49.993931, 26.372861, 12],
      [49.990023, 26.371777, 13],
      [49.983615, 26.371100, 14],
      [49.977036, 26.371664, 15],
      [49.975357, 26.372011, 15],
      [49.972667, 26.372588, 15],
      [49.962233, 26.374843, 16],
      [49.932896, 26.383677, 16],
      [49.898674, 26.395856, 16],
      [49.876966, 26.400786, 17],
      [49.842038, 26.407620, 17],
      [49.820720, 26.413291, 17],
      [49.817223, 26.415116, 18],
      [49.814972, 26.417758, 18],
      [49.810092, 26.432877, 18],
      [49.806454, 26.444790, 18],
      [49.802490, 26.457945, 19],
      [49.802010, 26.461870, 19],
      [49.798487, 26.473454, 19],
      [49.797316, 26.475504, 19],
      [49.796214, 26.475048, 19],
      [49.796881, 26.472312, 20],
      [49.797620, 26.470881, 20],
      [49.797907, 26.471176, 20],
    ],
  },
  {
    id: "wait_dmm",
    type: "transfer",
    label: "DMM · Delayed Departure",
    chapterTitle: "KING FAHD INTERNATIONAL",
    chapterSubtitle: "Flight delayed 10:30p → 11:00p · Qatar Airways",
    logo: "qatarairways",
    poi: "DMM",
    position: [49.7979, 26.4712],
    groundElev: 20,
    startUTC: "2026-07-27T15:00:00Z",
    endUTC: "2026-07-27T20:00:00Z",
    simDuration: 4,
    cameraStyle: "orbit",
  },
  {
    id: "flight1",
    type: "flight",
    vehicle: "plane",
    label: "DMM → DOH",
    chapterTitle: "QATAR AIRWAYS · DMM → DOH",
    chapterSubtitle: "Rerouted far off the normal path to avoid the conflict zone below",
    logo: "qatarairways",
    poiStart: "DMM",
    poiEnd: "DOH",
    startUTC: "2026-07-27T20:00:00Z",
    endUTC: "2026-07-27T21:55:00Z",
    simDuration: 16,
    cameraStyle: "chase",
    cruiseAltitude: 7000,
    speedOverride: { value: 480, unit: "mph" }, // short regional hop, narrowbody cruise speed
    celebrationAt: {
      triggerFrac: 0.40,
      emoji: "✈️🙏",
      title: "AN UNUSUAL ROUTE",
      sub: "Looping far out over the Gulf to avoid the conflict zone below. Thank you, Qatar Airways, for keeping my family safe.",
      colors: ["#8D1B3D", "#FFFFFF"],
      confetti: false,
    },
    // Shown after the celebration above finishes (frac 0.40 + ~4.2s), not
    // at the same moment — avoids the polaroid and the celebration text
    // competing for attention at once.
    photoAt: { src: "assets/flight.jpg", caption: "Our Actual Flight Path", triggerFrac: 0.62 },
    // Re-traced a second time using the actual moving-map photo, this time
    // accounting for something important: the WHITE ribbon in that photo is
    // the 3D path lifted by altitude in the display's perspective, not the
    // ground track — the SHADOW beneath it is the true lat/lon path. A lot
    // of the white ribbon's sharp zigzag is really the climb/descent profile
    // showing through, not actual heading changes. The real ground track is
    // a smoother single sweeping curve: north along the coast, one broad arc
    // east over the Gulf north of Bahrain, then one continuous hook back
    // down into Doha — not the double zigzag drawn before.
    // NOTE: this is a best-effort trace from a photo, not surveyed data —
    // see the chat reply for an easy way to correct it yourself precisely.
    waypoints: [
      [
        49.7979,
        26.4712,
        20
      ],
      [
        49.7739559,
        26.5503602
      ],
      [
        49.687488,
        26.5439142
      ],
      [
        49.6082257,
        26.653446
      ],
      [
        49.6406512,
        26.7274815
      ],
      [
        49.7379276,
        26.7274815
      ],
      [
        50.3402497,
        26.5497288
      ],
      [
        50.6596171,
        26.6389719
      ],
      [
        50.9690043,
        26.7370588
      ],
      [
        51.3781938,
        26.6478924
      ],
      [
        51.7175217,
        26.5765091
      ],
      [
        51.7774031,
        26.4246718
      ],
      [
        51.7574427,
        26.0755841
      ],
      [
        51.817324,
        25.958989
      ],
      [
        52.1366915,
        25.8602413
      ],
      [
        52.2764147,
        25.8063441
      ],
      [
        52.169405,
        25.6912329
      ],
      [
        51.99281,
        25.6988106
      ],
      [
        51.8444018,
        25.6428358
      ],
      [
        51.7458201,
        25.3968777
      ],
      [
        51.7690158,
        25.1871559
      ],
      [
        51.7980104,
        25.0611491
      ],
      [
        51.7690158,
        24.9875852
      ],
      [
        51.7110266,
        25.055896
      ],
      [
        51.620849,
        25.269089,
        10],
      [
        51.6067,
        25.2732,
        10
      ]
    ],
  },
  {
    id: "hustle_doh",
    type: "transfer",
    label: "DOH · Tight Connection",
    chapterTitle: "HAMAD INTERNATIONAL",
    chapterSubtitle: "Landed 12:55a · Sprinting for the 1:55a to JFK",
    logo: "qatarairways",
    poi: "DOH",
    position: [51.6067, 25.2732],
    groundElev: 10,
    flagFrom: "SA",
    flagTo: "QA",
    countryCode: "QA",
    stampText: "ENTERING QATAR",
    startUTC: "2026-07-27T21:55:00Z",
    endUTC: "2026-07-27T22:55:00Z",
    simDuration: 5,
    cameraStyle: "orbit",
    urgent: true,
  },
  {
    id: "flight2",
    type: "flight",
    vehicle: "plane",
    label: "DOH → JFK",
    chapterTitle: "QATAR AIRWAYS · DOH → JFK",
    chapterSubtitle: "Flying west over Saudi Arabia before the great-circle route north",
    logo: "qatarairways",
    poiStart: "DOH",
    poiEnd: "JFK",
    startUTC: "2026-07-27T22:55:00Z",
    endUTC: "2026-07-28T13:00:00Z",
    simDuration: 34,
    cameraStyle: "chase",
    cruiseAltitude: 11500,
    speedOverride: { value: 560, unit: "mph" }, // long-haul widebody cruise speed
    // triggerFrac 0.30 is where the route's real cumulative distance first
    // crosses into continental Europe (Bulgaria/Romania, ~26-32% of the way
    // through this leg per the waypoint geometry below) — computed from the
    // actual waypoints, not eyeballed.
    celebrationAt: {
      triggerFrac: 0.30,
      emoji: "🙏✈️",
      title: "THANK YOU, QATAR AIRWAYS",
      sub: "For keeping my family safe, all the way home.",
      colors: ["#5C0A32", "#FFFFFF"],
      confetti: false,
    },
    sunriseMoment: 0.62, // fraction along the flight where we slow down for sunrise
    // CORRECTED: the previous version of this array routed north from
    // Saudi Arabia through Amman (35.9°E) and then almost due north at a
    // near-constant 35.5-35.9°E longitude — which is exactly the Israel/
    // Lebanon corridor. This one stays over Saudi Arabia longer, crosses
    // into far-eastern Jordan (~38.5°E, well east of Amman), then continues
    // northeast through eastern Syria into southeastern Turkey before
    // curving west across Turkey toward Istanbul/Europe — well clear of
    // Israel and Lebanon airspace throughout.
    waypoints: [
      [
        51.6067,
        25.2732,
        10
      ],
      [
        51.620849,
        25.269089,
        10
      ],
      [
        49,
        26,
        0
      ],
      [
        45.7483796,
        27.0170511
      ],
      [
        43.0143624,
        28.7929294
      ],
      [
        40.303709,
        30.556216
      ],
      [
        38.5,
        32.2,
        0
      ],
      [
        38.1203805,
        35.5575552
      ],
      [
        36.0532724,
        38.8062036
      ],
      [
        30.4467505,
        41.6111455
      ],
      [
        24,
        45.5,
        0
      ],
      [
        10,
        50.5,
        0
      ],
      [
        -2,
        53,
        0
      ],
      [
        -16.4959629,
        53.9238048
      ],
      [
        -30.9106186,
        53.131831
      ],
      [
        -42.9010136,
        51.4334169
      ],
      [
        -53,
        48.5,
        0
      ],
      [
        -70,
        42,
        0
      ],
      [
        -73.7789,
        40.6413,
        4
      ]
    ],
  },

  // ------------------------------------------------------------------ DAY 3
  {
    id: "jfk_ground",
    // Fully inside Google Photorealistic 3D Tiles coverage, so the globe
    // underneath is invisible for this whole leg — yet it was still
    // downloading, decoding and caching basemap imagery nobody can see,
    // on top of the tileset's own budget. Hiding it removes that entire
    // cost exactly where the memory pressure peaks.
    hideGlobe: true,
    type: "transfer",
    label: "JFK · Immigration & Rental Pickup",
    chapterTitle: "WELCOME TO THE USA",
    chapterSubtitle: "Border control · baggage · AirTrain to Budget · Honda Odyssey",
    poi: "JFK",
    position: [-73.7789, 40.6413],
    groundElev: 4,
    logo: "budget",
    flagFrom: "QA",
    flagTo: "US",
    countryCode: "US",
    stampText: "WELCOME TO THE UNITED STATES",
    celebration: {
      delay: 2200,
      emoji: "🗽🎉",
      title: "HOME AT LAST",
      sub: "Two years away from the homeland — so happy to be back.",
      colors: ["#B22234", "#3C3B6E", "#FFFFFF", "#38bdf8", "#FFD700"],
    },
    startUTC: "2026-07-28T13:00:00Z",
    endUTC: "2026-07-28T16:30:00Z",
    simDuration: 9,
    cameraStyle: "orbit",
  },
  {
    id: "drive4",
    // Fully inside Google Photorealistic 3D Tiles coverage, so the globe
    // underneath is invisible for this whole leg — yet it was still
    // downloading, decoding and caching basemap imagery nobody can see,
    // on top of the tileset's own budget. Hiding it removes that entire
    // cost exactly where the memory pressure peaks.
    hideGlobe: true,
    type: "drive",
    vehicle: "minivan",
    label: "JFK → Stroudsburg",
    chapterTitle: "ROAD TRIP: NEW YORK → PENNSYLVANIA",
    chapterSubtitle: "Van Wyck (678) → I-95 South → I-80 West",
    poiStart: "JFK",
    poiEnd: "Stroudsburg, PA",
    countryCode: "US",
    startUTC: "2026-07-28T16:30:00Z",
    endUTC: "2026-07-28T20:30:00Z",
    simDuration: 18,
    cameraStyle: "chase",
    speedOverride: { value: 70, unit: "mph" },
    trafficSlowdowns: [[0.05, 0.22], [0.30, 0.40]], // fractions along leg with heavier traffic (slower camera/vehicle cadence)
    // Re-routed per feedback: the family actually left JFK via the Van Wyck
    // Expressway (I-678) north, merged onto I-95 South through the Bronx and
    // over the George Washington Bridge, then picked up I-80 West right at
    // the NJ side of the bridge — not the earlier OSRM-default path through
    // Queens surface streets. Re-fetched via OSRM with via-points forced
    // onto those three roads; elevation from the real USGS Elevation Point
    // Query Service, same as the rest of this leg's original route.
    waypoints: [
      [-73.789993, 40.644662, 6],
      [-73.784149, 40.646124, 5],
      [-73.799788, 40.645582, 3],
      [-73.807392, 40.656109, 5],
      [-73.801403, 40.666772, 2],
      [-73.803657, 40.678740, 7],
      [-73.809541, 40.690209, 11],
      [-73.815527, 40.701574, 17],
      [-73.817239, 40.705153, 20],
      [-73.825505, 40.715654, 12],
      [-73.831780, 40.726401, 2],
      [-73.836548, 40.738036, 3],
      [-73.834790, 40.749703, 3],
      [-73.838780, 40.761369, 2],
      [-73.832558, 40.771716, 7],
      [-73.824794, 40.782289, 3],
      [-73.824497, 40.794026, 15],
      [-73.831636, 40.805087, 0],
      [-73.836196, 40.816609, 3],
      [-73.835911, 40.828852, 3],
      [-73.850607, 40.830371, 7],
      [-73.865751, 40.834873, 1],
      [-73.881349, 40.837897, 12],
      [-73.895298, 40.843804, 21],
      [-73.911452, 40.845214, 25],
      [-73.915776, 40.845227, 8],
      [-73.931706, 40.846402, 36],
      [-73.946882, 40.850595, 0],
      [-73.962641, 40.853673, 81],
      [-73.974598, 40.860121, 77],
      [-73.972380, 40.872166, 44],
      [-73.983701, 40.880563, 2],
      [-73.996324, 40.888318, 19],
      [-74.010896, 40.893346, 39],
      [-74.019978, 40.886321, 33],
      [-74.025838, 40.875014, 36],
      [-74.034987, 40.867247, 0],
      [-74.051222, 40.867732, 4],
      [-74.062397, 40.876067, 17],
      [-74.069366, 40.887084, 19],
      [-74.079830, 40.896379, 17],
      [-74.091957, 40.903133, 15],
      [-74.108196, 40.904085, 19],
      [-74.123858, 40.901920, 22],
      [-74.139761, 40.901367, 19],
      [-74.155692, 40.902230, 33],
      [-74.169700, 40.907724, 46],
      [-74.185390, 40.907631, 54],
      [-74.197468, 40.900013, 57],
      [-74.210783, 40.897582, 62],
      [-74.226803, 40.897774, 60],
      [-74.242552, 40.899038, 54],
      [-74.258176, 40.895586, 54],
      [-74.274282, 40.893973, 60],
      [-74.290566, 40.893797, 54],
      [-74.306690, 40.892510, 54],
      [-74.320708, 40.886445, 54],
      [-74.328417, 40.875868, 55],
      [-74.333735, 40.864345, 54],
      [-74.348938, 40.862335, 52],
      [-74.364798, 40.861147, 60],
      [-74.380555, 40.859982, 56],
      [-74.396741, 40.860517, 78],
      [-74.412487, 40.863579, 92],
      [-74.428534, 40.865610, 95],
      [-74.444633, 40.867317, 103],
      [-74.460236, 40.870003, 151],
      [-74.468808, 40.880225, 172],
      [-74.477355, 40.889867, 161],
      [-74.488375, 40.898136, 164],
      [-74.499342, 40.907138, 164],
      [-74.514230, 40.911381, 209],
      [-74.530516, 40.911087, 220],
      [-74.546801, 40.910785, 223],
      [-74.563085, 40.910450, 196],
      [-74.579049, 40.908090, 202],
      [-74.595211, 40.908927, 213],
      [-74.610520, 40.904789, 220],
      [-74.625678, 40.900283, 234],
      [-74.640836, 40.895780, 234],
      [-74.656357, 40.892346, 267],
      [-74.672569, 40.892425, 287],
      [-74.688409, 40.890220, 336],
      [-74.704670, 40.890896, 311],
      [-74.717618, 40.896923, 255],
      [-74.726239, 40.907217, 241],
      [-74.740770, 40.912381, 221],
      [-74.756981, 40.912165, 209],
      [-74.771828, 40.916221, 235],
      [-74.782905, 40.924071, 297],
      [-74.798244, 40.923439, 292],
      [-74.811260, 40.916954, 236],
      [-74.827233, 40.918144, 195],
      [-74.842766, 40.919477, 168],
      [-74.858599, 40.922141, 166],
      [-74.874745, 40.923648, 163],
      [-74.889107, 40.929205, 175],
      [-74.905189, 40.930506, 183],
      [-74.920620, 40.926567, 178],
      [-74.936631, 40.925116, 157],
      [-74.952815, 40.924250, 164],
      [-74.967429, 40.928445, 148],
      [-74.983269, 40.930527, 159],
      [-74.998741, 40.933955, 192],
      [-75.014779, 40.935738, 216],
      [-75.030174, 40.931817, 191],
      [-75.044994, 40.926768, 169],
      [-75.060198, 40.922692, 151],
      [-75.072521, 40.929691, 124],
      [-75.087994, 40.927439, 101],
      [-75.101649, 40.933623, 92],
      [-75.107996, 40.944692, 97],
      [-75.116020, 40.955342, 98],
      [-75.118764, 40.967402, 98],
      [-75.131395, 40.971061, 98],
      [-75.137534, 40.982287, 108],
      [-75.142374, 40.994003, 101],
      [-75.155822, 40.998115, 135],
      [-75.170297, 40.992516, 166],
      [-75.184620, 40.986674, 128],
      [-75.194747, 40.982132, 126],
    ],
  },
  {
    id: "hotel2",
    type: "stay",
    label: "Holiday Inn Express & Suites, Stroudsburg",
    chapterTitle: "TWO NIGHTS IN THE POCONOS",
    chapterSubtitle: "Holiday Inn Express & Suites · July 28–30",
    logo: "hiexpress",
    poi: "Stroudsburg, PA",
    position: [-75.1946, 40.9876],
    groundElev: 150,
    startUTC: "2026-07-28T20:30:00Z",
    endUTC: "2026-07-30T16:00:00Z",
    simDuration: 9,
    cameraStyle: "orbit",
    photoAt: { src: "assets/strousburg.jpg", caption: "Stroudsburg, PA", triggerFrac: 0.3 },
  },

  // ------------------------------------------------------------------ DAY 5
  {
    id: "drive5",
    type: "drive",
    vehicle: "minivan",
    label: "Stroudsburg → State College",
    chapterTitle: "FINAL STRETCH",
    chapterSubtitle: "Stroudsburg → State College, PA · I-80 West · July 30",
    poiStart: "Stroudsburg, PA",
    poiEnd: "Happy Valley",
    countryCode: "US",
    // Closer to the end than before, but still ahead of the "WE ARE"
    // celebration below (frac 0.78 vs 0.9) so the two moments don't stack.
    photoAt: { src: "assets/psu.jpg", caption: "Home At Penn State", triggerFrac: 0.78 },
    celebrationAt: {
      triggerFrac: 0.9,
      emoji: "🦁💙🤍",
      title: "WE ARE... PENN STATE!",
      sub: "Welcome home to Happy Valley — State College, PA.",
      colors: ["#041E42", "#FFFFFF", "#96BEE6"],
    },
    startUTC: "2026-07-30T16:00:00Z",
    endUTC: "2026-07-30T19:00:00Z",
    simDuration: 15,
    cameraStyle: "chase",
    speedOverride: { value: 70, unit: "mph" },
    // Road-snapped via OSRM, elevation from the real USGS Elevation Point
    // Query Service. This is the leg where the camera was clipping below
    // ground: the real peak near 41.073°N is 575-587m — our earlier hand
    // estimate of ~520m was 55-65m short, which combined with only a 55m
    // safety margin was just enough to put the camera underground right at
    // the ridge. Real data removes that guesswork entirely.
    waypoints: [
      [-75.194494, 40.987386, 143],
      [-75.199126, 40.984002, 147],
      [-75.210391, 40.982544, 150],
      [-75.214285, 40.983922, 154],
      [-75.230217, 40.985870, 157],
      [-75.270961, 40.998585, 228],
      [-75.303561, 41.020562, 262],
      [-75.317389, 41.054365, 317],
      [-75.354237, 41.065456, 429],
      [-75.383955, 41.067033, 519],
      [-75.399149, 41.074652, 575],
      [-75.417121, 41.072713, 587],
      [-75.469987, 41.074944, 585],
      [-75.521046, 41.078667, 561],
      [-75.588419, 41.077201, 482],
      [-75.602610, 41.080695, 508],
      [-75.622557, 41.083315, 535],
      [-75.659365, 41.080712, 538],
      [-75.686879, 41.070430, 504],
      [-75.707793, 41.064371, 461],
      [-75.748970, 41.060647, 408],
      [-75.783673, 41.057228, 368],
      [-75.844005, 41.053003, 424],
      [-75.879603, 41.061668, 393],
      [-75.964732, 41.052361, 358],
      [-76.021142, 41.044655, 375],
      [-76.070696, 41.030181, 334],
      [-76.084588, 41.025848, 333],
      [-76.103184, 41.023901, 330],
      [-76.122232, 41.015677, 312],
      [-76.137917, 41.007002, 280],
      [-76.158594, 41.003773, 234],
      [-76.164343, 41.005790, 208],
      [-76.170346, 41.017861, 202],
      [-76.180513, 41.019067, 208],
      [-76.200850, 41.017001, 244],
      [-76.218882, 41.013839, 270],
      [-76.243595, 41.009009, 274],
      [-76.265436, 41.009548, 270],
      [-76.283407, 41.012534, 254],
      [-76.297250, 41.011605, 222],
      [-76.312810, 41.021521, 165],
      [-76.344869, 41.036904, 189],
      [-76.395286, 41.028752, 237],
      [-76.435184, 41.028088, 177],
      [-76.471437, 41.020176, 156],
      [-76.500297, 41.009724, 171],
      [-76.529122, 41.006388, 192],
      [-76.549849, 41.007553, 201],
      [-76.577817, 41.001184, 181],
      [-76.597826, 41.001992, 167],
      [-76.641982, 40.997787, 164],
      [-76.681704, 40.989813, 184],
      [-76.717946, 40.986633, 197],
      [-76.744240, 40.996181, 165],
      [-76.783071, 41.012537, 180],
      [-76.800614, 41.025177, 180],
      [-76.824846, 41.046735, 166],
      [-76.866466, 41.052230, 154],
      [-76.884846, 41.055318, 167],
      [-76.930699, 41.077196, 198],
      [-77.029304, 41.074843, 314],
      [-77.086850, 41.055475, 357],
      [-77.138286, 41.041383, 450],
      [-77.150418, 41.050965, 436],
      [-77.190391, 41.052372, 455],
      [-77.208196, 41.054790, 491],
      [-77.213083, 41.063830, 508],
      [-77.246649, 41.060241, 510],
      [-77.307697, 41.050755, 485],
      [-77.344336, 41.050743, 473],
      [-77.370645, 41.062186, 417],
      [-77.398215, 41.065608, 334],
      [-77.410231, 41.069317, 304],
      [-77.435023, 41.056628, 273],
      [-77.477450, 41.038099, 221],
      [-77.509925, 41.033908, 258],
      [-77.559645, 41.025724, 292],
      [-77.596148, 41.007547, 319],
      [-77.619574, 40.985423, 329],
      [-77.644332, 40.968227, 334],
      [-77.702025, 40.948522, 306],
      [-77.716647, 40.946741, 268],
      [-77.721551, 40.943910, 259],
      [-77.730447, 40.938801, 271],
      [-77.742220, 40.921091, 285],
      [-77.736759, 40.896326, 334],
      [-77.734510, 40.887887, 325],
      [-77.756888, 40.881471, 299],
      [-77.779001, 40.872532, 338],
      [-77.794887, 40.856670, 334],
      [-77.815540, 40.845201, 321],
      [-77.830982, 40.840169, 298],
      [-77.842510, 40.827757, 330],
      [-77.837898, 40.821058, 297],
      [-77.830259, 40.811062, 297],
      [-77.836405, 40.807892, 296],
      [-77.851051, 40.802226, 323],
      [-77.856260, 40.798478, 335],
      [-77.860077, 40.798801, 355],
    ],
  },
];

export const TRIP_START = LEGS[0].startUTC;
export const TRIP_END = LEGS[LEGS.length - 1].endUTC;

// Country flag stripe colors (stylized, not pixel-perfect emblems)
export const FLAGS = {
  KW: { name: "Kuwait", colors: ["#007A3D", "#FFFFFF", "#CE1126"], trapezoid: "#000000" },
  SA: { name: "Saudi Arabia", colors: ["#006C35"], emblem: true },
  QA: { name: "Qatar", colors: ["#8D1B3D", "#FFFFFF"], serrated: true },
  US: { name: "United States", colors: ["#B22234", "#FFFFFF"], canton: "#3C3B6E" },
};

// Shown on the closing credits roll — edit freely.
export const CREDITS = {
  filmedBy: "Dr. Scott Pezanowski",
  website: "scottpez.tech",
  logo: "assets/logo.png", // drop your logo file here; shown next to the credit line if present
};

export const BRAND_BADGES = {
  parkinn: { text: "Park Inn by Radisson", color: "#5A2D82", img: "assets/park-logo.png" },
  hiexpress: { text: "Holiday Inn Express", color: "#00693C", img: "assets/holiday-logo.webp" },
  budget: { text: "Budget Rent A Car", color: "#E2231A", img: "assets/budget-logo.webp" },
  qatarairways: { text: "Qatar Airways", color: "#5C0A32", img: "assets/qatar-logo.webp" },
};
