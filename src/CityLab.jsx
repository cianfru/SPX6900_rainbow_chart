import { useRef, useEffect, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import CityGate from "./CityGate.jsx";
import { SANS, MONO, MAX_W } from "./chart-ui.jsx";

// CITY LAB — the same block, drawn both ways, side by side.
//
// Nothing here touches Aeon City or Whale City. It exists to answer one question before any of that
// is refactored: does the realistic treatment actually look better, and does it still READ as data?
//
// Left is exactly what ships today: flat Lambert shading, a 4-column window grid, one roof colour,
// no shadows, no reflections. Right is the proposal:
//
//   • PBR materials with an environment map, so glass reflects a sky instead of being flat blue
//   • a real sun with shadows — buildings shadowing the street is the strongest 3D cue we lack
//   • material FAMILIES by archetype: glass towers, brick brownstones, concrete mid-rises
//   • roof life — water towers, HVAC, parapets. This is the detail that says New York
//   • windows spaced by real floor height rather than six height bins
//
// The rule the whole design hangs on is STONE AND LIGHT: realism goes into form, material and
// lighting; the DATA stays in the light. Age still ramps warm→cyan and flow still burns green/red,
// but they now live in the windows and the glow rather than painting the whole facade. That is how
// a real city reads at dusk anyway — the building is stone, the windows are light — so believability
// and legibility stop competing.
const hash01 = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const lerp = (a, b, t) => a + (b - a) * t;
const mixC = (c1, c2, t) => new THREE.Color(lerp(c1.r, c2.r, t), lerp(c1.g, c2.g, t), lerp(c1.b, c2.b, t));
const GREEN = new THREE.Color(0x22c55e), RED = new THREE.Color(0xf43f5e), WARM = new THREE.Color(0xffcf7a);

// A fixed sample block: a mix of sizes, ages and flows so both panels show the same story. Seeded
// rather than random so the comparison is stable between reloads and between the two panels.
const SAMPLE = [
  { a: "0xtower1", h: 15.5, ageT: 0.92, flow: 0 },
  { a: "0xtower2", h: 11.0, ageT: 0.30, flow: 0.8 },
  { a: "0xtower3", h: 8.2, ageT: 0.65, flow: 0 },
  { a: "0xcondo1", h: 5.4, ageT: 0.15, flow: -0.7 },
  { a: "0xcondo2", h: 4.6, ageT: 0.80, flow: 0 },
  { a: "0xcondo3", h: 3.4, ageT: 0.50, flow: 0.4 },
  { a: "0xhouse1", h: 2.1, ageT: 0.97, flow: 0 },
  { a: "0xhouse2", h: 1.5, ageT: 0.10, flow: 0 },
  { a: "0xhouse3", h: 1.7, ageT: 0.72, flow: -0.35 },
  { a: "0xhouse4", h: 1.2, ageT: 0.42, flow: 0 },
  { a: "0xtower4", h: 19.0, ageT: 0.55, flow: 0.25 },
  { a: "0xhouse5", h: 2.6, ageT: 0.88, flow: 0 },
];
const LOTS = [
  [-6, -3], [-2, -3], [2, -3], [6, -3],
  [-6, 0], [-2, 0], [2, 0], [6, 0],
  [-6, 3], [-2, 3], [2, 3], [6, 3],
];

// ── window facades ────────────────────────────────────────────────────────────────────────────
// OLD: six height bins, four columns, one look for every building in the city.
function windowTexOld(rows) {
  const cell = 8, cols = 4, W = cols * cell, H = Math.max(2, rows) * cell;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d");
  g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
  for (let y = 0; y < Math.max(2, rows); y++) {
    for (let x = 0; x < cols; x++) {
      if (Math.random() < 0.24) continue;
      g.fillStyle = `rgba(255,255,255,${(0.5 + Math.random() * 0.5).toFixed(2)})`;
      g.fillRect(x * cell + 2, y * cell + 2, cell - 4, cell - 4);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// NEW: floors are a fixed WORLD height, so a 20-storey tower gets twenty rows of windows and a
// brownstone gets three — instead of both being stretched to fill the same six-bin texture. The
// pattern differs per family too: continuous glass bands on a tower, punched openings on masonry.
const FLOOR = 0.42;                                   // world units per storey
function facadeTexture(family, floors, cols, seed) {
  const cell = 16, W = cols * cell, H = Math.max(2, floors) * cell;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d");
  const rnd = (() => { let s = seed * 4294967296 >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
  g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
  for (let y = 0; y < Math.max(2, floors); y++) {
    // whole dark floors read as plant rooms / empty storeys and break up the regularity
    const darkFloor = rnd() < 0.08;
    for (let x = 0; x < cols; x++) {
      if (darkFloor || rnd() < (family === "glass" ? 0.14 : 0.3)) continue;
      const warmth = rnd();
      const [r, gg, bb] = warmth < 0.55 ? [255, 236, 200] : warmth < 0.85 ? [214, 232, 255] : [255, 255, 255];
      g.fillStyle = `rgba(${r},${gg},${bb},${(0.45 + rnd() * 0.55).toFixed(2)})`;
      if (family === "glass") g.fillRect(x * cell + 1, y * cell + 3, cell - 2, cell - 7);   // wide band
      else g.fillRect(x * cell + 4, y * cell + 3, cell - 8, cell - 7);                       // punched
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function archetype(h, r, landmark) {
  const P = [];
  if (landmark) {
    const base = h * 0.52, mid = h * 0.26, top = h * 0.16;
    P.push({ w: 1.00, d: 1.00, h: base, y: base / 2 });
    P.push({ w: 0.74, d: 0.74, h: mid, y: base + mid / 2 });
    P.push({ w: 0.48, d: 0.48, h: top, y: base + mid + top / 2 });
    return { parts: P, spire: h * 0.16, family: "glass" };
  }
  if (h >= 9) {
    const base = h * 0.72, top = h * 0.28;
    P.push({ w: 0.92, d: 0.92, h: base, y: base / 2 });
    P.push({ w: 0.62, d: 0.62, h: top, y: base + top / 2 });
    return { parts: P, spire: r > 0.5 ? h * 0.12 : 0, family: "glass" };
  }
  if (h >= 4) {
    const base = h * 0.85, cap = h * 0.15;
    P.push({ w: 0.86, d: 0.86, h: base, y: base / 2 });
    P.push({ w: 0.66, d: 0.66, h: cap, y: base + cap / 2 });
    return { parts: P, spire: 0, family: "concrete" };
  }
  if (h >= 1.8) {
    P.push({ w: 0.94, d: 0.94, h: h * 0.92, y: h * 0.46 });
    P.push({ w: 0.99, d: 0.99, h: h * 0.08, y: h * 0.96 });
    return { parts: P, spire: 0, family: "masonry" };
  }
  P.push({ w: 1.02, d: 0.86, h: h * 0.88, y: h * 0.44 });
  P.push({ w: 1.08, d: 0.92, h: h * 0.12, y: h * 0.94 });
  return { parts: P, spire: 0, family: "masonry" };
}

// A sky as an environment map. Procedural rather than a downloaded HDRI: it costs no bytes, and
// it's what makes glass look like glass — a flat material with nothing to reflect always reads as
// plastic no matter how good its roughness value is.
function skyEnv(renderer, { top, horizon, ground }) {
  const c = document.createElement("canvas"); c.width = 16; c.height = 256;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, top); grad.addColorStop(0.48, horizon);
  grad.addColorStop(0.52, ground); grad.addColorStop(1, ground);
  g.fillStyle = grad; g.fillRect(0, 0, 16, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose();
  // The same gradient is ALSO the visible sky. Using a flat background colour instead left a hard
  // seam where the ground plane stopped and the scene read as a model on a table rather than a
  // place with a horizon — the single most model-like thing about the first pass.
  return { env, sky: tex };
}

const TIMES = {
  day:   { label: "Day",   bg: 0x9fc4e8, top: "#7fb2e6", horizon: "#dce9f5", ground: "#5c6a80", sun: 0xfff6e8, sunI: 3.0, amb: 0.55, exposure: 1.0, win: 0.62 },
  dusk:  { label: "Dusk",  bg: 0x2c3a5c, top: "#22304f", horizon: "#e8a06a", ground: "#22283a", sun: 0xffb877, sunI: 2.1, amb: 0.42, exposure: 1.05, win: 1.0 },
  night: { label: "Night", bg: 0x0d1424, top: "#080e1c", horizon: "#2a3d63", ground: "#0a0f1c", sun: 0x9fbfff, sunI: 0.55, amb: 0.30, exposure: 1.15, win: 1.7 },
};

export default function CityLab({ isMobile }) {
  const oldRef = useRef(null), newRef = useRef(null);
  const [time, setTime] = useState("day");
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const oldEl = oldRef.current, newEl = newRef.current;
    if (!oldEl || !newEl) return;
    const T = TIMES[time];
    const W = (isMobile ? window.innerWidth - 32 : Math.min(560, (MAX_W - 24) / 2));
    const H = isMobile ? 320 : 420;
    const disposables = [];
    const keep = o => { disposables.push(o); return o; };

    // ── shared geometry ──────────────────────────────────────────────────────────────────────
    const box = keep(new THREE.BoxGeometry(1, 1, 1));
    const spireGeo = keep(new THREE.CylinderGeometry(0.035, 0.075, 1, 6));
    const cyl = keep(new THREE.CylinderGeometry(0.5, 0.5, 1, 10));
    const cone = keep(new THREE.ConeGeometry(0.62, 0.5, 10));

    const mkRenderer = el => {
      const r = new THREE.WebGLRenderer({ antialias: true });
      r.setPixelRatio(Math.min(devicePixelRatio, 2)); r.setSize(W, H);
      el.appendChild(r.domElement);
      return r;
    };
    const rOld = mkRenderer(oldEl), rNew = mkRenderer(newEl);

    // Colour management + filmic tone mapping on the NEW side only. Without this, bright emissive
    // windows clip to flat white and the whole image looks like a screenshot of a spreadsheet.
    rNew.outputColorSpace = THREE.SRGBColorSpace;
    rNew.toneMapping = THREE.ACESFilmicToneMapping;
    rNew.toneMappingExposure = T.exposure;
    rNew.shadowMap.enabled = true;
    rNew.shadowMap.type = THREE.PCFSoftShadowMap;

    // ── OLD scene: exactly today's treatment ─────────────────────────────────────────────────
    const sOld = new THREE.Scene();
    sOld.background = new THREE.Color(0x1b2740);
    sOld.add(new THREE.AmbientLight(0xffffff, 0.95));
    const od1 = new THREE.DirectionalLight(0xfff2df, 1.15); od1.position.set(30, 60, 20); sOld.add(od1);
    const od2 = new THREE.DirectionalLight(0x9dc4ff, 0.6); od2.position.set(-25, 25, -15); sOld.add(od2);
    const groundOld = new THREE.Mesh(keep(new THREE.PlaneGeometry(60, 60)), keep(new THREE.MeshLambertMaterial({ color: 0x59668f })));
    groundOld.rotation.x = -Math.PI / 2; sOld.add(groundOld);
    const roofOld = keep(new THREE.MeshLambertMaterial({ color: 0x2b3350 }));
    const texOld = Array.from({ length: 6 }, (_, i) => keep(windowTexOld(2 + i * 3)));

    // ── NEW scene: the proposal ──────────────────────────────────────────────────────────────
    const sNew = new THREE.Scene();
    const { env, sky } = skyEnv(rNew, T);
    sNew.environment = env; sNew.background = sky;
    disposables.push(env, sky);
    sNew.fog = new THREE.Fog(new THREE.Color(T.horizon), 55, 210);
    sNew.add(new THREE.AmbientLight(0xffffff, T.amb));
    const sun = new THREE.DirectionalLight(T.sun, T.sunI);
    sun.position.set(22, 34, 16); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 90 });
    sNew.add(sun);

    // Street: asphalt with a pavement inset, so the ground stops being one flat plate.
    // Big enough that its edge never enters frame — a visible ground edge is what made the scene
    // read as a diorama on a table. The fog closes the rest of the gap to the horizon.
    const asphalt = new THREE.Mesh(keep(new THREE.PlaneGeometry(260, 260)),
      keep(new THREE.MeshStandardMaterial({ color: 0x2b2f39, roughness: 0.95 })));
    asphalt.rotation.x = -Math.PI / 2; asphalt.receiveShadow = true; sNew.add(asphalt);
    const paveMat = keep(new THREE.MeshStandardMaterial({ color: 0x6b7285, roughness: 0.9 }));
    for (const [x, z] of LOTS) {
      const pv = new THREE.Mesh(box, paveMat);
      pv.scale.set(3.3, 0.09, 2.4); pv.position.set(x, 0.045, z);
      pv.receiveShadow = true; sNew.add(pv);
    }

    // Material families. One shared material per (family × age bin), which is also how the real
    // city will bin them — a unique material per building is what made it draw-call bound.
    const FAMILIES = {
      glass:    { colour: 0x7d92b5, roughness: 0.14, metalness: 0.85 },
      concrete: { colour: 0x9aa0a8, roughness: 0.78, metalness: 0.04 },
      masonry:  { colour: 0x8d6a5b, roughness: 0.92, metalness: 0.0 },
    };
    const roofNew = keep(new THREE.MeshStandardMaterial({ color: 0x3b3f4a, roughness: 0.88 }));
    const woodMat = keep(new THREE.MeshStandardMaterial({ color: 0x6b4a35, roughness: 0.95 }));
    const metalMat = keep(new THREE.MeshStandardMaterial({ color: 0x8a9099, roughness: 0.5, metalness: 0.7 }));

    SAMPLE.forEach((t, i) => {
      const [x, z] = LOTS[i];
      const r = hash01(t.a);
      const flowCol = t.flow > 0.02 ? GREEN : t.flow < -0.02 ? RED : null;
      const mag = Math.min(1, Math.abs(t.flow) * 1.6);
      const { parts, spire, family } = archetype(t.h, r, i === 10);

      // ---- OLD: facade tinted by age, then tinted again by flow; windows the same warm glow ----
      const ageOld = mixC(new THREE.Color(0xd97706), new THREE.Color(0x22d3ee), t.ageT);
      const bodyOld = flowCol ? mixC(ageOld, flowCol, 0.22 + 0.4 * mag) : ageOld;
      const glowOld = flowCol ? mixC(WARM, flowCol, Math.min(1, 0.35 + mag)) : WARM;
      const ti = Math.min(5, Math.floor((t.h / 21) * 6));
      const sideOld = keep(new THREE.MeshLambertMaterial({
        color: bodyOld, emissive: glowOld, emissiveMap: texOld[ti], emissiveIntensity: 0.5 + (flowCol ? 0.8 * mag : 0),
      }));
      for (const q of parts) {
        const m = new THREE.Mesh(box, [sideOld, sideOld, roofOld, roofOld, sideOld, sideOld]);
        m.scale.set(q.w, q.h, q.d); m.position.set(x, q.y, z); sOld.add(m);
      }
      if (spire > 0) {
        const s = new THREE.Mesh(spireGeo, keep(new THREE.MeshBasicMaterial({ color: 0xdbeafe })));
        s.scale.set(1, spire, 1); s.position.set(x, t.h + spire / 2, z); sOld.add(s);
      }

      // ---- NEW: stone and light ---------------------------------------------------------------
      // Albedo is the real material with only a WHISPER of the age hue (12%), so a brick building
      // still looks like brick. The age signal moves into the emissive windows at full strength,
      // where it reads better anyway because it's the brightest thing on the facade.
      const f = FAMILIES[family];
      const ageHue = mixC(new THREE.Color(0xd97706), new THREE.Color(0x22d3ee), t.ageT);
      const albedo = mixC(new THREE.Color(f.colour), ageHue, 0.12);
      const winCol = flowCol ? mixC(ageHue, flowCol, Math.min(1, 0.45 + mag)) : ageHue;
      const floors = Math.max(2, Math.round(t.h / FLOOR));
      const cols = family === "glass" ? 6 : 4;
      const tex = keep(facadeTexture(family, floors, cols, r));
      const sideNew = keep(new THREE.MeshStandardMaterial({
        color: albedo, roughness: f.roughness, metalness: f.metalness,
        emissive: winCol, emissiveMap: tex, emissiveIntensity: T.win * (flowCol ? 1 + 0.9 * mag : 1),
        envMapIntensity: family === "glass" ? 1.35 : 0.55,
      }));
      for (const q of parts) {
        const m = new THREE.Mesh(box, [sideNew, sideNew, roofNew, roofNew, sideNew, sideNew]);
        m.scale.set(q.w, q.h, q.d); m.position.set(x, q.y, z);
        m.castShadow = true; m.receiveShadow = true; sNew.add(m);
      }
      if (spire > 0) {
        const s = new THREE.Mesh(spireGeo, metalMat);
        s.scale.set(1, spire, 1); s.position.set(x, t.h + spire / 2, z);
        s.castShadow = true; sNew.add(s);
      }

      // Roof life. A water tower on the low-rise roofs is the single most New York thing we can
      // add for four triangles, and HVAC boxes stop every rooftop reading as a flat lid.
      const top = parts[parts.length - 1];
      const roofY = top.y + top.h / 2, roofW = top.w;
      if (family === "masonry" && r > 0.25) {
        const tank = new THREE.Mesh(cyl, woodMat);
        tank.scale.set(0.34, 0.42, 0.34); tank.position.set(x + roofW * 0.2, roofY + 0.32, z - roofW * 0.15);
        tank.castShadow = true; sNew.add(tank);
        const cap = new THREE.Mesh(cone, woodMat);
        cap.scale.set(0.3, 0.34, 0.3); cap.position.set(x + roofW * 0.2, roofY + 0.62, z - roofW * 0.15);
        cap.castShadow = true; sNew.add(cap);
        // the spindly legs a water tower actually stands on
        for (const [dx, dz] of [[-0.1, -0.1], [0.1, -0.1], [-0.1, 0.1], [0.1, 0.1]]) {
          const leg = new THREE.Mesh(box, woodMat);
          leg.scale.set(0.03, 0.16, 0.03);
          leg.position.set(x + roofW * 0.2 + dx, roofY + 0.08, z - roofW * 0.15 + dz);
          sNew.add(leg);
        }
      } else {
        const n = 1 + Math.floor(r * 3);
        for (let k = 0; k < n; k++) {
          const hv = new THREE.Mesh(box, metalMat);
          const s2 = 0.12 + hash01(t.a + k) * 0.16;
          hv.scale.set(s2 * roofW * 2, 0.12 + hash01(t.a + "h" + k) * 0.2, s2 * roofW * 2);
          hv.position.set(x + (hash01(t.a + "x" + k) - 0.5) * roofW * 0.7, roofY + 0.08,
            z + (hash01(t.a + "z" + k) - 0.5) * roofW * 0.7);
          hv.castShadow = true; sNew.add(hv);
        }
      }
      // A parapet lip around the roof — cheap, and it stops the roof/wall join looking like a cut.
      const lip = new THREE.Mesh(box, roofNew);
      lip.scale.set(top.w * 1.04, 0.07, top.d * 1.04); lip.position.set(x, roofY + 0.035, z);
      lip.castShadow = true; sNew.add(lip);

      // Flow still spills onto the pavement, unchanged — it's the loudest data channel there is.
      if (flowCol && mag > 0.12) {
        for (const [scene, opacity] of [[sOld, 0.10 + 0.3 * mag], [sNew, 0.14 + 0.34 * mag]]) {
          const halo = new THREE.Mesh(keep(new THREE.CircleGeometry(1.5, 20)),
            keep(new THREE.MeshBasicMaterial({ color: flowCol, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false })));
          halo.rotation.x = -Math.PI / 2; halo.position.set(x, scene === sNew ? 0.1 : 0.06, z);
          scene.add(halo);
        }
      }
    });

    // ── one camera driving both, so the comparison is honest ─────────────────────────────────
    const camOld = new THREE.PerspectiveCamera(46, W / H, 0.1, 400);
    const camNew = new THREE.PerspectiveCamera(46, W / H, 0.1, 400);
    camOld.position.set(14, 11, 17); camNew.position.copy(camOld.position);
    const controls = new OrbitControls(camNew, rNew.domElement);
    const controls2 = new OrbitControls(camOld, rOld.domElement);
    for (const c of [controls, controls2]) {
      c.target.set(0, 3.5, 0); c.enableDamping = true; c.dampingFactor = 0.08;
      c.minDistance = 8; c.maxDistance = 60; c.maxPolarAngle = Math.PI * 0.49;
      c.autoRotate = true; c.autoRotateSpeed = 0.55;
    }

    let raf;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      controls.update();
      // mirror the driven camera onto the other panel, so both always show the same angle
      camOld.position.copy(camNew.position); camOld.quaternion.copy(camNew.quaternion);
      controls2.target.copy(controls.target);
      rOld.render(sOld, camOld); rNew.render(sNew, camNew);
    };
    loop();
    const id = setTimeout(() => setStats({
      old: { calls: rOld.info.render.calls, tris: rOld.info.render.triangles },
      neu: { calls: rNew.info.render.calls, tris: rNew.info.render.triangles },
    }), 600);

    return () => {
      cancelAnimationFrame(raf); clearTimeout(id);
      controls.dispose(); controls2.dispose();
      disposables.forEach(d => d.dispose());
      rOld.dispose(); rNew.dispose();
      oldEl.removeChild(rOld.domElement); newEl.removeChild(rNew.domElement);
    };
  }, [isMobile, time]);

  const panel = (title, sub, ref, tint) => (
    <div style={{ flex: "1 1 320px", minWidth: 0 }}>
      <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 14, color: tint, marginBottom: 2 }}>{title}</div>
      <div style={{ fontFamily: SANS, fontSize: 12, color: "#7c8a9e", marginBottom: 7, minHeight: 32 }}>{sub}</div>
      <div ref={ref} style={{ borderRadius: 12, overflow: "hidden", background: "#0b1020", cursor: "grab" }} />
    </div>
  );

  return (
    <CityGate title="City Lab" unit="holder" accent="#5eead4">
      <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
        <div style={{ fontFamily: SANS, fontSize: 13.5, color: "#94a3b8", lineHeight: 1.65, textAlign: "center", maxWidth: 760, margin: "0 auto 16px" }}>
          The same block drawn both ways. Nothing in Aeon City or Whale City has changed — this is here
          to judge the look first. <strong style={{ color: "#e2e8f0" }}>Drag either panel; both cameras move together.</strong>
        </div>

        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 14 }}>
          {Object.entries(TIMES).map(([k, v]) => (
            <button key={k} onClick={() => setTime(k)} style={{
              padding: "5px 14px", borderRadius: 0, cursor: "pointer", fontFamily: MONO, fontSize: 12,
              background: time === k ? "rgba(94,234,212,0.16)" : "transparent",
              border: `1px solid ${time === k ? "#5eead4" : "rgba(255,255,255,0.12)"}`,
              color: time === k ? "#5eead4" : "#94a3b8",
            }}>{v.label}</button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
          {panel("Now", "Flat shading, one window pattern, no shadows or reflections. The facade itself is tinted by age and by flow.", oldRef, "#94a3b8")}
          {panel("Proposed", "Real materials and a sun that casts shadows. Age and flow move into the windows and the glow — stone and light.", newRef, "#5eead4")}
        </div>

        {stats && (
          <div style={{ fontFamily: MONO, fontSize: 11.5, color: "#64748b", textAlign: "center", marginTop: 12 }}>
            now {stats.old.calls} draw calls · {stats.old.tris.toLocaleString()} triangles &nbsp;|&nbsp;
            proposed {stats.neu.calls} draw calls · {stats.neu.tris.toLocaleString()} triangles
            <div style={{ marginTop: 4, color: "#7c8a9e", fontFamily: SANS, fontSize: 12 }}>
              Twelve buildings, so both are cheap here. At city scale the proposed side needs the instancing
              work first — that is what pays for the shadows.
            </div>
          </div>
        )}

        <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 18, lineHeight: 1.65, maxWidth: 820, marginInline: "auto" }}>
          Both panels show identical data: the same twelve wallets, sizes, ages and flows. Only the rendering
          differs. The green and red buildings are the ones adding and reducing; the amber-to-cyan ramp is
          holding age. Judge whether the right-hand side still says that as clearly as the left.
        </div>
      </div>
    </CityGate>
  );
}
