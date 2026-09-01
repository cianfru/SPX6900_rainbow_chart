// THE RAINBOW ROAD — an OutRun-style driving video. The road is a multi-lane highway; each LANE is a
// rainbow valuation band and the car's lane is SPX6900's ACTUAL band over history (starts cheap at
// launch, climbs as SPX ran up, drops back — the swerves are the real band changes). A camera follows
// the car so you see a handful of wide lanes with dashed paint, winding curves + hills, traffic to
// overtake, palms, a bright coastal sky, retro HUD. SVG frames → Resvg → ffmpeg (H.264). $0, Node-only.
//
//   node tools/render-lane-video.mjs --format=vertical --seconds=30 --out=out/rainbow-road.mp4
//   flags: --format=vertical|wide|square  --fps=30  --seconds=30  --from=YYYY-MM-DD  --pixel=N
//          --car/--sky/--palm/--cars=<png[,png]>  --announce="<BAND>"
//   FOR POSTING TO X (survives its H.264 re-encode): add --soften=0.8 --crf=16 — softens the razor
//   pixel edges to a ~1px ramp + high bitrate, so X's transcode doesn't ring/block them (still pixel-art).
import { Resvg } from "@resvg/resvg-js";
import { spawn, execSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { FONT } from "../scripts/bot/font.mjs";
import { buildModel, bandIndex, dayN, BAND_LABELS } from "../src/models.js";
import { DEFAULT_RAW } from "../src/data.js";

const FORMATS = { vertical: { W: 1080, H: 1920 }, wide: { W: 1280, H: 720 }, square: { W: 1080, H: 1080 } };
const arg = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const N = BAND_LABELS.length, VIS = 4;           // 9 bands; ~4 wider lanes visible so a car ≈ one lane
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const usd = v => v >= 1 ? "$" + v.toFixed(2) : v >= 0.01 ? "$" + v.toFixed(3) : "$" + v.toFixed(5);
const fDate = d => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r1 = v => Number(v).toFixed(1);
const bandCol = i => BAND_LABELS[clamp(Math.round(i), 0, N - 1)].c;

// ── sprites (rear view) ──
// A Testarossa-inspired convertible, rear view: wide low stance, the couple in the open cockpit, and
// the signature full-width horizontal tail slats. A homage — not the ripped sprite.
function playerCar(w, lean) {
  const hw = w / 2, h = w * 0.74, b = h * 0.5, deckTop = -h * 0.34, screenTop = -h * 0.62, screenW = w * 0.5;
  let slats = "";
  for (let i = 0; i < 5; i++) slats += `<rect x="${r1(-hw * 0.82)}" y="${r1(b - h * 0.42 + i * h * 0.07)}" width="${r1(hw * 1.64)}" height="${r1(h * 0.035)}" rx="2" fill="${i % 2 ? "#ff4d4d" : "#3a0d10"}"/>`;
  return `<g transform="rotate(${(lean * 7).toFixed(2)})">
    <ellipse cx="0" cy="${r1(b + 5)}" rx="${r1(hw * 1.12)}" ry="${r1(w * 0.1)}" fill="rgba(0,0,0,0.4)"/>
    <rect x="${r1(-hw * 1.02)}" y="${r1(b - h * 0.2)}" width="${r1(w * 0.16)}" height="${r1(h * 0.24)}" rx="4" fill="#141414"/>
    <rect x="${r1(hw * 0.86)}" y="${r1(b - h * 0.2)}" width="${r1(w * 0.16)}" height="${r1(h * 0.24)}" rx="4" fill="#141414"/>
    <!-- couple in the open cockpit -->
    <circle cx="${r1(-w * 0.13)}" cy="${r1(screenTop + h * 0.06)}" r="${r1(w * 0.088)}" fill="#8a5a3a"/>
    <circle cx="${r1(w * 0.13)}" cy="${r1(screenTop + h * 0.06)}" r="${r1(w * 0.088)}" fill="#f2d16b"/>
    <!-- windshield frame + deck -->
    <path d="M ${r1(-screenW / 2)} ${r1(screenTop)} L ${r1(screenW / 2)} ${r1(screenTop)} L ${r1(screenW / 1.55)} ${r1(deckTop)} L ${r1(-screenW / 1.55)} ${r1(deckTop)} Z" fill="#0c0f16" opacity="0.9"/>
    <!-- wide wedge body -->
    <path d="M ${r1(-hw * 0.8)} ${r1(deckTop)} Q ${r1(-hw * 1.02)} ${r1(deckTop + h * 0.3)} ${r1(-hw)} ${b} L ${r1(hw)} ${b} Q ${r1(hw * 1.02)} ${r1(deckTop + h * 0.3)} ${r1(hw * 0.8)} ${r1(deckTop)} Z" fill="url(#carbody)" stroke="#5a0b12" stroke-width="2"/>
    <!-- side strakes hint -->
    <rect x="${r1(-hw * 0.98)}" y="${r1(b - h * 0.24)}" width="${r1(hw * 0.14)}" height="${r1(h * 0.14)}" rx="2" fill="#7a0d16"/>
    <rect x="${r1(hw * 0.84)}" y="${r1(b - h * 0.24)}" width="${r1(hw * 0.14)}" height="${r1(h * 0.14)}" rx="2" fill="#7a0d16"/>
    <!-- the signature full-width tail slats -->
    <rect x="${r1(-hw * 0.84)}" y="${r1(b - h * 0.45)}" width="${r1(hw * 1.68)}" height="${r1(h * 0.4)}" rx="4" fill="#120507"/>
    ${slats}
  </g>`;
}
function truck(w) {
  const h = w * 1.5, hw = w / 2;
  return `<g><ellipse cx="0" cy="${r1(h * 0.5 + 5)}" rx="${r1(hw * 1.1)}" ry="${r1(w * 0.12)}" fill="rgba(0,0,0,0.38)"/>
    <rect x="${r1(-hw)}" y="${r1(-h * 0.5)}" width="${r1(w)}" height="${r1(h)}" rx="6" fill="url(#truckbody)" stroke="#1b2740" stroke-width="2"/>
    <rect x="${r1(-hw + w * 0.08)}" y="${r1(-h * 0.5 + w * 0.08)}" width="${r1(w - w * 0.16)}" height="${r1(h * 0.5)}" rx="4" fill="#dfe6f2" opacity="0.5"/>
    <line x1="0" y1="${r1(-h * 0.5)}" x2="0" y2="${r1(h * 0.5)}" stroke="#1b2740" stroke-width="2"/>
    <rect x="${r1(-hw * 0.9)}" y="${r1(h * 0.5 - h * 0.1)}" width="${r1(w * 0.2)}" height="${r1(h * 0.07)}" rx="3" fill="#ff5a3b"/>
    <rect x="${r1(hw * 0.7)}" y="${r1(h * 0.5 - h * 0.1)}" width="${r1(w * 0.2)}" height="${r1(h * 0.07)}" rx="3" fill="#ff5a3b"/></g>`;
}
function trafficCar(w, col) {
  const h = w * 0.8, hw = w / 2, b = h * 0.5, roofW = w * 0.6;
  return `<g><ellipse cx="0" cy="${r1(b + 5)}" rx="${r1(hw * 1.05)}" ry="${r1(w * 0.1)}" fill="rgba(0,0,0,0.35)"/>
    <path d="M ${-roofW / 2} ${-h * 0.5} L ${roofW / 2} ${-h * 0.5} L ${hw} ${b} L ${-hw} ${b} Z" fill="${col}" stroke="#0a0a10" stroke-width="2"/>
    <path d="M ${r1(-roofW / 2.1)} ${r1(-h * 0.47)} L ${r1(roofW / 2.1)} ${r1(-h * 0.47)} L ${r1(roofW / 1.6)} ${r1(-h * 0.12)} L ${r1(-roofW / 1.6)} ${r1(-h * 0.12)} Z" fill="#0c0f16" opacity="0.9"/>
    <rect x="${r1(-hw * 0.9)}" y="${r1(b - h * 0.28)}" width="${r1(w * 0.22)}" height="${r1(h * 0.09)}" rx="3" fill="#ffce3b"/>
    <rect x="${r1(hw * 0.68)}" y="${r1(b - h * 0.28)}" width="${r1(w * 0.22)}" height="${r1(h * 0.09)}" rx="3" fill="#ffce3b"/></g>`;
}
function palm(x, y, s) {
  const th = 128 * s, tw = Math.max(2, 10 * s), fr = 72 * s, lw = Math.max(2, 7 * s);
  let f = "", sh = "";
  // two frond layers (dark under, bright over) for depth
  for (const [col, w2, dy] of [["#16803f", lw + 2, 0], ["#33c46a", lw, -1.5 * s]])
    for (let a = -2.2; a <= 2.2; a += 1.1) f += `<path d="M ${r1(x)} ${r1(y - th + dy)} q ${r1(a * fr * 0.5)} ${r1(-fr * 0.55)} ${r1(a * fr)} ${r1(-fr * 0.12 + Math.abs(a) * fr * 0.28)}" stroke="${col}" stroke-width="${r1(w2)}" fill="none" stroke-linecap="round"/>`;
  sh += `<ellipse cx="${r1(x)}" cy="${r1(y + 2)}" rx="${r1(Math.max(3, 16 * s))}" ry="${r1(Math.max(1.5, 5 * s))}" fill="rgba(0,0,0,0.18)"/>`;
  return `${sh}<path d="M ${r1(x - tw / 2)} ${r1(y)} Q ${r1(x - tw * 0.9)} ${r1(y - th * 0.5)} ${r1(x - tw / 3)} ${r1(y - th)} L ${r1(x + tw / 3)} ${r1(y - th)} Q ${r1(x + tw * 0.9)} ${r1(y - th * 0.5)} ${r1(x + tw / 2)} ${r1(y)} Z" fill="#7a5230"/><circle cx="${r1(x - 3 * s)}" cy="${r1(y - th)}" r="${r1(Math.max(1.5, 4 * s))}" fill="#8a5a2a"/><circle cx="${r1(x + 3 * s)}" cy="${r1(y - th + 3 * s)}" r="${r1(Math.max(1.5, 4 * s))}" fill="#8a5a2a"/>${f}`;
}
function bush(x, y, s) {
  const r = 22 * s;
  return `<g><ellipse cx="${r1(x)}" cy="${r1(y + 2)}" rx="${r1(r * 1.2)}" ry="${r1(r * 0.35)}" fill="rgba(0,0,0,0.15)"/><ellipse cx="${r1(x)}" cy="${r1(y - r * 0.4)}" rx="${r1(r)}" ry="${r1(r * 0.85)}" fill="#1f8a3f"/><ellipse cx="${r1(x - r * 0.7)}" cy="${r1(y - r * 0.1)}" rx="${r1(r * 0.7)}" ry="${r1(r * 0.6)}" fill="#2aa04c"/><ellipse cx="${r1(x + r * 0.7)}" cy="${r1(y - r * 0.1)}" rx="${r1(r * 0.7)}" ry="${r1(r * 0.6)}" fill="#2aa04c"/><ellipse cx="${r1(x)}" cy="${r1(y - r * 0.6)}" rx="${r1(r * 0.55)}" ry="${r1(r * 0.5)}" fill="#3cc060"/></g>`;
}
function rock(x, y, s) {
  const r = 20 * s;
  return `<g><ellipse cx="${r1(x)}" cy="${r1(y + 2)}" rx="${r1(r * 1.15)}" ry="${r1(r * 0.3)}" fill="rgba(0,0,0,0.2)"/><path d="M ${r1(x - r)} ${r1(y)} Q ${r1(x - r * 1.1)} ${r1(y - r * 0.9)} ${r1(x - r * 0.2)} ${r1(y - r)} Q ${r1(x + r * 0.9)} ${r1(y - r * 1.1)} ${r1(x + r)} ${r1(y)} Z" fill="#8b8f98"/><path d="M ${r1(x - r * 0.2)} ${r1(y - r)} Q ${r1(x + r * 0.9)} ${r1(y - r * 1.1)} ${r1(x + r)} ${r1(y)} L ${r1(x + r * 0.2)} ${r1(y)} Z" fill="#6b7079"/><ellipse cx="${r1(x - r * 0.35)}" cy="${r1(y - r * 0.55)}" rx="${r1(r * 0.28)}" ry="${r1(r * 0.2)}" fill="#a7abb3"/></g>`;
}

function scene({ W, H, carLane, camLane, band, date, price, scroll, progress, curve, hill, traffic, lean, carImg, carAspect, skyImg, palmImg, palmAspect, trafficImgs, frame, announce }) {
  const hy = H * 0.52, zN = 1, zF = 9;                             // lower camera: more sky, road more edge-on (OutRun eye height)
  const ds = t => zN / (zN + (zF - zN) * t);                       // depth scale (1 near → small far)
  const yOf = t => hy + (H - hy) * ds(t) - hill * Math.sin(t * Math.PI) * H * 0.05;
  const laneW = t => (W * 1.0 / VIS) * ds(t);                      // wide lanes (a car ≈ one lane)
  const centerX = t => W / 2 + curve * (t * t) * (W * 0.42);       // winding
  const laneX = (L, t) => centerX(t) + (L - camLane) * laneW(t);
  const M = 34, ts = Array.from({ length: M + 1 }, (_, k) => k / M);
  // FLIPPED colours: screen-left is the DEAR end (Max Bubble), screen-right is the CHEAP end (Fire Sale)
  const yH = yOf(1), y0 = yOf(0), col = i => BAND_LABELS[clamp(N - 1 - i, 0, N - 1)].c;
  const glow = bandCol(band);

  // ── sky ──
  let s;
  if (skyImg) {
    // the real OutRun sky plate: fill the whole sky with the plate's own blue, then lay the cloud photo
    // along the horizon shifted LEFT so a strip of blue reaches the horizon on the right (owner's note).
    const skyAspect = 1687 / 864;                                  // cropped plate w/h
    const pw = W * 1.16, ph = pw / skyAspect, px = -W * 0.24;      // slight left crop
    s = `<rect width="${W}" height="${r1(yH + 20)}" fill="#0194fe"/>`
      + `<image href="${skyImg}" x="${r1(px)}" y="${r1(yH - ph)}" width="${r1(pw)}" height="${r1(ph)}" preserveAspectRatio="xMidYMax slice" image-rendering="pixelated"/>`;
  } else {
    s = `<rect width="${W}" height="${r1(yH + 20)}" fill="url(#sky)"/>
      <circle cx="${W * 0.5}" cy="${r1(yH * 0.5)}" r="${r1(W * 0.2)}" fill="url(#sunglow)"/>
      <circle cx="${W * 0.5}" cy="${r1(yH * 0.5)}" r="${r1(W * 0.1)}" fill="url(#sun)"/>`;
    let mtn = `M 0 ${r1(yH)}`;
    for (let mx = 0; mx <= W; mx += W / 12) mtn += ` L ${r1(mx)} ${r1(yH - 22 - 26 * Math.abs(Math.sin(mx * 0.011 + 1)))}`;
    mtn += ` L ${W} ${r1(yH)} Z`;
    s += `<path d="${mtn}" fill="#6f8fd6" opacity="0.55"/>`;
    const cloud = (clx, cly, r, op) => {
      const lobe = (dx, dy, rr, fill) => `<ellipse cx="${r1(clx + dx)}" cy="${r1(cly + dy)}" rx="${r1(rr)}" ry="${r1(rr * 0.72)}" fill="${fill}"/>`;
      return `<g opacity="${op}">${lobe(0, r * 0.18, r * 1.05, "#d7e3f5")}${lobe(-r * 0.72, r * 0.24, r * 0.62, "#d7e3f5")}${lobe(r * 0.74, r * 0.24, r * 0.68, "#d7e3f5")}`
        + `${lobe(0, 0, r, "#ffffff")}${lobe(-r * 0.62, r * 0.12, r * 0.6, "#ffffff")}${lobe(r * 0.64, r * 0.12, r * 0.66, "#ffffff")}${lobe(-r * 0.25, -r * 0.28, r * 0.55, "#ffffff")}${lobe(r * 0.3, -r * 0.24, r * 0.5, "#ffffff")}</g>`;
    };
    for (const [fx, fy, rs, op] of [[0.14, 0.36, 60, 0.97], [0.52, 0.2, 46, 0.9], [0.85, 0.44, 66, 0.95], [0.3, 0.58, 40, 0.85], [0.7, 0.62, 52, 0.92], [0.03, 0.66, 44, 0.8]]) {
      const clx = ((fx - scroll * 0.025) % 1 + 1) % 1 * W;
      s += cloud(clx, fy * yH, rs, op);
    }
  }
  // ground + coastal horizon (sea gradient + sand)
  s += `<rect x="0" y="${r1(yH)}" width="${W}" height="${r1(H - yH)}" fill="url(#grass)"/>
    <rect x="0" y="${r1(yH - 14)}" width="${W}" height="14" fill="url(#sea)"/>
    <rect x="0" y="${r1(yH)}" width="${W}" height="9" fill="#e8c98a"/>`;

  // ── the rainbow is FIXED: 9 lanes in world space (lane 0 = Fire Sale on the left … lane 8 = Max
  // Bubble on the right). The camera pans to follow the car, so only ~VIS lanes fit on screen and the
  // rest run off to the sides — you see the car move ALONG the rainbow, colours never flip sides. ──
  const eL = 0, eR = N;                                            // fixed rainbow edges
  const leftPts = ts.map(t => `${r1(laneX(eL, t))},${r1(yOf(t))}`).join(" ");
  const rightPts = ts.slice().reverse().map(t => `${r1(laneX(eR, t))},${r1(yOf(t))}`).join(" ");
  s += `<clipPath id="road"><polygon points="${leftPts} ${rightPts}"/></clipPath><g clip-path="url(#road)">`;
  for (let L = 0; L < N; L++) {                                    // all 9 bands; off-screen ones clip away
    const lp = ts.map(t => `${r1(laneX(L, t))},${r1(yOf(t))}`).join(" ");
    const rp = ts.slice().reverse().map(t => `${r1(laneX(L + 1, t))},${r1(yOf(t))}`).join(" ");
    s += `<polygon points="${lp} ${rp}" fill="${col(L)}"/>`;
  }
  s += `<polygon points="${leftPts} ${rightPts}" fill="url(#roadfade)"/></g>`;

  // ── dashed white lane paint between the bands (scrolls) ──
  for (let L = 1; L < N; L++)
    for (let k = 0; k < M; k++) {
      if ((k + Math.floor(scroll * M)) % 2) continue;              // intermittent
      const ta = k / M, tb = (k + 1) / M, wln = clamp(7 * ds(ta), 0.6, 7);
      s += `<line x1="${r1(laneX(L, ta))}" y1="${r1(yOf(ta))}" x2="${r1(laneX(L, tb))}" y2="${r1(yOf(tb))}" stroke="rgba(255,255,255,0.85)" stroke-width="${r1(wln)}"/>`;
    }
  // ── red/white rumble strips at the rainbow edges (= the valuation extremes) ──
  const ph = Math.floor(scroll * M);
  for (let k = 0; k < M; k++) {
    const ta = k / M, tb = (k + 1) / M, c = ((k + ph) % 2 === 0) ? "#e11d2a" : "#f8fafc";
    const kwa = clamp(34 * ds(ta) + 3, 3, 40), kwb = clamp(34 * ds(tb) + 3, 3, 40);
    const la = laneX(eL, ta), lb = laneX(eL, tb), ra = laneX(eR, ta), rb = laneX(eR, tb);
    s += `<polygon points="${r1(la - kwa)},${r1(yOf(ta))} ${r1(la)},${r1(yOf(ta))} ${r1(lb)},${r1(yOf(tb))} ${r1(lb - kwb)},${r1(yOf(tb))}" fill="${c}"/>`;
    s += `<polygon points="${r1(ra)},${r1(yOf(ta))} ${r1(ra + kwa)},${r1(yOf(ta))} ${r1(rb + kwb)},${r1(yOf(tb))} ${r1(rb)},${r1(yOf(tb))}" fill="${c}"/>`;
  }

  // ── roadside scenery beyond the rainbow edges, far→near so it scrolls past ──
  const SC = 14;
  if (palmImg) {
    // OutRun style: the SAME palm sprite repeated, growing as it nears. Collect far→near then draw sorted
    // so a near palm overlaps a far one. Base-anchored on the ground line just off each rumble edge.
    const items = [];
    for (let k = 0; k < SC; k++) {
      let t = ((k / SC) - scroll) % 1; if (t < 0) t += 1; if (t < 0.02 || t > 0.985) continue;
      const yy = yOf(t), pw = clamp(W * 0.30 * ds(t), 3, W * 0.55), ph = pw / palmAspect;
      const emit = bx => `<image href="${palmImg}" x="${r1(bx - pw / 2)}" y="${r1(yy - ph)}" width="${r1(pw)}" height="${r1(ph)}" image-rendering="pixelated"/>`;
      items.push([t, emit(laneX(eL, t) - pw * 0.42)]);            // left of the rainbow
      items.push([t, emit(laneX(eR, t) + pw * 0.42)]);            // right of the rainbow
      if (k % 3 === 0) items.push([t, emit(laneX(eR, t) + pw * 1.15)]);  // a sparser second row on the right (palm-lined like stage 1)
    }
    items.sort((a, b) => b[0] - a[0]);                            // far (large t) first
    for (const [, g] of items) s += g;
  } else {
    for (let k = 0; k < SC; k++) {
      let t = ((k / SC) - scroll * 1.0) % 1; if (t < 0) t += 1; if (t < 0.03 || t > 0.97) continue;
      const sc = clamp(1.0 * ds(t) * 2.2, 0.04, 1.05), yy = yOf(t);
      const put = (bx, kind, jx) => { const x = bx + jx * sc; return kind === 0 ? palm(x, yy, sc) : kind === 1 ? bush(x, yy, sc * 0.9) : rock(x, yy, sc * 0.85); };
      const kindL = (k * 7) % 3, kindR = (k * 5 + 1) % 3;
      s += put(laneX(eL, t) - 44 * sc, kindL, -18);
      s += put(laneX(eR, t) + 44 * sc, kindR, 18);
      if (k % 2 === 0) { s += put(laneX(eL, t) - 130 * sc, (kindL + 1) % 3, -20); s += put(laneX(eR, t) + 130 * sc, (kindR + 2) % 3, 20); }
    }
  }

  // ── traffic to overtake (far → near), then the player car on top. Sized to match the player car at
  //    the same depth so proportions stay consistent. ──
  const carDepthScale = ds(0.02), useImgs = trafficImgs && trafficImgs.length;
  for (const v of traffic.slice().sort((a, b) => b.z - a.z)) {
    if (v.z < 0.02 || v.z > 1) continue;
    const t = v.z, x = laneX(v.lane + 0.5, t), yv = yOf(t);
    if (useImgs) {
      // rear-3/4 sprite: scale by depth, base-anchored on the road, MIRRORED by which side of the view it's
      // on so a car overtaken on the left and one on the right both angle the natural way.
      const img = trafficImgs[v.ci % trafficImgs.length], asp = img.aspect || 1.2;
      const w = W * 0.26 * (ds(t) / carDepthScale), h = w / asp, sx = (v.lane + 0.5) < camLane ? -1 : 1;
      s += `<g transform="translate(${r1(x)},${r1(yv)}) scale(${sx},1)"><image href="${img.uri}" x="${r1(-w / 2)}" y="${r1(-h)}" width="${r1(w)}" height="${r1(h)}" image-rendering="pixelated"/></g>`;
    } else {
      const w = W * 0.19 * (ds(t) / carDepthScale) * (v.type === "truck" ? 0.98 : 0.86);
      s += `<g transform="translate(${r1(x)},${r1(yv - w * 0.5)})">${v.type === "truck" ? truck(w) : trafficCar(w, v.col)}</g>`;
    }
  }
  // OutRun camera height: the car sits LOW + CLOSE, so it's big in the lower-centre (a fixed fraction
  // of the frame, not tied to the far-shrinking lane width). It still tracks its lane (band).
  // GUARDRAIL: even if SPX drops below the Fire Sale floor (or runs past Max Bubble), the car body is
  // hard-clamped between the rumble edges so it never drives onto the grass.
  const tCar = 0.02, cw = carImg ? W * 0.26 : W * 0.21;             // the real sprite reads a touch bigger
  const iw = cw, ih = carImg && carAspect > 0 ? cw / carAspect : cw;
  const carY = yOf(tCar) - ih * 0.42;
  // keep the car both ON the rainbow AND fully inside the frame — even if the camera is still catching up
  // to a fast band jump, so it can never be clipped at a screen edge.
  const scLo = cw * 0.5 + W * 0.015, scHi = W - cw * 0.5 - W * 0.015;
  const loX = Math.max(laneX(eL, tCar) + cw * 0.5, scLo), hiX = Math.min(laneX(eR, tCar) - cw * 0.5, scHi);
  const carX = clamp(laneX(carLane + 0.5, tCar), Math.min(loX, hiX), Math.max(loX, hiX));
  // OutRun turn smoke: white puffs kicked up behind the rear wheels while cornering (drawn UNDER the car).
  // The harder the lean, the denser + more it favours the OUTSIDE wheel. Procedural so it billows/scales.
  if (Math.abs(lean) > 0.12) {
    const baseOp = clamp(Math.abs(lean) * 1.15, 0, 0.85), NP = 6;
    const jr = n => { const x = Math.sin(frame * 12.9898 + n * 78.233) * 43758.545; return x - Math.floor(x); };
    const puff = (px, py, r, op) => `<g opacity="${op.toFixed(2)}"><circle cx="${r1(px)}" cy="${r1(py)}" r="${r1(r)}" fill="#eef1f6"/><circle cx="${r1(px - r * 0.5)}" cy="${r1(py + r * 0.2)}" r="${r1(r * 0.68)}" fill="#ffffff"/><circle cx="${r1(px + r * 0.55)}" cy="${r1(py + r * 0.12)}" r="${r1(r * 0.6)}" fill="#e7ecf3"/><circle cx="${r1(px)}" cy="${r1(py - r * 0.42)}" r="${r1(r * 0.55)}" fill="#ffffff"/></g>`;
    for (const side of [-1, 1]) {
      const wx = carX + side * iw * 0.32, wy = carY + ih * 0.40;    // behind a rear wheel
      const bias = side === Math.sign(lean) ? 1 : 0.5;              // more smoke on the outside of the turn
      for (let k = 0; k < NP; k++) {
        const j1 = jr(k + (side > 0 ? 100 : 0)) - 0.5, j2 = jr(k * 3 + (side > 0 ? 7 : 0)) - 0.5;
        const px = wx + side * (iw * 0.05 + k * iw * 0.05) + j1 * cw * 0.12;
        const py = wy + k * ih * 0.085 + j2 * cw * 0.08;
        const op = clamp(baseOp * bias * (1 - k / (NP + 1)), 0, 0.9);
        s += puff(px, py, cw * (0.09 + k * 0.028), op);
      }
    }
  }
  const carSprite = carImg
    ? `<image href="${carImg}" x="${r1(-iw / 2)}" y="${r1(-ih / 2)}" width="${r1(iw)}" height="${r1(ih)}" transform="rotate(${r1(-lean * 3.2)})" preserveAspectRatio="xMidYMid meet" image-rendering="pixelated"/>`
    : playerCar(cw, clamp(lean, -1, 1));
  s += `<g transform="translate(${r1(carX)},${r1(carY)})">${carSprite}</g>`;
  s += hud({ W, H, band, date, price, progress, announce });
  return s;
}

// A DELIBERATELY SIMPLE HUD (rendered in the same pixel pass as the scene): a title, the date + price,
// and one big band chip. No legend — the road colours + the chip already say the band. Fonts are large so
// they stay readable through a moderate pixel pass (no separate crisp layer needed). Sizes scale with W.
function hud({ W, H, band, date, price, progress, announce }) {
  const glow = bandCol(band), k = W / 1080;
  let s = `<rect width="${W}" height="${r1(H * 0.11)}" fill="url(#hud)"/>
    <text x="${r1(40 * k)}" y="${r1(62 * k)}" fill="#fde047" font-size="${r1(37 * k)}" font-weight="800" font-family="sans-serif" letter-spacing="1" stroke="#7a1e00" stroke-width="${r1(1.4 * k)}">SPX6900 · RAINBOW ROAD</text>
    <text x="${r1(40 * k)}" y="${r1(116 * k)}" fill="#f8fafc" font-size="${r1(38 * k)}" font-weight="700" font-family="sans-serif">${esc(fDate(date)).toUpperCase()} · <tspan fill="#fde047" font-weight="800">${esc(usd(price))}</tspan></text>`;
  // one clear band chip, top-right (sized for the longest band name)
  const cw = 400 * k, cx = W - cw - 28 * k, cy = 26 * k, ch = 74 * k;
  s += `<rect x="${r1(cx)}" y="${r1(cy)}" width="${r1(cw)}" height="${r1(ch)}" rx="${r1(11 * k)}" fill="#0b1226" stroke="${glow}" stroke-width="${r1(4 * k)}"/>
    <rect x="${r1(cx + 20 * k)}" y="${r1(cy + ch / 2 - 16 * k)}" width="${r1(32 * k)}" height="${r1(32 * k)}" rx="${r1(4 * k)}" fill="${glow}"/>
    <text x="${r1(cx + 66 * k)}" y="${r1(cy + ch / 2 + 14 * k)}" fill="${glow}" font-size="${r1(37 * k)}" font-weight="800" font-family="sans-serif">${esc(BAND_LABELS[clamp(band, 0, N - 1)].l.toUpperCase())}</text>`;
  // progress bar
  s += `<rect x="0" y="${r1(H - 10 * k)}" width="${W}" height="${r1(10 * k)}" fill="rgba(255,255,255,0.16)"/><rect x="0" y="${r1(H - 10 * k)}" width="${r1(W * progress)}" height="${r1(10 * k)}" fill="${glow}"/>`;
  // finish card over the final stretch — an OutRun/arcade "TO BE CONTINUED" between two checkered-flag
  // strips (the giant band name was too much; the band is already in the top-right chip).
  if (announce && progress > 0.82) {
    const aop = clamp((progress - 0.82) / 0.05, 0, 1);
    const pw = W * 0.84, px = (W - pw) / 2, ph = H * 0.185, py = H * 0.365, sq = 24 * k, cb = sq * 2;
    const checker = (cx, cy, cwid, phase) => {
      let o = `<rect x="${r1(cx)}" y="${r1(cy)}" width="${r1(cwid)}" height="${r1(cb)}" fill="#0d0d0d"/>`;
      const cols = Math.ceil(cwid / sq);
      for (let rr = 0; rr < 2; rr++) for (let cc = 0; cc < cols; cc++) if (((rr + cc + phase) & 1) === 0) o += `<rect x="${r1(cx + cc * sq)}" y="${r1(cy + rr * sq)}" width="${r1(sq)}" height="${r1(sq)}" fill="#f2f2f2"/>`;
      return o;
    };
    s += `<g opacity="${aop.toFixed(2)}">`
      + `<clipPath id="fin"><rect x="${r1(px)}" y="${r1(py)}" width="${r1(pw)}" height="${r1(ph)}" rx="${r1(14 * k)}"/></clipPath>`
      + `<rect x="${r1(px)}" y="${r1(py)}" width="${r1(pw)}" height="${r1(ph)}" rx="${r1(14 * k)}" fill="rgba(8,11,22,0.92)"/>`
      + `<g clip-path="url(#fin)">${checker(px, py, pw, 0)}${checker(px, py + ph - cb, pw, 1)}</g>`
      + `<rect x="${r1(px)}" y="${r1(py)}" width="${r1(pw)}" height="${r1(ph)}" rx="${r1(14 * k)}" fill="none" stroke="#f2f2f2" stroke-width="${r1(4 * k)}"/>`
      + `<text x="${r1(W / 2)}" y="${r1(py + ph * 0.56)}" text-anchor="middle" fill="#fde047" font-size="${r1(58 * k)}" font-weight="800" font-family="sans-serif" letter-spacing="${r1(3 * k)}" stroke="#7a1e00" stroke-width="${r1(1.5 * k)}">TO BE CONTINUED…</text>`
      + `<text x="${r1(W / 2)}" y="${r1(py + ph * 0.75)}" text-anchor="middle" fill="#c8d1de" font-size="${r1(25 * k)}" font-weight="700" font-family="sans-serif" letter-spacing="${r1(3 * k)}">SPX6900 · RAINBOW ROAD</text>`
      + `</g>`;
  }
  return s;
}

const svg = (state, W, H) => `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1b4fd8"/><stop offset="65%" stop-color="#3b82f6"/><stop offset="100%" stop-color="#a7d3ff"/></linearGradient>
<radialGradient id="sun" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#fffdf2"/><stop offset="60%" stop-color="#fff2b0"/><stop offset="100%" stop-color="#ffe98a"/></radialGradient>
<radialGradient id="sunglow" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#fff3b0" stop-opacity="0.9"/><stop offset="55%" stop-color="#ffe98a" stop-opacity="0.35"/><stop offset="100%" stop-color="#ffe98a" stop-opacity="0"/></radialGradient>
<linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#2f8fe0"/><stop offset="100%" stop-color="#1657b0"/></linearGradient>
<linearGradient id="grass" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1f7a37"/><stop offset="100%" stop-color="#2fa84a"/></linearGradient>
<linearGradient id="roadfade" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#0a0a12" stop-opacity="0.5"/></linearGradient>
<linearGradient id="hud" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#050914" stop-opacity="0.9"/><stop offset="100%" stop-color="#050914" stop-opacity="0"/></linearGradient>
<linearGradient id="carbody" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ff5a5a"/><stop offset="55%" stop-color="#e11d2a"/><stop offset="100%" stop-color="#8f0f18"/></linearGradient>
<linearGradient id="truckbody" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#5b7cc4"/><stop offset="100%" stop-color="#33477a"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="#3b82f6"/>
${scene({ ...state, W, H })}
</svg>`;

async function main() {
  const fmt = FORMATS[arg("format", "vertical")] || FORMATS.vertical;
  const fps = +arg("fps", "30"), seconds = +arg("seconds", "30"), out = arg("out", "out/rainbow-road.mp4"), from = arg("from", "");
  // --pixel=N: render every frame at 1/N resolution, then nearest-neighbour upscale ×N in ffmpeg so the
  // WHOLE scene shares one chunky pixel grid (matches the low-res car → one coherent OutRun world). N=1 = crisp.
  const PIX = Math.max(1, Math.round(+arg("pixel", "3")));
  const RW = Math.round(fmt.W / PIX);                              // low-res render width; ffmpeg blows it back up
  mkdirSync(dirname(out), { recursive: true });
  // optional --car=path.png (or .svg): a supplied car sprite (rear view, transparent bg) replaces the
  // vector car — embedded as a data URI so it rides in every frame.
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const asset = f => { try { return fileURLToPath(new URL(`./rainbow-road-assets/${f}`, import.meta.url)); } catch { return ""; } };
  // load a supplied sprite/photo → {uri, aspect}. PNG aspect is read from the IHDR; else 0. Missing/bad
  // file → soft null so the tool still renders with its vector fallbacks.
  const loadImg = (p, label) => {
    if (!p) return { uri: null, aspect: 0 };
    let b; try { b = readFileSync(p); } catch { console.log(`(${label}: not found at ${p} — using fallback)`); return { uri: null, aspect: 0 }; }
    const mime = p.endsWith(".svg") ? "image/svg+xml" : p.endsWith(".webp") ? "image/webp" : p.endsWith(".jpg") || p.endsWith(".jpeg") ? "image/jpeg" : "image/png";
    let aspect = 0;
    if (mime === "image/png" && b.length > 24 && b.readUInt32BE(12) === 0x49484452) aspect = b.readUInt32BE(16) / b.readUInt32BE(20);
    console.log(`using ${label}: ${p}${aspect ? ` (aspect ${aspect.toFixed(2)})` : ""}`);
    return { uri: `data:${mime};base64,${b.toString("base64")}`, aspect };
  };
  // default to the committed OutRun-homage assets; --car/--sky/--palm/--cars still override.
  const car = loadImg(arg("car", asset("car.png")), "car"), carImg = car.uri, carAspect = car.aspect;
  const sky = loadImg(arg("sky", asset("sky.png")), "sky plate"), skyImg = sky.uri;
  const palm = loadImg(arg("palm", asset("palm.png")), "palm"), palmImg = palm.uri, palmAspect = palm.aspect || 0.437;
  const carsArg = arg("cars", ["traffic-yellow.png", "traffic-beetle.png", "traffic-truck.png"].map(asset).join(","));
  const trafficImgs = (carsArg ? carsArg.split(",") : []).map((p, i) => loadImg(p.trim(), `traffic ${i}`)).filter(x => x.uri);
  // --announce="ACCUMULATE" → a "SPX IS NOW IN <BAND>" banner over the final seconds (band-arrival clips)
  const announce = arg("announce", "");
  const m = buildModel(DEFAULT_RAW);
  let seq = DEFAULT_RAW.map(r => ({ date: r.date, price: r.price, band: clamp(bandIndex(m, r.price, dayN(r.date)), 0, N - 1) }));
  // Extend the journey PAST the frozen model bundle up to TODAY, using recent daily closes (thinned to
  // ~weekly) so the car arrives at the CURRENT band instead of stopping at DEFAULT_RAW's last date. Bands
  // are still scored by the same frozen model m. Source: public/price-history.json (fresh daily in CI).
  try {
    const lastD = DEFAULT_RAW.at(-1).date;
    const ph = JSON.parse(readFileSync(new URL("../public/price-history.json", import.meta.url), "utf8"));
    const extra = (Array.isArray(ph) ? ph : []).filter(r => r && r.date > lastD && Number.isFinite(r.price));
    const thinned = extra.filter((_, i) => i % 7 === 0 || i === extra.length - 1);
    for (const r of thinned) seq.push({ date: r.date, price: r.price, band: clamp(bandIndex(m, r.price, dayN(r.date)), 0, N - 1) });
    if (thinned.length) console.log(`journey extended ${lastD} → ${seq.at(-1).date} (+${thinned.length} recent weeks)`);
  } catch (e) { console.log(`(no journey extension: ${e.message})`); }
  if (from) seq = seq.filter(r => r.date >= from);
  const total = fps * seconds, bandAt = p => seq[clamp(Math.floor(p * (seq.length - 1)), 0, seq.length - 1)];
  const rnd = (() => { let s = 12345; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();
  const cols = ["#38bdf8", "#a3e635", "#f472b6", "#fbbf24"];
  const DZ = 1.0, camClamp = v => clamp(v, VIS / 2 - 0.8, (N - 1) - (VIS / 2 - 0.8));  // tighter dead-zone so a fast jump can't outrun the camera
  const MINGAP = 2.3;                              // a vehicle holds a lane this many clear of the car's PATH
  // the car's SCREEN lane is the FLIPPED band (Max Bubble left … Fire Sale right)
  const screenLane = band => (N - 1) - band;
  // Precompute the WHOLE car-lane path up front, so each traffic vehicle can look AHEAD and pick ONE fixed
  // lane the car won't reach while it's close — then hold it. The player sweeps past; the traffic never
  // dodges (the old per-frame collective slide was the unnatural "all three move aside together" look).
  const carTraj = new Array(total);
  { let cl = screenLane(seq[0].band);
    for (let i = 0; i < total; i++) { const b = seq[clamp(Math.floor((i / (total - 1)) * (seq.length - 1)), 0, seq.length - 1)].band; cl = clamp(cl + (screenLane(b) - cl) * 0.10, 0, N - 1); carTraj[i] = cl; } }
  const TZ = 0.7 / fps, travelFrames = Math.round(1 / TZ);   // z units/frame a vehicle approaches; frames for z:1→0
  // the car's lane range across a vehicle's danger window (while it's near, z≲0.6, plus a little slack)
  const carRange = born => { let lo = Infinity, hi = -Infinity; const a = born + Math.round(0.55 * travelFrames), b = born + travelFrames + Math.round(0.15 * fps); for (let f = a; f <= b; f++) { const c = carTraj[clamp(f, 0, total - 1)]; if (c < lo) lo = c; if (c > hi) hi = c; } return [lo, hi]; };
  const pickLane = born => { const [lo, hi] = carRange(born); const rRoom = (N - 1) - (hi + MINGAP), lRoom = lo - MINGAP; if (rRoom >= 0 && (lRoom < 0 || rRoom >= lRoom)) return clamp(hi + MINGAP + rnd() * rRoom, 0, N - 1); if (lRoom >= 0) return clamp((lo - MINGAP) - rnd() * lRoom, 0, N - 1); return (hi + MINGAP) > (N - 1 - (lo - MINGAP)) ? 0 : N - 1; };
  let camLane = camClamp(carTraj[0]);
  const nImg = trafficImgs.length;
  let traffic = Array.from({ length: 3 }, (_, i) => { const z0 = 0.4 + i * 0.24, born = Math.round(-(1 - z0) * travelFrames); return { z: z0, born, lane: pickLane(born), ci: nImg ? Math.floor(rnd() * nImg) : 0, type: rnd() < 0.3 ? "truck" : "car", col: cols[i % cols.length] }; });

  const dir = mkdtempSync(join(tmpdir(), "lanevid-"));
  console.log(`rainbow road v6 (flipped + real car) · ${fmt.W}×${fmt.H} · ${fps}fps · ${seconds}s (${total}f) · ${seq.length} weeks → ${out}`);
  try {
    for (let i = 0; i < total; i++) {
      const p = i / (total - 1), curr = bandAt(p);
      const carLane = carTraj[i], prevCar = i > 0 ? carTraj[i - 1] : carLane;
      // dead-zone camera: the car moves freely in the central zone; the camera only pans (revealing the
      // off-screen lanes) once it leaves that zone.
      if (carLane - camLane > DZ) camLane += (carLane - DZ - camLane) * 0.22;   // catch up faster on a big jump
      else if (carLane - camLane < -DZ) camLane += (carLane + DZ - camLane) * 0.22;
      camLane = camClamp(camLane);
      const lean = clamp((carLane - prevCar) * 6, -1, 1);
      // each vehicle holds its FIXED lane and just approaches; when it passes the camera it recycles to the
      // far distance and picks a fresh lane clear of the car's upcoming path. No dodging → looks natural.
      for (const v of traffic) {
        v.z -= TZ;
        if (v.z < 0.0) { v.z = 1; v.born = i; v.lane = pickLane(i); v.ci = nImg ? Math.floor(rnd() * nImg) : 0; v.type = rnd() < 0.3 ? "truck" : "car"; v.col = cols[Math.floor(rnd() * cols.length)]; }
      }
      const st = { carLane, camLane, band: curr.band, date: curr.date, price: curr.price, scroll: (i * 0.62 / fps) % 1, progress: p, curve: Math.sin(p * Math.PI * 6) * 0.4, hill: Math.sin(p * Math.PI * 4 + 1) * 0.55, traffic, lean, carImg, carAspect, skyImg, palmImg, palmAspect, trafficImgs, frame: i, announce };
      writeFileSync(join(dir, `f${String(i).padStart(5, "0")}.png`), new Resvg(svg(st, fmt.W, fmt.H), { fitTo: { mode: "width", value: RW }, font: FONT }).render().asPng());
      if (i % 30 === 0) process.stdout.write(`\r  frame ${i + 1}/${total}`);
    }
    process.stdout.write(`\r  frame ${total}/${total}\n`);
    const ff = execSync('python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"').toString().trim();
    // Encode chain. --soften=<sigma> adds a sub-pixel gaussian AFTER the nearest-neighbour blow-up so the
    // razor pixel edges get a ~1px ramp — this survives X's H.264 re-encode far better (hard edges ring/
    // block). --crf sets quality (lower = higher bitrate; 16 makes a strong upload master). Keeps the look.
    const soften = +arg("soften", "0"), crf = arg("crf", "18"), audio = arg("audio", "");
    const chain = [];
    if (PIX > 1) chain.push(`scale=${fmt.W}:${fmt.H}:flags=neighbor`);
    if (soften > 0) chain.push(`gblur=sigma=${soften}`);
    const vf = chain.length ? ["-vf", chain.join(",")] : [];
    // --audio=<file>: mux a soundtrack, LOOPED to the video length (-stream_loop -1 + -shortest). Use an
    // ORIGINAL/licensed track — never a copyrighted game rip, or X's Content-ID will mute/flag the post.
    const aIn = audio ? ["-stream_loop", "-1", "-i", audio] : [];
    // pin the output to the VIDEO length with -t (deterministic) rather than -shortest, which could clip a
    // video longer than the audio loop down to the loop length depending on the ffmpeg build/input type.
    const aOut = audio ? ["-c:a", "aac", "-b:a", "192k", "-map", "0:v:0", "-map", "1:a:0", "-t", String(seconds)] : [];
    await new Promise((res, rej) => spawn(ff, ["-y", "-framerate", String(fps), "-i", join(dir, "f%05d.png"), ...aIn, ...vf, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-profile:v", "high", "-crf", String(crf), "-preset", "slow", "-g", String(fps * 2), ...aOut, "-movflags", "+faststart", out], { stdio: ["ignore", "ignore", "inherit"] }).on("close", c => c === 0 ? res() : rej(new Error("ffmpeg " + c))));
    console.log(`✓ ${out}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
main().catch(e => { console.error(e.message); process.exit(1); });
