import { useRef, useEffect } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { placeCity, cityScale, CITY_LENGTH, ISLAND_RING, PARK_RINGS, BACKDROP, ISLETS, WATER,
         streetGrid, hoodGrid, NEIGHBOURHOODS, AXIS_ANGLE } from "./city-map.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { chainOf } from "./city-messages.js";
import { makeDrs } from "./city-drs.js";
import { TIMES, FAMILIES, skyEnv, facadeTexture, wallGeometry, roofGeometry, archetype, heightOf, waterMaterials,
         berthGeometry, bridgeGeometry, monumentGeometry } from "./city-render.js";
import { infraFrom, portBerths, siteAt, bridgeSpan, SITES, fmtTokens } from "./city-infra.js";

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
  focus = null,                             // an address to move the camera to
  focusNonce = 0,                           // bump to re-trigger a move to the SAME address
  pinned = null,                            // the selected tower — its card hangs over its roof
  pinnedHtml = null,                        // (tower) => HTML for that card
  intro = true,                             // play the arrival fly-through on mount
  onIntroDone,
  messages = null,                          // { address: { text, ts } } — signs hung over buildings
  time = "dusk",                            // "day" | "dusk" | "night"
  infra = null,                             // latest on-chain row → the harbour: docks, bridge, monument
  arcs = null,                              // [{ f, to, eth, usd, token, d }] — trades, drawn wallet to wallet
  viewH = 0,                                // viewport height in px; 0 = the built-in default
}) {
  const mount = useRef(null);
  const api = useRef(null);                 // { cam, controls, homes } for the focus effect
  // Height can change WITHOUT rebuilding the scene (going fullscreen, or the window resizing while
  // fullscreen). The renderer reads it through a ref at resize time, so a 5,000-building city is
  // never torn down and re-merged just because the frame got bigger.
  const viewHRef = useRef(viewH); viewHRef.current = viewH;
  const selectRef = useRef(onSelect); selectRef.current = onSelect;
  const cardRef = useRef(cardHtml); cardRef.current = cardHtml;
  const pinRef = useRef(pinnedHtml); pinRef.current = pinnedHtml;

  useEffect(() => {
    const el = mount.current; if (!el || !towers?.length) return;
    const t0 = performance.now();
    const T = towers.slice().sort((a, b) => b.score - a.score);
    const maxScore = Math.max(...T.map(t => t.score), 1e-9);
    // heightOf is log-based, so it needs the bottom of the range as well as the top. Zero and
    // negative scores can't sit on a log axis; they fall back to the smallest positive one.
    const minScore = Math.max(1e-12, Math.min(...T.map(t => t.score).filter(s => s > 0)));
    const maxFlow = Math.max(...T.map(t => Math.abs(t.flow || 0)), 1e-9);

    // CINEMA MODE (?cinema=1) — the canvas takes the whole window, page chrome and all. It exists
    // for tools/render-city-video.mjs: the first cut of that tool forced the canvas full-bleed with
    // injected CSS instead, which took it out of flow, left `el.clientWidth` at 0, and rendered
    // every frame into a zero-width buffer. The video came out as 28 seconds of flat background.
    // Sizing from the window here means the renderer and the layout agree by construction.
    const cine = typeof location !== "undefined" && new URLSearchParams(location.search).get("cinema") === "1";
    const W = cine ? window.innerWidth : el.clientWidth;
    const VH = cine ? window.innerHeight : (viewHRef.current || (isMobile ? 440 : 580));
    if (cine) Object.assign(el.style, { position: "fixed", inset: "0", width: "100vw", height: "100vh", zIndex: "9999", borderRadius: "0" });
    // Height range. The CURVE between them lives in heightOf (city-render.js) — see the note there
    // for why it is mostly logarithmic. HMIN is the floor: the smallest resident cleared the
    // residency bar, so nothing in this city is a one-storey shed.
    const HMIN = 1.0, HMAX = 21;
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
    // ⚠ NEAR PLANE 0.5, NOT 0.1. Depth precision is governed by the far:near RATIO, and 3000:0.1 is
    // 30,000:1 — so little precision is left at distance that near-coplanar ground sheets round to
    // the same depth and flicker. 0.5 buys ~5× precision across the whole scene and cannot clip
    // anything: OrbitControls holds the camera at least 8 units from its target.
    const cam = new THREE.PerspectiveCamera(46, W / VH, 0.5, 3000);
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

    // ── bloom (dusk + night only) ────────────────────────────────────────────────────────────
    // The "stone and light" rule finally glows: the composer renders into a half-float target so
    // the emissive windows and the torch flame (the only things over the threshold) bleed light,
    // while facades and sky stay untouched. Day skips the composer entirely — sunlight washes
    // emissive light out, so bloom would only cost frames and blur. OutputPass applies the same
    // ACES tone mapping the plain path uses, so toggling time-of-day can't shift the grade.
    let composer = null;
    if (time !== "day") {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, cam));
      composer.addPass(new UnrealBloomPass(new THREE.Vector2(W, VH), time === "night" ? 0.55 : 0.3, 0.5, 0.92));
      composer.addPass(new OutputPass());
    }
    const draw = () => { if (composer) composer.render(); else renderer.render(scene, cam); labelR.render(scene, cam); };

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
    let waterTick = null;                    // set by the city's water block, ticked in the render loop
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
      // ── animated water ──────────────────────────────────────────────────────────────────────
      // One material pair for EVERY wet surface — the sea plane, its chop overlay, and the river
      // patches — so the whole harbour moves together and can never disagree with itself. The tick
      // scrolls the two normal fields against each other each frame (see city-render.js).
      // DoubleSide because the river patches are rotated face-DOWN (see flat()); bookkeeping rides
      // groundBits + waterTick since ownMats/frameCbs are declared further down this effect.
      const wm = waterMaterials(TOD);
      wm.base.side = THREE.DoubleSide;
      waterTick = wm.tick;
      groundBits.push({ dispose: () => { wm.textures.forEach(t => t.dispose()); wm.base.dispose(); wm.over.dispose(); } });

      // `wet` matters: the harbour patches are WATER and have to match the sea plane's material,
      // not the matte one the land polygons use. Painted with the land material they came out as
      // flat pale shapes that took no sun at all, so the bay looked like concrete beside a river
      // that sparkled.
      const flat = (rings, colour, y, wet = false) => {
        if (!rings?.length) return;
        const m = new THREE.Mesh(new THREE.ShapeGeometry(ringShape(rings)),
          wet ? wm.base
              : new THREE.MeshStandardMaterial({ color: colour, roughness: 0.95, side: THREE.DoubleSide }));
        m.rotation.x = Math.PI / 2; m.position.y = y; scene.add(m); groundBits.push(m);
      };

      // Water is the one genuinely reflective surface in frame, so it gets a low roughness and
      // picks up the sky — which is most of why the island now reads as sitting IN something.
      const water = new THREE.Mesh(new THREE.PlaneGeometry(LEN * 8.0, LEN * 8.0), wm.base);
      water.rotation.x = -Math.PI / 2; water.position.y = -0.42; scene.add(water); groundBits.push(water);
      const chop = new THREE.Mesh(new THREE.PlaneGeometry(LEN * 8.0, LEN * 8.0), wm.over);
      // 0.06 above the base rather than 0.02 — margin on top of the polygon offset, still far too
      // small to read as two separate sheets.
      chop.rotation.x = -Math.PI / 2; chop.position.y = -0.36; scene.add(chop); groundBits.push(chop);

      for (const b of BACKDROP) flat(b.rings, TOD.back, -0.30);   // Brooklyn / Queens / Bronx / Jersey
      // The harbour, painted back OVER the boroughs — their outlines are administrative boundaries
      // that legally cross open water, so without this Brooklyn paves the Upper Bay and Manhattan
      // sits in a puddle. See the WATER note in city-map.js.
      for (const w of WATER) flat([w.ring], TOD.water, -0.16, true);
      for (const i of ISLETS) flat(i.rings, TOD.back, -0.06);     // Roosevelt Island
      flat([ISLAND_RING], TOD.road, 0);   // the island reads as the road surface; blocks sit above it                            // Manhattan
      flat(PARK_RINGS, TOD.park, 0.06);                            // Central Park

      // Raised pavement, one slab per block. This is what makes the gaps read as ROADS rather than
      // as blank ground with lines painted on it — a kerb you can see is worth more than a brighter
      // line. Per-block, never per-building: see hoodGrid.
      // Only pave a block something actually stands on. A slab with nothing on it reads as a
      // missing building rather than as undeveloped land, which is what sent us looking for a
      // bug the last two times. Density is even now, so this catches one block at the northern
      // tip — but it makes the failure impossible rather than unlikely.
      const cosB = Math.cos(-AXIS_ANGLE), sinB = Math.sin(-AXIS_ANGLE);
      const built = b => placed.some(q => {
        const dx = q.x - b.x, dz = q.z - b.z;
        return Math.abs(dx * cosB + dz * sinB) <= b.d / 2 + 0.05 &&
               Math.abs(-dx * sinB + dz * cosB) <= b.w / 2 + 0.05;
      });
      const slabs = [];
      for (const h of NEIGHBOURHOODS) {
        for (const b of hoodGrid(h, K).blocks) {
          if (!built(b)) continue;
          // NOT scaled by K: lot pitch is already in final world units (hoodLots divides u by k
          // before projecting, then multiplies back), so scaling here shrinks every slab under its
          // own buildings and the pavement vanishes.
          const g = new THREE.BoxGeometry(b.d, 0.17, b.w);   // already sized to its lots + kerb
          g.rotateY(-AXIS_ANGLE); g.translate(b.x, 0.085, b.z);
          slabs.push(g);
        }
      }
      if (slabs.length) {
        const merged = mergeGeometries(slabs, false);
        slabs.forEach(g => g.dispose());
        if (merged) {
          const pmat = new THREE.MeshStandardMaterial({ color: TOD.pave, roughness: 0.92 });
          const m = new THREE.Mesh(merged, pmat);
          m.receiveShadow = true; m.castShadow = true;
          scene.add(m); groundBits.push(m);
        }
      }

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
      // ⚠ FLOW MUST WIN OUTRIGHT, NOT BLEND. The age ramp's fresh end is amber and the selling
      // colour is rose — mixing them half and half made "new holder" and "sold" land on the same
      // orange, which is the one confusion this page cannot afford: one is neutral, the other is
      // the actual signal. Any wallet with real flow now shows essentially pure green or red, and
      // age is read from the wallets that AREN'T moving.
      const winCol = flowCol ? mix(ageHue, flowCol, Math.min(1, 0.82 + 0.18 * mag)) : ageHue;
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

    const addMerged = (geos, mat, shadow = true) => {
      if (!geos.length) return;
      const merged = mergeGeometries(geos, false);
      geos.forEach(g => g.dispose());
      if (!merged) return;
      const m = new THREE.Mesh(merged, mat);
      m.castShadow = shadow; m.receiveShadow = shadow;
      scene.add(m); disposables.push(merged);
    };

    const labelBits = [];          // { obj, prio } — prio decides who survives a collision
    const haloUp = [], haloDown = [], beamUp = [], beamDown = [];
    // ⚠ BUILDINGS MUST WEAR THE GRID'S ROTATION. They were axis-aligned boxes dropped onto blocks
    // that are rotated to the street bearing, so every building sat askew on its own plot. With a
    // near-square footprint the error reads as "a few degrees" rather than the full 60.9°, because
    // a square looks the same every quarter turn — which is exactly why it survived this long.
    const A = AXIS_ANGLE, cosA = Math.cos(A), sinA = Math.sin(A);
    // rotate a roof-local offset into world space, so rooftop clutter lands ON the roof
    const off = (dx, dz) => [dx * cosA - dz * sinA, dx * sinA + dz * cosA];
    const M = new THREE.Matrix4();
    T.forEach((t, i) => {
      const h = heightOf(t.score, minScore, maxScore, HMIN, HMAX);
      const p = pts[i], r = hash01(t.a || String(i));
      const f = (t.flow || 0) / maxFlow;                     // -1..1
      const mag = Math.min(1, Math.abs(f) * 3.0);
      const flowCol = f > 0.02 ? GREEN : f < -0.02 ? RED : null;
      const ai = Math.min(AGE_BINS - 1, Math.floor((t.ageT ?? 0.5) * AGE_BINS));
      const fi = Math.max(0, Math.min(FLOW_BINS - 1, Math.round((Math.max(-1, Math.min(1, f)) + 1) / 2 * (FLOW_BINS - 1))));

      const { parts, spire, family } = archetype(h, r, i < 3 ? i : -1);
      // Anchor to where the building ACTUALLY ends. Only the landmark archetype's stack falls short
      // of h (0.52 + 0.26 + 0.16), which is why just the tallest few had floating antennas.
      const roofTop = Math.max(...parts.map(q => q.y + q.h / 2));
      const bucket = matFor(family, ai, fi);
      let widest = 0;
      for (const q of parts) {
        M.makeTranslation(p.x, q.y, p.z);
        const wall = wallGeometry(q.w, q.d, q.h); wall.rotateY(-A); wall.applyMatrix4(M); bucket.geos.push(wall);
        const roof = roofGeometry(q.w, q.d); roof.rotateY(-A);
        roof.translate(p.x, q.y + q.h / 2, p.z); roofGeos.push(roof);
        widest = Math.max(widest, q.w, q.d);
      }
      if (spire > 0) {
        const g = spireGeo.clone(); g.scale(1, spire, 1); g.translate(p.x, roofTop + spire / 2, p.z);
        spireGeos.push(g);
      }

      // Roof life. A water tower is the most New York thing available for four triangles, and the
      // HVAC boxes stop every rooftop reading as a flat lid from above — which is the angle this
      // city is mostly viewed from.
      const top = parts[parts.length - 1], roofY = top.y + top.h / 2, rw = top.w;
      if (family === "masonry" && r > 0.25) {
        const [tox, toz] = off(rw * 0.2, -rw * 0.15);
        const tx = p.x + tox, tz = p.z + toz;
        const tank = new THREE.CylinderGeometry(0.17, 0.17, 0.42, 8); tank.translate(tx, roofY + 0.36, tz);
        const cap = new THREE.ConeGeometry(0.2, 0.18, 8); cap.translate(tx, roofY + 0.66, tz);
        woodGeos.push(tank, cap);
        for (const [dx, dz] of [[-0.1, -0.1], [0.1, -0.1], [-0.1, 0.1], [0.1, 0.1]]) {
          const [lx, lz] = off(dx, dz);
          const leg = new THREE.BoxGeometry(0.03, 0.16, 0.03); leg.rotateY(-A);
          leg.translate(tx + lx, roofY + 0.08, tz + lz);
          woodGeos.push(leg);
        }
      } else if (h > 1.2) {
        const n = 1 + Math.floor(r * 2);
        for (let k = 0; k < n; k++) {
          const s2 = 0.14 + hash01((t.a || i) + "s" + k) * 0.18;
          const hv = new THREE.BoxGeometry(s2 * rw, 0.12 + hash01((t.a || i) + "h" + k) * 0.18, s2 * rw);
          hv.rotateY(-A);
          const [hx, hz] = off((hash01((t.a || i) + "x" + k) - 0.5) * rw * 0.6,
                               (hash01((t.a || i) + "z" + k) - 0.5) * rw * 0.6);
          hv.translate(p.x + hx, roofY + 0.09, p.z + hz);
          metalGeos.push(hv);
        }
      }

      // The flow signal spilling onto the pavement — kept as its own mesh because additive
      // blending has to draw after everything else.
      if (flowCol && mag > 0.12) {
        const g = haloGeo.clone();
        const r2 = 0.6 + 0.5 * mag;
        g.scale(r2, r2, 1); g.rotateX(-Math.PI / 2); g.translate(p.x, 0.14, p.z);
        (f > 0 ? haloUp : haloDown).push(g);
        // ⭐ A SHAFT OF LIGHT, not a ring on the pavement. The ground halo only reads from above,
        // and the city is mostly looked at from street level where the pavement is hidden behind
        // the buildings in front of it. A beam clears the roofline, so who is buying and who is
        // selling is legible from any angle and at any zoom — which is the whole signal here.
        const beamH = roofTop * 0.35 + 3.5 + 9 * mag;
        const bg = new THREE.CylinderGeometry(0.10 + 0.06 * mag, 0.16 + 0.10 * mag, beamH, 6, 1, true);
        bg.translate(p.x, roofTop + spire + beamH / 2 + 0.6, p.z);
        (f > 0 ? beamUp : beamDown).push(bg);
      }

      // Merged geometry has no per-building mesh to hover, so picking rides an invisible instanced
      // box per building — one draw call for the whole city, and it gives back an instanceId.
      picks.push({ t, x: p.x, z: p.z, w: widest * 1.02, h: h + spire });
      if (city) { t.hood = placed[i].hood; homes.set((t.a || "").toLowerCase(), { x: p.x, z: p.z, h: h + spire }); }
      if (i === 0) champInfo = { x: p.x, z: p.z, h: h + spire };
    });

    for (const b of wallBuckets.values()) addMerged(b.geos, b.mat);
    addMerged(roofGeos, roofMat);
    addMerged(woodGeos, woodMat);
    addMerged(metalGeos, metalMat);
    addMerged(spireGeos, metalMat);
    // Additive glow, so it must draw after everything and never write depth.
    for (const [geos, col, op] of [[haloUp, GREEN, 0.34], [haloDown, RED, 0.34],
                                   [beamUp, GREEN, 0.5], [beamDown, RED, 0.5]]) {
      const hm = new THREE.MeshBasicMaterial({
        color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide,
      });
      ownMats.push(hm); addMerged(geos, hm, false);
    }

    // ── the harbour: everything that isn't a holder ──────────────────────────────────────────
    // Exchanges, the bridge that backs Base and Solana, the Uniswap pool and the burn. Together
    // these are ~264M of the 931M supply — a quarter of the token that the holder map alone can
    // never show. Merged into their own buckets, so the whole port is a few draw calls.
    if (city && infra) {
      const I = infraFrom(infra);
      const infraMats = {
        pier:   new THREE.MeshStandardMaterial({ color: 0x6b6f78, roughness: 0.95 }),
        shed:   new THREE.MeshStandardMaterial({ color: 0xb1b6c0, roughness: 0.7, metalness: 0.15 }),
        steel:  new THREE.MeshStandardMaterial({ color: 0xd08a3a, roughness: 0.5, metalness: 0.6 }),
        stone:  new THREE.MeshStandardMaterial({ color: 0x9aa1ac, roughness: 0.9 }),
        // Weathered copper, because that is what the real one is and it reads instantly.
        copper: new THREE.MeshStandardMaterial({ color: 0x5fbfa6, roughness: 0.55, metalness: 0.35 }),
        gold:   new THREE.MeshStandardMaterial({ color: 0xf0c46a, roughness: 0.25, metalness: 0.9 }),
        flame:  new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xff8a1f, emissiveIntensity: 2.4, roughness: 0.4 }),
      };
      Object.values(infraMats).forEach(m => ownMats.push(m));
      const buckets = Object.fromEntries(Object.keys(infraMats).map(k2 => [k2, []]));

      for (const b of portBerths(I.venues, K)) for (const part of berthGeometry(b)) buckets[part.mat].push(part.g);

      // Deck width carries the bridged supply — the 111.5M that actually backs Base and Solana.
      const span = bridgeSpan(K);
      const thick = Math.max(0.6, Math.min(2.2, I.bridge / 60e6));
      for (const part of bridgeGeometry(span, thick * K)) buckets[part.mat].push(part.g);

      const mon = siteAt(SITES.monument, K);
      for (const part of monumentGeometry(mon.x, mon.z, K * 1.25)) buckets[part.mat].push(part.g);

      // The Uniswap pool on its own island — the oldest coins here, since SPX launched on a DEX.
      const lp = siteAt(SITES.lp, K);
      const lpN = Math.max(3, Math.round(I.lp / 2.2e6));
      for (let i = 0; i < lpN; i++) {
        const a = (i / lpN) * Math.PI * 2, r = 1.5 * K;
        const g = new THREE.BoxGeometry(0.75 * K, (0.9 + (i % 3) * 0.5) * K, 0.75 * K);
        g.translate(lp.x + Math.cos(a) * r, (0.45 + (i % 3) * 0.25) * K, lp.z + Math.sin(a) * r);
        buckets.shed.push(g);
      }

      // ── tags ────────────────────────────────────────────────────────────────────────────────
      // The harbour is the only part of the city that ISN'T a person, and without saying so it
      // reads as decoration. Each piece gets its name and its number, so the quarter of the supply
      // that no holder owns is legible rather than merely present.
      const tag = (x, y, z, title, value, sub, colour) => {
        const d = document.createElement("div");
        Object.assign(d.style, { textAlign: "center", pointerEvents: "none", whiteSpace: "nowrap",
          textShadow: "0 2px 10px rgba(0,0,0,0.95), 0 0 3px rgba(0,0,0,0.9)" });
        d.innerHTML =
          `<div style="color:${colour};font:700 10.5px 'Space Grotesk',system-ui;letter-spacing:.2em">${title}</div>` +
          `<div style="color:#f1f5f9;font:700 13px 'Space Grotesk',system-ui">${value}</div>` +
          (sub ? `<div style="color:#94a3b8;font:500 10px 'Space Grotesk',system-ui">${sub}</div>` : "");
        const o = new CSS2DObject(d);
        o.position.set(x, y, z);
        // The harbour carries the numbers no holder owns, so it outranks a district name.
        scene.add(o); labelBits.push({ obj: o, prio: title ? 100 : 50 });
      };

      // clear of the torch, which tops out around 11 units at this scale
      tag(mon.x, 14.5 * K, mon.z, "THE BURN", fmtTokens(I.burn) + " SPX", "gone for good · 0x…dead", "#ffb347");
      const lpP = siteAt(SITES.lp, K);
      tag(lpP.x, 5 * K, lpP.z, "UNISWAP POOL", fmtTokens(I.lp) + " SPX", "where SPX started", "#ff77c8");
      const midX = (span.ax + span.bx) / 2, midZ = (span.az + span.bz) / 2;
      tag(midX, 11 * K, midZ, "WORMHOLE BRIDGE", fmtTokens(I.bridge) + " SPX", "backs Base &amp; Solana", "#3b82f6");
      // the port: a heading, plus the biggest venues named on their own sheds
      const berths = portBerths(I.venues, K);
      if (berths.length) {
        const cx = berths.reduce((a, b) => a + b.x, 0) / berths.length;
        const cz = berths.reduce((a, b) => a + b.z, 0) / berths.length;
        tag(cx, 9 * K, cz, "EXCHANGES", fmtTokens(I.cex) + " SPX",
          I.held ? Math.round(I.cex / (I.held + I.cex) * 100) + "% of tradable supply" : "", "#d08a3a");
        for (const b of berths.slice(0, 4)) {
          tag(b.x, b.tall + 1.6, b.z, "", b.name, fmtTokens(b.tokens) + " SPX", "#d08a3a");
        }
      }

      for (const [k2, geos] of Object.entries(buckets)) addMerged(geos, infraMats[k2], k2 !== "flame");
      // The flame is a light as well as a shape, so the monument reads at night from across the bay.
      const fire = new THREE.PointLight(0xff9a3c, 40 * K * K, 60 * K);
      fire.position.set(mon.x + 0.75 * K, 6.6 * K, mon.z);
      scene.add(fire);
    }

    // invisible pick volumes — one InstancedMesh, so hovering costs nothing to draw
    const pickGeo = new THREE.BoxGeometry(1, 1, 1);
    const pickMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    const pickMesh = new THREE.InstancedMesh(pickGeo, pickMat, picks.length);
    picks.forEach((q, i) => {
      M.compose(new THREE.Vector3(q.x, q.h / 2, q.z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -A),
        new THREE.Vector3(q.w, q.h, q.w));
      pickMesh.setMatrixAt(i, M);
    });
    pickMesh.instanceMatrix.needsUpdate = true;
    scene.add(pickMesh); disposables.push(pickGeo, pickMat);

    const buildMs = performance.now() - t0;

    // ── district names, laid on the city like a map ─────────────────────────────────────────
    // The neighbourhood is one of the nicest things the city knows and it was buried in the second
    // line of a card. Written across the districts it becomes the thing you read first — and it is
    // what makes the place navigable, because "Harlem" tells you where you are and a wallet address
    // never will. Positioned from the buildings actually placed there, so a label can never float
    // over water or over a district that came out empty.
    if (city) {
      const agg = new Map();
      T.forEach((t, i) => {
        const h = placed[i]?.hood; if (!h) return;
        const a = agg.get(h.id) || { name: h.name, x: 0, z: 0, n: 0, top: 0 };
        a.x += pts[i].x; a.z += pts[i].z; a.n++;
        a.top = Math.max(a.top, heightOf(t.score, minScore, maxScore, HMIN, HMAX));
        agg.set(h.id, a);
      });
      // Stagger the heights. Downtown's districts are small and perspective compresses the far end
      // of the island, so at a single height four labels pile onto the same twenty pixels.
      let li = 0;
      for (const a of agg.values()) {
        if (a.n < 3) continue;
        const lift = [0, 7, 14][li++ % 3];
        const d = document.createElement("div");
        d.textContent = a.name;
        Object.assign(d.style, {
          color: "rgba(226,232,240,0.72)", font: "600 12px 'Space Grotesk', system-ui, sans-serif",
          letterSpacing: "0.22em", textTransform: "uppercase", whiteSpace: "nowrap",
          textShadow: "0 2px 10px rgba(0,0,0,0.9), 0 0 3px rgba(0,0,0,0.8)", pointerEvents: "none",
        });
        const o = new CSS2DObject(d);
        o.position.set(a.x / a.n, Math.max(a.top * 1.15, 9) + lift, a.z / a.n);
        scene.add(o); labelBits.push({ obj: o, prio: 10 + a.n / 1000 });   // busier districts win
      }
    }

    // ── TRADE ARCS ────────────────────────────────────────────────────────────────────────────
    // A sale drawn as a curve from the seller's roof to the buyer's. This is the one thing the NFT
    // side can show that the coin side cannot: a token transfer usually ends at an exchange and the
    // counterparty is unknowable, while an NFT sale is one wallet to another with a price attached.
    //
    // VIOLET, deliberately. Age is amber→cyan and flow is green/red; a trade is a third kind of
    // fact and needs a channel of its own, or it reads as a strange building.
    //
    // ⚠ AN ARC WITH ONE END MISSING IS STILL A TRUE STATEMENT, so it is drawn rather than dropped.
    // A building only exists for a wallet that still holds, so a seller who sold out has no roof to
    // leave from. Those arcs run out past the coastline instead — which is what actually happened:
    // they sold and left. Silently keeping only the arcs that happened to fit would have hidden two
    // thirds of the trades and made the market look far quieter than it was.
    if (city && arcs?.length) {
      const joinGeos = [], leaveGeos = [];
      const priced = arcs.filter(a => a.eth > 0);
      const maxEth = Math.max(...priced.map(a => a.eth), 0.0001);
      // ⚠ A DEPARTED COUNTERPARTY GETS A SHORT STUB, NOT A CABLE TO THE HORIZON. The first version
      // put them on a ring around the whole map, so two thirds of the trades became full-length
      // arcs crossing the sky in every direction — the 38 real building-to-building trades, which
      // are the entire point, vanished under the noise. A departure only needs to read as "this
      // one left", so it leaves its own roof and stops just past the shoreline.
      const leaveDir = addr => {
        let h = 2166136261;
        for (let i = 0; i < addr.length; i++) { h ^= addr.charCodeAt(i); h = Math.imul(h, 16777619); }
        const ang = ((h >>> 0) % 3600) / 3600 * Math.PI * 2;
        return { dx: Math.cos(ang), dz: Math.sin(ang) };
      };
      const drawn = [];
      for (const a of priced) {
        const fh = homes.get(a.f), th = homes.get(a.to);
        if (!fh && !th) continue;                     // nothing left to anchor it to
        const anchor = fh || th;
        let s, e;
        if (fh && th) {
          s = new THREE.Vector3(fh.x, fh.h + 1.2, fh.z);
          e = new THREE.Vector3(th.x, th.h + 1.2, th.z);
        } else {
          const d = leaveDir(fh ? a.to : a.f);
          const reach = LEN * 0.07;
          s = new THREE.Vector3(anchor.x, anchor.h + 1.2, anchor.z);
          e = new THREE.Vector3(anchor.x + d.dx * reach, 0.4, anchor.z + d.dz * reach);
          if (!fh) { const t = s; s = e; e = t; }      // keep the direction seller → buyer
        }
        const span = s.distanceTo(e);
        if (span < 0.01) continue;
        // Apex rises with distance so a trade across the island clears the skyline, but capped —
        // uncapped, the longest arcs left the frame entirely.
        const mid = s.clone().add(e).multiplyScalar(0.5);
        mid.y = Math.max(s.y, e.y) + 2 + Math.min(span * 0.22, 7);
        const curve = new THREE.QuadraticBezierCurve3(s, mid, e);
        const t = Math.min(1, a.eth / maxEth);
        const rad = 0.05 + 0.14 * Math.sqrt(t);       // thickness carries the price
        const geo = new THREE.TubeGeometry(curve, 22, rad, 5, false);
        (fh && th ? joinGeos : leaveGeos).push(geo);
        if (fh && th) drawn.push({ ...a, mid });      // only label trades you can actually trace
      }
      // Two weights, because they are two different statements. A trade between two standing
      // buildings is the readable one and gets the brighter line; a departure is context.
      for (const [geos, op] of [[leaveGeos, 0.20], [joinGeos, 0.5]]) {
        if (!geos.length) continue;
        const am = new THREE.MeshBasicMaterial({
          color: 0xa78bfa, transparent: true, opacity: op,
          blending: THREE.AdditiveBlending, depthWrite: false,
        });
        ownMats.push(am); addMerged(geos, am, false);
      }
      // Label only the largest few. Every arc labelled is an unreadable mess, and the question a
      // viewer actually has — what was the big one — is answered by three.
      drawn.sort((x, y) => y.eth - x.eth);
      for (const a of drawn.slice(0, 3)) {
        const d = document.createElement("div");
        d.textContent = `${a.eth} ETH${a.token != null ? ` · #${a.token}` : ""}`;
        Object.assign(d.style, {
          color: "#c4b5fd", font: "700 11px 'Space Grotesk', system-ui, sans-serif",
          textShadow: "0 1px 4px #000", whiteSpace: "nowrap",
        });
        const o = new CSS2DObject(d); o.position.copy(a.mid);
        scene.add(o); labelBits.push({ obj: o, prio: 150 });
      }
    }

    // crown the #1
    if (champInfo) {
      const d = document.createElement("div");
      d.textContent = crownLabel;
      Object.assign(d.style, { color: "#fde68a", font: "700 12px 'Space Grotesk', system-ui, sans-serif", textShadow: "0 1px 4px #000", whiteSpace: "nowrap" });
      const o = new CSS2DObject(d); o.position.set(champInfo.x, champInfo.h + 3, champInfo.z);
      scene.add(o); labelBits.push({ obj: o, prio: 200 });   // the crown outranks everything
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
    // NAVIGATION.
    // ⚠ THE DESKTOP CHANGES MUST NOT TOUCH MOBILE. The trackpad ask (drag to pan, two-finger scroll
    // to orbit, pinch to zoom) is a MOUSE/WHEEL story. An earlier version also rewrote `touches` and
    // set enableZoom=false globally — which on a phone swapped one-finger-orbit for one-finger-pan
    // AND killed pinch-to-zoom (enableZoom gates the touch pinch too). The mobile defaults were fine;
    // only the pointer devices needed changing. So: mouse mapping always (it can't affect touch),
    // touch mapping stays the OrbitControls default, and the wheel takeover is desktop-only.
    const coarse = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
    // Mouse: left-drag PANS the map (it used to rotate around the invisible target — the "moves
    // around an unidentifiable point" feeling); orbiting moves to right-drag / two-finger scroll.
    controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    // Touch: the default that was fine — one finger orbits, two fingers pinch-zoom + pan.
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    controls.panSpeed = 0.9;
    if (!coarse) {
      controls.screenSpacePanning = false;   // desktop: pan across the ground plane — the "drag a map" feel
      controls.enableZoom = false;           // desktop: the wheel is split below (orbit vs zoom)
    }
    // ⭐ TWO-FINGER ORBIT AROUND THE PIVOT (owner ask 2026-07-31: "spinning around a position like a
    // building is missing"). On a trackpad both gestures arrive as wheel events, and they are
    // distinguishable: a PINCH comes through as ctrl+wheel, a real MOUSE wheel as line-mode deltas or
    // big discrete jumps — those ZOOM. A gentle two-finger SLIDE is a stream of small pixel deltas,
    // often with a horizontal component — that ORBITS.
    //
    // What makes it orbit around a BUILDING rather than an abstract centre: clicking a building
    // already flies the camera to it and sets controls.target to it, so the pivot is whatever you
    // last chose. Panning moves that pivot with the map, which is why lateral movement no longer
    // feels anchored — the earlier complaint was that orbit was the ONLY gesture, not that it existed.
    // Shift+scroll is an escape hatch for anyone who wants zoom on the wheel. Touch is untouched.
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
    const frameCbs = [];
    api.current = { cam, controls, homes, pulse, signs, scene, picks, frameCbs, el, size: () => [el.clientWidth || W, VH] };

    // ⭐ SCREEN-SPACE DECLUTTER, the way a real map does it. Fourteen districts plus the harbour
    // tags plus the crown all project into a small area at certain angles, and stacking them was
    // making the most valuable labels unreadable. Each frame: project every label, walk them in
    // priority order, and hide any whose box overlaps one already placed. Raising heights only ever
    // moved the pile around; this removes it at every zoom.
    if (labelBits.length) {
      const vv = new THREE.Vector3();
      const declutter = () => {
        const W2 = el.clientWidth || W, H2 = cine ? window.innerHeight : VH;
        const placedBoxes = [];
        const cand = labelBits.map(({ obj, prio }) => {
          vv.copy(obj.position).project(cam);
          const behind = vv.z > 1;
          return { obj, prio, behind, x: (vv.x * 0.5 + 0.5) * W2, y: (-vv.y * 0.5 + 0.5) * H2 };
        }).sort((a, b) => b.prio - a.prio);
        for (const c of cand) {
          const e = c.obj.element; if (!e) continue;
          if (c.behind || c.x < -80 || c.x > W2 + 80 || c.y < -40 || c.y > H2 + 40) { e.style.visibility = "hidden"; continue; }
          const w2 = (e.offsetWidth || 90) / 2 + 5, h2 = (e.offsetHeight || 14) / 2 + 4;
          const hit = placedBoxes.some(b => Math.abs(b.x - c.x) < b.w + w2 && Math.abs(b.y - c.y) < b.h + h2);
          e.style.visibility = hit ? "hidden" : "visible";
          if (!hit) placedBoxes.push({ x: c.x, y: c.y, w: w2, h: h2 });
        }
      };
      frameCbs.push(declutter);
    }

    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    let hovered = null, px = 0, py = 0, moved = false;
    // hover marker — a bright wireframe cage placed over the hovered building
    const cageMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.55 });
    const cage = new THREE.Mesh(box, cageMat); cage.visible = false; cage.rotation.y = -AXIS_ANGLE;
    scene.add(cage); ownMats.push(cageMat);
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
      // Clicking nothing clears the pin — otherwise the only way to dismiss a card is to pin a
      // different one, and there is no way back to just looking at the city.
      selectRef.current?.(hit ? picks[hit.instanceId].t : null);
    };
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("pointerleave", () => { setHover(null); tip.style.display = "none"; });

    let raf, flying = !!flight;
    const stopFlight = () => {
      if (!flying) return;
      // FREEZE IN PLACE — do not teleport to the overview. The flight loop already set cam.position and
      // controls.target to the current (interpolated) values, so handing control over from exactly here
      // is seamless. The old hard-snap to `overview` was the "closing the intro popup jerks the camera
      // to the north of the city" bug: any interaction (incl. dismissing the gate) cancels the flight,
      // and snapping to a fixed point read as a reset. Cancel = take the wheel from where you are.
      flying = false; controls.enabled = true; controls.autoRotate = false; controls.update();
      onIntroDone?.();
    };

    const _sph = new THREE.Spherical(), _off = new THREE.Vector3();
    const _ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), _hit = new THREE.Vector3();
    const onWheel = e => {
      if (flying || !controls.enabled) return;
      e.preventDefault();
      _off.copy(cam.position).sub(controls.target);
      // pinch, a real mouse wheel, or shift-held → zoom; a two-finger slide → orbit
      const zoom = e.ctrlKey || e.shiftKey || e.deltaMode !== 0 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 40);
      if (zoom) {
        // ⭐ ZOOM IS PROPORTIONAL, AND THE THREE INPUTS ARE ON DIFFERENT SCALES. A trackpad PINCH
        // arrives as a stream of tiny deltas (±1-10), a wheel in line mode as ±3, and a wheel in
        // pixel mode as ±100. The old single 0.95^(-dy*0.02) curve was tuned for the last of those,
        // so a pinch moved ~0.5% per event — crossing the 8→2,000 unit range took hundreds of
        // events, i.e. "several gestures to zoom into a building". Each input gets its own gain.
        const dy = e.deltaMode !== 0 ? e.deltaY * 16 : e.deltaY;      // line mode → ~pixels
        const gain = e.ctrlKey ? 0.018 : 0.0024;                      // pinch deltas are ~10× smaller
        const dist = _off.length();
        const d = THREE.MathUtils.clamp(dist * Math.exp(dy * gain), controls.minDistance, controls.maxDistance);
        _off.setLength(d);
        // Zooming IN pulls the pivot toward whatever is under the cursor — buildings first, the
        // ground plane otherwise — so you close in on the thing you are pointing at instead of
        // whatever the camera happened to be centred on. That is most of the "responsiveness".
        if (d < dist) {
          const r = renderer.domElement.getBoundingClientRect();
          ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
          ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
          ray.setFromCamera(ndc, cam);
          const b = ray.intersectObject(pickMesh, false)[0];
          const p = b ? b.point : (ray.ray.intersectPlane(_ground, _hit) ? _hit : null);
          if (p) controls.target.lerp(p, 0.15);
        }
      } else {
        // BOTH AXES INVERTED (owner, 2026-07-31). The gesture now reads as pushing the CITY around
        // under your fingers rather than swinging the camera against them — which is the same
        // convention as dragging to pan, so the two gestures agree instead of fighting each other.
        _sph.setFromVector3(_off);
        _sph.theta += e.deltaX * 0.005;
        _sph.phi = THREE.MathUtils.clamp(_sph.phi - e.deltaY * 0.005, 0.12, controls.maxPolarAngle);
        _off.setFromSpherical(_sph);
      }
      cam.position.copy(controls.target).add(_off);
      controls.update();
    };
    // Desktop only. On touch, OrbitControls keeps enableZoom (pinch) and owns the gesture; attaching
    // this too would double-handle any wheel a hybrid device emits.
    if (!coarse) renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

    // Frame-accurate seek for offline video capture (tools/render-city-video.mjs). Driving the
    // path by progress rather than wall-clock means every frame lands exactly where intended,
    // however slowly the renderer is running.
    if (flight) {
      window.__citySeek = u => {
        flying = false; controls.enabled = false;
        const e = easeInOut(Math.max(0, Math.min(1, u)));
        const pp = spline(flight.keys.map(kk => kk.p), e), tt = spline(flight.keys.map(kk => kk.t), e);
        cam.position.set(pp[0], pp[1], pp[2]); controls.target.set(tt[0], tt[1], tt[2]);
        controls.update(); draw();
      };
      window.__cityReady = true;
    }
    // Perf probe. The open question on these pages is what they cost on a REAL GPU — everything
    // here has only ever been measured on a software rasteriser, so the building caps are caution
    // rather than measurement. Exposed so that can be answered from any device's console.
    // Park the camera anywhere and render one frame. __citySeek only walks the fixed intro path,
    // which is the wrong tool for a still: a good frame is almost never a point on that spline.
    // Coordinates are world units; `len` from __cityStats is the island's length, so a caller can
    // express a vantage relative to the city instead of guessing absolute numbers.
    // An optional third argument sets the field of view. It matters more than it sounds: the beams
    // are spread along a two-kilometre island, and a wide lens from far enough back to hold them all
    // renders them small and separate. A long lens from further out compresses that depth, so the
    // forest reads as one mass — which is the thing worth looking at.
    const baseFov = cam.fov;
    window.__cityCam = (p, t, fov) => {
      flying = false; controls.enabled = false; controls.autoRotate = false;
      cam.position.set(p[0], p[1], p[2]);
      controls.target.set(t[0], t[1], t[2]);
      cam.fov = fov || baseFov;
      cam.updateProjectionMatrix(); controls.update();
      draw();
    };
    window.__cityStats = () => ({
      len: LEN,
      buildings: T.length, meshes: scene.children.length,
      drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
      programs: renderer.info.programs?.length, geometries: renderer.info.memory.geometries,
      k: K, buildMs: +buildMs.toFixed(0), cam: [+cam.position.x.toFixed(1), +cam.position.y.toFixed(1), +cam.position.z.toFixed(1)],
      textures: renderer.info.memory.textures,
      pixelRatio: +renderer.getPixelRatio().toFixed(2), frameMs: drs.frameMs,
    });
    if (flying) { controls.enabled = false; renderer.domElement.addEventListener("pointerdown", stopFlight, { once: true }); addEventListener("wheel", stopFlight, { once: true, passive: true }); }

    // ── adaptive resolution ──────────────────────────────────────────────────────────────────
    // Full pixel ratio where the GPU keeps up, stepping the render buffer down where it doesn't —
    // measured, not device-sniffed. The controller lives in city-drs.js and is UNIT-TESTED there;
    // it cannot be exercised live in the dev sandbox (headless rAF ~0.7Hz, frames slower than the
    // tab-switch cutoff), which let two earlier in-page versions sit silently dead. CSS2D labels
    // are DOM and untouched — text stays sharp at any render scale.
    const MAXR = Math.min(devicePixelRatio, 2), MINR = Math.max(0.55, MAXR * 0.4);
    const sizeNow = () => [cine ? window.innerWidth : el.clientWidth,
      cine ? window.innerHeight : (viewHRef.current || VH)];
    const drs = makeDrs({
      maxRatio: MAXR, minRatio: MINR,
      apply: r => { renderer.setPixelRatio(r); composer?.setPixelRatio(r); const [w, h] = sizeNow(); if (w && h) { renderer.setSize(w, h); composer?.setSize(w, h); } },
    });
    const adapt = now => drs.tick(now);

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const nowT = performance.now();
      adapt(nowT);
      waterTick?.(nowT);
      if (flying) {
        const u = Math.min(1, (performance.now() - flight.start) / flight.dur);
        const e = easeInOut(u);
        const p = spline(flight.keys.map(k => k.p), e), t = spline(flight.keys.map(k => k.t), e);
        cam.position.set(p[0], p[1], p[2]); controls.target.set(t[0], t[1], t[2]);
        if (u >= 1) stopFlight();
      }
      controls.update();
      for (const cb of frameCbs) cb();
      sun.target.position.copy(controls.target);
      sun.position.set(controls.target.x + LEN * 0.22, controls.target.y + LEN * 0.34, controls.target.z + LEN * 0.17);
      sun.target.updateMatrixWorld(); sun.shadow.camera.updateProjectionMatrix();
      draw();
    };
    loop();
    const onResize = () => {
      const [w, h] = sizeNow();
      if (!w || !h) return;                       // a zero-size buffer renders nothing at all
      cam.aspect = w / h; cam.updateProjectionMatrix(); renderer.setSize(w, h); composer?.setSize(w, h); labelR.setSize(w, h);
    };
    if (api.current) api.current.onResize = onResize;   // parent calls this when viewH changes
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf); window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("pointerdown", stopFlight);
      renderer.domElement.removeEventListener("wheel", onWheel);
      removeEventListener("wheel", stopFlight);
      controls.dispose(); composer?.dispose();
      disposables.forEach(d => d.dispose()); env.dispose(); sky.dispose();
      ownMats.forEach(m => m.dispose());
      groundBits.forEach(g => { if (g.dispose) g.dispose(); else { g.geometry?.dispose(); g.material?.dispose(); } });
      pads?.dispose();
      labelBits.forEach(({ obj }) => { obj.element?.remove(); scene.remove(obj); });
      delete window.__citySeek; delete window.__cityReady; delete window.__cityStats; delete window.__cityCam;
      renderer.dispose(); el.removeChild(renderer.domElement); el.removeChild(labelR.domElement); el.removeChild(tip);
    };
  }, [towers, isMobile, crownLabel, accent, bodyFrom, bodyTo, layout, intro, time, infra, arcs]);

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

  // The selected wallet's card, tracking its own building.
  //
  // Positioned in SCREEN space rather than as a world-anchored label: anchored in the world it
  // clipped off the top of the canvas the moment you zoomed in, which is exactly when you most
  // want to read it. Projecting the building each frame and clamping to the viewport means the
  // card follows its building while it is visible and stays fully readable when it isn't.
  useEffect(() => {
    const a = api.current; if (!a?.frameCbs || !pinned || !pinRef.current) return;
    const home = a.homes.get(String(pinned.a || "").toLowerCase());
    if (!home) return;

    const d = document.createElement("div");
    Object.assign(d.style, {
      position: "absolute", width: "216px", borderRadius: "12px", overflow: "hidden",
      background: "rgba(8,11,20,0.95)", border: `1px solid ${accent}`, zIndex: "6",
      boxShadow: "0 12px 34px rgba(0,0,0,0.65)", pointerEvents: "auto",
      font: "500 12.5px 'Space Grotesk', system-ui, sans-serif", color: "#e2e8f0",
    });
    d.setAttribute("data-city-pin", "");     // so tests can assert on the card, not on any text
    d.innerHTML = pinRef.current(pinned) ?? "";
    a.el.appendChild(d);

    const v = new THREE.Vector3();
    const track = () => {
      const [W2, H2] = a.size();
      v.set(home.x, home.h + 1.2, home.z).project(a.cam);
      const cw = d.offsetWidth || 216, ch = d.offsetHeight || 200, pad = 8;
      let x = (v.x * 0.5 + 0.5) * W2 - cw / 2;
      let y = (-v.y * 0.5 + 0.5) * H2 - ch - 14;      // sit above the anchor
      // Behind the camera projects to a mirrored point — park it rather than flip it across.
      if (v.z > 1) { x = W2 - cw - pad; y = pad; }
      d.style.left = Math.max(pad, Math.min(W2 - cw - pad, x)) + "px";
      d.style.top = Math.max(pad, Math.min(H2 - ch - pad, y)) + "px";
    };
    track();
    a.frameCbs.push(track);
    return () => {
      const i = a.frameCbs.indexOf(track); if (i >= 0) a.frameCbs.splice(i, 1);
      d.remove();
    };
  }, [pinned, towers, layout, time, accent]);

  // Move to a building, without rebuilding the scene. A tween rather than a jump: teleporting
  // between towers is disorienting because you lose all sense of where you went, and the whole
  // point of a city is knowing where you are in it. Any drag cancels, so it never fights you.
  useEffect(() => {
    const a = api.current; if (!a || !focus) return;
    const home = a.homes.get(String(focus).toLowerCase());
    if (!home) return;
    a.controls.autoRotate = false;

    const from = a.cam.position.clone(), fromT = a.controls.target.clone();
    // Stand off by the building's own height, so a townhouse is framed as tightly as a tower.
    const dist = Math.max(11, home.h * 1.5);
    const toT = new THREE.Vector3(home.x, Math.min(home.h * 0.55, 14), home.z);

    // ⭐ PICK AN APPROACH WITH A CLEAR VIEW. A fixed offset meant the camera always arrived from the
    // same corner, so any taller neighbour on that side hid the building you just asked to see —
    // and in a city, roughly half your neighbours are on the wrong side. This tests candidate
    // bearings against the actual skyline and takes the least obstructed, breaking ties toward
    // wherever the camera already is so the move stays short.
    const EL = 0.42;                                        // elevation of the approach, radians
    const near = a.picks.filter(q => {
      const d = Math.hypot(q.x - home.x, q.z - home.z);
      return d > 1.2 && d < dist + 6 && q.h > 1.5;          // skip the subject and anything tiny
    });
    const blockage = ang => {
      const dx = Math.cos(ang), dz = Math.sin(ang);
      let bad = 0;
      for (let i = 1; i <= 7; i++) {                        // sample along the line of sight
        const f2 = i / 8, r = dist * f2;
        const sx = home.x + dx * r * Math.cos(EL), sz = home.z + dz * r * Math.cos(EL);
        const sy = toT.y + (home.h * 0.85 + dist * 0.45 - toT.y) * f2;
        for (const q of near) {
          if (q.h < sy) continue;                           // too short to be in the way
          if (Math.abs(q.x - sx) < q.w * 0.75 && Math.abs(q.z - sz) < q.w * 0.75) { bad++; break; }
        }
      }
      return bad;
    };
    const curAng = Math.atan2(from.z - home.z, from.x - home.x);
    let bestAng = curAng, bestScore = Infinity;
    for (let i = 0; i < 16; i++) {
      const ang = curAng + (i / 16) * Math.PI * 2;
      // a whole turn away is worth about one blocked sample — clear sightline wins, but not by
      // swinging the camera across the city when a near-side approach is nearly as good
      const score = blockage(ang) + Math.abs(((ang - curAng + Math.PI) % (Math.PI * 2)) - Math.PI) / Math.PI;
      if (score < bestScore) { bestScore = score; bestAng = ang; }
    }
    const to = new THREE.Vector3(
      home.x + Math.cos(bestAng) * dist * Math.cos(EL),
      home.h * 0.85 + dist * 0.45,
      home.z + Math.sin(bestAng) * dist * Math.cos(EL),
    );

    let raf, cancelled = false;
    const stop = () => { cancelled = true; };
    a.controls.domElement?.addEventListener("pointerdown", stop, { once: true });
    const t0 = performance.now(), DUR = 800;
    const ease = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
    const step = () => {
      if (cancelled) return;
      const e = ease(Math.min(1, (performance.now() - t0) / DUR));
      a.cam.position.lerpVectors(from, to, e);
      a.controls.target.lerpVectors(fromT, toT, e);
      a.controls.update();
      if (e < 1) raf = requestAnimationFrame(step);
    };
    step();
    const clearPulse = a.pulse ? a.pulse(home) : null;   // flash it so the eye lands on it
    return () => {
      cancelled = true; cancelAnimationFrame(raf);
      a.controls.domElement?.removeEventListener("pointerdown", stop);
      clearPulse?.();
    };
  }, [focus, focusNonce]);

  // Resize the renderer in place when the frame changes size (fullscreen in/out, or a window resize
  // while fullscreen). Never rebuilds the scene.
  useEffect(() => { api.current?.onResize?.(); }, [viewH]);

  return <div ref={mount} style={{ position: "relative", width: "100%", borderRadius: 12, overflow: "hidden", cursor: "grab" }} />;
}
