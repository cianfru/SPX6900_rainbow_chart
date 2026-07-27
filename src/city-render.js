import * as THREE from "three";

// How the cities are DRAWN — the treatment proved out in City Lab, factored out so Aeon City,
// Whale City and the lab can't drift apart.
//
// ⭐ THE RULE: STONE AND LIGHT. Realism goes into form, material and lighting; the DATA stays in
// the light. Buildings get real materials and real shadows, while holding age and flow live in the
// emissive windows and the street glow at full strength. That's how a city reads at dusk anyway —
// the building is stone, the windows are light — so believability and legibility stop competing.
// If a future change starts tinting facades by data again, it will look worse AND say less.
//
// ⚠ EVERYTHING HERE IS BUILT FOR MERGING. The old renderer issued 6,836 draw calls to push 14,908
// triangles — two triangles per call — because every box carried a 6-material array and three.js
// emits one call per material group. So walls and roofs are separate single-material geometries
// with their window pattern baked into UVs, which lets hundreds of buildings merge into one mesh.
// Per-building floor counts survive because they're UV scale, not a per-building texture.

export const FLOOR = 0.42;        // world units per storey
const WINDOW_W = 0.46;            // world units per window column

// ── time of day ───────────────────────────────────────────────────────────────────────────────
// Dusk is the default: night is the most beautiful but too dark to read outdoors, and day is the
// most realistic and the least informative — sunlight washes emissive windows out, which is
// physically right and exactly wrong for a page whose whole point is the colour of those windows.
// Day compensates by pushing window intensity rather than pretending the problem isn't there.
export const TIMES = {
  day:   { label: "Day",   top: "#7fb2e6", horizon: "#dce9f5", ground: "#8f9bb0", sun: 0xfff6e8, sunI: 2.6, amb: 0.85, hemi: 1.05, exposure: 1.0,  win: 0.62, water: 0x3f8fcc, land: 0x8a94ad, back: 0x6c7a68, park: 0x4f9a5c },
  dusk:  { label: "Dusk",  top: "#22304f", horizon: "#e8a06a", ground: "#4a4a58", sun: 0xffb877, sunI: 2.0, amb: 0.78, hemi: 0.95, exposure: 1.05, win: 1.0,  water: 0x35789f, land: 0x6f7591, back: 0x4b5749, park: 0x3f8452 },
  night: { label: "Night", top: "#080e1c", horizon: "#2a3d63", ground: "#141a2c", sun: 0x9fbfff, sunI: 0.7,  amb: 0.55, hemi: 0.7,  exposure: 1.2,  win: 1.7,  water: 0x1e4a74, land: 0x3d456a, back: 0x2b3330, park: 0x275f3a },
};

// ── the sky ───────────────────────────────────────────────────────────────────────────────────
// Procedural rather than a downloaded HDRI: it costs no bytes and it's what makes glass look like
// glass — a material with nothing to reflect reads as plastic however good its roughness is. The
// same gradient is ALSO the visible background; a flat background colour left a hard seam where
// the ground ended and the whole city read as a model on a table.
export function skyEnv(renderer, { top, horizon, ground }) {
  const c = document.createElement("canvas"); c.width = 16; c.height = 256;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, top); grad.addColorStop(0.47, horizon);
  grad.addColorStop(0.53, ground); grad.addColorStop(1, ground);
  g.fillStyle = grad; g.fillRect(0, 0, 16, 256);
  const sky = new THREE.CanvasTexture(c);
  sky.mapping = THREE.EquirectangularReflectionMapping;
  sky.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(sky).texture;
  pmrem.dispose();
  return { env, sky };
}

// ── facades ───────────────────────────────────────────────────────────────────────────────────
// ONE TILEABLE texture per family, repeated by UV. The previous renderer built a texture per
// height bin and stretched it, so a brownstone and a skyscraper got the same number of window
// rows at different sizes. Here a floor is a fixed world height, so a twenty-storey tower gets
// twenty rows and a townhouse gets three — and because that's UV scale, they still share a
// texture and can merge into one mesh.
export function facadeTexture(family) {
  const cell = 16, cols = 8, rows = 8, W = cols * cell, H = rows * cell;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d");
  let s = family === "glass" ? 12345 : family === "concrete" ? 777 : 4242;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
  for (let y = 0; y < rows; y++) {
    const darkFloor = rnd() < 0.09;                    // a plant room / empty storey
    for (let x = 0; x < cols; x++) {
      if (darkFloor || rnd() < (family === "glass" ? 0.14 : 0.3)) continue;
      const warmth = rnd();
      const [r, gg, bb] = warmth < 0.55 ? [255, 236, 200] : warmth < 0.85 ? [214, 232, 255] : [255, 255, 255];
      g.fillStyle = `rgba(${r},${gg},${bb},${(0.45 + rnd() * 0.55).toFixed(2)})`;
      if (family === "glass") g.fillRect(x * cell + 1, y * cell + 3, cell - 2, cell - 7);
      else g.fillRect(x * cell + 4, y * cell + 3, cell - 8, cell - 7);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const FAMILIES = {
  glass:    { colour: 0x7d92b5, roughness: 0.14, metalness: 0.85, env: 1.35 },
  concrete: { colour: 0x9aa0a8, roughness: 0.78, metalness: 0.04, env: 0.55 },
  masonry:  { colour: 0x8d6a5b, roughness: 0.92, metalness: 0.0, env: 0.45 },
};

// ── geometry ──────────────────────────────────────────────────────────────────────────────────
// Walls only — four side quads, no top or bottom. The roof is separate so it can wear a different
// material without a per-mesh material array (the thing that made the old renderer draw-call
// bound), and the underside is never visible.
export function wallGeometry(w, d, h) {
  const hw = w / 2, hd = d / 2, hh = h / 2;
  const vRep = Math.max(2, Math.round(h / FLOOR)) / 8;      // /8 because the texture is 8 rows
  const uW = Math.max(2, Math.round(w / WINDOW_W)) / 8;
  const uD = Math.max(2, Math.round(d / WINDOW_W)) / 8;

  const pos = [], nor = [], uv = [];
  const quad = (a, b, c2, dd, n, uRep) => {
    for (const [p, u, v] of [[a, 0, 0], [b, uRep, 0], [c2, uRep, vRep], [a, 0, 0], [c2, uRep, vRep], [dd, 0, vRep]]) {
      pos.push(p[0], p[1], p[2]); nor.push(n[0], n[1], n[2]); uv.push(u, v);
    }
  };
  quad([-hw, -hh, hd], [hw, -hh, hd], [hw, hh, hd], [-hw, hh, hd], [0, 0, 1], uW);    // front
  quad([hw, -hh, -hd], [-hw, -hh, -hd], [-hw, hh, -hd], [hw, hh, -hd], [0, 0, -1], uW); // back
  quad([hw, -hh, hd], [hw, -hh, -hd], [hw, hh, -hd], [hw, hh, hd], [1, 0, 0], uD);    // right
  quad([-hw, -hh, -hd], [-hw, -hh, hd], [-hw, hh, hd], [-hw, hh, -hd], [-1, 0, 0], uD); // left

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uv), 2));
  return g;
}

// A flat lid. Merged into its own bucket, so every roof in the city is one draw call.
export function roofGeometry(w, d) {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  return g;
}

// The archetypes. Silhouette carries scale, so a townhouse is never mistaken for a skyscraper —
// and the family it returns is what decides whether it's glass, concrete or brick.
export function archetype(h, r, landmark) {
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
