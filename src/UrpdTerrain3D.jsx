import { useRef, useEffect, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { loadUrpdHistory } from "./history-data.js";
import { SANS, MONO } from "./chart-ui.jsx";

// URPD TERRAIN OVER TIME — the cost-basis distribution as a landscape that deforms week by week, with
// the live price sweeping through it as a curtain. X = cost basis (log price), Z = time (week), Y =
// share of supply held at that price. Every week's slice sits on ONE fixed price grid (built in the
// FIFO engine), so the slices stack into a coherent surface. The terrain is coloured by profit vs THAT
// week's spot — GREEN where the coins sitting there are in profit (cost ≤ price), RED where they're
// underwater — and a translucent white curtain marks spot, so you watch the price wall sweep across the
// bags: walls of supply forming, ageing, going green as price climbs past them or red as it falls back.
//
// A reconstruction, not a signal. three.js is code-split, so nothing here touches the base bundle.

const fp = p => p >= 1 ? "$" + p.toFixed(1) : p >= 0.01 ? "$" + p.toFixed(2) : "$" + p.toFixed(3);
const GREEN = [0.13, 0.77, 0.37], RED = [0.98, 0.44, 0.52];

function buildScene(el, hist, isMobile) {
  const { weeks, edges, nBuckets } = hist;
  const nW = weeks.length, nB = nBuckets;
  const price = Array.from({ length: nB }, (_, i) => Math.sqrt(edges[i] * edges[i + 1]));
  const loLog = Math.log(hist.pMin), span = (Math.log(hist.pMax) - loLog) || 1;
  const spotX = spot => Math.max(0, Math.min(nB, ((Math.log(Math.max(spot, hist.pMin)) - loLog) / span) * nB));

  const maxV = Math.max(...weeks.flatMap(w => w.pct), 1e-6);
  const DZ = Math.max(0.4, Math.min(0.9, 60 / nW));   // depth per week — keep the whole span ~visible
  const SY = 16 / maxV;                                // world height per 1% of supply
  const cx = nB / 2, depth = (nW - 1) * DZ, cz = depth / 2;

  const W = el.clientWidth, H = isMobile ? 400 : 560;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0a0e1c);
  scene.fog = new THREE.Fog(0x0a0e1c, depth * 1.1, depth * 2.6);
  const cam = new THREE.PerspectiveCamera(46, W / H, 0.1, 2000);
  cam.position.set(nB * 0.62, Math.max(26, maxV * SY * 1.4), depth * 0.78 + 26);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(W, H);
  el.appendChild(renderer.domElement);

  const labelR = new CSS2DRenderer(); labelR.setSize(W, H);
  Object.assign(labelR.domElement.style, { position: "absolute", top: "0", left: "0", pointerEvents: "none" });
  el.appendChild(labelR.domElement);
  const addLabel = (text, x, y, z, color, size = 11, weight = 500) => {
    const d = document.createElement("div");
    d.textContent = text;
    Object.assign(d.style, { color, font: `${weight} ${size}px 'Space Grotesk', system-ui, sans-serif`, whiteSpace: "nowrap", textShadow: "0 1px 3px #000", opacity: "0.92" });
    const l = new CSS2DObject(d); l.position.set(x, y, z); scene.add(l); return l;
  };

  scene.add(new THREE.AmbientLight(0xffffff, 0.72));
  const d1 = new THREE.DirectionalLight(0xffffff, 0.85); d1.position.set(nB * 0.5, maxV * SY + 30, depth * 0.4); scene.add(d1);
  const d2 = new THREE.DirectionalLight(0x88aaff, 0.35); d2.position.set(-nB * 0.4, 24, -depth * 0.3); scene.add(d2);

  const disposables = [], ownMats = [];

  // ── the terrain surface ──────────────────────────────────────────────────────
  const pos = new Float32Array(nW * nB * 3), col = new Float32Array(nW * nB * 3);
  for (let j = 0; j < nW; j++) {
    const spot = weeks[j].spot || 0, pct = weeks[j].pct;
    for (let i = 0; i < nB; i++) {
      const idx = j * nB + i, h = (pct[i] || 0) * SY;
      pos[idx * 3] = i - cx; pos[idx * 3 + 1] = h; pos[idx * 3 + 2] = j * DZ - cz;
      const base = (spot > 0 && price[i] <= spot) ? GREEN : RED;      // in profit vs THAT week's spot
      const t = 0.25 + 0.75 * Math.min(1, (pct[i] || 0) / maxV);      // dark where flat, bright at the walls
      col[idx * 3] = base[0] * t; col[idx * 3 + 1] = base[1] * t; col[idx * 3 + 2] = base[2] * t;
    }
  }
  const idxArr = [];
  for (let j = 0; j < nW - 1; j++) for (let i = 0; i < nB - 1; i++) {
    const a = j * nB + i, b = a + 1, c = a + nB, d = c + 1;
    idxArr.push(a, c, b, b, c, d);
  }
  const surf = new THREE.BufferGeometry();
  surf.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  surf.setAttribute("color", new THREE.BufferAttribute(col, 3));
  surf.setIndex(idxArr); surf.computeVertexNormals();
  const surfMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  scene.add(new THREE.Mesh(surf, surfMat)); disposables.push(surf); ownMats.push(surfMat);

  // ── the spot-price curtain sweeping through the terrain ──────────────────────
  const top = maxV * SY * 1.04;
  const cpos = new Float32Array(nW * 2 * 3), tpts = [];
  for (let j = 0; j < nW; j++) {
    const xw = spotX(weeks[j].spot || hist.pMin) - cx, zw = j * DZ - cz;
    cpos[j * 6] = xw; cpos[j * 6 + 1] = 0; cpos[j * 6 + 2] = zw;
    cpos[j * 6 + 3] = xw; cpos[j * 6 + 4] = top; cpos[j * 6 + 5] = zw;
    tpts.push(new THREE.Vector3(xw, top, zw));
  }
  const cidx = [];
  for (let j = 0; j < nW - 1; j++) { const a = j * 2, b = a + 1, c = a + 2, d = a + 3; cidx.push(a, b, c, b, d, c); }
  const curtain = new THREE.BufferGeometry();
  curtain.setAttribute("position", new THREE.BufferAttribute(cpos, 3)); curtain.setIndex(cidx);
  const curtMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false });
  scene.add(new THREE.Mesh(curtain, curtMat)); disposables.push(curtain); ownMats.push(curtMat);
  const topG = new THREE.BufferGeometry().setFromPoints(tpts);
  const topMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  scene.add(new THREE.Line(topG, topMat)); disposables.push(topG, topMat);

  // ── axis reference ───────────────────────────────────────────────────────────
  const xL = -cx - 0.5, xR = nB - cx - 0.5, zF = -cz - 0.8, zB = depth - cz + 0.8;
  const lineMat = new THREE.LineBasicMaterial({ color: 0x2a3550, transparent: true, opacity: 0.55 });
  disposables.push(lineMat);
  const seg = (a, b) => { const g = new THREE.BufferGeometry().setFromPoints([a, b]); scene.add(new THREE.Line(g, lineMat)); disposables.push(g); };
  // y (% of supply)
  const yStep = maxV > 8 ? 4 : maxV > 4 ? 2 : 1;
  for (let v = 0; v <= maxV; v += yStep) {
    const y = v * SY;
    seg(new THREE.Vector3(xL, y, zB), new THREE.Vector3(xR, y, zB));
    seg(new THREE.Vector3(xL, y, zF), new THREE.Vector3(xL, y, zB));
    addLabel(v + "%", xL - 1.3, y, zB, "#9aa6bd", 11);
  }
  addLabel("% of supply", xL - 1.3, maxV * SY + 2.4, zB, "#cbd5e1", 12, 700);
  // x (cost basis) along the front edge
  const xStep = Math.max(1, Math.round(nB / 6));
  for (let i = 0; i < nB; i += xStep) addLabel(fp(price[i]), i - cx, 0, zF - 0.4, "#9aa6bd", 10.5);
  addLabel("cost basis →", xR - 3, 0, zF - 2.2, "#cbd5e1", 12, 700);
  // z (time) — first / mid / last week dates along the right edge
  [0, Math.floor(nW / 2), nW - 1].forEach(j => addLabel(weeks[j].d?.slice(0, 7) || "", xR + 1.4, 0, j * DZ - cz, "#9aa6bd", 10.5));
  addLabel("time →", xR + 1.4, 0, zB - 1.5, "#cbd5e1", 12, 700);
  addLabel("spot", spotX(weeks.at(-1).spot || hist.pMin) - cx, top + 1.2, depth - cz, "#f8fafc", 11, 700);

  const controls = new OrbitControls(cam, renderer.domElement);
  controls.target.set(0, maxV * SY * 0.3, 0); controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minDistance = 20; controls.maxDistance = depth * 2.4 + 60; controls.maxPolarAngle = Math.PI * 0.49;
  controls.autoRotate = false;   // fixed 3/4 view — a full spin would swing the price axis right→left

  let raf;
  const loop = () => { raf = requestAnimationFrame(loop); controls.update(); renderer.render(scene, cam); labelR.render(scene, cam); };
  loop();
  const onResize = () => { const w = el.clientWidth; if (!w) return; cam.aspect = w / H; cam.updateProjectionMatrix(); renderer.setSize(w, H); labelR.setSize(w, H); };
  window.addEventListener("resize", onResize);

  window.__terrainStats = () => ({ weeks: nW, buckets: nB, maxPct: +maxV.toFixed(2), drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles });

  return () => {
    cancelAnimationFrame(raf); window.removeEventListener("resize", onResize);
    delete window.__terrainStats;
    controls.dispose();
    disposables.forEach(d => d.dispose?.()); ownMats.forEach(m => m.dispose?.());
    renderer.dispose();
    if (labelR.domElement.parentNode) labelR.domElement.parentNode.removeChild(labelR.domElement);
    if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
  };
}

export default function UrpdTerrain3D({ isMobile }) {
  const mount = useRef(null);
  const [hist, setHist] = useState(null);   // null=loading, false=none, object=ok
  useEffect(() => { let off = false; loadUrpdHistory().then(d => { if (!off) setHist(d ?? false); }); return () => { off = true; }; }, []);
  useEffect(() => {
    if (!hist || !mount.current) return;
    let cleanup = () => {};
    try { cleanup = buildScene(mount.current, hist, isMobile); }
    catch (e) { console.error("UrpdTerrain3D:", e); }
    return () => cleanup();
  }, [hist, isMobile]);

  if (hist === false) return (
    <div style={{ padding: "60px 20px", textAlign: "center", fontFamily: SANS, color: "#94a3b8" }}>
      The cost-basis terrain is being reconstructed — it appears after the next on-chain refresh banks the weekly history.
    </div>
  );

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 14px", fontFamily: SANS }}>
      {hist && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", justifyContent: "space-between", margin: "6px 0 10px" }}>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontFamily: MONO, fontSize: 12, color: "#94a3b8" }}>
            <span><b style={{ color: "#4ade80" }}>▮</b> in profit (cost ≤ spot)</span>
            <span><b style={{ color: "#fb7185" }}>▮</b> underwater</span>
            <span><b style={{ color: "#f8fafc" }}>▮</b> spot price</span>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 12, color: "#64748b" }}>{hist.weeks.length} weeks · drag to orbit · {hist.updated}</div>
        </div>
      )}
      <div ref={mount} style={{ position: "relative", width: "100%", borderRadius: 12, overflow: "hidden", background: "#0a0e1c", cursor: "grab" }} />
      <p style={{ fontSize: 12.5, color: "#7c8a9e", lineHeight: 1.6, margin: "12px 2px 0" }}>
        The cost-basis distribution (URPD) rebuilt every week and stacked through time. Each ridge is a wall of supply — coins
        that last moved around that price — and the white curtain is spot. Watch walls form as buyers pile in, then turn
        <b style={{ color: "#4ade80" }}> green</b> as price climbs past them or <b style={{ color: "#fb7185" }}>red</b> as it
        falls back. Reconstructed from on-chain FIFO lots (self-custody holders; exchanges, LP and bridge excluded). A snapshot of where the bags sit, not a signal.
      </p>
    </div>
  );
}
