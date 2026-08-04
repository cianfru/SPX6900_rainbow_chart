import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { skyEnv, TIMES } from "./city-render.js";
import { makeDrs } from "./city-drs.js";
import { buildCohorts, ageRamp } from "./whale-cohorts.js";
import { loadWhales } from "./history-data.js";
import CityGate from "./CityGate.jsx";
import { SANS, MONO } from "./chart-ui.jsx";

// "WHALES WATCHING" — a deliberately ABSTRACT whale-activity monitor. Every wallet ≥100k SPX is a
// CUBE, grouped on the ground into four size cohorts. Height = holding size, colour = holder age
// (warm amber = new → cyan = long-held), and a BEAM over each cube shows 30-day net flow: green =
// accumulating, red = distributing, none = flat. A slab + label under each cluster reads the
// cohort's overall sentiment. One glance answers "are the big wallets buying or selling, and which
// size band is moving?" — NOT the realistic Whale City; this is behaviour, not geography.
//
// ⚠ RENDERING IS UNVERIFIED IN THE DEV SANDBOX (CPU software rasteriser). The DATA/layout math lives
// in ../whale-cohorts.js and is unit-tested; this file mirrors Skyline3D's proven three bootstrap
// (ACES tone mapping, sky env, hemisphere fill for the top-down view, merged geometry per bucket so
// draw calls stay flat, adaptive resolution, CSS2D labels). Check window.__whaleStats() on a real GPU.

const FOOT = 1.1;               // cube footprint (world units)
const HMIN = 1.6, HMAX = 17;    // height range for the log/√ size curve
const AGE_BINS = 12;            // age-ramp buckets → one merged mesh + material each
const GREEN = 0x22c55e, RED = 0xf43f5e;

function buildScene(el, data, { time, onlyMovers, isMobile, onPick }) {
  const TOD = TIMES[time] || TIMES.dusk;
  const wallets = onlyMovers ? data.wallets.filter(w => (w.d30 || 0) !== 0) : data.wallets;
  const model = buildCohorts(wallets);
  const cohorts = model.cohorts;
  const bounds = model.bounds;

  const W = el.clientWidth, VH = isMobile ? 460 : 600;
  const scene = new THREE.Scene();
  const span = Math.max(bounds.width, bounds.depth, 40);
  scene.fog = new THREE.Fog(new THREE.Color(TOD.horizon), span * 1.1, span * 3.4);

  const cam = new THREE.PerspectiveCamera(46, W / VH, 0.5, 4000);
  cam.position.set(span * 0.08, span * 0.42, span * 0.80);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(W, VH);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = TOD.exposure;
  el.appendChild(renderer.domElement);
  const { env, sky } = skyEnv(renderer, TOD);
  scene.environment = env; scene.background = sky;

  const labelR = new CSS2DRenderer(); labelR.setSize(W, VH);
  Object.assign(labelR.domElement.style, { position: "absolute", top: "0", left: "0", pointerEvents: "none" });
  el.appendChild(labelR.domElement);

  const tip = document.createElement("div");
  Object.assign(tip.style, {
    position: "absolute", pointerEvents: "none", padding: "9px 12px", borderRadius: "11px", display: "none",
    background: "rgba(8,11,20,0.97)", border: "1px solid #5eead4", color: "#e2e8f0",
    font: "500 12.5px 'Space Grotesk', system-ui, sans-serif", zIndex: "5", width: "232px",
    boxShadow: "0 10px 34px rgba(0,0,0,0.6)", transform: "translate(-50%, -114%)", lineHeight: "1.5",
  });
  el.appendChild(tip);

  scene.add(new THREE.AmbientLight(0xffffff, TOD.amb));
  // Hemisphere fill keeps the top-down view from going black (sky env barely lights a flat top).
  scene.add(new THREE.HemisphereLight(new THREE.Color(TOD.top), new THREE.Color(TOD.ground), TOD.hemi));
  const sun = new THREE.DirectionalLight(TOD.sun, TOD.sunI);
  sun.position.set(span * 0.5, span * 0.8, span * 0.35);
  scene.add(sun);

  // ── ground ──────────────────────────────────────────────────────────────────
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(span * 6, span * 6),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(TOD.ground).multiplyScalar(0.6), roughness: 0.98 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.32;
  scene.add(ground);

  const disposables = [ground.geometry, ground.material];
  const ownMats = [];

  // ── cohort platforms + sentiment labels ────────────────────────────────────
  cohorts.forEach(c => {
    const tint = c.sentiment === "accumulating" ? GREEN : c.sentiment === "distributing" ? RED : 0x475069;
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(tint).multiplyScalar(c.sentiment === "balanced" ? 0.5 : 0.28),
      emissive: new THREE.Color(tint), emissiveIntensity: c.sentiment === "balanced" ? 0.05 : 0.22,
      roughness: 0.85, metalness: 0.0,
    });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(c.platform.w, 0.3, c.platform.d), mat);
    slab.position.set(c.center.x, -0.16, 0);
    scene.add(slab); disposables.push(slab.geometry); ownMats.push(mat);

    if (!c.n) return;
    const np = c.netPct >= 0 ? `+${c.netPct.toFixed(2)}%` : `${c.netPct.toFixed(2)}%`;
    const scol = c.sentiment === "accumulating" ? "#4ade80" : c.sentiment === "distributing" ? "#fb7185" : "#94a3b8";
    const div = document.createElement("div");
    div.style.cssText = "text-align:center;pointer-events:none;transform:translateY(-6px)";
    div.innerHTML =
      `<div style="font:800 14px 'Space Grotesk',sans-serif;color:#e6edf7;letter-spacing:.3px;text-shadow:0 2px 8px #000">${c.label}</div>` +
      `<div style="font:700 12px 'Space Grotesk',sans-serif;color:${scol};text-shadow:0 2px 8px #000">${c.n} · net ${np} · ${c.sentiment}</div>`;
    const label = new CSS2DObject(div);
    label.position.set(c.center.x, HMAX * 0.62, -c.platform.d / 2 - 1.2);
    scene.add(label);
  });

  // ── cubes: one merged mesh per age bin ──────────────────────────────────────
  const cubeBins = Array.from({ length: AGE_BINS }, () => []);
  const beamBuy = [], beamSell = [];
  const picks = [];             // { x, z, h, w } per cube, for hover
  const all = cohorts.flatMap(c => c.wallets.map(w => ({ ...w, cohort: c.label })));
  all.forEach(w => {
    const h = HMIN + (HMAX - HMIN) * w.hU;
    const g = new THREE.BoxGeometry(FOOT, h, FOOT);
    g.translate(w.x, h / 2, w.z);
    const ai = Math.min(AGE_BINS - 1, Math.round(w.ageU * (AGE_BINS - 1)));
    cubeBins[ai].push(g);
    picks.push({ x: w.x, z: w.z, h, ref: w });
    // beam: a thin emissive column above movers, taller with bigger relative flow
    if (w.flow !== "flat") {
      const mag = Math.min(1, Math.abs(w.d30) / Math.max(1, w.bal) * 6);
      const bh = 2.4 + 6 * mag;
      const bg = new THREE.BoxGeometry(0.18, bh, 0.18);
      bg.translate(w.x, h + 0.5 + bh / 2, w.z);
      (w.flow === "buy" ? beamBuy : beamSell).push(bg);
    }
  });

  const addMerged = (geos, mat) => {
    if (!geos.length) return;
    const merged = mergeGeometries(geos, false);
    geos.forEach(g => g.dispose());
    if (!merged) return;
    scene.add(new THREE.Mesh(merged, mat));
    disposables.push(merged); ownMats.push(mat);
  };

  cubeBins.forEach((geos, ai) => {
    const hex = ageRamp(ai / (AGE_BINS - 1)).hex;
    const col = new THREE.Color(hex);
    const mat = new THREE.MeshStandardMaterial({
      color: col.clone().multiplyScalar(0.5), emissive: col, emissiveIntensity: TOD.win * 0.55,
      roughness: 0.42, metalness: 0.12, envMapIntensity: 0.8,
    });
    addMerged(geos, mat);
  });
  const beamMat = c => new THREE.MeshStandardMaterial({ color: new THREE.Color(c), emissive: new THREE.Color(c), emissiveIntensity: 1.7, roughness: 0.3 });
  addMerged(beamBuy, beamMat(GREEN));
  addMerged(beamSell, beamMat(RED));

  // ── hover picking: one invisible InstancedMesh of the cube boxes ────────────
  const pickGeo = new THREE.BoxGeometry(1, 1, 1);
  const pickMat = new THREE.MeshBasicMaterial({ visible: false });
  const pickMesh = new THREE.InstancedMesh(pickGeo, pickMat, Math.max(1, picks.length));
  const M = new THREE.Matrix4();
  picks.forEach((p, i) => { M.makeScale(FOOT, p.h, FOOT); M.setPosition(p.x, p.h / 2, p.z); pickMesh.setMatrixAt(i, M); });
  pickMesh.instanceMatrix.needsUpdate = true;
  scene.add(pickMesh);
  disposables.push(pickGeo, pickMat);

  const cageMat = new THREE.MeshBasicMaterial({ color: 0x5eead4, wireframe: true, transparent: true, opacity: 0.9 });
  const cage = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), cageMat);
  cage.visible = false; scene.add(cage);
  disposables.push(cage.geometry, cageMat);

  const controls = new OrbitControls(cam, renderer.domElement);
  controls.target.set(0, HMAX * 0.42, 0);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.495;   // don't dive under the ground
  controls.minDistance = 8; controls.maxDistance = span * 3;

  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
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
    const flowTxt = w.flow === "buy" ? `<span style="color:#4ade80">+${Math.round(w.d30).toLocaleString()} added (30d)</span>`
      : w.flow === "sell" ? `<span style="color:#fb7185">${Math.round(w.d30).toLocaleString()} sold (30d)</span>`
      : `<span style="color:#94a3b8">flat (30d)</span>`;
    tip.innerHTML =
      `<div style="font-family:${MONO};font-size:11px;color:#94a3b8">${w.a.slice(0, 6)}…${w.a.slice(-4)}</div>` +
      `<div style="font-weight:800;font-size:15px;margin:2px 0"><span style="color:${rgb}">${(w.bal / 1e6 >= 1 ? (w.bal / 1e6).toFixed(2) + "M" : Math.round(w.bal / 1e3) + "k")}</span> SPX · ${w.cohort}</div>` +
      `<div style="font-size:12px;color:#c7d2e4">held ${Math.round(w.days / 30)} months · ${flowTxt}</div>`;
    tip.style.display = "block";
    tip.style.left = `${e.clientX - r.left}px`; tip.style.top = `${e.clientY - r.top}px`;
    cage.position.set(p.x, p.h / 2, p.z); cage.scale.set(FOOT + 0.12, p.h + 0.12, FOOT + 0.12); cage.visible = true;
  };
  const onLeave = () => { hovered = -1; tip.style.display = "none"; cage.visible = false; };
  const onClick = () => { if (hovered >= 0 && onPick) onPick(picks[hovered].ref); };
  renderer.domElement.addEventListener("pointermove", onMove);
  renderer.domElement.addEventListener("pointerleave", onLeave);
  renderer.domElement.addEventListener("click", onClick);

  const drs = makeDrs({ maxRatio: Math.min(devicePixelRatio, 2), minRatio: 0.55, apply: r => renderer.setPixelRatio(r) });
  let raf = 0;
  const loop = t => {
    raf = requestAnimationFrame(loop);
    drs.tick(t);
    controls.update();
    renderer.render(scene, cam);
    labelR.render(scene, cam);
  };
  raf = requestAnimationFrame(loop);

  const onResize = () => {
    const w = el.clientWidth; if (!w) return;
    cam.aspect = w / VH; cam.updateProjectionMatrix();
    renderer.setSize(w, VH); labelR.setSize(w, VH);
  };
  window.addEventListener("resize", onResize);

  window.__whaleStats = () => ({
    whales: picks.length, cohorts: cohorts.map(c => ({ label: c.label, n: c.n, sentiment: c.sentiment })),
    drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
    pixelRatio: +renderer.getPixelRatio().toFixed(2), frameMs: drs.frameMs,
  });

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", onResize);
    renderer.domElement.removeEventListener("pointermove", onMove);
    renderer.domElement.removeEventListener("pointerleave", onLeave);
    renderer.domElement.removeEventListener("click", onClick);
    delete window.__whaleStats;
    controls.dispose();
    disposables.forEach(d => d.dispose?.());
    ownMats.forEach(m => m.dispose?.());
    env?.dispose?.(); sky?.dispose?.();
    renderer.dispose();
    tip.remove();
    if (labelR.domElement.parentNode) labelR.domElement.parentNode.removeChild(labelR.domElement);
    if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
  };
}

const GUIDE = [
  { swatch: "linear-gradient(90deg,#d97706,#22d3ee)", title: "Colour is age", text: "warm amber for wallets that arrived recently, cyan for the ones that have held longest." },
  { swatch: "#94a3b8", title: "Height is size", text: "how much the wallet holds — 100k tucked at one end, the multi-million whales towering at the other." },
  { swatch: "#22c55e", title: "A green beam = buying", text: "the wallet added over the last 30 days. Taller beam, bigger move." },
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

function Watcher({ isMobile }) {
  const host = useRef(null);
  const [data, setData] = useState(null);     // null=loading, false=failed, object=ok
  const [time, setTime] = useState("dusk");
  const [onlyMovers, setOnlyMovers] = useState(false);
  const [sel, setSel] = useState(null);

  useEffect(() => { let off = false; loadWhales().then(d => { if (!off) setData(d ?? false); }); return () => { off = true; }; }, []);

  useEffect(() => {
    if (!data || !host.current) return;
    let cleanup = () => {};
    try { cleanup = buildScene(host.current, data, { time, onlyMovers, isMobile, onPick: setSel }); }
    catch (e) { console.error("WhalesWatching:", e); }
    return () => cleanup();
  }, [data, time, onlyMovers, isMobile]);

  const total = data && data.wallets ? data.wallets.filter(w => w.bal >= 1e5).length : 0;

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 14px", fontFamily: SANS }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between", margin: "6px 0 12px" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["day", "dusk", "night"].map(t => <Toggle key={t} on={time === t} onClick={() => setTime(t)}>{TIMES[t].label}</Toggle>)}
          <Toggle on={onlyMovers} onClick={() => setOnlyMovers(v => !v)}>Only movers</Toggle>
        </div>
        {data && <div style={{ fontFamily: MONO, fontSize: 12, color: "#64748b" }}>{total.toLocaleString()} whales ≥100k · {data.updated}</div>}
      </div>

      {data === false && (
        <div style={{ padding: "60px 20px", textAlign: "center", color: "#94a3b8" }}>
          Whale data is being rebuilt — check back after the next on-chain refresh.
        </div>
      )}
      <div ref={host} style={{ position: "relative", width: "100%", minHeight: isMobile ? 460 : 600, borderRadius: 14, overflow: "hidden", background: "#05060c" }} />

      {/* legend */}
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
        Every cube is one wallet holding ≥100,000 SPX, grouped into four size cohorts. The slab and label under each
        cluster read its overall 30-day flow. Cost basis and infra (exchanges, LP, bridge) are excluded — these are real
        self-custody holders. A distribution snapshot, not a signal. {sel && <b style={{ color: "#c7d2e4" }}>Selected: {sel.a.slice(0, 6)}…{sel.a.slice(-4)} · {(sel.bal / 1e6 >= 1 ? (sel.bal / 1e6).toFixed(2) + "M" : Math.round(sel.bal / 1e3) + "k")} SPX.</b>}
      </p>
    </div>
  );
}

export default function WhalesWatching({ isMobile }) {
  return (
    <CityGate title="Whales Watching" accent="#5eead4" unit="whale" locked guide={GUIDE_INTRO}>
      <Watcher isMobile={isMobile} />
    </CityGate>
  );
}

// Cube-appropriate arrival explainer for the gate (the default one talks about buildings/streets).
const GUIDE_INTRO = {
  emoji: "🐋",
  lead: "Every cube is one whale — a wallet holding 100,000 SPX or more. Here's how to read it:",
  rows: [
    { swatch: "linear-gradient(90deg,#d97706,#22d3ee)", title: "Colour is age", text: "warm amber for wallets that arrived recently, cyan for the ones that have held longest." },
    { swatch: "#94a3b8", title: "Height is size", text: "how much the wallet holds — tucked-away 100k to towering multi-million whales." },
    { swatch: "#22c55e", title: "Green beam = buying", text: "the wallet added over the last 30 days." },
    { swatch: "#f43f5e", title: "Red beam = selling", text: "it reduced its position. No beam means it sat still." },
  ],
  footer: "Cubes are grouped into four size cohorts; the label under each cluster reads its overall flow. Real data, self-custody holders only.",
};
