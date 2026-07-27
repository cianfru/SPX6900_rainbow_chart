import { useRef, useEffect } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";

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
}) {
  const mount = useRef(null);
  const selectRef = useRef(onSelect); selectRef.current = onSelect;
  const cardRef = useRef(cardHtml); cardRef.current = cardHtml;

  useEffect(() => {
    const el = mount.current; if (!el || !towers?.length) return;
    const T = towers.slice().sort((a, b) => b.score - a.score);
    const maxScore = Math.max(...T.map(t => t.score), 1e-9);
    const maxFlow = Math.max(...T.map(t => Math.abs(t.flow || 0)), 1e-9);

    const W = el.clientWidth, VH = isMobile ? 440 : 580;
    // Height uses a SQUARE-ROOT scale. Holdings are power-law (the top wallet here is ~100x the
    // median), so a linear axis renders one lonely spike over a field of paving slabs. The root
    // keeps the ordering exact and lets the archetypes actually spread across the city — the
    // caption says so, and the exact figure is always one hover away.
    const HMAX = 21;
    const { pts, blockW, blockD, blocks } = cityPlots(T.length);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05070f);
    scene.fog = new THREE.Fog(0x05070f, 40, 190);
    const cam = new THREE.PerspectiveCamera(46, W / VH, 0.1, 3000);
    const span = Math.sqrt(T.length) * 2.0;
    cam.position.set(span * 0.95, 20, span * 1.28);
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

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const d1 = new THREE.DirectionalLight(0xffffff, 0.85); d1.position.set(30, 60, 20); scene.add(d1);
    const d2 = new THREE.DirectionalLight(0x7f9dff, 0.45); d2.position.set(-25, 25, -15); scene.add(d2);

    // ── the streets: asphalt ground + a lighter pad per block, so the gaps read as avenues ──
    const groundSize = Math.max(blocks.length * 2, 60) * 4;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(groundSize, groundSize),
      new THREE.MeshLambertMaterial({ color: 0x0a0e1a }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; scene.add(ground);

    const padGeo = new THREE.BoxGeometry(BW * PLOT + 0.5, 0.12, BD * PLOT + 0.5);
    const padMat = new THREE.MeshLambertMaterial({ color: 0x161c2c });
    const pads = new THREE.InstancedMesh(padGeo, padMat, blocks.length);
    const mtx = new THREE.Matrix4();
    blocks.forEach((b, i) => { mtx.makeTranslation(b.x * blockW, 0.04, b.z * blockD); pads.setMatrixAt(i, mtx); });
    pads.instanceMatrix.needsUpdate = true; scene.add(pads);

    // shared geometry + per-height-bin window textures + one shared roof material
    const box = new THREE.BoxGeometry(1, 1, 1);
    const spireGeo = new THREE.CylinderGeometry(0.035, 0.075, 1, 6);
    const haloGeo = new THREE.CircleGeometry(1.05, 20);
    const BINS = 6, texes = Array.from({ length: BINS }, (_, i) => windowTexture(2 + i * 3));
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x11172a });
    const disposables = [box, spireGeo, haloGeo, padGeo, padMat, roofMat, ground.geometry, ground.material, ...texes];

    const hitMeshes = [], ownMats = [];
    T.forEach((t, i) => {
      const h = Math.max(0.6, Math.sqrt(Math.max(0, t.score) / maxScore) * HMAX);
      const p = pts[i], r = hash01(t.a || String(i));
      const f = (t.flow || 0) / maxFlow;                     // -1..1
      const mag = Math.min(1, Math.abs(f) * 3.0);            // how loudly to shout the flow
      const flowCol = f > 0.02 ? GREEN : f < -0.02 ? RED : null;

      // Facade tints toward the flow colour, so the WHOLE building reads green/red — not just
      // its windows. Neutral wallets keep the age ramp.
      const age = mix(new THREE.Color(bodyFrom), new THREE.Color(bodyTo), t.ageT ?? 0.5);
      const body = flowCol ? mix(age, flowCol, 0.30 + 0.45 * mag) : age;
      const glow = flowCol ? mix(WARM, flowCol, Math.min(1, 0.35 + mag)) : WARM;
      const tex = texes[Math.min(BINS - 1, Math.floor((h / 21) * BINS))];
      const emissiveIntensity = 0.45 + (flowCol ? 0.75 * mag : 0);

      // sides get windows, roof does not (face order: +X, −X, +Y, −Y, +Z, −Z)
      const sideMat = new THREE.MeshLambertMaterial({ color: body, emissive: glow, emissiveMap: tex, emissiveIntensity });
      const faces = [sideMat, sideMat, roofMat, roofMat, sideMat, sideMat];
      ownMats.push(sideMat);

      const { parts, spire, crownW } = archetype(h, r, i < 3);
      const group = [];
      for (const q of parts) {
        const m = new THREE.Mesh(box, faces);
        m.scale.set(q.w, q.h, q.d); m.position.set(p.x, q.y, p.z);
        m.userData = { t, mat: sideMat, base: emissiveIntensity };
        scene.add(m); hitMeshes.push(m); group.push(m);
      }
      if (spire > 0) {
        const sMat = new THREE.MeshBasicMaterial({ color: flowCol ? glow : 0xdbeafe });
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

    const controls = new OrbitControls(cam, renderer.domElement);
    controls.target.set(0, 7, 0); controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.minDistance = 12; controls.maxDistance = span * 4 + 60; controls.maxPolarAngle = Math.PI * 0.492;
    controls.autoRotate = true; controls.autoRotateSpeed = 0.5;

    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    let hovered = null, px = 0, py = 0, moved = false;
    const setHover = m => {
      const mat = m?.userData.mat ?? null, prev = hovered?.userData.mat ?? null;
      if (mat === prev) return;
      if (prev) prev.emissiveIntensity = hovered.userData.base;
      hovered = m;
      if (mat) { mat.emissiveIntensity = 1.5; renderer.domElement.style.cursor = "pointer"; }
      else renderer.domElement.style.cursor = "grab";
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

    let raf;
    const loop = () => { raf = requestAnimationFrame(loop); controls.update(); renderer.render(scene, cam); labelR.render(scene, cam); };
    loop();
    const onResize = () => { const w = el.clientWidth; cam.aspect = w / VH; cam.updateProjectionMatrix(); renderer.setSize(w, VH); labelR.setSize(w, VH); };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf); window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      controls.dispose();
      disposables.forEach(d => d.dispose());
      ownMats.forEach(m => m.dispose());
      pads.dispose();
      renderer.dispose(); el.removeChild(renderer.domElement); el.removeChild(labelR.domElement); el.removeChild(tip);
    };
  }, [towers, isMobile, crownLabel, accent, bodyFrom, bodyTo]);

  return <div ref={mount} style={{ position: "relative", width: "100%", borderRadius: 12, overflow: "hidden", cursor: "grab" }} />;
}
