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
  day:   { label: "Day",   top: "#7fb2e6", horizon: "#dce9f5", ground: "#8f9bb0", sun: 0xfff6e8, sunI: 2.6, amb: 0.85, hemi: 1.05, exposure: 1.0,  win: 0.62, water: 0x3f8fcc, land: 0x8a94ad, road: 0x59616f, pave: 0x9fa9bd, back: 0x6c7a68, park: 0x4f9a5c,
           sunV: 0.14, sunCol: "#fff7e0", glow: 0.30, clouds: 0.55, stars: 0 },
  dusk:  { label: "Dusk",  top: "#22304f", horizon: "#e8a06a", ground: "#4a4a58", sun: 0xffb877, sunI: 2.0, amb: 0.78, hemi: 0.95, exposure: 1.05, win: 1.0,  water: 0x35789f, land: 0x6f7591, road: 0x3f4a63, pave: 0x707f9c, back: 0x4b5749, park: 0x3f8452,
           sunV: 0.43, sunCol: "#ffcf8a", glow: 0.55, clouds: 0.38, stars: 0 },
  night: { label: "Night", top: "#080e1c", horizon: "#2a3d63", ground: "#141a2c", sun: 0x9fbfff, sunI: 0.7,  amb: 0.55, hemi: 0.7,  exposure: 1.2,  win: 1.7,  water: 0x1e4a74, land: 0x3d456a, road: 0x1e2436, pave: 0x414b66, back: 0x2b3330, park: 0x275f3a,
           sunV: 0.16, sunCol: "#e8eeff", glow: 0.10, clouds: 0, stars: 320 },
};

// ── the sky ───────────────────────────────────────────────────────────────────────────────────
// Procedural rather than a downloaded HDRI: it costs no bytes and it's what makes glass look like
// glass — a material with nothing to reflect reads as plastic however good its roughness is. The
// same gradient is ALSO the visible background; a flat background colour left a hard seam where
// the ground ended and the whole city read as a model on a table.
//
// v2 (the wow pass): the gradient gains a painted SUN with its glow (a moon at night), soft cloud
// banks at day/dusk, and a star field at night. Everything is deterministic (seeded LCG), drawn on
// one canvas, and PMREM-blurred into the environment — so the sun disc is also what the glass
// towers and the water actually reflect. Clouds keep clear of the u=0/1 seam because the texture
// wraps horizontally, and a cloud cut in half at the seam is exactly the kind of tell that breaks
// the sky illusion.
export function skyEnv(renderer, tod) {
  const { top, horizon, ground } = tod;
  const W = 1024, H = 512;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, top); grad.addColorStop(0.47, horizon);
  grad.addColorStop(0.53, ground); grad.addColorStop(1, ground);
  g.fillStyle = grad; g.fillRect(0, 0, W, H);

  let s = 20260729;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);

  // stars first, so clouds and glow sit over them
  for (let i = 0; i < (tod.stars || 0); i++) {
    const x = rnd() * W, y = rnd() * H * 0.44, m = rnd();
    g.fillStyle = `rgba(255,255,255,${(0.25 + m * 0.6).toFixed(2)})`;
    g.fillRect(x, y, m > 0.92 ? 2 : 1, m > 0.92 ? 2 : 1);
  }

  // the sun (or moon): a hard disc inside a wide radial glow, at a fixed azimuth that roughly
  // matches the directional light so reflections and shadows agree about where the light lives
  const su = 0.615 * W, sv = (tod.sunV ?? 0.2) * H;
  const glowR = (tod.glow ?? 0.3) * H;
  if (glowR > 0) {
    const halo = g.createRadialGradient(su, sv, 0, su, sv, glowR);
    halo.addColorStop(0, tod.sunCol + "e6"); halo.addColorStop(0.25, tod.sunCol + "55");
    halo.addColorStop(1, tod.sunCol + "00");
    g.fillStyle = halo; g.fillRect(su - glowR, sv - glowR, glowR * 2, glowR * 2);
  }
  g.fillStyle = tod.sunCol;
  g.beginPath(); g.arc(su, sv, tod.stars ? 9 : 13, 0, Math.PI * 2); g.fill();
  if (tod.stars) {                                   // bite a crescent out of the moon
    g.fillStyle = top;
    g.beginPath(); g.arc(su - 5, sv - 3, 10, 0, Math.PI * 2); g.fill();
  }

  // cloud banks: clusters of soft low-alpha puffs, kept off the wrap seam
  if (tod.clouds > 0) {
    const nBank = 7;
    for (let b = 0; b < nBank; b++) {
      const cx = W * (0.08 + rnd() * 0.84), cy = H * (0.16 + rnd() * 0.24);
      const wBank = W * (0.05 + rnd() * 0.08), warm = rnd() < 0.4 && tod.sunV > 0.3;
      for (let p = 0; p < 12; p++) {
        const px = cx + (rnd() - 0.5) * wBank * 2, py = cy + (rnd() - 0.5) * wBank * 0.4;
        const pr = wBank * (0.14 + rnd() * 0.2);
        const puff = g.createRadialGradient(px, py, 0, px, py, pr);
        const tint = warm ? "255,214,170" : "255,255,255";
        puff.addColorStop(0, `rgba(${tint},${(tod.clouds * (0.10 + rnd() * 0.08)).toFixed(3)})`);
        puff.addColorStop(1, `rgba(${tint},0)`);
        g.fillStyle = puff; g.beginPath(); g.arc(px, py, pr, 0, Math.PI * 2); g.fill();
      }
    }
  }

  const sky = new THREE.CanvasTexture(c);
  sky.mapping = THREE.EquirectangularReflectionMapping;
  sky.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(sky).texture;
  pmrem.dispose();
  return { env, sky };
}

// ── the water ─────────────────────────────────────────────────────────────────────────────────
// A tileable normal map from summed integer-cycle sinusoids (integer wave counts are what makes it
// tile), worn by two layers: the sea plane, and a translucent overlay at a different scale drifting
// the other way. Two counter-scrolling normal fields read as chop; one alone reads as a conveyor
// belt. Done as two ordinary MeshStandardMaterials rather than shader surgery — onBeforeCompile
// against three's normal-map chunk breaks on version bumps, and two draw calls for the entire
// harbour is nothing.
export function waterNormalTexture(size = 256) {
  const c = document.createElement("canvas"); c.width = size; c.height = size;
  const g = c.getContext("2d");
  const img = g.createImageData(size, size);
  const waves = [];
  let s = 96900;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 7; i++) {
    waves.push({ nx: Math.round(1 + rnd() * 5), ny: Math.round(1 + rnd() * 5), a: 0.4 + rnd() * 0.6, p: rnd() * Math.PI * 2 });
  }
  const hAt = (x, y) => {
    let h = 0;
    for (const w of waves) h += w.a * Math.sin((x * w.nx + y * w.ny) * Math.PI * 2 / size + w.p);
    return h;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = hAt(x + 1, y) - hAt(x - 1, y), dy = hAt(x, y + 1) - hAt(x, y - 1);
      const inv = 1 / Math.hypot(dx * 0.9, dy * 0.9, 2);
      const o = (y * size + x) * 4;
      img.data[o] = 128 + (-dx * 0.9 * inv) * 127;
      img.data[o + 1] = 128 + (-dy * 0.9 * inv) * 127;
      img.data[o + 2] = 128 + (2 * inv) * 127;
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function waterMaterials(tod) {
  const t1 = waterNormalTexture(), t2 = waterNormalTexture();
  t1.repeat.set(38, 38); t2.repeat.set(97, 97);
  // ⭐ THE SEA IS THE BOTTOM LAYER, SO BIAS IT TO ALWAYS LOSE. The base plane spans LEN×8 (~1,600
  // units) and sits only ~0.12 units under the borough land, so at distance the depth buffer can't
  // separate them and the sea sometimes wins the pixel — Brooklyn floats on water. This is real
  // z-fighting, GPU-precision-dependent, which is why a CPU rasteriser (the dev sandbox) can't
  // reproduce it. A POSITIVE polygonOffset pushes the sea's depth AWAY from the camera, so any land
  // stacked above it wins deterministically, at every distance and on every GPU. It only ever draws
  // where there is genuinely nothing above it — i.e. open water. (Contrast the chop OVERLAY: it must
  // NOT get an offset, because pulling that one toward the camera drew water over the land.)
  // ⭐ ROUGH ENOUGH THAT THE SUN DOESN'T BLOW IT OUT. At roughness 0.3 + envMapIntensity 1.15 the
  // sea was a near-mirror, so on a real GPU the sun's reflection clipped to a flat white sheet across
  // the whole harbour under ACES tone mapping (the sandbox's software renderer can't show env
  // reflections, so this only appeared on the Mac). Higher roughness spreads that specular into a
  // soft sheen instead of a blown streak, and a lower env lets the water's own blue read through — it
  // still reflects (that's what keeps it reading as water, not concrete), just doesn't overexpose.
  const base = new THREE.MeshStandardMaterial({
    color: tod.water, roughness: 0.5, metalness: 0.06,
    polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4,
    normalMap: t1, normalScale: new THREE.Vector2(0.6, 0.6), envMapIntensity: 0.7,
  });
  // The chop rides just above the base sea plane. Their flicker (both span LEN×8, so at distance the
  // depth buffer couldn't tell them apart) is handled by the camera's near plane — raised from 0.1 to
  // 0.5, ~5× more depth precision everywhere — plus a wider y-gap on the meshes. ⚠ DO NOT use
  // polygonOffset here: it biases this huge plane's depth toward the camera at EVERY distance, which
  // makes the transparent water draw OVER the borough land (Brooklyn sat on the sea). The near-plane
  // fix is depth-correct; the offset was a coplanar hack that broke the shoreline.
  const over = new THREE.MeshStandardMaterial({
    color: tod.water, transparent: true, opacity: 0.34, depthWrite: false,
    roughness: 0.42, metalness: 0.06,
    normalMap: t2, normalScale: new THREE.Vector2(0.42, 0.42), envMapIntensity: 0.7,
  });
  // slow, slightly divergent drift — the relative motion is what sells it
  const tick = now => {
    const t = now * 0.001;
    t1.offset.set(t * 0.012, t * 0.007);
    t2.offset.set(-t * 0.016, t * 0.010);
  };
  return { base, over, tick, textures: [t1, t2] };
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

// ⭐ FACADE ALBEDO — the free upgrade. The walls used to carry ONLY the emissive window map, so an
// unlit surface was a flat tinted box: all the detail was the glowing dots. This paints the actual
// surface — mullions, spandrels, coursing, per-panel tonal variation — on the SAME 8×8 window grid,
// applied through the material's `map`. It costs nothing that matters: no draw calls, no triangles,
// it rides UVs the geometry already has, and it registers with the emissive map so lit windows land
// inside their glass panel. Values sit high (multiply darkens), so the city keeps its brightness;
// the detail is in the darker mullions and the light/shade between panels. Family = different build:
// glass is curtain wall, concrete is punched windows in a slab, masonry is brick with stone trim.
export function facadeAlbedo(family) {
  const cell = 24, cols = 8, rows = 8, W = cols * cell, H = rows * cell;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d");
  let s = family === "glass" ? 9001 : family === "concrete" ? 313 : 5521;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const wall = family === "glass" ? "#e8eef7" : family === "concrete" ? "#d8dade" : "#dcccbf";
  g.fillStyle = wall; g.fillRect(0, 0, W, H);

  // fine surface noise so a plain wall isn't dead-flat under raking light
  for (let i = 0; i < (family === "glass" ? 220 : 900); i++) {
    g.fillStyle = `rgba(0,0,0,${(rnd() * 0.05).toFixed(3)})`;
    g.fillRect((rnd() * W) | 0, (rnd() * H) | 0, 1, 1);
  }
  if (family === "masonry") {                              // brick coursing — faint horizontal lines
    g.strokeStyle = "rgba(120,80,60,0.18)"; g.lineWidth = 1;
    for (let y = 3; y < H; y += 4) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); g.stroke(); }
  }

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const ox = x * cell, oy = y * cell;
      if (family === "glass") {
        // curtain wall: glass fills the cell, thin mullions frame it, panels vary slightly
        const tone = 0.86 + rnd() * 0.14;
        g.fillStyle = `rgba(150,170,200,${(0.5 * tone).toFixed(2)})`;
        g.fillRect(ox + 1, oy + 1, cell - 2, cell - 2);
        g.fillStyle = "rgba(40,52,70,0.55)";               // mullions (dark recessed frame)
        g.fillRect(ox, oy, cell, 2); g.fillRect(ox, oy, 2, cell);
      } else if (family === "concrete") {
        // punched window: smaller opening centred in the concrete, a pale sill under it
        g.fillStyle = "rgba(70,80,96,0.72)";
        g.fillRect(ox + 6, oy + 5, cell - 12, cell - 11);
        g.fillStyle = "rgba(255,255,255,0.16)";            // sill catches light
        g.fillRect(ox + 5, oy + cell - 6, cell - 10, 2);
      } else {
        // masonry: small window, warm stone lintel above
        g.fillStyle = "rgba(58,60,74,0.7)";
        g.fillRect(ox + 7, oy + 7, cell - 14, cell - 13);
        g.fillStyle = "rgba(226,214,196,0.5)";             // lintel + sill in stone
        g.fillRect(ox + 6, oy + 5, cell - 12, 2);
        g.fillRect(ox + 6, oy + cell - 5, cell - 12, 2);
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;                                        // crisper at the grazing angles facades live at — cheap
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

// ⭐ HOW TALL A WALLET STANDS. Holdings are power-law — the top wallet is ~2,800× the smallest
// resident — so the SHAPE of this curve decides whether the city reads as Manhattan or as a car
// park. A square root (what this used to be) is not nearly enough compression: it put the median
// resident at 0.62 units against a 0.92-unit footprint, i.e. a building WIDER THAN IT WAS TALL,
// with 78% of the city under two units. One needle over a field of doormats.
//
// So: mostly LOG (the right scale for a power law, and the scale every price chart in this repo
// already uses) with a little root mixed back in, which buys the whales their separation again —
// pure log flattens the top end until a 14M-token wallet is barely twice the median.
//
// HMIN is not decoration. The smallest resident here cleared 5,000 tokens held 90+ days; nothing
// in Manhattan is one storey, and neither is anyone who got in. The ordering stays exact either
// way — this only ever restates the same ranking on a scale you can see.
export function heightOf(score, minScore, maxScore, hmin, hmax) {
  const s = Math.max(Number.isFinite(score) ? score : 0, minScore);
  // Degenerate inputs (one wallet, or a min at zero) fall back to the root alone rather than
  // returning NaN and dropping the whole geometry bucket on the floor.
  const usable = minScore > 0 && maxScore > minScore;
  const lg = usable ? (Math.log(s) - Math.log(minScore)) / (Math.log(maxScore) - Math.log(minScore)) : 0;
  const rt = maxScore > 0 ? Math.sqrt(Math.max(0, s) / maxScore) : 0;
  const u = usable ? 0.50 * lg + 0.50 * rt : rt;
  return hmin + (hmax - hmin) * Math.max(0, Math.min(1, u));
}

// The archetypes. Silhouette carries scale, so a townhouse is never mistaken for a skyscraper —
// and the family it returns is what decides whether it's glass, concrete or brick.
// ⚠ The thresholds below are calibrated to heightOf's output range (HMIN..HMAX, currently
// 1.0..21). They were 1.8/4/9 back when the curve dumped three quarters of the city under two
// units; on the log curve that made every building glass. Retune them WITH the curve, never alone.
// Footprint and setback VARIETY comes from the wallet hash — footprint encodes nothing (height is
// the data), so it is free silhouette diversity. `r` is the wallet's own hash01; two decorrelated
// follow-ons derive from it so width, depth and setback don't all move together. Heights are never
// jittered: the ordering promise holds.
const fract = x => x - Math.floor(x);

// `landmark` is the top-wallet INDEX (0, 1, 2) or -1. The top three wear three DIFFERENT hero
// silhouettes — a spired setback tower, a slender flat-top, and a tapering antenna mast — so the
// crown of the skyline reads as landmarks, not as three copies of the same big box.
export function archetype(h, r, landmark = -1) {
  const P = [];
  const v1 = fract(r * 7.1317), v2 = fract(r * 13.077);
  if (landmark === 0) {                                // spired setback crown (the Empire pose)
    const base = h * 0.52, mid = h * 0.26, top = h * 0.16;
    P.push({ w: 1.00, d: 1.00, h: base, y: base / 2 });
    P.push({ w: 0.74, d: 0.74, h: mid, y: base + mid / 2 });
    P.push({ w: 0.48, d: 0.48, h: top, y: base + mid + top / 2 });
    return { parts: P, spire: h * 0.16, family: "glass" };
  }
  if (landmark === 1) {                                // slender flat-top (the 432 Park pose)
    P.push({ w: 1.02, d: 1.02, h: h * 0.06, y: h * 0.03 });
    P.push({ w: 0.60, d: 0.60, h: h * 0.97, y: h * 0.515 });
    return { parts: P, spire: 0, family: "glass" };
  }
  if (landmark === 2) {                                // tapering mast (the One WTC pose)
    const b = h * 0.34, m = h * 0.36, t = h * 0.30;
    P.push({ w: 0.98, d: 0.98, h: b, y: b / 2 });
    P.push({ w: 0.78, d: 0.78, h: m, y: b + m / 2 });
    P.push({ w: 0.56, d: 0.56, h: t, y: b + m + t / 2 });
    return { parts: P, spire: h * 0.22, family: "glass" };
  }
  if (h >= 11) {
    const setback = 0.62 + (v1 - 0.5) * 0.16;          // where the shaft steps in
    const split = 0.66 + (v2 - 0.5) * 0.16;            // how far up the step happens
    const w = 0.86 + v1 * 0.16, base = h * split, top = h * (1 - split);
    P.push({ w, d: w, h: base, y: base / 2 });
    P.push({ w: w * setback, d: w * setback, h: top, y: base + top / 2 });
    if (v2 > 0.72) {                                   // a second setback for a few — wedding-cake
      const cap = top * 0.4;
      P[1].h = top - cap; P[1].y = base + (top - cap) / 2;
      P.push({ w: w * setback * 0.68, d: w * setback * 0.68, h: cap, y: h - cap / 2 });
    }
    return { parts: P, spire: r > 0.5 ? h * 0.12 : 0, family: "glass" };
  }
  if (h >= 6) {
    const w = 0.78 + v1 * 0.16, d = 0.78 + v2 * 0.16;  // rectangular slabs, not just squares
    const base = h * 0.85, cap = h * 0.15;
    P.push({ w, d, h: base, y: base / 2 });
    P.push({ w: w * 0.78, d: d * 0.78, h: cap, y: base + cap / 2 });
    return { parts: P, spire: 0, family: "concrete" };
  }
  if (h >= 3.5) {
    const w = 0.88 + v1 * 0.12, d = 0.88 + v2 * 0.12;
    P.push({ w, d, h: h * 0.92, y: h * 0.46 });
    P.push({ w: w + 0.05, d: d + 0.05, h: h * 0.08, y: h * 0.96 });  // the cornice
    return { parts: P, spire: 0, family: "masonry" };
  }
  // low-rise: some face the avenue, some the street — the swap costs nothing and breaks the grid
  const w = v1 > 0.5 ? 1.02 : 0.86, d = v1 > 0.5 ? 0.86 : 1.02;
  P.push({ w, d, h: h * 0.88, y: h * 0.44 });
  P.push({ w: w + 0.06, d: d + 0.06, h: h * 0.12, y: h * 0.94 });
  return { parts: P, spire: 0, family: "masonry" };
}

// ── the infrastructure ────────────────────────────────────────────────────────────────────────
// Everything in the harbour: the exchange docks, the bridge to the other chains, and the monument.
// All returned as geometry arrays to be MERGED like the buildings, so the entire port costs a
// handful of draw calls rather than one per crate.

// A warehouse on a pier. Deliberately squat and wide — nothing here should be mistaken for a
// holder's building, because none of these coins belong to a person.
export function berthGeometry(b) {
  const out = [];
  const pier = new THREE.BoxGeometry(b.wide * 1.5, 0.18, b.len * 1.1);
  pier.translate(b.x, 0.09, b.z); out.push({ g: pier, mat: "pier" });
  const shed = new THREE.BoxGeometry(b.wide, b.tall, b.len * 0.82);
  shed.translate(b.x, b.tall / 2 + 0.18, b.z); out.push({ g: shed, mat: "shed" });
  // A pitched roof ridge, so a warehouse reads as a warehouse from above rather than as a slab.
  const ridge = new THREE.BoxGeometry(b.wide * 0.55, b.tall * 0.22, b.len * 0.84);
  ridge.translate(b.x, b.tall + 0.2, b.z); out.push({ g: ridge, mat: "shed" });
  // Gantry cranes, one per ~8% of exchange supply — Kraken gets a row of them and Binance gets none,
  // which is exactly the point of the chart.
  const cranes = Math.min(5, Math.floor(b.share / 0.08));
  for (let i = 0; i < cranes; i++) {
    const cz = b.z - b.len * 0.35 + (b.len * 0.7 * (i + 0.5)) / Math.max(1, cranes);
    const leg = new THREE.BoxGeometry(0.09, b.tall * 1.5, 0.09);
    leg.translate(b.x + b.wide * 0.85, b.tall * 0.75, cz); out.push({ g: leg, mat: "steel" });
    const arm = new THREE.BoxGeometry(b.wide * 1.6, 0.11, 0.11);
    arm.translate(b.x + b.wide * 0.2, b.tall * 1.5, cz); out.push({ g: arm, mat: "steel" });
  }
  return out;
}

// The Brooklyn Bridge. What makes it recognisable is not "a bridge" — it is two stone towers with
// POINTED GOTHIC ARCHES, a catenary main cable, and the fan of diagonal stays that no other
// suspension bridge has. The first pass had a deck, two posts and a sine wave, which read as a
// plank. Returned as {g, mat} so the towers can be stone while the cables are steel.
export function bridgeGeometry({ ax, az, bx, bz }, thickness = 1) {
  const out = [];
  const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz), ang = Math.atan2(dx, dz);
  const w = Math.max(0.5, 1.1 * thickness);          // deck width carries the bridged supply
  const DECK = 2.2, TOWER = 7.2;                     // deck height, tower height above it
  // place a geometry in bridge-local space: x across, z along, origin at the midpoint
  const put = (g, mat, lx, y, lz) => {
    g.rotateY(ang);
    g.translate(ax + dx * (0.5 + lz / len) + Math.cos(ang) * lx,
                y,
                az + dz * (0.5 + lz / len) - Math.sin(ang) * lx);
    out.push({ g, mat });
  };

  const deck = new THREE.BoxGeometry(w, 0.18, len);
  put(deck, "stone", 0, DECK, 0);
  for (const side of [-1, 1]) {                      // parapets, so the deck has an edge
    const r = new THREE.BoxGeometry(0.08, 0.22, len);
    put(r, "steel", side * w * 0.5, DECK + 0.2, 0);
  }

  const towerZ = [-len * 0.22, len * 0.22];
  for (const tz of towerZ) {
    // two piers with a gap between them — that gap IS the arch, read as a silhouette
    for (const side of [-1, 1]) {
      const pier = new THREE.BoxGeometry(w * 0.26, TOWER + DECK, w * 0.34);
      put(pier, "stone", side * w * 0.3, (TOWER + DECK) / 2, tz);
    }
    // the pointed arch: a lintel plus a cap, which is what turns two posts into a gothic opening
    const lintel = new THREE.BoxGeometry(w * 0.9, 0.42, w * 0.34);
    put(lintel, "stone", 0, DECK + TOWER * 0.42, tz);
    const cap = new THREE.BoxGeometry(w * 0.9, 0.5, w * 0.38);
    put(cap, "stone", 0, DECK + TOWER * 0.93, tz);
    const spire = new THREE.ConeGeometry(w * 0.16, 0.9, 4);
    put(spire, "stone", 0, DECK + TOWER + 0.6, tz);
  }

  // Main cables: a real catenary through the tower tops, sagging to mid-span and running down to
  // the anchorages at each end.
  const topY = DECK + TOWER * 0.86, midY = DECK + 1.1, endY = DECK + 0.5;
  const cableY = t => {                              // t is -0.5..0.5 along the span
    const a = Math.abs(t);
    if (a <= 0.22) { const u = a / 0.22; return midY + (topY - midY) * u * u; }
    const u = (a - 0.22) / 0.28;
    return topY + (endY - topY) * u * u;
  };
  const N = 26;
  for (const side of [-1, 1]) {
    for (let i = 0; i < N; i++) {
      const t0 = -0.5 + i / N, t1 = -0.5 + (i + 1) / N;
      const y0 = cableY(t0), y1 = cableY(t1);
      const seg = new THREE.BoxGeometry(0.07, Math.hypot(y1 - y0, len / N), 0.07);
      seg.rotateX(Math.atan2(len / N, y1 - y0) - Math.PI / 2);
      put(seg, "steel", side * w * 0.45, (y0 + y1) / 2, ((t0 + t1) / 2) * len);
      // hangers down to the deck — the vertical comb that says "suspension"
      if (i % 2 === 0 && Math.abs(t0) < 0.44) {
        const h = Math.max(0.2, y0 - DECK);
        const hang = new THREE.BoxGeometry(0.045, h, 0.045);
        put(hang, "steel", side * w * 0.45, DECK + h / 2, t0 * len);
      }
    }
    // the diagonal stays — the fan unique to this bridge
    for (const tz of towerZ) {
      for (let i = 1; i <= 5; i++) {
        const reach = len * 0.055 * i, dyy = topY - DECK;
        const seg = new THREE.BoxGeometry(0.05, Math.hypot(dyy, reach), 0.05);
        seg.rotateX(Math.atan2(reach, dyy) * (tz < 0 ? -1 : 1));
        put(seg, "steel", side * w * 0.42, DECK + dyy / 2, tz + (tz < 0 ? -reach / 2 : reach / 2));
      }
    }
  }
  return out;
}

// The monument on Liberty Island. A silhouette, not a sculpture — at the distance this is viewed
// from, the outline is the whole recognition, and the outline is pedestal + figure + raised arm +
// torch. The torch is emissive on purpose: 69M coins burned, a flame that cannot go out.
export function monumentGeometry(x, z, scale = 1) {
  const s = scale, out = [];
  const add = (g, mat) => out.push({ g, mat });
  const base = new THREE.BoxGeometry(3.2 * s, 1.1 * s, 3.2 * s); base.translate(x, 0.55 * s, z);
  add(base, "stone");
  const plinth = new THREE.BoxGeometry(2.2 * s, 2.6 * s, 2.2 * s); plinth.translate(x, 2.4 * s, z);
  add(plinth, "stone");
  const shoulder = new THREE.BoxGeometry(2.6 * s, 0.3 * s, 2.6 * s); shoulder.translate(x, 3.85 * s, z);
  add(shoulder, "stone");
  // The figure: a tapered column, which is what the robe reads as in silhouette.
  const body = new THREE.CylinderGeometry(0.42 * s, 0.95 * s, 4.2 * s, 8);
  body.translate(x, 6.1 * s, z); add(body, "copper");
  const head = new THREE.CylinderGeometry(0.3 * s, 0.34 * s, 0.62 * s, 8);
  head.translate(x, 8.5 * s, z); add(head, "copper");
  // The crown — seven points, which is the detail people actually count.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 - Math.PI / 2;
    const spike = new THREE.ConeGeometry(0.07 * s, 0.6 * s, 4);
    spike.rotateZ(-Math.cos(a) * 0.5); spike.rotateX(Math.sin(a) * 0.5);
    spike.translate(x + Math.cos(a) * 0.4 * s, 9.05 * s, z + Math.sin(a) * 0.4 * s);
    add(spike, "copper");
  }
  // The raised right arm. It has to actually MEET the shoulder and carry the torch in one straight
  // line, or the torch floats off to the side — which is exactly what the old numbers did: the base
  // sat at x≈0.97 (outside the body's ~0.45 radius up here) and rotateZ(+0.22) leaned the top back
  // toward the head while the torch sat further OUT at x+1.2, so nothing joined up. Now the base
  // tucks just inside the body's top edge and the arm tilts OUT (negative Z leans the top toward
  // +x), so shoulder → arm → torch → flame is one continuous diagonal.
  const arm = new THREE.BoxGeometry(0.24 * s, 2.1 * s, 0.24 * s);
  arm.rotateZ(-0.3); arm.translate(x + 0.58 * s, 8.95 * s, z); add(arm, "copper");
  const torch = new THREE.CylinderGeometry(0.3 * s, 0.16 * s, 0.42 * s, 8);
  torch.translate(x + 0.89 * s, 10.15 * s, z); add(torch, "gold");
  const flame = new THREE.ConeGeometry(0.26 * s, 0.85 * s, 8);
  flame.translate(x + 0.89 * s, 10.75 * s, z); add(flame, "flame");
  // The tablet in the other arm — small, but it fixes the pose so the figure isn't just a column.
  const tablet = new THREE.BoxGeometry(0.5 * s, 0.75 * s, 0.14 * s);
  tablet.rotateZ(-0.35); tablet.translate(x - 0.6 * s, 7.2 * s, z + 0.3 * s); add(tablet, "stone");
  return out;
}
