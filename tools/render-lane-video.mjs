// THE RAINBOW ROAD — an OutRun-style driving video. The road is a multi-lane highway; each LANE is a
// rainbow valuation band and the car's lane is SPX6900's ACTUAL band over history (starts cheap at
// launch, climbs as SPX ran up, drops back — the swerves are the real band changes). A camera follows
// the car so you see a handful of wide lanes with dashed paint, winding curves + hills, traffic to
// overtake, palms, a bright coastal sky, retro HUD. SVG frames → Resvg → ffmpeg (H.264). $0, Node-only.
//
//   node tools/render-lane-video.mjs --format=vertical --seconds=30 --out=out/rainbow-road.mp4
//   flags: --format=vertical|wide|square  --fps=30  --seconds=30  --from=YYYY-MM-DD
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
const N = BAND_LABELS.length, VIS = 5;           // 9 bands; ~5 lanes visible on the road at once
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

function scene({ W, H, carLane, camLane, band, date, price, scroll, progress, curve, hill, traffic, lean, carImg, carAspect }) {
  const hy = H * 0.47, zN = 1, zF = 9;                             // lower horizon + shallower plane → a near-eye rear-view angle that matches a flat-backed car
  const ds = t => zN / (zN + (zF - zN) * t);                       // depth scale (1 near → small far)
  const yOf = t => hy + (H - hy) * ds(t) - hill * Math.sin(t * Math.PI) * H * 0.05;
  const laneW = t => (W * 0.9 / VIS) * ds(t);                      // wide lanes
  const centerX = t => W / 2 + curve * (t * t) * (W * 0.42);       // winding
  const laneX = (L, t) => centerX(t) + (L - camLane) * laneW(t);
  const M = 34, ts = Array.from({ length: M + 1 }, (_, k) => k / M);
  // FLIPPED colours: screen-left is the DEAR end (Max Bubble), screen-right is the CHEAP end (Fire Sale)
  const yH = yOf(1), y0 = yOf(0), col = i => BAND_LABELS[clamp(N - 1 - i, 0, N - 1)].c;
  const glow = bandCol(band);

  // ── sky, sun, clouds ──
  let s = `<rect width="${W}" height="${r1(yH + 20)}" fill="url(#sky)"/>
    <circle cx="${W * 0.5}" cy="${r1(yH * 0.5)}" r="${r1(W * 0.2)}" fill="url(#sunglow)"/>
    <circle cx="${W * 0.5}" cy="${r1(yH * 0.5)}" r="${r1(W * 0.1)}" fill="url(#sun)"/>`;
  // distant hazy mountains along the horizon (depth)
  let mtn = `M 0 ${r1(yH)}`;
  for (let mx = 0; mx <= W; mx += W / 12) mtn += ` L ${r1(mx)} ${r1(yH - 22 - 26 * Math.abs(Math.sin(mx * 0.011 + 1)))}`;
  mtn += ` L ${W} ${r1(yH)} Z`;
  s += `<path d="${mtn}" fill="#6f8fd6" opacity="0.55"/>`;
  // fluffy clouds — a cluster of lobes with a soft grey base and a white crown
  const cloud = (clx, cly, r, op) => {
    const lobe = (dx, dy, rr, fill) => `<ellipse cx="${r1(clx + dx)}" cy="${r1(cly + dy)}" rx="${r1(rr)}" ry="${r1(rr * 0.72)}" fill="${fill}"/>`;
    return `<g opacity="${op}">${lobe(0, r * 0.18, r * 1.05, "#d7e3f5")}${lobe(-r * 0.72, r * 0.24, r * 0.62, "#d7e3f5")}${lobe(r * 0.74, r * 0.24, r * 0.68, "#d7e3f5")}`
      + `${lobe(0, 0, r, "#ffffff")}${lobe(-r * 0.62, r * 0.12, r * 0.6, "#ffffff")}${lobe(r * 0.64, r * 0.12, r * 0.66, "#ffffff")}${lobe(-r * 0.25, -r * 0.28, r * 0.55, "#ffffff")}${lobe(r * 0.3, -r * 0.24, r * 0.5, "#ffffff")}</g>`;
  };
  for (const [fx, fy, rs, op] of [[0.14, 0.36, 60, 0.97], [0.52, 0.2, 46, 0.9], [0.85, 0.44, 66, 0.95], [0.3, 0.58, 40, 0.85], [0.7, 0.62, 52, 0.92], [0.03, 0.66, 44, 0.8]]) {
    const clx = ((fx - scroll * 0.025) % 1 + 1) % 1 * W;
    s += cloud(clx, fy * yH, rs, op);
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

  // ── dense, varied roadside scenery on the grass beyond the rainbow edges (two staggered rows per
  //    side: palms + bushes + rocks), far→near so it scrolls past ──
  const SC = 14;
  for (let k = 0; k < SC; k++) {
    let t = ((k / SC) - scroll * 1.0) % 1; if (t < 0) t += 1; if (t < 0.03 || t > 0.97) continue;
    const sc = clamp(1.0 * ds(t) * 2.2, 0.04, 1.05), yy = yOf(t);
    const put = (bx, kind, jx) => { const x = bx + jx * sc; return kind === 0 ? palm(x, yy, sc) : kind === 1 ? bush(x, yy, sc * 0.9) : rock(x, yy, sc * 0.85); };
    const kindL = (k * 7) % 3, kindR = (k * 5 + 1) % 3;
    // near row (just off the rumble) + a sparser far row further out
    s += put(laneX(eL, t) - 44 * sc, kindL, -18);
    s += put(laneX(eR, t) + 44 * sc, kindR, 18);
    if (k % 2 === 0) { s += put(laneX(eL, t) - 130 * sc, (kindL + 1) % 3, -20); s += put(laneX(eR, t) + 130 * sc, (kindR + 2) % 3, 20); }
  }

  // ── traffic to overtake (far → near), then the player car on top. Sized to match the player car at
  //    the same depth so proportions stay consistent. ──
  const carDepthScale = ds(0.02);
  for (const v of traffic.slice().sort((a, b) => b.z - a.z)) {
    if (v.z < 0.02 || v.z > 1) continue;
    const t = v.z, w = W * 0.19 * (ds(t) / carDepthScale) * (v.type === "truck" ? 0.98 : 0.86), x = laneX(v.lane + 0.5, t), yv = yOf(t);
    s += `<g transform="translate(${r1(x)},${r1(yv - w * 0.5)})">${v.type === "truck" ? truck(w) : trafficCar(w, v.col)}</g>`;
  }
  // OutRun camera height: the car sits LOW + CLOSE, so it's big in the lower-centre (a fixed fraction
  // of the frame, not tied to the far-shrinking lane width). It still tracks its lane (band).
  // GUARDRAIL: even if SPX drops below the Fire Sale floor (or runs past Max Bubble), the car body is
  // hard-clamped between the rumble edges so it never drives onto the grass.
  const tCar = 0.02, cw = carImg ? W * 0.26 : W * 0.21;             // the real sprite reads a touch bigger
  const iw = cw, ih = carImg && carAspect > 0 ? cw / carAspect : cw;
  const carY = yOf(tCar) - ih * 0.42;
  const carX = clamp(laneX(carLane + 0.5, tCar), laneX(eL, tCar) + cw * 0.5, laneX(eR, tCar) - cw * 0.5);
  if (Math.abs(lean) > 0.2)   // two short tyre streaks trailing behind on a lane change
    for (const dx of [-cw * 0.28, cw * 0.28])
      s += `<line x1="${r1(carX + dx)}" y1="${r1(carY + ih * 0.5)}" x2="${r1(carX + dx - lean * cw * 0.4)}" y2="${r1(carY + ih * 0.5 + cw * 0.22)}" stroke="rgba(15,15,20,0.3)" stroke-width="${r1(cw * 0.05)}" stroke-linecap="round"/>`;
  const carSprite = carImg
    ? `<image href="${carImg}" x="${r1(-iw / 2)}" y="${r1(-ih / 2)}" width="${r1(iw)}" height="${r1(ih)}" transform="rotate(${r1(lean * 6)})" preserveAspectRatio="xMidYMid meet" image-rendering="pixelated"/>`
    : playerCar(cw, clamp(lean, -1, 1));
  s += `<g transform="translate(${r1(carX)},${r1(carY)})">${carSprite}</g>`;

  // ── retro HUD ──
  s += `<rect width="${W}" height="${r1(H * 0.13)}" fill="url(#hud)"/>
    <text x="44" y="58" fill="#fde047" font-size="34" font-weight="800" font-family="sans-serif" letter-spacing="2" stroke="#7a1e00" stroke-width="1">SPX6900 · RAINBOW ROAD</text>
    <text x="44" y="98" fill="#f8fafc" font-size="22" font-family="sans-serif" letter-spacing="1">DATE <tspan fill="#fde047" font-weight="800">${esc(fDate(date)).toUpperCase()}</tspan>   PRICE <tspan fill="#fde047" font-weight="800">${esc(usd(price))}</tspan></text>
    <rect x="${W - 360}" y="34" width="316" height="52" rx="8" fill="#0b1226" stroke="${glow}" stroke-width="2"/>
    <text x="${W - 344}" y="70" fill="#9aa4b4" font-size="22" font-weight="800" font-family="sans-serif">BAND</text>
    <text x="${W - 250}" y="70" fill="${glow}" font-size="26" font-weight="800" font-family="sans-serif">${esc(BAND_LABELS[clamp(band,0,N-1)].l.toUpperCase())}</text>`;
  const lx = W - 236, lyt = H * 0.13 + 20, lh = 30;
  s += `<rect x="${lx - 12}" y="${r1(lyt - 14)}" width="228" height="${r1(N * lh + 16)}" rx="8" fill="rgba(5,9,20,0.6)"/>`;
  for (let i = N - 1; i >= 0; i--) {
    const yy = lyt + (N - 1 - i) * lh, on = i === clamp(band, 0, N - 1);
    s += `<rect x="${lx}" y="${r1(yy)}" width="18" height="18" rx="3" fill="${BAND_LABELS[i].c}" stroke="${on ? "#fff" : "none"}" stroke-width="2"/>
      <text x="${lx + 26}" y="${r1(yy + 15)}" fill="${on ? "#f8fafc" : "#c8d1de"}" font-size="${on ? 19 : 16}" font-weight="${on ? 800 : 600}" font-family="sans-serif">${esc(BAND_LABELS[i].l)}</text>`;
  }
  s += `<rect x="0" y="${H - 9}" width="${W}" height="9" fill="rgba(255,255,255,0.14)"/><rect x="0" y="${H - 9}" width="${r1(W * progress)}" height="9" fill="${glow}"/>`;
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
  let carImg = null, carAspect = 0; const carPath = arg("car", "");
  if (carPath) {
    const { readFileSync } = await import("node:fs"); const b = readFileSync(carPath);
    const mime = carPath.endsWith(".svg") ? "image/svg+xml" : carPath.endsWith(".webp") ? "image/webp" : carPath.endsWith(".jpg") || carPath.endsWith(".jpeg") ? "image/jpeg" : "image/png";
    carImg = `data:${mime};base64,${b.toString("base64")}`;
    if (mime === "image/png" && b.length > 24 && b.readUInt32BE(12) === 0x49484452) carAspect = b.readUInt32BE(16) / b.readUInt32BE(20); // IHDR w/h
    console.log(`using supplied car: ${carPath}${carAspect ? ` (aspect ${carAspect.toFixed(2)})` : ""}`);
  }
  const m = buildModel(DEFAULT_RAW);
  let seq = DEFAULT_RAW.map(r => ({ date: r.date, price: r.price, band: clamp(bandIndex(m, r.price, dayN(r.date)), 0, N - 1) }));
  if (from) seq = seq.filter(r => r.date >= from);
  const total = fps * seconds, bandAt = p => seq[clamp(Math.floor(p * (seq.length - 1)), 0, seq.length - 1)];
  const rnd = (() => { let s = 12345; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();
  const cols = ["#38bdf8", "#a3e635", "#f472b6", "#fbbf24"];
  const DZ = 1.3, camClamp = v => clamp(v, VIS / 2 - 0.8, (N - 1) - (VIS / 2 - 0.8));  // dead-zone + edge reveal
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
  let traffic = Array.from({ length: 3 }, (_, i) => { const z0 = 0.4 + i * 0.24, born = Math.round(-(1 - z0) * travelFrames); return { z: z0, born, lane: pickLane(born), type: rnd() < 0.3 ? "truck" : "car", col: cols[i % cols.length] }; });

  const dir = mkdtempSync(join(tmpdir(), "lanevid-"));
  console.log(`rainbow road v6 (flipped + real car) · ${fmt.W}×${fmt.H} · ${fps}fps · ${seconds}s (${total}f) · ${seq.length} weeks → ${out}`);
  try {
    for (let i = 0; i < total; i++) {
      const p = i / (total - 1), curr = bandAt(p);
      const carLane = carTraj[i], prevCar = i > 0 ? carTraj[i - 1] : carLane;
      // dead-zone camera: the car moves freely in the central zone; the camera only pans (revealing the
      // off-screen lanes) once it leaves that zone.
      if (carLane - camLane > DZ) camLane += (carLane - DZ - camLane) * 0.12;
      else if (carLane - camLane < -DZ) camLane += (carLane + DZ - camLane) * 0.12;
      camLane = camClamp(camLane);
      const lean = clamp((carLane - prevCar) * 6, -1, 1);
      // each vehicle holds its FIXED lane and just approaches; when it passes the camera it recycles to the
      // far distance and picks a fresh lane clear of the car's upcoming path. No dodging → looks natural.
      for (const v of traffic) {
        v.z -= TZ;
        if (v.z < 0.0) { v.z = 1; v.born = i; v.lane = pickLane(i); v.type = rnd() < 0.3 ? "truck" : "car"; v.col = cols[Math.floor(rnd() * cols.length)]; }
      }
      const st = { carLane, camLane, band: curr.band, date: curr.date, price: curr.price, scroll: (i * 0.62 / fps) % 1, progress: p, curve: Math.sin(p * Math.PI * 6) * 0.4, hill: Math.sin(p * Math.PI * 4 + 1) * 0.55, traffic, lean, carImg, carAspect };
      writeFileSync(join(dir, `f${String(i).padStart(5, "0")}.png`), new Resvg(svg(st, fmt.W, fmt.H), { fitTo: { mode: "width", value: RW }, font: FONT }).render().asPng());
      if (i % 30 === 0) process.stdout.write(`\r  frame ${i + 1}/${total}`);
    }
    process.stdout.write(`\r  frame ${total}/${total}\n`);
    const ff = execSync('python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"').toString().trim();
    const vf = PIX > 1 ? ["-vf", `scale=${fmt.W}:${fmt.H}:flags=neighbor`] : [];   // nearest-neighbour blow-up = hard pixels
    await new Promise((res, rej) => spawn(ff, ["-y", "-framerate", String(fps), "-i", join(dir, "f%05d.png"), ...vf, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "medium", "-movflags", "+faststart", out], { stdio: ["ignore", "ignore", "inherit"] }).on("close", c => c === 0 ? res() : rej(new Error("ffmpeg " + c))));
    console.log(`✓ ${out}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
main().catch(e => { console.error(e.message); process.exit(1); });
