import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { makeDrs } from "./city-drs.js";
import { recordCanvas, downloadBlob, recorderSupported } from "./canvas-record.js";
import { buildCohorts, ageRamp } from "./whale-cohorts.js";
import { loadWhales } from "./history-data.js";
import WhaleBoard from "./WhaleBoard.jsx";
import WhaleMosaic from "./WhaleMosaic.jsx";
import WalletCard from "./WalletCard.jsx";
import CityGate from "./CityGate.jsx";
import { SANS, MONO } from "./chart-ui.jsx";

// "WHALES WATCHING" — a whale-activity monitor drawn in the SAME clean data-chart design as the
// Cost Basis × Age 3D chart (Urpd3D): flat dark ground, a blue grid floor, solid Lambert bars, thin
// blue axis-reference lines with CSS2D labels, and a slow autorotate that stops on interaction.
// Every wallet ≥100k SPX is a bar, GROUPED into four size cohorts along X. HEIGHT sits on a log SPX
// axis (100k → 10M), COLOUR is holder age (warm amber = new → cyan = long-held), and a BEAM over a
// bar shows 30-day flow (green = buying, red = selling, none = flat). A slab + label under each
// cluster reads its overall sentiment. A distribution snapshot, not a signal.
//
// ⚠ GPU render is unverified in the dev sandbox (software rasteriser). The data/layout math is in
// ../whale-cohorts.js and unit-tested; check window.__whaleStats() on real hardware.

const FOOT = 1.15;               // bar footprint (world units)
const HMIN = 1.2, HMAX = 18;     // world-height range across the log size axis
const AGE_BINS = 12;             // age-ramp buckets → one merged mesh + material each
const GREEN = 0x22c55e, RED = 0xf43f5e;
const GRID_A = 0x243258, GRID_B = 0x18223c, AXIS = 0x2a3550;
const FLOOR_COL = 0x0e1526;   // one unified ground colour (fog matches it)
const PAD_COL = 0x1a2440;     // cohort tiles — same for every cohort, a touch above the floor
const kM = v => v >= 1e6 ? (v / 1e6 % 1 ? (v / 1e6).toFixed(1) : v / 1e6) + "M" : Math.round(v / 1e3) + "k";

function buildScene(el, data, { onlyMovers, isMobile, flowWin = 30, onPick }) {
  const flowKey = "d" + flowWin;                       // "d30" | "d7" | "d1"
  const winLbl = flowWin === 1 ? "24h" : flowWin + "d";
  const flowOf = w => { const v = w[flowKey]; return Number.isFinite(v) ? v : (w.d30 || 0); };
  const wallets = onlyMovers ? data.wallets.filter(w => (flowOf(w) || 0) !== 0) : data.wallets;
  const model = buildCohorts(wallets, { flowKey });
  const cohorts = model.cohorts;
  const { minBal, maxBal, bounds } = model;
  const lnLo = Math.log(minBal), lnHi = Math.log(Math.max(maxBal, minBal * 1.0001));
  const heightOf = bal => HMIN + (HMAX - HMIN) * Math.max(0, Math.min(1, (Math.log(bal) - lnLo) / (lnHi - lnLo)));

  // fill the container's real height (driven by the CSS vh below) so the scene uses the screen
  const W = el.clientWidth, VH = el.clientHeight || (isMobile ? 440 : 560);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0e1c);         // flat, like Urpd3D — not a sky
  const span = Math.max(bounds.width, bounds.depth, 40);

  const cam = new THREE.PerspectiveCamera(46, W / VH, 0.1, 2000);
  // Fit the whole cohort field to the viewport. On PORTRAIT phones the four cohorts spread wider than
  // a narrow vertical FOV, so a landscape-tuned front view ran them off the right edge. There we view
  // the row DIAGONALLY (from a corner) so it recedes across the frame's HEIGHT instead of its width;
  // landscape keeps the wide front view. Either way pull back to whichever of width/height binds.
  const portrait = (W / VH) < 1;
  // lower look-at on portrait tilts the camera down so the floor field fills the frame (less sky).
  const camTarget = new THREE.Vector3(0, HMAX * (portrait ? 0.14 : 0.34), 0);
  const vFov = 46 * Math.PI / 180, hFov = 2 * Math.atan(Math.tan(vFov / 2) * (W / VH));
  const dirV = (portrait ? new THREE.Vector3(0.6, 0.98, 0.6) : new THREE.Vector3(0.42, 0.52, 0.86)).normalize();
  const fitDist = Math.max((span * (portrait ? 0.5 : 0.64)) / Math.tan(hFov / 2), Math.max(span * 0.42, HMAX * 0.9) / Math.tan(vFov / 2)) * 1.05;
  cam.position.copy(dirV.multiplyScalar(fitDist).add(camTarget));
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(W, VH);
  el.appendChild(renderer.domElement);

  const labelR = new CSS2DRenderer(); labelR.setSize(W, VH);
  Object.assign(labelR.domElement.style, { position: "absolute", top: "0", left: "0", pointerEvents: "none" });
  el.appendChild(labelR.domElement);
  const mkLabel = (text, color, size = 11, weight = 500) => {
    const d = document.createElement("div");
    d.textContent = text;
    Object.assign(d.style, { color, font: `${weight} ${size}px 'Space Grotesk', system-ui, sans-serif`, whiteSpace: "nowrap", textShadow: "0 1px 3px #000", opacity: "0.94" });
    return new CSS2DObject(d);
  };
  const addLabel = (text, x, y, z, color, size, weight) => { const l = mkLabel(text, color, size, weight); l.position.set(x, y, z); scene.add(l); };

  // lights — the same simple rig as Urpd3D (no shadows, no env, no tone mapping)
  scene.add(new THREE.AmbientLight(0xffffff, 0.78));
  const d1 = new THREE.DirectionalLight(0xffffff, 0.85); d1.position.set(span * 0.4, span * 0.7, span * 0.3); scene.add(d1);
  const d2 = new THREE.DirectionalLight(0x88aaff, 0.35); d2.position.set(-span * 0.3, span * 0.3, -span * 0.2); scene.add(d2);

  // ── the floor ───────────────────────────────────────────────────────────────
  // ONE unified ground plane in a single colour, with the grid + cohort tiles sitting on top of it,
  // so the base reads as a single cohesive floor rather than a patchwork of coloured pads. Sentiment
  // moves OFF the floor colour (it was tinting each tile green/red) and onto a thin rim + the label.
  const gridSize = Math.max(bounds.width, bounds.depth) * 1.6;
  const groundMat = new THREE.MeshLambertMaterial({ color: FLOOR_COL });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(gridSize * 2, gridSize * 2), groundMat);
  ground.rotation.x = -Math.PI / 2; scene.add(ground);
  const grid = new THREE.GridHelper(gridSize, 20, GRID_A, GRID_B);
  grid.position.y = 0.02; grid.material.transparent = true; grid.material.opacity = 0.5; scene.add(grid);
  // gentle haze so the far cohorts sink into the ground colour instead of ending on a hard edge
  scene.fog = new THREE.Fog(new THREE.Color(FLOOR_COL), span * 1.5, span * 3.8);

  const disposables = [ground.geometry, groundMat, grid.geometry, grid.material];
  const ownMats = [];

  // ── axis reference: log SIZE gridlines across the back + left walls ──────────
  const xL = -bounds.width / 2 - 1.5, xR = bounds.width / 2 + 1.5;
  const zB = -bounds.depth / 2 - 1.2, zF = bounds.depth / 2 + 1.2;
  const lineMat = new THREE.LineBasicMaterial({ color: AXIS, transparent: true, opacity: 0.6 });
  disposables.push(lineMat);
  const seg = (a, b) => { const g = new THREE.BufferGeometry().setFromPoints([a, b]); const l = new THREE.Line(g, lineMat); scene.add(l); disposables.push(g); };
  const ticks = [1e5, 2.5e5, 5e5, 1e6, 2.5e6, 5e6, 1e7].filter(v => v >= minBal * 0.999 && v <= maxBal * 1.001);
  ticks.forEach(v => {
    const y = heightOf(v);
    seg(new THREE.Vector3(xL, y, zB), new THREE.Vector3(xR, y, zB));   // back wall line
    seg(new THREE.Vector3(xL, y, zB), new THREE.Vector3(xL, y, zF));   // left wall line
    addLabel(kM(v), xL - 1.4, y, zB, "#9aa6bd", 11);
  });
  addLabel("SPX held ↑", xL - 1.4, HMAX + 1.8, zB, "#cbd5e1", 12.5, 700);
  addLabel("size cohorts →", xR - 6, 0.2, zF + 0.6, "#cbd5e1", 12.5, 700);

  // ── cohort tiles (unified colour) + a sentiment rim + label ─────────────────
  // Every tile is the SAME colour so the floor stays unified; which cohort is accumulating vs
  // distributing reads from the thin glowing rim around it and from the coloured label above.
  const padMat = new THREE.MeshLambertMaterial({ color: PAD_COL });
  ownMats.push(padMat);
  cohorts.forEach(c => {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(c.platform.w, 0.16, c.platform.d), padMat);
    pad.position.set(c.center.x, 0.09, 0);
    scene.add(pad); disposables.push(pad.geometry);

    const rimHex = c.sentiment === "accumulating" ? GREEN : c.sentiment === "distributing" ? RED : 0x5b6784;
    const hw = c.platform.w / 2, hd = c.platform.d / 2;
    const ring = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd], [-hw, -hd]].map(([x, z]) => new THREE.Vector3(c.center.x + x, 0.18, z));
    const rimG = new THREE.BufferGeometry().setFromPoints(ring);
    const rimM = new THREE.LineBasicMaterial({ color: rimHex, transparent: true, opacity: c.sentiment === "balanced" ? 0.5 : 0.9 });
    scene.add(new THREE.Line(rimG, rimM)); disposables.push(rimG, rimM);

    if (!c.n) return;
    const np = c.netPct >= 0 ? `+${c.netPct.toFixed(2)}%` : `${c.netPct.toFixed(2)}%`;
    const scol = c.sentiment === "accumulating" ? "#4ade80" : c.sentiment === "distributing" ? "#fb7185" : "#94a3b8";
    const div = document.createElement("div");
    div.style.cssText = "text-align:center;pointer-events:none";
    div.innerHTML =
      `<div style="font:800 13.5px 'Space Grotesk',sans-serif;color:#e6edf7;letter-spacing:.3px;text-shadow:0 1px 3px #000">${c.label}</div>` +
      `<div style="font:700 11.5px 'Space Grotesk',sans-serif;color:${scol};text-shadow:0 1px 3px #000">${c.n} · net ${np} · ${c.sentiment}</div>`;
    const label = new CSS2DObject(div);
    label.position.set(c.center.x, HMAX * 0.66, zB + 0.4);
    scene.add(label);
  });

  // ── bars: one merged mesh per age bin (solid Lambert, like Urpd3D) ──────────
  const cubeBins = Array.from({ length: AGE_BINS }, () => []);
  const beamBuy = [], beamSell = [];
  const picks = [];
  const all = cohorts.flatMap(c => c.wallets.map(w => ({ ...w, cohort: c.label })));
  all.forEach(w => {
    const h = heightOf(w.bal);
    const g = new THREE.BoxGeometry(FOOT, h, FOOT); g.translate(w.x, h / 2, w.z);
    cubeBins[Math.min(AGE_BINS - 1, Math.round(w.ageU * (AGE_BINS - 1)))].push(g);
    picks.push({ x: w.x, z: w.z, h, ref: w });
    if (w.flow !== "flat") {
      const mag = Math.min(1, Math.abs(w.net) / Math.max(1, w.bal) * 6);
      const bh = 2 + 5 * mag;
      const bg = new THREE.BoxGeometry(0.2, bh, 0.2); bg.translate(w.x, h + 0.4 + bh / 2, w.z);
      (w.flow === "buy" ? beamBuy : beamSell).push(bg);
    }
  });
  const addMerged = (geos, mat) => {
    if (!geos.length) return;
    const merged = mergeGeometries(geos, false);
    geos.forEach(g => g.dispose());
    if (!merged) return;
    scene.add(new THREE.Mesh(merged, mat)); disposables.push(merged); ownMats.push(mat);
  };
  cubeBins.forEach((geos, ai) => {
    const col = new THREE.Color(ageRamp(ai / (AGE_BINS - 1)).hex);
    // a whisper of self-illumination so the age colour still reads on a face the sun doesn't hit
    addMerged(geos, new THREE.MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: 0.18 }));
  });
  // beams read as light: a Lambert body with a matching emissive so they glow above the bars
  const beamMat = c => new THREE.MeshLambertMaterial({ color: new THREE.Color(c), emissive: new THREE.Color(c), emissiveIntensity: 0.9 });
  addMerged(beamBuy, beamMat(GREEN));
  addMerged(beamSell, beamMat(RED));

  // ── hover picking: invisible InstancedMesh of the bar boxes ─────────────────
  const pickGeo = new THREE.BoxGeometry(1, 1, 1);
  const pickMat = new THREE.MeshBasicMaterial({ visible: false });
  const pickMesh = new THREE.InstancedMesh(pickGeo, pickMat, Math.max(1, picks.length));
  const M = new THREE.Matrix4();
  picks.forEach((p, i) => { M.makeScale(FOOT, p.h, FOOT); M.setPosition(p.x, p.h / 2, p.z); pickMesh.setMatrixAt(i, M); });
  pickMesh.instanceMatrix.needsUpdate = true;
  scene.add(pickMesh); disposables.push(pickGeo, pickMat);

  const cageMat = new THREE.MeshBasicMaterial({ color: 0x5eead4, wireframe: true, transparent: true, opacity: 0.9 });
  const cage = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), cageMat);
  cage.visible = false; scene.add(cage); disposables.push(cage.geometry, cageMat);

  const tip = document.createElement("div");
  Object.assign(tip.style, {
    position: "absolute", pointerEvents: "none", padding: "9px 12px", borderRadius: "11px", display: "none",
    background: "rgba(8,11,20,0.97)", border: "1px solid #5eead4", color: "#e2e8f0",
    font: "500 12.5px 'Space Grotesk', system-ui, sans-serif", zIndex: "5", width: "232px",
    boxShadow: "0 10px 34px rgba(0,0,0,0.6)", transform: "translate(-50%, -114%)", lineHeight: "1.5",
  });
  el.appendChild(tip);

  const controls = new OrbitControls(cam, renderer.domElement);
  controls.target.copy(camTarget);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minDistance = 14; controls.maxDistance = Math.max(span * 2.6, fitDist * 1.25); controls.maxPolarAngle = Math.PI * 0.49;
  controls.autoRotate = true; controls.autoRotateSpeed = 0.6;
  const stopSpin = () => { controls.autoRotate = false; };
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  // Click a bar → select that wallet (React shows its Zerion card). We tell a click from an orbit-drag
  // by the pointer travel between down and up, so dragging to rotate never selects.
  let downXY = null;
  const onDown = e => { downXY = [e.clientX, e.clientY]; stopSpin(); };
  const onUp = e => {
    if (!downXY) return;
    const moved = Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]); downXY = null;
    if (moved > 6 || !onPick) return;                      // a drag/orbit, not a click
    const r = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(mouse, cam);
    const hit = ray.intersectObject(pickMesh, false)[0];
    onPick(hit ? picks[hit.instanceId]?.ref || null : null);
  };
  renderer.domElement.addEventListener("pointerdown", onDown);
  renderer.domElement.addEventListener("pointerup", onUp);

  let hovered = -1;
  const onMove = e => {
    const r = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(mouse, cam);
    const hit = ray.intersectObject(pickMesh, false)[0];
    const id = hit ? hit.instanceId : -1;
    if (id === hovered) { if (id >= 0) { tip.style.left = `${e.clientX - r.left}px`; tip.style.top = `${e.clientY - r.top}px`; } return; }
    hovered = id;
    if (id < 0) { tip.style.display = "none"; cage.visible = false; return; }
    const p = picks[id], w = p.ref, rgb = ageRamp(w.ageU).hex;
    const flowTxt = w.flow === "buy" ? `<span style="color:#4ade80">+${Math.round(w.net).toLocaleString()} added (${winLbl})</span>`
      : w.flow === "sell" ? `<span style="color:#fb7185">${Math.round(w.net).toLocaleString()} sold (${winLbl})</span>`
      : `<span style="color:#94a3b8">flat (${winLbl})</span>`;
    tip.innerHTML =
      `<div style="font-family:${MONO};font-size:11px;color:#94a3b8">${w.a.slice(0, 6)}…${w.a.slice(-4)}</div>` +
      `<div style="font-weight:800;font-size:15px;margin:2px 0"><span style="color:${rgb}">${kM(w.bal)}</span> SPX · ${w.cohort}</div>` +
      `<div style="font-size:12px;color:#c7d2e4">held ${Math.round(w.days / 30)} months · ${flowTxt}</div>`;
    tip.style.display = "block";
    tip.style.left = `${e.clientX - r.left}px`; tip.style.top = `${e.clientY - r.top}px`;
    cage.position.set(p.x, p.h / 2, p.z); cage.scale.set(FOOT + 0.12, p.h + 0.12, FOOT + 0.12); cage.visible = true;
  };
  const onLeave = () => { hovered = -1; tip.style.display = "none"; cage.visible = false; };
  renderer.domElement.addEventListener("pointermove", onMove);
  renderer.domElement.addEventListener("pointerleave", onLeave);

  const drs = makeDrs({ maxRatio: Math.min(devicePixelRatio, 2), minRatio: 0.55, apply: r => renderer.setPixelRatio(r) });
  let raf = 0;
  const loop = t => { raf = requestAnimationFrame(loop); drs.tick(t); controls.update(); renderer.render(scene, cam); labelR.render(scene, cam); };
  raf = requestAnimationFrame(loop);

  const onResize = () => { const w = el.clientWidth, h = el.clientHeight || VH; if (!w) return; cam.aspect = w / h; cam.updateProjectionMatrix(); renderer.setSize(w, h); labelR.setSize(w, h); };
  window.addEventListener("resize", onResize);

  window.__whaleStats = () => ({
    whales: picks.length, cohorts: cohorts.map(c => ({ label: c.label, n: c.n, sentiment: c.sentiment })),
    drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
    pixelRatio: +renderer.getPixelRatio().toFixed(2), frameMs: drs.frameMs,
  });

  // Owner video export: record a smooth orbit of the live canvas → downloadable clip, entirely
  // client-side. We drive the orbit with OrbitControls' OWN autoRotate (advanced by the render loop's
  // controls.update() every frame) rather than setting the azimuth from a second loop — the latter
  // fought the render loop and left the recording static. Speed is tuned to ~one revolution over the
  // clip; the previous autoRotate state is restored when done. Revealed in the UI only behind ?rec=1.
  window.__whaleRecord = ({ seconds = 12, fps = 60, onTick } = {}) => {
    const wasAuto = controls.autoRotate, wasSpeed = controls.autoRotateSpeed;
    controls.autoRotate = true; controls.autoRotateSpeed = 60 / seconds;  // ~one orbit over `seconds` at 60fps
    return recordCanvas(renderer.domElement, { seconds, fps, onTick })
      .finally(() => { controls.autoRotate = wasAuto; controls.autoRotateSpeed = wasSpeed; });
  };

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", onResize);
    renderer.domElement.removeEventListener("pointermove", onMove);
    renderer.domElement.removeEventListener("pointerleave", onLeave);
    renderer.domElement.removeEventListener("pointerdown", onDown);
    renderer.domElement.removeEventListener("pointerup", onUp);
    delete window.__whaleStats;
    delete window.__whaleRecord;
    controls.dispose();
    disposables.forEach(d => d.dispose?.());
    ownMats.forEach(m => m.dispose?.());
    renderer.dispose();
    tip.remove();
    if (labelR.domElement.parentNode) labelR.domElement.parentNode.removeChild(labelR.domElement);
    if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
  };
}

const GUIDE = [
  { swatch: "linear-gradient(90deg,#d97706,#22d3ee)", title: "Colour is age", text: "warm amber for wallets that arrived recently, cyan for the ones that have held longest." },
  { swatch: "#94a3b8", title: "Height is size", text: "each bar sits on a log SPX axis — 100k at the floor, the multi-million whales towering above." },
  { swatch: "#22c55e", title: "A green beam = buying", text: "the wallet added over the chosen window (30d / 1w / 1d). Taller beam, bigger move." },
  { swatch: "#f43f5e", title: "A red beam = selling", text: "the wallet reduced its position. No beam means it sat still." },
];

function Toggle({ on, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontFamily: SANS, fontSize: 13, fontWeight: 600,
      background: on ? "rgba(94,234,212,0.16)" : "rgba(255,255,255,0.05)",
      border: `1px solid ${on ? "#5eead4" : "rgba(255,255,255,0.14)"}`, color: on ? "#5eead4" : "#94a3b8",
    }}>{children}</button>
  );
}

// Flow-window options, longest first. The buttons shown are the intersection of these with the
// windows the data actually carries (whales.json `lookback`), so "1 day" only appears once the
// daily on-chain refresh has banked a d1 delta — no dead button before then.
const WINDOWS = [{ d: 30, label: "30 days" }, { d: 7, label: "1 week" }, { d: 1, label: "1 day" }];

function Watcher({ isMobile }) {
  const host = useRef(null);
  const [data, setData] = useState(null);     // null=loading, false=failed, object=ok
  const [onlyMovers, setOnlyMovers] = useState(false);
  const [flowWin, setFlowWin] = useState(30); // net-flow lookback the beams read
  const [square, setSquare] = useState(() => {   // ?sq=1 (from the control panel) opens straight in 1:1
    try { return new URLSearchParams(window.location.search).get("sq") === "1"; } catch { return false; }
  });
  const [recSecs, setRecSecs] = useState(12);
  const [rec, setRec] = useState({ state: "idle", pct: 0, msg: "" }); // idle | recording | error
  const [selWhale, setSelWhale] = useState(null); // clicked tower → its Zerion card

  // Owner-only video export, revealed behind ?rec=1 (or a local flag the control panel sets).
  const showRec = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const q = new URLSearchParams(window.location.search).get("rec") === "1";
      return (q || localStorage.getItem("spx-rec") === "1") && recorderSupported();
    } catch { return false; }
  })[0];

  useEffect(() => { let off = false; loadWhales().then(d => { if (!off) setData(d ?? false); }); return () => { off = true; }; }, []);

  const doRecord = async () => {
    if (!window.__whaleRecord || rec.state === "recording") return;
    setRec({ state: "recording", pct: 0, msg: "" });
    try {
      const { blob, ext } = await window.__whaleRecord({ seconds: recSecs, fps: 60, onTick: p => setRec(r => ({ ...r, pct: p })) });
      downloadBlob(blob, `whales-watching-${(data?.updated || "").slice(0, 10) || "clip"}.${ext}`);
      setRec({ state: "idle", pct: 0, msg: "" });
    } catch (e) {
      setRec({ state: "error", pct: 0, msg: e.message || "recording failed" });
    }
  };

  // ?auto=1 → fire one record automatically once the scene has settled (control-panel one-click).
  useEffect(() => {
    if (!showRec || !data) return;
    let cancelled = false;
    try { if (new URLSearchParams(window.location.search).get("auto") !== "1") return; } catch { return; }
    const t = setTimeout(() => { if (!cancelled) doRecord(); }, 2800);
    return () => { cancelled = true; clearTimeout(t); };
  }, [showRec, data]); // eslint-disable-line react-hooks/exhaustive-deps

  const windows = WINDOWS.filter(w => (data?.lookback || [7, 30]).includes(w.d));
  // If the current selection isn't offered by this data, fall back to the longest available.
  useEffect(() => {
    if (data && windows.length && !windows.some(w => w.d === flowWin)) setFlowWin(windows[0].d);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!data || !host.current) return;
    let cleanup = () => {};
    setSelWhale(null);   // the picks change when the scene rebuilds → drop any stale selection
    try { cleanup = buildScene(host.current, data, { onlyMovers, isMobile, flowWin, onPick: setSelWhale }); }
    catch (e) { console.error("WhalesWatching:", e); }
    return () => cleanup();
  }, [data, onlyMovers, isMobile, flowWin, square]);

  const total = data && data.wallets ? data.wallets.filter(w => w.bal >= 1e5).length : 0;

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 14px", fontFamily: SANS }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between", margin: "6px 0 12px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <Toggle on={onlyMovers} onClick={() => setOnlyMovers(v => !v)}>Only movers</Toggle>
          <Toggle on={square} onClick={() => setSquare(v => !v)}>1:1 frame</Toggle>
          {showRec && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <button onClick={doRecord} disabled={rec.state === "recording"} style={{
                padding: "6px 12px", borderRadius: 8, cursor: rec.state === "recording" ? "default" : "pointer",
                fontFamily: SANS, fontSize: 13, fontWeight: 700,
                background: rec.state === "recording" ? "rgba(251,113,133,0.16)" : "rgba(94,234,212,0.16)",
                border: `1px solid ${rec.state === "recording" ? "#fb7185" : "#5eead4"}`, color: rec.state === "recording" ? "#fb7185" : "#5eead4",
              }}>{rec.state === "recording" ? `● Recording ${Math.round(rec.pct * 100)}%` : "🎥 Record"}</button>
              {rec.state !== "recording" && (
                <select value={recSecs} onChange={e => setRecSecs(+e.target.value)} style={{
                  padding: "6px 8px", borderRadius: 8, fontFamily: MONO, fontSize: 12, cursor: "pointer",
                  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.14)", color: "#94a3b8",
                }}>
                  <option value={8}>8s</option><option value={12}>12s</option><option value={20}>20s</option>
                </select>
              )}
              {rec.state === "error" && <span style={{ fontFamily: MONO, fontSize: 11.5, color: "#fb7185", maxWidth: 220 }}>{rec.msg}</span>}
            </div>
          )}
          {windows.length > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: MONO, fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>flow over</span>
              <div style={{ display: "inline-flex", borderRadius: 8, overflow: "hidden", border: "1px solid rgba(255,255,255,0.14)" }}>
                {windows.map((w, i) => {
                  const on = flowWin === w.d;
                  return (
                    <button key={w.d} onClick={() => setFlowWin(w.d)} style={{
                      padding: "6px 12px", cursor: "pointer", fontFamily: SANS, fontSize: 13, fontWeight: 600, border: "none",
                      borderLeft: i ? "1px solid rgba(255,255,255,0.12)" : "none",
                      background: on ? "rgba(94,234,212,0.16)" : "transparent", color: on ? "#5eead4" : "#94a3b8",
                    }}>{w.label}</button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        {data && <div style={{ fontFamily: MONO, fontSize: 12, color: "#64748b" }}>{total.toLocaleString()} whales ≥100k · drag to orbit · {data.updated}</div>}
      </div>

      {data === false && (
        <div style={{ padding: "60px 20px", textAlign: "center", color: "#94a3b8" }}>
          Whale data is being rebuilt — check back after the next on-chain refresh.
        </div>
      )}
      {square ? (
        // a self-contained 1:1 card — title + live count + wordmark baked in, so a screenshot of
        // just this card drops straight into a tweet with nothing to crop.
        <div style={{
          width: "min(94vw, 640px)", aspectRatio: "1 / 1", margin: "0 auto", display: "flex", flexDirection: "column",
          borderRadius: 14, overflow: "hidden", border: "1px solid rgba(94,234,212,0.35)", background: "#0a0e1c",
          boxShadow: "0 16px 50px rgba(0,0,0,0.5)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 15px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>🐋</span>
              <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 15.5, color: "#e6edf7", letterSpacing: 0.2 }}>Whales Watching</span>
            </div>
            <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 700, color: "#5eead4" }}>{total.toLocaleString()} whales ≥100k</span>
          </div>
          <div ref={host} style={{ position: "relative", flex: "1 1 auto", minHeight: 0, background: "#0a0e1c", cursor: "grab" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 15px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <span style={{ fontFamily: MONO, fontSize: 10.5, color: "#7c8a9e" }}>{windows.find(w => w.d === flowWin)?.label || "30 days"} flow · self-custody · not a signal</span>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: "#94a3b8", letterSpacing: 0.3 }}>spx6900rainbow.xyz</span>
          </div>
        </div>
      ) : (
        <div ref={host} style={{ position: "relative", width: "100%", height: isMobile ? "min(52vh, 470px)" : "min(80vh, 920px)", minHeight: isMobile ? 340 : 460, borderRadius: 12, overflow: "hidden", background: "#0a0e1c", cursor: "grab" }} />
      )}

      {selWhale && (
        <div style={{ margin: "12px 0 2px" }}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
            <button onClick={() => setSelWhale(null)} style={{
              fontFamily: MONO, fontSize: 11.5, cursor: "pointer", padding: "3px 9px", borderRadius: 6,
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.14)", color: "#94a3b8",
            }}>× close</button>
          </div>
          <WalletCard w={selWhale} isMobile={isMobile} accent="#5eead4"
            flow={selWhale.net || 0} flowUnit=" SPX"
            lines={[
              `${kM(selWhale.bal)} SPX · held ${Math.round((selWhale.days || 0) / 30)} mo${selWhale.cohort ? ` · ${selWhale.cohort}` : ""}`,
              selWhale.net ? `net over ${flowWin === 1 ? "24h" : flowWin + "d"}` : "no move in this window",
            ]} />
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,1fr)", gap: 12, margin: "14px 0 6px" }}>
        {GUIDE.map((g, i) => (
          <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
            <span style={{ width: 13, height: 13, borderRadius: 3, background: g.swatch, flex: "0 0 auto", marginTop: 3 }} />
            <div style={{ fontSize: 12.5, color: "#a7b3c6", lineHeight: 1.45 }}>
              <b style={{ color: "#e2e8f0" }}>{g.title}.</b> {g.text}
            </div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12.5, color: "#7c8a9e", lineHeight: 1.6, margin: "6px 2px 0" }}>
        Every bar is one wallet holding ≥100,000 SPX, grouped into four size cohorts along the floor. The slab and
        label under each cluster read its overall net flow over the window you pick above ({windows.find(w => w.d === flowWin)?.label || "30 days"}).
        Cost basis and infra (exchanges, LP, bridge) are excluded — these are real self-custody holders. A distribution snapshot, not a signal.
      </p>
    </div>
  );
}

// Inside the gate: a City (3D skyline) / Live board (2D pulsing grid) switch. Same watched wallets,
// two lenses — the 3D scene for the landscape, the grid for glanceable live buy/sell.
function WhalesInner({ isMobile }) {
  const [mode, setMode] = useState("city");
  const seg = on => ({
    padding: "6px 16px", cursor: "pointer", fontFamily: SANS, fontSize: 13, fontWeight: 600, border: "none",
    background: on ? "rgba(94,234,212,0.16)" : "transparent", color: on ? "#5eead4" : "#94a3b8",
  });
  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 14px" }}>
      <div style={{ display: "flex", justifyContent: "center", margin: "8px 0 6px" }}>
        <div style={{ display: "inline-flex", borderRadius: 9, overflow: "hidden", border: "1px solid rgba(255,255,255,0.14)" }}>
          <button onClick={() => setMode("city")} style={{ ...seg(mode === "city"), borderRight: "1px solid rgba(255,255,255,0.12)" }}>City · 3D</button>
          <button onClick={() => setMode("board")} style={{ ...seg(mode === "board"), borderRight: "1px solid rgba(255,255,255,0.12)" }}>Live board</button>
          <button onClick={() => setMode("mosaic")} style={seg(mode === "mosaic")}>Mosaic</button>
        </div>
      </div>
      {mode === "city" ? <Watcher isMobile={isMobile} /> : mode === "mosaic" ? <WhaleMosaic isMobile={isMobile} /> : <WhaleBoard isMobile={isMobile} />}
    </div>
  );
}

export default function WhalesWatching({ isMobile }) {
  return (
    <CityGate title="Whales Watching" accent="#5eead4" unit="whale" locked guide={GUIDE_INTRO}>
      <WhalesInner isMobile={isMobile} />
    </CityGate>
  );
}

// Cube-appropriate arrival explainer for the gate (the default one talks about buildings/streets).
const GUIDE_INTRO = {
  emoji: "🐋",
  lead: "Every bar is one whale — a wallet holding 100,000 SPX or more. Here's how to read it:",
  rows: [
    { swatch: "linear-gradient(90deg,#d97706,#22d3ee)", title: "Colour is age", text: "warm amber for wallets that arrived recently, cyan for the ones that have held longest." },
    { swatch: "#94a3b8", title: "Height is size", text: "each bar sits on a log SPX axis — 100k to the multi-million whales." },
    { swatch: "#22c55e", title: "Green beam = buying", text: "the wallet added over the window you pick — 30 days, 1 week or 1 day." },
    { swatch: "#f43f5e", title: "Red beam = selling", text: "it reduced its position. No beam means it sat still." },
  ],
  footer: "Bars are grouped into four size cohorts; the label under each cluster reads its overall flow. Real data, self-custody holders only.",
};
