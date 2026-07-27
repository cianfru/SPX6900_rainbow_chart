import { useRef, useEffect } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { placeCity, cityScale, CITY_LENGTH, ISLAND_RING, PARK_RINGS, BACKDROP, ISLETS, WATER, streetGrid } from "./city-map.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { chainOf } from "./city-messages.js";
import { TIMES, FAMILIES, skyEnv, facadeTexture, wallGeometry, roofGeometry, archetype } from "./city-render.js";

// A 3D CITY of wallets — shared by the AEON holder skyline and the SPX whale watcher.
//
// Every wallet is a building on a Manhattan-style block grid: the biggest, longest-held
// positions cluster in "midtown" and the rest spread out through the boroughs. Size picks the
// ARCHETYPE — townhouse → condo → tower → skyscraper, with a spired landmark for the top few —
// so scale reads instantly from the silhouette rather than from a bar height.
//
// The flow signal (bought/sold over the lookback window) lights the WHOLE building: the facade
// tints toward green or red, the windows glow that colour, and a halo pad spills onto the street
// so an accumulating or distributing wallet is obvious from any angle and any zoom.
//
// Caller supplies already-normalised towers so this stays asset-agnostic:
//   { a, score, ageT (0..1), flow (signed, 0 = flat), ...anything the card renderer wants }
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => new THREE.Color(lerp(c1.r, c2.r, t), lerp(c1.g, c2.g, t), lerp(c1.b, c2.b, t));
const GREEN = new THREE.Color(0x22c55e), RED = new THREE.Color(0xf43f5e), WARM = new THREE.Color(0xffcf7a);
// deterministic per-wallet variation, so a given address always gets the same building
const hash01 = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };

// square-spiral integer coords, index 0 at centre — used for BLOCKS, so the tallest fill midtown
function spiral(n) {
  const pts = []; let x = 0, z = 0, dx = 0, dz = -1;
  for (let i = 0; i < n; i++) {
    pts.push({ x, z });
    if (x === z || (x < 0 && x === -z) || (x > 0 && x === 1 - z)) { const t = dx; dx = -dz; dz = t; }
    x += dx; z += dz;
  }
  return pts;
}

// Manhattan-ish plots: blocks of BW×BD lots, separated by streets (and wider avenues N-S).
const BW = 3, BD = 2, PLOT = 1.5, STREET = 1.7, AVENUE = 2.5;
function cityPlots(n) {
  const blockW = BW * PLOT + AVENUE, blockD = BD * PLOT + STREET;
  const blocks = spiral(Math.ceil(n / (BW * BD)));
  const pts = [];
  for (const b of blocks) {
    for (let i = 0; i < BW * BD && pts.length < n; i++) {
      pts.push({
        x: b.x * blockW + (i % BW - (BW - 1) / 2) * PLOT,
        z: b.z * blockD + (Math.floor(i / BW) - (BD - 1) / 2) * PLOT,
        bx: b.x * blockW, bz: b.z * blockD,
      });
    }
  }
  return { pts, blockW, blockD, blocks };
}

export default function Skyline3D({
  towers, isMobile, onSelect, cardHtml, crownLabel = "👑 biggest", accent = "rgba(45,212,191,0.4)",
  bodyFrom = 0x334063, bodyTo = 0x8fa6d8,   // body colour ramp across holding age (new → old)
  layout = "city",                          // "city" = laid out on Manhattan · "grid" = the raw skyline
  focus = null,                             // an address to fly the camera to
  intro = true,                             // play the arrival fly-through on mount
  onIntroDone,
  messages = null,                          // { address: { text, ts } } — signs hung over buildings
  time = "dusk",                            // "day" | "dusk" | "night"
}) {
  const mount = useRef(null);
  const api = useRef(null);                 // { cam, controls, homes } for the focus effect
  const selectRef = useRef(onSelect); selectRef.current = onSelect;
  const cardRef = useRef(cardHtml); cardRef.current = cardHtml;

  useEffect(() => {
    const el = mount.current; if (!el || !towers?.length) return;
    const T = towers.slice().sort((a, b) => b.score - a.score);
    const maxScore = Math.max(...T.map(t => t.score), 1e-9);
    const maxFlow = Math.max(...T.map(t => Math.abs(t.flow || 0)), 1e-9);

    // CINEMA MODE (?cinema=1) — the canvas takes the whole window, page chrome and all. It exists
    // for tools/render-city-video.mjs: the first cut of that tool forced the canvas full-bleed with
    // injected CSS instead, which took it out of flow, left `el.clientWidth` at 0, and rendered
    // every frame into a zero-width buffer. The video came out as 28 seconds of flat background.
    // Sizing from the window here means the renderer and the layout agree by construction.
    const cine = typeof location !== "undefined" && new URLSearchParams(location.search).get("cinema") === "1";
    const W = cine ? window.innerWidth : el.clientWidth;
    const VH = cine ? window.innerHeight : (isMobile ? 440 : 580);
    if (cine) Object.assign(el.style, { position: "fixed", inset: "0", width: "100vw", height: "100vh", zIndex: "9999", borderRadius: "0" });
    // Height uses a SQUARE-ROOT scale. Holdings are power-law (the top wallet here is ~100x the
    // median), so a linear axis renders one lonely spike over a field of paving slabs. The root
    // keeps the ordering exact and lets the archetypes actually spread across the city — the
    // caption says so, and the exact figure is always one hover away.
    const HMAX = 21;
    const city = layout === "city";
    // City: real Manhattan lots (biggest holders in the tower districts). Grid: the plain block
    // skyline, kept as an option because it compares sizes far better than a scattered map does.
    const K = cityScale(T.length);
    const LEN = CITY_LENGTH * K;
    const placed = city ? placeCity(T, K) : null;
    const grid = city ? null : cityPlots(T.length);
    const pts = city ? placed.map(p => ({ x: p.x, z: p.z })) : grid.pts;

    const TOD = TIMES[time] || TIMES.dusk;
    const scene = new THREE.Scene();
    // Haze, tuned between two failures: too far and the borough ADMIN boundaries pave the whole
    // frame as flat land; too near and the top-down overview washes out to sky colour.
    scene.fog = new THREE.Fog(new THREE.Color(TOD.horizon), city ? LEN * 0.95 : 55, city ? LEN * 3.0 : 230);
    const cam = new THREE.PerspectiveCamera(46, W / VH, 0.1, 3000);
    const span = city ? LEN * 0.5 : Math.sqrt(T.length) * 2.0;
    if (city) cam.position.set(LEN * 0.34, LEN * 0.66, LEN * 0.50); else cam.position.set(span * 0.95, 20, span * 1.28);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(W, VH);
    // Filmic tone mapping is not a nicety here: without it the bright emissive windows clip to
    // flat white and the age ramp — the whole point of the colour — disappears at the top end.
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = TOD.exposure;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);
    const { env, sky } = skyEnv(renderer, TOD);
    scene.environment = env; scene.background = sky;

    const labelR = new CSS2DRenderer(); labelR.setSize(W, VH);
    Object.assign(labelR.domElement.style, { position: "absolute", top: "0", left: "0", pointerEvents: "none" });
    el.appendChild(labelR.domElement);

    const tip = document.createElement("div");
    Object.assign(tip.style, {
      position: "absolute", pointerEvents: "none", padding: "0", borderRadius: "12px", display: "none",
      background: "rgba(8,11,20,0.97)", border: `1px solid ${accent}`, color: "#e2e8f0",
      font: "500 12.5px 'Space Grotesk', system-ui, sans-serif", zIndex: "5", overflow: "hidden",
      boxShadow: "0 10px 34px rgba(0,0,0,0.6)", transform: "translate(-50%, -108%)", width: "268px",
    });
    el.appendChild(tip);

    scene.add(new THREE.AmbientLight(0xffffff, TOD.amb));
    // A hemisphere light is what stops the top-down view going black. The city is mostly looked at
    // from ABOVE, where the sky env contributes almost nothing to a horizontal surface and every
    // roof and street falls into shadow — this lights upward-facing faces with the sky's own colour.
    // The owner's brief is explicit that the map must be readable in a bright room, so brightness
    // here is a requirement, not a taste setting.
    scene.add(new THREE.HemisphereLight(new THREE.Color(TOD.top), new THREE.Color(TOD.ground), TOD.hemi));
    const sun = new THREE.DirectionalLight(TOD.sun, TOD.sunI);
    sun.position.set(LEN * 0.4, LEN * 0.6, LEN * 0.3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0006;
    // The shadow camera FOLLOWS the view rather than covering the whole island. One map stretched
    // over the full city would be so coarse that shadows read as noise; a tight box around wherever
    // you're looking is crisp, and buildings far enough away to fall outside it are too small for
    // a missing shadow to be visible.
    const SHADOW_SPAN = Math.max(30, LEN * 0.16);
    Object.assign(sun.shadow.camera, { left: -SHADOW_SPAN, right: SHADOW_SPAN, top: SHADOW_SPAN, bottom: -SHADOW_SPAN, near: 1, far: LEN * 2.6 });
    scene.add(sun); scene.add(sun.target);
    let champInfo = null;

    // ── the ground. City: the rivers, the island itself and Central Park. Grid: block pads. ──
    const groundBits = [];
    let pads = null;
    if (city) {
      // Real OpenStreetMap geometry: the island, Central Park, the surrounding boroughs and the
      // rivers between them. Three separated tones — water, backdrop land, island — because at
      // near-identical values the rivers disappeared and the whole thing read as one blob.
      const ringShape = rings => {
        const sh = new THREE.Shape();
        const r0 = rings[0];
        sh.moveTo(r0[0][0] * K, r0[0][1] * K);
        for (const [x, z] of r0.slice(1)) sh.lineTo(x * K, z * K);
        sh.closePath();
        return sh;
      };
      const flat = (rings, colour, y) => {
        if (!rings?.length) return;
        const m = new THREE.Mesh(new THREE.ShapeGeometry(ringShape(rings)),
          new THREE.MeshStandardMaterial({ color: colour, roughness: 0.95, side: THREE.DoubleSide }));
        m.rotation.x = Math.PI / 2; m.position.y = y; scene.add(m); groundBits.push(m);
      };

      // Water is the one genuinely reflective surface in frame, so it gets a low roughness and
      // picks up the sky — which is most of why the island now reads as sitting IN something.
      const water = new THREE.Mesh(new THREE.PlaneGeometry(LEN * 8.0, LEN * 8.0),
        new THREE.MeshStandardMaterial({ color: TOD.water, roughness: 0.42, metalness: 0.06 }));
      water.rotation.x = -Math.PI / 2; water.position.y = -0.42; scene.add(water); groundBits.push(water);

      for (const b of BACKDROP) flat(b.rings, TOD.back, -0.30);   // Brooklyn / Queens / Bronx / Jersey
      // The harbour, painted back OVER the boroughs — their outlines are administrative boundaries
      // that legally cross open water, so without this Brooklyn paves the Upper Bay and Manhattan
      // sits in a puddle. See the WATER note in city-map.js.
      for (const w of WATER) flat([w.ring], TOD.water, -0.16);
      for (const i of ISLETS) flat(i.rings, TOD.back, -0.06);     // Roosevelt Island
      flat([ISLAND_RING], TOD.land, 0);                            // Manhattan
      flat(PARK_RINGS, TOD.park, 0.06);                            // Central Park

      // The street grid — what actually says "Manhattan" at a glance
      const segs = streetGrid(K);
      const gp = new Float32Array(segs.length * 6);
      segs.forEach((sg, i) => {
        gp[i * 6] = sg[0]; gp[i * 6 + 1] = 0.09; gp[i * 6 + 2] = sg[1];
        gp[i * 6 + 3] = sg[2]; gp[i * 6 + 4] = 0.09; gp[i * 6 + 5] = sg[3];
      });
      const gg = new THREE.BufferGeometry();
      gg.setAttribute("position", new THREE.BufferAttribute(gp, 3));
      const gm = new THREE.LineBasicMaterial({ color: 0x8fa4cc, transparent: true, opacity: 0.55 });
      const gl = new THREE.LineSegments(gg, gm); scene.add(gl); groundBits.push(gl);
    } else {
      const groundSize = Math.max(grid.blocks.length * 2, 60) * 4;
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(groundSize, groundSize),
        new THREE.MeshStandardMaterial({ color: 0x1a2033, roughness: 0.95 }));
      ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; scene.add(ground); groundBits.push(ground);

      const padGeo = new THREE.BoxGeometry(BW * PLOT + 0.5, 0.12, BD * PLOT + 0.5);
      const padMat = new THREE.MeshStandardMaterial({ color: 0x262d42, roughness: 0.9 });
      pads = new THREE.InstancedMesh(padGeo, padMat, grid.blocks.length);
      const mtx = new THREE.Matrix4();
      grid.blocks.forEach((b, i) => { mtx.makeTranslation(b.x * grid.blockW, 0.04, b.z * grid.blockD); pads.setMatrixAt(i, mtx); });
      pads.instanceMatrix.needsUpdate = true; scene.add(pads);
      groundBits.push({ dispose: () => { padGeo.dispose(); padMat.dispose(); } });
    }

    // ── the buildings, MERGED ─────────────────────────────────────────────────────────────────
    // One mesh per (family × age × flow) bucket rather than per building. The old renderer issued
    // 6,836 draw calls to push 14,908 triangles — every box carried a 6-material array and three.js
    // emits one call per material group — so the city was CPU-bound on state changes while the GPU
    // sat idle. Merging is what pays for the shadows and materials below.
    // A plain unit cube kept for the two markers that are NOT buildings — the hover cage and the
    // search pulse. Buildings themselves no longer use one; they're merged geometry.
    const box = new THREE.BoxGeometry(1, 1, 1);
    const spireGeo = new THREE.CylinderGeometry(0.035, 0.075, 1, 6);
    const haloGeo = new THREE.CircleGeometry(1.05, 20);
    const texes = Object.fromEntries(Object.keys(FAMILIES).map(f => [f, facadeTexture(f)]));
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x3b3f4a, roughness: 0.88 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4a35, roughness: 0.95 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x8a9099, roughness: 0.5, metalness: 0.7 });
    const disposables = [box, spireGeo, haloGeo, roofMat, woodMat, metalMat, ...Object.values(texes)];

    const ownMats = [], homes = new Map(), picks = [];
    const wallBuckets = new Map();          // key -> { mat, geos: [] }
    const roofGeos = [], woodGeos = [], metalGeos = [], spireGeos = [];
    const AGE_BINS = 6, FLOW_BINS = 5;
    const matFor = (family, ai, fi) => {
      const key = `${family}|${ai}|${fi}`;
      let b = wallBuckets.get(key);
      if (b) return b;
      const aT = (ai + 0.5) / AGE_BINS, fT = (fi / (FLOW_BINS - 1)) * 2 - 1;
      const mag = Math.min(1, Math.abs(fT) * 1.6);
      const flowCol = fT > 0.05 ? GREEN : fT < -0.05 ? RED : null;
      const ageHue = mix(new THREE.Color(bodyFrom), new THREE.Color(bodyTo), aT);
      const F = FAMILIES[family];
      // STONE AND LIGHT: the albedo is the real material with only a whisper of the age hue, so
      // brick still looks like brick. The data lives at full strength in the emissive windows,
      // where it reads better anyway because they are the brightest thing on the facade.
      const albedo = mix(new THREE.Color(F.colour), ageHue, 0.12);
      const winCol = flowCol ? mix(ageHue, flowCol, Math.min(1, 0.45 + mag)) : ageHue;
      const mat = new THREE.MeshStandardMaterial({
        color: albedo, roughness: F.roughness, metalness: F.metalness,
        emissive: winCol, emissiveMap: texes[family],
        emissiveIntensity: TOD.win * (flowCol ? 1 + 0.9 * mag : 1),
        envMapIntensity: F.env,
      });
      ownMats.push(mat);
      b = { mat, geos: [] };
      wallBuckets.set(key, b);
      return b;
    };

    const M = new THREE.Matrix4();
    T.forEach((t, i) => {
      const h = Math.max(0.6, Math.sqrt(Math.max(0, t.score) / maxScore) * HMAX);
      const p = pts[i], r = hash01(t.a || String(i));
      const f = (t.flow || 0) / maxFlow;                     // -1..1
      const mag = Math.min(1, Math.abs(f) * 3.0);
      const flowCol = f > 0.02 ? GREEN : f < -0.02 ? RED : null;
      const ai = Math.min(AGE_BINS - 1, Math.floor((t.ageT ?? 0.5) * AGE_BINS));
      const fi = Math.max(0, Math.min(FLOW_BINS - 1, Math.round((Math.max(-1, Math.min(1, f)) + 1) / 2 * (FLOW_BINS - 1))));

      const { parts, spire, family } = archetype(h, r, i < 3);
      const bucket = matFor(family, ai, fi);
      let widest = 0;
      for (const q of parts) {
        M.makeTranslation(p.x, q.y, p.z);
        const wall = wallGeometry(q.w, q.d, q.h); wall.applyMatrix4(M); bucket.geos.push(wall);
        const roof = roofGeometry(q.w, q.d);
        roof.translate(p.x, q.y + q.h / 2, p.z); roofGeos.push(roof);
        widest = Math.max(widest, q.w, q.d);
      }
      if (spire > 0) {
        const g = spireGeo.clone(); g.scale(1, spire, 1); g.translate(p.x, h + spire / 2, p.z);
        spireGeos.push(g);
      }

      // Roof life. A water tower is the most New York thing available for four triangles, and the
      // HVAC boxes stop every rooftop reading as a flat lid from above — which is the angle this
      // city is mostly viewed from.
      const top = parts[parts.length - 1], roofY = top.y + top.h / 2, rw = top.w;
      if (family === "masonry" && r > 0.25) {
        const tx = p.x + rw * 0.2, tz = p.z - rw * 0.15;
        const tank = new THREE.CylinderGeometry(0.17, 0.17, 0.42, 8); tank.translate(tx, roofY + 0.36, tz);
        const cap = new THREE.ConeGeometry(0.2, 0.18, 8); cap.translate(tx, roofY + 0.66, tz);
        woodGeos.push(tank, cap);
        for (const [dx, dz] of [[-0.1, -0.1], [0.1, -0.1], [-0.1, 0.1], [0.1, 0.1]]) {
          const leg = new THREE.BoxGeometry(0.03, 0.16, 0.03); leg.translate(tx + dx, roofY + 0.08, tz + dz);
          woodGeos.push(leg);
        }
      } else if (h > 1.2) {
        const n = 1 + Math.floor(r * 2);
        for (let k = 0; k < n; k++) {
          const s2 = 0.14 + hash01((t.a || i) + "s" + k) * 0.18;
          const hv = new THREE.BoxGeometry(s2 * rw, 0.12 + hash01((t.a || i) + "h" + k) * 0.18, s2 * rw);
          hv.translate(p.x + (hash01((t.a || i) + "x" + k) - 0.5) * rw * 0.6, roofY + 0.09,
            p.z + (hash01((t.a || i) + "z" + k) - 0.5) * rw * 0.6);
          metalGeos.push(hv);
        }
      }

      // The flow signal spilling onto the pavement — kept as its own mesh because additive
      // blending has to draw after everything else.
      if (flowCol && mag > 0.12) {
        const hMat = new THREE.MeshBasicMaterial({ color: flowCol, transparent: true, opacity: 0.12 + 0.32 * mag, blending: THREE.AdditiveBlending, depthWrite: false });
        const halo = new THREE.Mesh(haloGeo, hMat);
        halo.rotation.x = -Math.PI / 2; halo.position.set(p.x, 0.14, p.z);
        halo.scale.setScalar(0.6 + 0.5 * mag);
        scene.add(halo); ownMats.push(hMat);
      }

      // Merged geometry has no per-building mesh to hover, so picking rides an invisible instanced
      // box per building — one draw call for the whole city, and it gives back an instanceId.
      picks.push({ t, x: p.x, z: p.z, w: widest * 1.02, h: h + spire });
      if (city) { t.hood = placed[i].hood; homes.set((t.a || "").toLowerCase(), { x: p.x, z: p.z, h: h + spire }); }
      if (i === 0) champInfo = { x: p.x, z: p.z, h: h + spire };
    });

    const addMerged = (geos, mat, shadow = true) => {
      if (!geos.length) return;
      const merged = mergeGeometries(geos, false);
      geos.forEach(g => g.dispose());
      if (!merged) return;
      const m = new THREE.Mesh(merged, mat);
      m.castShadow = shadow; m.receiveShadow = shadow;
      scene.add(m); disposables.push(merged);
    };
    for (const b of wallBuckets.values()) addMerged(b.geos, b.mat);
    addMerged(roofGeos, roofMat);
    addMerged(woodGeos, woodMat);
    addMerged(metalGeos, metalMat);
    addMerged(spireGeos, metalMat);

    // invisible pick volumes — one InstancedMesh, so hovering costs nothing to draw
    const pickGeo = new THREE.BoxGeometry(1, 1, 1);
    const pickMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    const pickMesh = new THREE.InstancedMesh(pickGeo, pickMat, picks.length);
    picks.forEach((q, i) => {
      M.compose(new THREE.Vector3(q.x, q.h / 2, q.z), new THREE.Quaternion(), new THREE.Vector3(q.w, q.h, q.w));
      pickMesh.setMatrixAt(i, M);
    });
    pickMesh.instanceMatrix.needsUpdate = true;
    scene.add(pickMesh); disposables.push(pickGeo, pickMat);

    // crown the #1
    if (champInfo) {
      const d = document.createElement("div");
      d.textContent = crownLabel;
      Object.assign(d.style, { color: "#fde68a", font: "700 12px 'Space Grotesk', system-ui, sans-serif", textShadow: "0 1px 4px #000", whiteSpace: "nowrap" });
      const o = new CSS2DObject(d); o.position.set(champInfo.x, champInfo.h + 3, champInfo.z); scene.add(o);
    }

    // ── the arrival flight ────────────────────────────────────────────────────────────────────
    // A scripted approach: come in low over the harbour, climb the length of the island through
    // the towers, then pull back into the overview. It shows the whole city the way a person
    // would want to see it first — the tall/short mix, the colour ramp, the green and red
    // buildings — instead of dropping you into a static wide shot. Any input cancels it.
    const overview = cam.position.clone();
    const flight = city && intro ? (() => {
      const half = LEN / 2;
      const keys = [
        // Comes up the HUDSON rather than in over Brooklyn. Partly because it's the classic approach
        // to Manhattan, but mostly because the water west of the island is genuinely water in the
        // data — the flight used to open on a flat plain, which is the borough ADMIN boundary
        // pretending to be land where the harbour should be. Flying over real water needed no
        // invented coastline.
        { p: [-LEN * 0.32, LEN * 0.055, -half - LEN * 0.30], t: [0, LEN * 0.02, -half + LEN * 0.05] }, // in off the bay
        { p: [-LEN * 0.25, LEN * 0.035, -half + LEN * 0.06], t: [0, LEN * 0.03, -half + LEN * 0.22] }, // up past downtown
        { p: [LEN * 0.055, LEN * 0.045, -half + LEN * 0.34], t: [0, LEN * 0.035, -half + LEN * 0.52] }, // up through midtown
        { p: [-LEN * 0.05, LEN * 0.075, -half + LEN * 0.62], t: [0, LEN * 0.02, -half + LEN * 0.80] }, // past the park
        { p: [LEN * 0.20, LEN * 0.26, LEN * 0.18], t: [0, 0, 0] },                                      // rise
        { p: [overview.x, overview.y, overview.z], t: [0, 4, 0] },                                       // settle
      ];
      // Slow and cinematic on purpose — at half this it read as a rush past the buildings rather
      // than a look at them. Any click, drag or scroll cancels it, so it never holds anyone up.
      return { keys, dur: 26000, start: performance.now() };
    })() : null;
    const easeInOut = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
    // Catmull-Rom through the keyframes, so the path curves instead of snapping corner to corner.
    const spline = (arr, u) => {
      const n = arr.length - 1, i = Math.min(n - 1, Math.floor(u * n)), f = u * n - i;
      const p0 = arr[Math.max(0, i - 1)], p1 = arr[i], p2 = arr[i + 1], p3 = arr[Math.min(n, i + 2)];
      return [0, 1, 2].map(k => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * f +
        (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * f * f +
        (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * f * f * f));
    };

    const controls = new OrbitControls(cam, renderer.domElement);
    controls.target.set(0, city ? 4 : 7, 0); controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.minDistance = 8; controls.maxDistance = city ? LEN * 2.4 : span * 4 + 60; controls.maxPolarAngle = Math.PI * 0.492;
    controls.autoRotate = !city; controls.autoRotateSpeed = 0.5;
    const pulseMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
    const pulseBox = new THREE.Mesh(box, pulseMat); pulseBox.visible = false; scene.add(pulseBox); ownMats.push(pulseMat);
    const pulse = home => {
      pulseBox.visible = true;
      pulseBox.scale.set(1.5, home.h, 1.5); pulseBox.position.set(home.x, home.h / 2, home.z);
      let n = 0;
      const id = setInterval(() => { pulseMat.opacity = n % 2 ? 0.5 : 0.08; if (++n > 7) { clearInterval(id); pulseBox.visible = false; } }, 240);
      return () => { clearInterval(id); pulseBox.visible = false; };
    };
    // Signs live in their own group so messages can be re-hung without touching the buildings.
    const signs = new THREE.Group(); scene.add(signs);
    api.current = { cam, controls, homes, pulse, signs, scene };

    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    let hovered = null, px = 0, py = 0, moved = false;
    // hover marker — a bright wireframe cage placed over the hovered building
    const cageMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.55 });
    const cage = new THREE.Mesh(box, cageMat); cage.visible = false; scene.add(cage); ownMats.push(cageMat);
    const setHover = id => {
      if (hovered === id) return;
      hovered = id;
      const q = id == null ? null : picks[id];
      if (q) {
        cage.visible = true;
        cage.scale.set(q.w * 1.06, q.h * 1.02, q.w * 1.06);
        cage.position.set(q.x, q.h / 2, q.z);
        renderer.domElement.style.cursor = "pointer";
      } else { cage.visible = false; renderer.domElement.style.cursor = "grab"; }
    };
    const pick = e => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1; ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      ray.setFromCamera(ndc, cam);
      return ray.intersectObject(pickMesh, false)[0];
    };
    const onMove = e => {
      const r = renderer.domElement.getBoundingClientRect();
      px = e.clientX - r.left; py = e.clientY - r.top; moved = true;
      const hit = pick(e);
      if (hit) {
        setHover(hit.instanceId);
        controls.autoRotate = false;
        tip.style.display = "block"; tip.style.left = px + "px"; tip.style.top = py + "px";
        tip.innerHTML = cardRef.current?.(picks[hit.instanceId].t) ?? "";
      } else { setHover(null); tip.style.display = "none"; }
    };
    const onDown = () => { moved = false; };
    const onUp = e => {
      if (moved) return;                                  // was a drag, not a click
      const hit = pick(e);
      if (hit) selectRef.current?.(picks[hit.instanceId].t);
    };
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("pointerleave", () => { setHover(null); tip.style.display = "none"; });

    let raf, flying = !!flight;
    const stopFlight = () => {
      if (!flying) return;
      flying = false; controls.enabled = true; controls.autoRotate = false;
      cam.position.copy(overview); controls.target.set(0, city ? 4 : 7, 0); controls.update();
      onIntroDone?.();
    };
    // Frame-accurate seek for offline video capture (tools/render-city-video.mjs). Driving the
    // path by progress rather than wall-clock means every frame lands exactly where intended,
    // however slowly the renderer is running.
    if (flight) {
      window.__citySeek = u => {
        flying = false; controls.enabled = false;
        const e = easeInOut(Math.max(0, Math.min(1, u)));
        const pp = spline(flight.keys.map(kk => kk.p), e), tt = spline(flight.keys.map(kk => kk.t), e);
        cam.position.set(pp[0], pp[1], pp[2]); controls.target.set(tt[0], tt[1], tt[2]);
        controls.update(); renderer.render(scene, cam); labelR.render(scene, cam);
      };
      window.__cityReady = true;
    }
    // Perf probe. The open question on these pages is what they cost on a REAL GPU — everything
    // here has only ever been measured on a software rasteriser, so the building caps are caution
    // rather than measurement. Exposed so that can be answered from any device's console.
    window.__cityStats = () => ({
      buildings: T.length, meshes: scene.children.length,
      drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
      programs: renderer.info.programs?.length, geometries: renderer.info.memory.geometries,
      k: K, cam: [+cam.position.x.toFixed(1), +cam.position.y.toFixed(1), +cam.position.z.toFixed(1)],
      textures: renderer.info.memory.textures,
    });
    if (flying) { controls.enabled = false; renderer.domElement.addEventListener("pointerdown", stopFlight, { once: true }); addEventListener("wheel", stopFlight, { once: true, passive: true }); }
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (flying) {
        const u = Math.min(1, (performance.now() - flight.start) / flight.dur);
        const e = easeInOut(u);
        const p = spline(flight.keys.map(k => k.p), e), t = spline(flight.keys.map(k => k.t), e);
        cam.position.set(p[0], p[1], p[2]); controls.target.set(t[0], t[1], t[2]);
        if (u >= 1) stopFlight();
      }
      controls.update();
      sun.target.position.copy(controls.target);
      sun.position.set(controls.target.x + LEN * 0.22, controls.target.y + LEN * 0.34, controls.target.z + LEN * 0.17);
      sun.target.updateMatrixWorld(); sun.shadow.camera.updateProjectionMatrix();
      renderer.render(scene, cam); labelR.render(scene, cam);
    };
    loop();
    const onResize = () => {
      const w = cine ? window.innerWidth : el.clientWidth, h = cine ? window.innerHeight : VH;
      if (!w || !h) return;                       // a zero-size buffer renders nothing at all
      cam.aspect = w / h; cam.updateProjectionMatrix(); renderer.setSize(w, h); labelR.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf); window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("pointerdown", stopFlight);
      removeEventListener("wheel", stopFlight);
      controls.dispose();
      disposables.forEach(d => d.dispose()); env.dispose(); sky.dispose();
      ownMats.forEach(m => m.dispose());
      groundBits.forEach(g => { if (g.dispose) g.dispose(); else { g.geometry?.dispose(); g.material?.dispose(); } });
      pads?.dispose();
      delete window.__citySeek; delete window.__cityReady; delete window.__cityStats;
      renderer.dispose(); el.removeChild(renderer.domElement); el.removeChild(labelR.domElement); el.removeChild(tip);
    };
  }, [towers, isMobile, crownLabel, accent, bodyFrom, bodyTo, layout, intro, time]);

  // ── messages hung over buildings ───────────────────────────────────────────────────────────
  // Own a building, leave a note on it. Signs are CSS2D labels rather than 3D text so they stay
  // legible at every zoom, and they live in their own group so a new message re-hangs one sign
  // instead of rebuilding four thousand meshes. Runs after the scene effect (declared later,
  // shares its deps) so a scene rebuild re-hangs everything.
  useEffect(() => {
    const a = api.current; if (!a?.signs) return;
    const g = a.signs;
    const entries = Object.entries(messages || {});
    for (const [addr, m] of entries) {
      const home = a.homes.get(String(addr).toLowerCase());
      if (!home || !m?.text) continue;
      // Two nested divs on purpose: CSS2DRenderer overwrites the outer element's transform every
      // frame, so the bubble is offset on the INNER one. That offset is in SCREEN pixels, which is
      // what keeps it clear of the crown label at every zoom — a world-space gap shrinks as you
      // pull back and the two labels end up on top of each other.
      const wrap = document.createElement("div");
      wrap.style.position = "relative";
      const d = document.createElement("div");
      const ch = chainOf(m.chain);
      Object.assign(d.style, {
        position: "absolute", left: "50%", bottom: "22px", transform: "translateX(-50%)",
        width: "180px", padding: "5px 9px 6px", borderRadius: "9px", textAlign: "center",
        background: "rgba(10,14,26,0.93)", border: `1px solid ${ch.colour}`,
        color: "#e2e8f0", font: "600 11.5px 'Space Grotesk', system-ui, sans-serif",
        lineHeight: "1.45", whiteSpace: "pre-wrap", wordBreak: "break-word",
        boxShadow: `0 6px 20px rgba(0,0,0,0.55), 0 0 0 3px ${ch.tint}`, pointerEvents: "none",
        opacity: m.pending ? "0.75" : "1",
      });
      d.textContent = m.text;
      // The chain in writing as well as in colour. The Ethereum grey is near-neutral by design, so
      // colour alone would be a distinction plenty of people can't make — and "which chain is this
      // note on" is the whole question the colour is there to answer.
      const tag = document.createElement("div");
      Object.assign(tag.style, {
        marginTop: "4px", font: "700 8.5px 'Space Grotesk', system-ui, sans-serif",
        letterSpacing: "0.09em", color: ch.colour, opacity: "0.95",
      });
      tag.textContent = m.pending ? `${ch.short} · CONFIRMING` : ch.short;
      d.appendChild(tag);
      wrap.appendChild(d);
      const o = new CSS2DObject(wrap);
      o.position.set(home.x, home.h + 3, home.z);   // same anchor as the crown; the 22px lifts it clear
      g.add(o);
    }
    return () => {
      // CSS2DRenderer only detaches elements it still knows about, so pull the DOM node too.
      for (const o of [...g.children]) { o.element?.remove(); g.remove(o); }
    };
  }, [messages, towers, layout, time]);

  // Fly to a searched wallet and flash its building, without rebuilding the scene.
  useEffect(() => {
    const a = api.current; if (!a || !focus) return;
    const home = a.homes.get(String(focus).toLowerCase());
    if (!home) return;
    a.controls.autoRotate = false;
    a.controls.target.set(home.x, Math.min(home.h * 0.6, 14), home.z);
    a.cam.position.set(home.x + 16, home.h * 0.9 + 12, home.z + 20);
    a.controls.update();
    if (a.pulse) return a.pulse(home);   // flash the building so the eye lands on it
  }, [focus]);

  return <div ref={mount} style={{ position: "relative", width: "100%", borderRadius: 12, overflow: "hidden", cursor: "grab" }} />;
}
