import { useRef, useEffect } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { placeCity, cityScale, CITY_LENGTH, ISLAND_RING, PARK_RINGS, BACKDROP, ISLETS, streetGrid } from "./city-map.js";

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

// Lit-window facade. Applied to the SIDES only (never the roof — a BoxGeometry maps the same
// texture to all six faces, which is why the first pass looked like windows on the rooftops).
function windowTexture(rows) {
  const cell = 8, cols = 4, W = cols * cell, H = Math.max(2, rows) * cell;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d");
  g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
  for (let y = 0; y < Math.max(2, rows); y++) {
    for (let x = 0; x < cols; x++) {
      if (Math.random() < 0.24) continue;                    // a dark window — nobody home
      g.fillStyle = `rgba(255,255,255,${(0.5 + Math.random() * 0.5).toFixed(2)})`;
      g.fillRect(x * cell + 2, y * cell + 2, cell - 4, cell - 4);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// The archetypes. Each returns stacked boxes {w,d,h,y} in local space, plus whether it gets a
// spire. Silhouette is the point: a townhouse should never be mistaken for a skyscraper.
function archetype(h, r, landmark) {
  const P = [];
  if (landmark) {                                   // Empire-State-ish: broad base, tiered setbacks, spire
    const base = h * 0.52, mid = h * 0.26, top = h * 0.16;
    P.push({ w: 1.00, d: 1.00, h: base, y: base / 2 });
    P.push({ w: 0.74, d: 0.74, h: mid, y: base + mid / 2 });
    P.push({ w: 0.48, d: 0.48, h: top, y: base + mid + top / 2 });
    return { parts: P, spire: h * 0.16, crownW: 0.48 };
  }
  if (h >= 9) {                                     // skyscraper: shaft + setback crown
    const base = h * 0.72, top = h * 0.28;
    P.push({ w: 0.92, d: 0.92, h: base, y: base / 2 });
    P.push({ w: 0.62, d: 0.62, h: top, y: base + top / 2 });
    return { parts: P, spire: r > 0.5 ? h * 0.12 : 0, crownW: 0.62 };
  }
  if (h >= 4) {                                     // tower: single slim setback
    const base = h * 0.85, cap = h * 0.15;
    P.push({ w: 0.86, d: 0.86, h: base, y: base / 2 });
    P.push({ w: 0.66, d: 0.66, h: cap, y: base + cap / 2 });
    return { parts: P, spire: 0, crownW: 0.66 };
  }
  if (h >= 1.8) {                                   // condo block: squat, full-width parapet
    P.push({ w: 0.94, d: 0.94, h: h * 0.92, y: h * 0.46 });
    P.push({ w: 0.99, d: 0.99, h: h * 0.08, y: h * 0.96 });
    return { parts: P, spire: 0, crownW: 0.99 };
  }
  // townhouse / brownstone: wide, low, with a cornice
  P.push({ w: 1.02, d: 0.86, h: h * 0.88, y: h * 0.44 });
  P.push({ w: 1.08, d: 0.92, h: h * 0.12, y: h * 0.94 });
  return { parts: P, spire: 0, crownW: 1.08 };
}

export default function Skyline3D({
  towers, isMobile, onSelect, cardHtml, crownLabel = "👑 biggest", accent = "rgba(45,212,191,0.4)",
  bodyFrom = 0x334063, bodyTo = 0x8fa6d8,   // body colour ramp across holding age (new → old)
  layout = "city",                          // "city" = laid out on Manhattan · "grid" = the raw skyline
  focus = null,                             // an address to fly the camera to
  intro = true,                             // play the arrival fly-through on mount
  onIntroDone,
  messages = null,                          // { address: { text, ts } } — signs hung over buildings
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

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1b2740);
    scene.fog = new THREE.Fog(0x1b2740, city ? LEN * 1.1 : 40, city ? LEN * 3.2 : 190);
    const cam = new THREE.PerspectiveCamera(46, W / VH, 0.1, 3000);
    const span = city ? LEN * 0.5 : Math.sqrt(T.length) * 2.0;
    if (city) cam.position.set(LEN * 0.34, LEN * 0.66, LEN * 0.50); else cam.position.set(span * 0.95, 20, span * 1.28);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(W, VH);
    el.appendChild(renderer.domElement);

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

    scene.add(new THREE.AmbientLight(0xffffff, 0.95));
    const d1 = new THREE.DirectionalLight(0xfff2df, 1.15); d1.position.set(30, 60, 20); scene.add(d1);
    const d2 = new THREE.DirectionalLight(0x9dc4ff, 0.6); d2.position.set(-25, 25, -15); scene.add(d2);

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
          new THREE.MeshLambertMaterial({ color: colour, side: THREE.DoubleSide }));
        m.rotation.x = Math.PI / 2; m.position.y = y; scene.add(m); groundBits.push(m);
      };

      const water = new THREE.Mesh(new THREE.PlaneGeometry(LEN * 3.0, LEN * 3.0),
        new THREE.MeshLambertMaterial({ color: 0x2a6a92 }));
      water.rotation.x = -Math.PI / 2; water.position.y = -0.3; scene.add(water); groundBits.push(water);

      for (const b of BACKDROP) flat(b.rings, 0x46527a, -0.08);   // Brooklyn / Queens / Bronx / Jersey
      for (const i of ISLETS) flat(i.rings, 0x4d5a85, -0.04);     // Roosevelt Island
      flat([ISLAND_RING], 0x59668f, 0);                            // Manhattan
      flat(PARK_RINGS, 0x2f7a45, 0.06);                            // Central Park

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
        new THREE.MeshLambertMaterial({ color: 0x0a0e1a }));
      ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; scene.add(ground); groundBits.push(ground);

      const padGeo = new THREE.BoxGeometry(BW * PLOT + 0.5, 0.12, BD * PLOT + 0.5);
      const padMat = new THREE.MeshLambertMaterial({ color: 0x161c2c });
      pads = new THREE.InstancedMesh(padGeo, padMat, grid.blocks.length);
      const mtx = new THREE.Matrix4();
      grid.blocks.forEach((b, i) => { mtx.makeTranslation(b.x * grid.blockW, 0.04, b.z * grid.blockD); pads.setMatrixAt(i, mtx); });
      pads.instanceMatrix.needsUpdate = true; scene.add(pads);
      groundBits.push({ dispose: () => { padGeo.dispose(); padMat.dispose(); } });
    }

    // shared geometry + per-height-bin window textures + one shared roof material
    const box = new THREE.BoxGeometry(1, 1, 1);
    const spireGeo = new THREE.CylinderGeometry(0.035, 0.075, 1, 6);
    const haloGeo = new THREE.CircleGeometry(1.05, 20);
    const BINS = 6, texes = Array.from({ length: BINS }, (_, i) => windowTexture(2 + i * 3));
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x2b3350 });
    const disposables = [box, spireGeo, haloGeo, roofMat, ...texes];  // ground/pads are disposed via groundBits

    const hitMeshes = [], ownMats = [], homes = new Map();
    // Materials are SHARED across buildings, binned by (age, flow) — a unique material per
    // building meant thousands of state changes per frame and the city crawled. Hover no longer
    // recolours a material (that would light every building in the bin); it moves an outline box.
    const matBin = new Map();
    const AGE_BINS = 8, FLOW_BINS = 7;
    const materialFor = (ageT, f) => {
      const ai = Math.min(AGE_BINS - 1, Math.floor((ageT ?? 0.5) * AGE_BINS));
      const fi = Math.max(0, Math.min(FLOW_BINS - 1, Math.round((Math.max(-1, Math.min(1, f)) + 1) / 2 * (FLOW_BINS - 1))));
      const key = ai * FLOW_BINS + fi;
      let m = matBin.get(key);
      if (!m) {
        const aT = (ai + 0.5) / AGE_BINS, fT = (fi / (FLOW_BINS - 1)) * 2 - 1;
        const mag = Math.min(1, Math.abs(fT) * 1.6);
        const flowCol = fT > 0.05 ? GREEN : fT < -0.05 ? RED : null;
        const age = mix(new THREE.Color(bodyFrom), new THREE.Color(bodyTo), aT);
        const body = flowCol ? mix(age, flowCol, 0.22 + 0.40 * mag) : age;
        const glow = flowCol ? mix(WARM, flowCol, Math.min(1, 0.35 + mag)) : WARM;
        m = { side: null, body, glow, intensity: 0.5 + (flowCol ? 0.8 * mag : 0), flowCol };
        matBin.set(key, m);
      }
      return m;
    };
    T.forEach((t, i) => {
      const h = Math.max(0.6, Math.sqrt(Math.max(0, t.score) / maxScore) * HMAX);
      const p = pts[i], r = hash01(t.a || String(i));
      const f = (t.flow || 0) / maxFlow;                     // -1..1
      const mag = Math.min(1, Math.abs(f) * 3.0);            // how loudly to shout the flow
      const flowCol = f > 0.02 ? GREEN : f < -0.02 ? RED : null;

      // Facade tints toward the flow colour, so the WHOLE building reads green/red — not just
      // its windows. Neutral wallets keep the age ramp. Material comes from the shared bin.
      const bin = materialFor(t.ageT ?? 0.5, f);
      const ti = Math.min(BINS - 1, Math.floor((h / 21) * BINS));
      if (!bin.side) bin.side = [];
      let sideMat = bin.side[ti];
      if (!sideMat) {
        // bin.body already carries the AGE ramp for this bin — warm for fresh wallets, cyan for
        // long-held. Using a fixed midpoint here is what flattened every building to one colour.
        sideMat = new THREE.MeshLambertMaterial({
          color: bin.body, emissive: bin.glow, emissiveMap: texes[ti], emissiveIntensity: bin.intensity,
        });
        bin.side[ti] = sideMat; ownMats.push(sideMat);
      }
      const faces = [sideMat, sideMat, roofMat, roofMat, sideMat, sideMat];
      const emissiveIntensity = bin.intensity;

      const { parts, spire, crownW } = archetype(h, r, i < 3);
      const group = [];
      for (const q of parts) {
        const m = new THREE.Mesh(box, faces);
        m.scale.set(q.w, q.h, q.d); m.position.set(p.x, q.y, p.z);
        m.userData = { t, mat: sideMat, base: emissiveIntensity };
        scene.add(m); hitMeshes.push(m); group.push(m);
      }
      if (spire > 0) {
        const sMat = new THREE.MeshBasicMaterial({ color: flowCol ? bin.glow : 0xdbeafe });
        const s = new THREE.Mesh(spireGeo, sMat);
        s.scale.set(1, spire, 1); s.position.set(p.x, h + spire / 2, p.z);
        scene.add(s); ownMats.push(sMat);
      }
      // street-level halo — the flow signal spilling onto the pavement, visible from above
      if (flowCol && mag > 0.12) {
        const hMat = new THREE.MeshBasicMaterial({ color: flowCol, transparent: true, opacity: 0.10 + 0.30 * mag, blending: THREE.AdditiveBlending, depthWrite: false });
        const halo = new THREE.Mesh(haloGeo, hMat);
        halo.rotation.x = -Math.PI / 2; halo.position.set(p.x, 0.12, p.z);
        halo.scale.setScalar(0.6 + 0.5 * mag);
        scene.add(halo); ownMats.push(hMat);
      }
      if (city) { t.hood = placed[i].hood; homes.set((t.a || "").toLowerCase(), { x: p.x, z: p.z, h: h + spire, mat: sideMat, base: emissiveIntensity }); }
      if (i === 0) group[0].userData.isChamp = { x: p.x, z: p.z, h: h + spire };
    });

    // crown the #1
    const champInfo = hitMeshes.find(m => m.userData.isChamp)?.userData.isChamp;
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
        { p: [LEN * 0.16, LEN * 0.055, -half - LEN * 0.30], t: [0, LEN * 0.02, -half + LEN * 0.05] }, // over the harbour
        { p: [LEN * 0.10, LEN * 0.035, -half + LEN * 0.06], t: [0, LEN * 0.03, -half + LEN * 0.22] }, // into downtown
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
    const setHover = m => {
      if (hovered === m) return;
      hovered = m;
      if (m) {
        cage.visible = true;
        cage.scale.copy(m.scale).multiplyScalar(1.06);
        cage.position.copy(m.position);
        renderer.domElement.style.cursor = "pointer";
      } else { cage.visible = false; renderer.domElement.style.cursor = "grab"; }
    };
    const pick = e => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1; ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      ray.setFromCamera(ndc, cam);
      return ray.intersectObjects(hitMeshes, false)[0];
    };
    const onMove = e => {
      const r = renderer.domElement.getBoundingClientRect();
      px = e.clientX - r.left; py = e.clientY - r.top; moved = true;
      const hit = pick(e);
      if (hit) {
        setHover(hit.object);
        controls.autoRotate = false;
        tip.style.display = "block"; tip.style.left = px + "px"; tip.style.top = py + "px";
        tip.innerHTML = cardRef.current?.(hit.object.userData.t) ?? "";
      } else { setHover(null); tip.style.display = "none"; }
    };
    const onDown = () => { moved = false; };
    const onUp = e => {
      if (moved) return;                                  // was a drag, not a click
      const hit = pick(e);
      if (hit) selectRef.current?.(hit.object.userData.t);
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
      controls.update(); renderer.render(scene, cam); labelR.render(scene, cam);
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
      disposables.forEach(d => d.dispose());
      ownMats.forEach(m => m.dispose());
      groundBits.forEach(g => { if (g.dispose) g.dispose(); else { g.geometry?.dispose(); g.material?.dispose(); } });
      pads?.dispose();
      delete window.__citySeek; delete window.__cityReady;
      renderer.dispose(); el.removeChild(renderer.domElement); el.removeChild(labelR.domElement); el.removeChild(tip);
    };
  }, [towers, isMobile, crownLabel, accent, bodyFrom, bodyTo, layout, intro]);

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
      Object.assign(d.style, {
        position: "absolute", left: "50%", bottom: "22px", transform: "translateX(-50%)",
        width: "180px", padding: "5px 9px", borderRadius: "9px", textAlign: "center",
        background: "rgba(10,14,26,0.92)", border: "1px solid rgba(255,255,255,0.22)",
        color: "#e2e8f0", font: "600 11.5px 'Space Grotesk', system-ui, sans-serif",
        lineHeight: "1.45", whiteSpace: "pre-wrap", wordBreak: "break-word",
        boxShadow: "0 6px 20px rgba(0,0,0,0.55)", pointerEvents: "none",
      });
      d.textContent = m.text;
      wrap.appendChild(d);
      const o = new CSS2DObject(wrap);
      o.position.set(home.x, home.h + 3, home.z);   // same anchor as the crown; the 22px lifts it clear
      g.add(o);
    }
    return () => {
      // CSS2DRenderer only detaches elements it still knows about, so pull the DOM node too.
      for (const o of [...g.children]) { o.element?.remove(); g.remove(o); }
    };
  }, [messages, towers, layout]);

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
