import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { makeDrs } from "./city-drs.js";
import { recordCanvas } from "./canvas-record.js";
import { ageRamp } from "./whale-cohorts.js";

// The shared three.js "skyline" scene, extracted verbatim from Whales Watching so a second grouping
// (the entity/cluster city) renders through the SAME proven rig instead of a copy that could drift.
// It consumes a MODEL — { cohorts, minBal, maxBal, bounds } — exactly as buildCohorts/buildClusterGroups
// emit it: each cohort is a group of cubes on a platform, height = balance (log axis), colour = age
// (amber→cyan), a beam over a cube = its net flow (green buy / red sell), and a rim + label read the
// group's sentiment. The caller builds the model (from whales.json size cohorts, or from entity
// clusters) and passes display labels via `opts`. GPU render is unverified in the dev sandbox
// (software rasteriser); check window[opts.statsName]() on real hardware.

const FOOT = 1.15;               // bar footprint (world units)
const HMIN = 1.2, HMAX = 18;     // world-height range across the log size axis
const AGE_BINS = 12;             // age-ramp buckets → one merged mesh + material each
const GREEN = 0x22c55e, RED = 0xf43f5e;
const GRID_A = 0x243258, GRID_B = 0x18223c, AXIS = 0x2a3550;
const FLOOR_COL = 0x0e1526;
const PAD_COL = 0x1a2440;
const kM = v => v >= 1e6 ? (v / 1e6 % 1 ? (v / 1e6).toFixed(1) : v / 1e6) + "M" : Math.round(v / 1e3) + "k";

export function renderSkyline(el, model, opts = {}) {
  const {
    isMobile, onPick,
    winLbl = "30d",
    axisLabel = "size cohorts →",
    countNoun = "",                          // "" (whales) | "wallets" (clusters) in the group sub-label
    accent = 0x5eead4,
    statsName = "__skylineStats",
    recordName = "__skylineRecord",
  } = opts;

  const cohorts = model.cohorts;
  const { minBal, maxBal, bounds } = model;
  const lnLo = Math.log(minBal), lnHi = Math.log(Math.max(maxBal, minBal * 1.0001));
  const heightOf = bal => HMIN + (HMAX - HMIN) * Math.max(0, Math.min(1, (Math.log(bal) - lnLo) / (lnHi - lnLo)));

  const W = el.clientWidth, VH = el.clientHeight || (isMobile ? 440 : 560);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0e1c);
  const span = Math.max(bounds.width, bounds.depth, 40);

  const cam = new THREE.PerspectiveCamera(46, W / VH, 0.1, 2000);
  const portrait = (W / VH) < 1;
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

  scene.add(new THREE.AmbientLight(0xffffff, 0.78));
  const d1 = new THREE.DirectionalLight(0xffffff, 0.85); d1.position.set(span * 0.4, span * 0.7, span * 0.3); scene.add(d1);
  const d2 = new THREE.DirectionalLight(0x88aaff, 0.35); d2.position.set(-span * 0.3, span * 0.3, -span * 0.2); scene.add(d2);

  const gridSize = Math.max(bounds.width, bounds.depth) * 1.6;
  const groundMat = new THREE.MeshLambertMaterial({ color: FLOOR_COL });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(gridSize * 2, gridSize * 2), groundMat);
  ground.rotation.x = -Math.PI / 2; scene.add(ground);
  const grid = new THREE.GridHelper(gridSize, 20, GRID_A, GRID_B);
  grid.position.y = 0.02; grid.material.transparent = true; grid.material.opacity = 0.5; scene.add(grid);
  scene.fog = new THREE.Fog(new THREE.Color(FLOOR_COL), span * 1.5, span * 3.8);

  const disposables = [ground.geometry, groundMat, grid.geometry, grid.material];
  const ownMats = [];

  const xL = -bounds.width / 2 - 1.5, xR = bounds.width / 2 + 1.5;
  const zB = -bounds.depth / 2 - 1.2, zF = bounds.depth / 2 + 1.2;
  const lineMat = new THREE.LineBasicMaterial({ color: AXIS, transparent: true, opacity: 0.6 });
  disposables.push(lineMat);
  const seg = (a, b) => { const g = new THREE.BufferGeometry().setFromPoints([a, b]); const l = new THREE.Line(g, lineMat); scene.add(l); disposables.push(g); };
  const ticks = [1e4, 2.5e4, 5e4, 1e5, 2.5e5, 5e5, 1e6, 2.5e6, 5e6, 1e7].filter(v => v >= minBal * 0.999 && v <= maxBal * 1.001);
  ticks.forEach(v => {
    const y = heightOf(v);
    seg(new THREE.Vector3(xL, y, zB), new THREE.Vector3(xR, y, zB));
    seg(new THREE.Vector3(xL, y, zB), new THREE.Vector3(xL, y, zF));
    addLabel(kM(v), xL - 1.4, y, zB, "#9aa6bd", 11);
  });
  addLabel("SPX held ↑", xL - 1.4, HMAX + 1.8, zB, "#cbd5e1", 12.5, 700);
  addLabel(axisLabel, xR - 6, 0.2, zF + 0.6, "#cbd5e1", 12.5, 700);

  const padMat = new THREE.MeshLambertMaterial({ color: PAD_COL });
  ownMats.push(padMat);
  cohorts.forEach(c => {
    const cz = c.center.z || 0;
    const pad = new THREE.Mesh(new THREE.BoxGeometry(c.platform.w, 0.16, c.platform.d), padMat);
    pad.position.set(c.center.x, 0.09, cz);
    scene.add(pad); disposables.push(pad.geometry);

    const rimHex = c.sentiment === "accumulating" ? GREEN : c.sentiment === "distributing" ? RED : 0x5b6784;
    const hw = c.platform.w / 2, hd = c.platform.d / 2;
    const ring = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd], [-hw, -hd]].map(([x, z]) => new THREE.Vector3(c.center.x + x, 0.18, cz + z));
    const rimG = new THREE.BufferGeometry().setFromPoints(ring);
    const rimM = new THREE.LineBasicMaterial({ color: rimHex, transparent: true, opacity: c.sentiment === "balanced" ? 0.5 : 0.9 });
    scene.add(new THREE.Line(rimG, rimM)); disposables.push(rimG, rimM);

    if (!c.n) return;
    const np = c.netPct >= 0 ? `+${c.netPct.toFixed(2)}%` : `${c.netPct.toFixed(2)}%`;
    const scol = c.sentiment === "accumulating" ? "#4ade80" : c.sentiment === "distributing" ? "#fb7185" : "#94a3b8";
    const div = document.createElement("div");
    div.style.cssText = "text-align:center;pointer-events:none";
    div.innerHTML =
      `<div style="font:800 13px 'Space Grotesk',sans-serif;color:#e6edf7;letter-spacing:.3px;text-shadow:0 1px 3px #000">${c.label}</div>` +
      `<div style="font:700 11px 'Space Grotesk',sans-serif;color:${scol};text-shadow:0 1px 3px #000">${c.n}${countNoun ? " " + countNoun : ""} · net ${np} · ${c.sentiment}</div>`;
    const label = new CSS2DObject(div);
    label.position.set(c.center.x, HMAX * 0.66, cz - c.platform.d / 2);
    scene.add(label);
  });

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
    addMerged(geos, new THREE.MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: 0.18 }));
  });
  const beamMat = c => new THREE.MeshLambertMaterial({ color: new THREE.Color(c), emissive: new THREE.Color(c), emissiveIntensity: 0.9 });
  addMerged(beamBuy, beamMat(GREEN));
  addMerged(beamSell, beamMat(RED));

  const pickGeo = new THREE.BoxGeometry(1, 1, 1);
  const pickMat = new THREE.MeshBasicMaterial({ visible: false });
  const pickMesh = new THREE.InstancedMesh(pickGeo, pickMat, Math.max(1, picks.length));
  const M = new THREE.Matrix4();
  picks.forEach((p, i) => { M.makeScale(FOOT, p.h, FOOT); M.setPosition(p.x, p.h / 2, p.z); pickMesh.setMatrixAt(i, M); });
  pickMesh.instanceMatrix.needsUpdate = true;
  scene.add(pickMesh); disposables.push(pickGeo, pickMat);

  const cageMat = new THREE.MeshBasicMaterial({ color: accent, wireframe: true, transparent: true, opacity: 0.9 });
  const cage = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), cageMat);
  cage.visible = false; scene.add(cage); disposables.push(cage.geometry, cageMat);

  const accentHex = "#" + new THREE.Color(accent).getHexString();
  const tip = document.createElement("div");
  Object.assign(tip.style, {
    position: "absolute", pointerEvents: "none", padding: "9px 12px", borderRadius: "11px", display: "none",
    background: "rgba(8,11,20,0.97)", border: `1px solid ${accentHex}`, color: "#e2e8f0",
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
  let downXY = null;
  const onDown = e => { downXY = [e.clientX, e.clientY]; stopSpin(); };
  const onUp = e => {
    if (!downXY) return;
    const moved = Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]); downXY = null;
    if (moved > 6 || !onPick) return;
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
      `<div style="font-family:ui-monospace,monospace;font-size:11px;color:#94a3b8">${w.a.slice(0, 6)}…${w.a.slice(-4)}</div>` +
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

  window[statsName] = () => ({
    cubes: picks.length, groups: cohorts.map(c => ({ label: c.label, n: c.n, sentiment: c.sentiment })),
    drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
    pixelRatio: +renderer.getPixelRatio().toFixed(2), frameMs: drs.frameMs,
  });

  window[recordName] = ({ seconds = 12, fps = 60, onTick } = {}) => {
    const wasAuto = controls.autoRotate, wasSpeed = controls.autoRotateSpeed;
    controls.autoRotate = true; controls.autoRotateSpeed = 60 / seconds;
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
    delete window[statsName];
    delete window[recordName];
    controls.dispose();
    disposables.forEach(d => d.dispose?.());
    ownMats.forEach(m => m.dispose?.());
    renderer.dispose();
    tip.remove();
    if (labelR.domElement.parentNode) labelR.domElement.parentNode.removeChild(labelR.domElement);
    if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
  };
}
