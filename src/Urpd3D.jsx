import { useRef, useEffect } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// Age bands age[0..4] = fresh → old, matching the ridgeline/card palette.
const AGE_C = [0xfb7185, 0xfb923c, 0xfbbf24, 0xa78bfa, 0x22d3ee];

// Interactive 3D bar field: x = cost-basis bucket, z = holding-age band, y (height) = % of
// supply. Drag to orbit, scroll to zoom. Lazy-loaded so three.js never touches the base bundle.
export default function Urpd3D({ buckets, isMobile }) {
  const mount = useRef(null);
  useEffect(() => {
    const el = mount.current; if (!el || !buckets?.length) return;
    const W = el.clientWidth, H = isMobile ? 360 : 480;
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0a0e1c);
    const cam = new THREE.PerspectiveCamera(46, W / H, 0.1, 1000);
    cam.position.set(nP() * 0.62, 26, 34);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(W, H); el.appendChild(renderer.domElement);

    function nP() { return buckets.length; }
    const P = buckets.length, A = 5;
    const maxV = Math.max(...buckets.flatMap(b => b.age), 1e-6);
    const SY = 18 / maxV;            // height scale
    const spanX = P, spanZ = A * 2.4;
    const cx = spanX / 2, cz = spanZ / 2;

    // lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.72));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9); dir.position.set(20, 40, 20); scene.add(dir);
    const dir2 = new THREE.DirectionalLight(0x88aaff, 0.35); dir2.position.set(-20, 20, -10); scene.add(dir2);

    // floor grid
    const grid = new THREE.GridHelper(Math.max(spanX, spanZ) * 1.1, 12, 0x223052, 0x162038);
    grid.position.set(cx - 0.5, 0, cz - 1.2); scene.add(grid);

    // bars
    const geo = new THREE.BoxGeometry(0.8, 1, 0.8);
    const group = new THREE.Group();
    buckets.forEach((b, i) => {
      for (let a = 0; a < A; a++) {
        const v = b.age[a]; if (v <= 0.001) continue;
        const h = v * SY;
        const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: AGE_C[a] }));
        m.scale.y = h;
        m.position.set(i - cx, h / 2, a * 2.4 - cz);
        group.add(m);
      }
    });
    scene.add(group);

    const zc = ((A - 1) * 2.4) / 2 - cz;              // geometric z-centre of the bar field (bars span -cz..(A-1)*2.4-cz)
    const controls = new OrbitControls(cam, renderer.domElement);
    controls.target.set(0, 5, zc); controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.minDistance = 18; controls.maxDistance = 90; controls.maxPolarAngle = Math.PI * 0.49;
    controls.autoRotate = true; controls.autoRotateSpeed = 0.7;
    const stop = () => { controls.autoRotate = false; };
    renderer.domElement.addEventListener("pointerdown", stop);

    let raf;
    const loop = () => { raf = requestAnimationFrame(loop); controls.update(); renderer.render(scene, cam); };
    loop();

    const onResize = () => { const w = el.clientWidth; cam.aspect = w / H; cam.updateProjectionMatrix(); renderer.setSize(w, H); };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf); window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointerdown", stop);
      controls.dispose(); geo.dispose(); group.children.forEach(m => m.material.dispose());
      renderer.dispose(); el.removeChild(renderer.domElement);
    };
  }, [buckets, isMobile]);

  return <div ref={mount} style={{ width: "100%", borderRadius: 12, overflow: "hidden", cursor: "grab" }} />;
}
