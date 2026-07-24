import { useRef, useEffect } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";

// Interactive 3D HOLDER SKYLINE. Each tower = a wallet. Height = a conviction score that
// combines HOW MANY it holds with HOW LONG it's held (duration-weighted); tallest = the
// biggest + longest-term holder. Colour ramps amber (newer) → cyan (OG, held since mint).
// Hover a tower to see the wallet + stats; click it to open the wallet in Zerion. Layout is
// a square spiral so the champion sits at the centre and the rest radiate out, descending.
// (The SPX6900-coin axis slots into `score` once per-wallet coin balances are joined in.)
const short = a => a.slice(0, 6) + "…" + a.slice(-4);
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => new THREE.Color(lerp(c1.r, c2.r, t), lerp(c1.g, c2.g, t), lerp(c1.b, c2.b, t));
const AMBER = new THREE.Color(0xf59e0b), TEAL = new THREE.Color(0x22d3ee);

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

export default function AeonSkyline3D({ holders, isMobile }) {
  const mount = useRef(null);
  useEffect(() => {
    const el = mount.current; if (!el || !holders?.length) return;
    const maxDays = Math.max(...holders.map(x => x.days), 1);
    const maxN = Math.max(...holders.map(x => x.n), 1);
    const maxSpx = Math.max(...holders.map(x => x.spx || 0), 0);
    // conviction "units": AEON count + SPX balance rescaled onto the same 0..maxN axis
    // (so both dimensions weigh comparably), then weighted by holding duration.
    const units = h => h.n + (maxSpx > 0 ? (h.spx || 0) / maxSpx * maxN : 0);
    const scoreOf = h => units(h) * (0.45 + 0.55 * (h.days / maxDays));
    const H = holders.slice().sort((a, b) => scoreOf(b) - scoreOf(a));
    const maxScore = Math.max(...H.map(scoreOf), 1);

    const W = el.clientWidth, VH = isMobile ? 420 : 560;
    const SP = 1.7, SY = 19 / maxScore, FOOT = 0.9;
    const cells = spiral(H.length);

    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x080b16);
    const cam = new THREE.PerspectiveCamera(48, W / VH, 0.1, 2000);
    const span = Math.sqrt(H.length) * SP;
    cam.position.set(span * 1.15, 26, span * 1.5);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(W, VH);
    el.appendChild(renderer.domElement);

    const labelR = new CSS2DRenderer(); labelR.setSize(W, VH);
    Object.assign(labelR.domElement.style, { position: "absolute", top: "0", left: "0", pointerEvents: "none" });
    el.appendChild(labelR.domElement);

    // cursor-following tooltip (plain HTML overlay)
    const tip = document.createElement("div");
    Object.assign(tip.style, {
      position: "absolute", pointerEvents: "none", padding: "9px 12px", borderRadius: "10px", display: "none",
      background: "rgba(10,14,26,0.94)", border: "1px solid rgba(45,212,191,0.4)", color: "#e2e8f0",
      font: "500 12.5px 'Space Grotesk', system-ui, sans-serif", whiteSpace: "nowrap", zIndex: "5",
      boxShadow: "0 8px 30px rgba(0,0,0,0.5)", transform: "translate(-50%, -115%)",
    });
    el.appendChild(tip);

    scene.add(new THREE.AmbientLight(0xffffff, 0.72));
    const d1 = new THREE.DirectionalLight(0xffffff, 0.95); d1.position.set(30, 50, 20); scene.add(d1);
    const d2 = new THREE.DirectionalLight(0x8899ff, 0.4); d2.position.set(-25, 25, -15); scene.add(d2);
    const grid = new THREE.GridHelper(span * 2.4, 24, 0x1e2a44, 0x141c30); grid.position.y = 0; scene.add(grid);

    const geo = new THREE.BoxGeometry(FOOT, 1, FOOT);
    const towers = [];
    H.forEach((h, i) => {
      const sc = scoreOf(h), ht = Math.max(0.4, sc * SY);
      const col = mix(AMBER, TEAL, h.days / maxDays);
      const mat = new THREE.MeshLambertMaterial({ color: col });
      const m = new THREE.Mesh(geo, mat);
      const px = cells[i].x * SP, pz = cells[i].z * SP;
      m.scale.set(1, ht, 1); m.position.set(px, ht / 2, pz);
      m.userData = { h, base: col.clone(), ht };
      scene.add(m); towers.push(m);
    });

    // crown the #1 holder
    const champ = towers[0];
    const crown = (() => {
      const d = document.createElement("div");
      d.textContent = "👑 top holder";
      Object.assign(d.style, { color: "#fde68a", font: "700 12px 'Space Grotesk', system-ui, sans-serif", textShadow: "0 1px 4px #000", whiteSpace: "nowrap" });
      const o = new CSS2DObject(d); o.position.set(champ.position.x, champ.userData.ht + 2, champ.position.z); return o;
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
      if (hovered) hovered.material.emissive?.setHex(0x000000);
      hovered = m;
      if (hovered) { hovered.material.emissive = new THREE.Color(0x333333); renderer.domElement.style.cursor = "pointer"; }
      else renderer.domElement.style.cursor = "grab";
    };
    const onMove = e => {
      const r = renderer.domElement.getBoundingClientRect();
      px = e.clientX - r.left; py = e.clientY - r.top; moved = true;
      ndc.x = (px / r.width) * 2 - 1; ndc.y = -(py / r.height) * 2 + 1;
      ray.setFromCamera(ndc, cam);
      const hit = ray.intersectObjects(towers, false)[0];
      if (hit) {
        setHover(hit.object); const h = hit.object.userData.h;
        controls.autoRotate = false;
        tip.style.display = "block"; tip.style.left = px + "px"; tip.style.top = py + "px";
        tip.innerHTML = `<b style="color:#5eead4">${short(h.a)}</b> · click to open in Zerion<br>` +
          `<span style="color:#94a3b8">${h.n} AEON${h.spx ? ` · ${h.spx.toLocaleString()} SPX` : ""} · held ${h.days} days (since ${h.since})</span>`;
      } else { setHover(null); tip.style.display = "none"; }
    };
    const onDown = () => { moved = false; };
    const onUp = e => {
      if (moved) return;                                  // was a drag, not a click
      const r = renderer.domElement.getBoundingClientRect();
      ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1; ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      ray.setFromCamera(ndc, cam);
      const hit = ray.intersectObjects(towers, false)[0];
      if (hit) window.open(`https://app.zerion.io/${hit.object.userData.h.a}/overview`, "_blank", "noopener,noreferrer");
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
      controls.dispose(); geo.dispose(); towers.forEach(m => m.material.dispose());
      renderer.dispose(); el.removeChild(renderer.domElement); el.removeChild(labelR.domElement); el.removeChild(tip);
    };
  }, [holders, isMobile]);

  return <div ref={mount} style={{ position: "relative", width: "100%", borderRadius: 12, overflow: "hidden", cursor: "grab" }} />;
}
