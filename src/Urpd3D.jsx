import { useRef, useEffect } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";

// Age bands age[0..4] = fresh → old, matching the ridgeline/card palette.
const AGE_C = [0xfb7185, 0xfb923c, 0xfbbf24, 0xa78bfa, 0x22d3ee];
const AGE_L = ["0–1m", "1–3m", "3–6m", "6–12m", "1y+"];
const fp = p => p >= 1 ? "$" + p.toFixed(1) : p >= 0.01 ? "$" + p.toFixed(2) : "$" + p.toFixed(3);

// Interactive 3D bar field: x = cost-basis bucket, z = holding-age band, y (height) = % of
// supply. Drag to orbit, scroll to zoom. Axis reference labels + % gridlines via CSS2D so the
// values are readable. Lazy-loaded so three.js never touches the base bundle.
export default function Urpd3D({ buckets, spot = 0, isMobile }) {
  const mount = useRef(null);
  useEffect(() => {
    const el = mount.current; if (!el || !buckets?.length) return;
    const W = el.clientWidth, H = isMobile ? 380 : 500;
    const P = buckets.length, A = 5, DZ = 2.4;
    const price = buckets.map(b => (b.lo * b.hi) ** 0.5);
    const maxV = Math.max(...buckets.flatMap(b => b.age), 1e-6);
    const SY = 18 / maxV;                    // height (world units) per 1% of supply
    const cx = P / 2, cz = (A * DZ) / 2;     // centre offsets
    const zc = ((A - 1) * DZ) / 2 - cz;      // geometric z-centre

    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0a0e1c);
    const cam = new THREE.PerspectiveCamera(46, W / H, 0.1, 1000);
    cam.position.set(P * 0.6, 26, 34);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(W, H);
    el.appendChild(renderer.domElement);

    // CSS2D label layer, overlaid on the canvas
    const labelR = new CSS2DRenderer(); labelR.setSize(W, H);
    Object.assign(labelR.domElement.style, { position: "absolute", top: "0", left: "0", pointerEvents: "none" });
    el.appendChild(labelR.domElement);
    const mkLabel = (text, color, size = 11, weight = 500) => {
      const d = document.createElement("div");
      d.textContent = text;
      Object.assign(d.style, { color, font: `${weight} ${size}px 'Space Grotesk', system-ui, sans-serif`, whiteSpace: "nowrap", textShadow: "0 1px 3px #000", opacity: "0.92" });
      return new CSS2DObject(d);
    };
    const addLabel = (text, x, y, z, color, size, weight) => { const l = mkLabel(text, color, size, weight); l.position.set(x, y, z); scene.add(l); };

    // lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.74));
    const d1 = new THREE.DirectionalLight(0xffffff, 0.9); d1.position.set(20, 40, 20); scene.add(d1);
    const d2 = new THREE.DirectionalLight(0x88aaff, 0.35); d2.position.set(-20, 20, -10); scene.add(d2);

    // floor grid
    const grid = new THREE.GridHelper(Math.max(P, A * DZ) * 1.1, 12, 0x223052, 0x162038);
    grid.position.set(-0.5, 0, zc); scene.add(grid);

    // bars
    const geo = new THREE.BoxGeometry(0.8, 1, 0.8);
    const group = new THREE.Group();
    buckets.forEach((b, i) => {
      for (let a = 0; a < A; a++) {
        const v = b.age[a]; if (v <= 0.001) continue;
        const h = v * SY;
        const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: AGE_C[a] }));
        m.scale.y = h; m.position.set(i - cx, h / 2, a * DZ - cz);
        group.add(m);
      }
    });
    scene.add(group);

    // ── AXIS REFERENCE ────────────────────────────────────────────────
    const xL = -cx - 0.5, xR = P - cx - 0.5, zF = -cz - 0.6, zB = (A - 1) * DZ - cz + 0.6;
    const lineMat = new THREE.LineBasicMaterial({ color: 0x2a3550, transparent: true, opacity: 0.6 });
    const seg = (a, b) => { const g = new THREE.BufferGeometry().setFromPoints([a, b]); scene.add(new THREE.Line(g, lineMat)); };

    // y (% of supply) gridlines + ticks on the back-left corner
    const yticks = [];
    for (let v = 0; v <= maxV; v += (maxV > 4 ? 2 : 1)) yticks.push(v);
    yticks.forEach(v => {
      const y = v * SY;
      seg(new THREE.Vector3(xL, y, zB), new THREE.Vector3(xR, y, zB));   // back wall line
      seg(new THREE.Vector3(xL, y, zF), new THREE.Vector3(xL, y, zB));   // left wall line
      addLabel(v + "%", xL - 1.2, y, zB, "#9aa6bd", 11);
    });
    addLabel("% of supply", xL - 1.2, maxV * SY + 2.4, zB, "#cbd5e1", 12, 700);

    // x (cost basis) ticks along the front edge
    const step = Math.max(1, Math.round(P / 6));
    for (let i = 0; i < P; i += step) addLabel(fp(price[i]), i - cx, 0, zF - 0.4, "#9aa6bd", 10.5);
    addLabel("cost basis →", xR - 3, 0, zF - 2.0, "#cbd5e1", 12, 700);

    // z (holding age) labels along the left edge
    for (let a = 0; a < A; a++) addLabel(AGE_L[a], xL - 0.8, 0, a * DZ - cz, "#" + AGE_C[a].toString(16).padStart(6, "0"), 11, 700);

    // spot cost-basis marker (nearest bucket)
    if (spot > 0) {
      let si = 0; for (let i = 1; i < P; i++) if (Math.abs(price[i] - spot) < Math.abs(price[si] - spot)) si = i;
      const sm = new THREE.LineBasicMaterial({ color: 0xf8fafc, transparent: true, opacity: 0.55 });
      const sg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(si - cx, 0, zF), new THREE.Vector3(si - cx, maxV * SY, zF)]);
      scene.add(new THREE.Line(sg, sm));
      addLabel("spot " + fp(spot), si - cx, maxV * SY + 1.2, zF, "#f8fafc", 11, 700);
    }

    const controls = new OrbitControls(cam, renderer.domElement);
    controls.target.set(0, 5, zc); controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.minDistance = 18; controls.maxDistance = 90; controls.maxPolarAngle = Math.PI * 0.49;
    // No auto-rotate: a full spin swings the cost-basis axis around to read right→left for half
    // the rotation, which inverts the price direction and confuses the read. Hold a fixed 3/4 view
    // (cheap on the left, expensive on the right); the user can still drag to orbit.
    controls.autoRotate = false;
    const stop = () => { controls.autoRotate = false; };
    renderer.domElement.addEventListener("pointerdown", stop);

    let raf;
    const loop = () => { raf = requestAnimationFrame(loop); controls.update(); renderer.render(scene, cam); labelR.render(scene, cam); };
    loop();

    const onResize = () => { const w = el.clientWidth; cam.aspect = w / H; cam.updateProjectionMatrix(); renderer.setSize(w, H); labelR.setSize(w, H); };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf); window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointerdown", stop);
      controls.dispose(); geo.dispose(); group.children.forEach(m => m.material.dispose());
      renderer.dispose(); el.removeChild(renderer.domElement); el.removeChild(labelR.domElement);
    };
  }, [buckets, spot, isMobile]);

  return <div ref={mount} style={{ position: "relative", width: "100%", borderRadius: 12, overflow: "hidden", cursor: "grab" }} />;
}
