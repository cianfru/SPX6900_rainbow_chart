import { useRef, useEffect } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";

// Interactive 3D HOLDER SKYLINE — shared by the AEON holder skyline and the SPX whale watcher.
// Each building is a wallet: height = a conviction score (how much × how long held), body colour
// ramps by holding age, and the WINDOWS glow by recent FLOW — green if the wallet has been
// accumulating over the lookback window, red if it's been shedding, warm amber if it sat still.
// That last channel is the point: a holdings snapshot says who is big, the glow says who is
// actually buying or selling right now.
//
// Caller supplies already-normalised towers so this stays asset-agnostic:
//   { a, score, ageT (0..1), flow (signed, 0 = flat), ...anything the card renderer wants }
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => new THREE.Color(lerp(c1.r, c2.r, t), lerp(c1.g, c2.g, t), lerp(c1.b, c2.b, t));
const GREEN = new THREE.Color(0x22c55e), RED = new THREE.Color(0xef4444), AMBER = new THREE.Color(0xffcf7a);

// square-spiral integer coords, index 0 at centre
function spiral(n) {
  const pts = []; let x = 0, z = 0, dx = 0, dz = -1;
  for (let i = 0; i < n; i++) {
    pts.push({ x, z });
    if (x === z || (x < 0 && x === -z) || (x > 0 && x === 1 - z)) { const t = dx; dx = -dz; dz = t; }
    x += dx; z += dz;
  }
  return pts;
}

// A facade of lit windows, drawn once per height bin and shared by every building in that bin.
// Used as an emissiveMap, so the material's `emissive` colour decides what the windows glow —
// which is how the green/red flow signal reads from across the scene.
function windowTexture(rows) {
  const cell = 8, cols = 4, W = cols * cell, H = Math.max(2, rows) * cell;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d");
  g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
  for (let y = 0; y < Math.max(2, rows); y++) {
    for (let x = 0; x < cols; x++) {
      if (Math.random() < 0.26) continue;                    // a dark window — nobody home
      g.fillStyle = `rgba(255,255,255,${(0.5 + Math.random() * 0.5).toFixed(2)})`;
      g.fillRect(x * cell + 2, y * cell + 2, cell - 4, cell - 4);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
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

    const W = el.clientWidth, VH = isMobile ? 420 : 560;
    const SP = 1.7, SY = 19 / maxScore, FOOT = 0.9;
    const cells = spiral(T.length);

    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x080b16);
    const cam = new THREE.PerspectiveCamera(48, W / VH, 0.1, 2000);
    const span = Math.sqrt(T.length) * SP;
    cam.position.set(span * 1.15, 26, span * 1.5);
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

    scene.add(new THREE.AmbientLight(0xffffff, 0.66));
    const d1 = new THREE.DirectionalLight(0xffffff, 0.9); d1.position.set(30, 50, 20); scene.add(d1);
    const d2 = new THREE.DirectionalLight(0x8899ff, 0.4); d2.position.set(-25, 25, -15); scene.add(d2);
    const grid = new THREE.GridHelper(span * 2.4, 24, 0x1e2a44, 0x141c30); scene.add(grid);

    // shared geometry + one window texture per height bin (cheap: ~6 textures for N buildings)
    const box = new THREE.BoxGeometry(1, 1, 1);
    const antennaGeo = new THREE.CylinderGeometry(0.045, 0.045, 1, 6);
    const BINS = 6, texes = Array.from({ length: BINS }, (_, i) => windowTexture(3 + i * 3));
    const disposables = [box, antennaGeo, ...texes];

    const towersMeshes = [], extras = [], extraMats = [];
    T.forEach((t, i) => {
      const h = Math.max(0.5, t.score * SY);
      const px = cells[i].x * SP, pz = cells[i].z * SP;
      // body colour = holding age (caller's ageT); windows = flow signal
      const body = mix(new THREE.Color(bodyFrom), new THREE.Color(bodyTo), t.ageT ?? 0.5);
      const f = (t.flow || 0) / maxFlow;                     // -1..1
      const glow = f > 0.02 ? mix(AMBER, GREEN, Math.min(1, f * 3.2))
        : f < -0.02 ? mix(AMBER, RED, Math.min(1, -f * 3.2)) : AMBER;
      const strength = 0.42 + Math.min(0.85, Math.abs(f) * 2.6);
      const tex = texes[Math.min(BINS - 1, Math.floor((h / 20) * BINS))];

      const mat = new THREE.MeshLambertMaterial({ color: body, emissive: glow, emissiveMap: tex, emissiveIntensity: strength });
      const m = new THREE.Mesh(box, mat);
      m.scale.set(FOOT, h, FOOT); m.position.set(px, h / 2, pz);
      m.userData = { t, parts: [], baseEmissive: strength };
      scene.add(m); towersMeshes.push(m);

      // setback crown on the taller buildings, and an antenna on the tallest few — the bits
      // that make these read as buildings rather than bars.
      if (h > 3) {
        const capH = Math.min(1.6, h * 0.14);
        const cap = new THREE.Mesh(box, mat);
        cap.scale.set(FOOT * 0.62, capH, FOOT * 0.62); cap.position.set(px, h + capH / 2, pz);
        scene.add(cap); extras.push(cap); m.userData.parts.push(cap);
      }
      if (i < 6) {
        const aH = 1.6 + (1 - i / 6) * 1.6;
        const aMat = new THREE.MeshBasicMaterial({ color: glow });
        const a = new THREE.Mesh(antennaGeo, aMat);
        a.scale.set(1, aH, 1); a.position.set(px, h + aH / 2 + Math.min(1.6, h * 0.14), pz);
        scene.add(a); extras.push(a); extraMats.push(aMat);
      }
    });

    // crown the #1
    const champ = towersMeshes[0];
    const crown = (() => {
      const d = document.createElement("div");
      d.textContent = crownLabel;
      Object.assign(d.style, { color: "#fde68a", font: "700 12px 'Space Grotesk', system-ui, sans-serif", textShadow: "0 1px 4px #000", whiteSpace: "nowrap" });
      const o = new CSS2DObject(d); o.position.set(champ.position.x, champ.scale.y + 3.4, champ.position.z); return o;
    })();
    scene.add(crown);

    const controls = new OrbitControls(cam, renderer.domElement);
    controls.target.set(0, 8.5, 0); controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.minDistance = 14; controls.maxDistance = span * 4 + 40; controls.maxPolarAngle = Math.PI * 0.49;
    controls.autoRotate = true; controls.autoRotateSpeed = 0.6;

    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    let hovered = null, px = 0, py = 0, moved = false;
    const setHover = m => {
      if (hovered === m) return;
      if (hovered) hovered.material.emissiveIntensity = hovered.userData.baseEmissive;
      hovered = m;
      if (hovered) { hovered.material.emissiveIntensity = 1.35; renderer.domElement.style.cursor = "pointer"; }
      else renderer.domElement.style.cursor = "grab";
    };
    const pick = e => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1; ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      ray.setFromCamera(ndc, cam);
      return ray.intersectObjects(towersMeshes, false)[0];
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
      towersMeshes.forEach(m => m.material.dispose());   // setback caps share their tower's material
      extraMats.forEach(m => m.dispose());
      renderer.dispose(); el.removeChild(renderer.domElement); el.removeChild(labelR.domElement); el.removeChild(tip);
    };
  }, [towers, isMobile, crownLabel, accent, bodyFrom, bodyTo]);

  return <div ref={mount} style={{ position: "relative", width: "100%", borderRadius: 12, overflow: "hidden", cursor: "grab" }} />;
}
