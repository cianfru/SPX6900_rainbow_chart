// Pure cohort math for "Whales Watching" (the 3D monitor) + the whale-behaviour card (2D). No
// three.js / DOM here, so both the browser page and the Node card can import it and it stays
// unit-testable. "Whales" = wallets ≥ 100k SPX, sliced into four SIZE cohorts. The read is always:
// COLOUR = holder age (warm amber = new → cyan = long-held), HEIGHT = holding size, BEAM = 30-day
// net flow (green buying / red selling / none flat). A distribution POSITION, never a signal.

export const WHALE_FLOOR = 1e5;

// Small (100k) → mega (5M+) warms to cyan, mirroring the census/city so size reads as colour too.
export const COHORTS = [
  { key: "t1", lo: 1e5,  hi: 25e4,     label: "100k–250k", accent: "#fbbf24" },
  { key: "t2", lo: 25e4, hi: 1e6,      label: "250k–1M",   accent: "#a3e635" },
  { key: "t3", lo: 1e6,  hi: 5e6,      label: "1M–5M",     accent: "#34d399" },
  { key: "t4", lo: 5e6,  hi: Infinity, label: "5M+",       accent: "#22d3ee" },
];

export function cohortIndex(bal) {
  for (let i = 0; i < COHORTS.length; i++) if (bal >= COHORTS[i].lo && bal < COHORTS[i].hi) return i;
  return -1;
}

// 30-day net flow → behaviour. `d30` is net tokens in/out over the trailing 30 days; the deadzone
// keeps rounding dust from lighting a beam. Returns "buy" | "sell" | "flat".
export function flowState(d30, bal, dead = 0.005) {
  if (!d30) return "flat";
  if (Math.abs(d30) / Math.max(1, bal) < dead) return "flat";  // <0.5% of the position moved = noise
  return d30 > 0 ? "buy" : "sell";
}

// Age ramp: warm amber (new) → cyan (long-held). Pure, so the SVG card and the three.js page colour
// identically. Returns { rgb:[r,g,b], hex }.
const WARM = [217, 119, 6], COOL = [34, 211, 238];
const lerp = (a, b, t) => a + (b - a) * t;
export function ageRamp(u) {
  const t = Math.max(0, Math.min(1, Number.isFinite(u) ? u : 0));
  const rgb = WARM.map((w, i) => Math.round(lerp(w, COOL[i], t)));
  return { rgb, hex: "#" + rgb.map(x => x.toString(16).padStart(2, "0")).join("") };
}

// The height curve — the SAME mostly-log / part-√ blend as the city's heightOf (city-render.js),
// kept here free of three so the card + tests can use it. A parity test pins the two equal.
export function heightUnit(score, minScore, maxScore) {
  const s = Math.max(Number.isFinite(score) ? score : 0, minScore);
  const usable = minScore > 0 && maxScore > minScore;
  const lg = usable ? (Math.log(s) - Math.log(minScore)) / (Math.log(maxScore) - Math.log(minScore)) : 0;
  const rt = maxScore > 0 ? Math.sqrt(Math.max(0, s) / maxScore) : 0;
  const u = usable ? 0.5 * lg + 0.5 * rt : rt;
  return Math.max(0, Math.min(1, u));
}

// Net-flow % of a cohort's held supply → a sentiment word + sign. Balanced band is deliberately
// wide (±0.3% of supply moved) so a couple of dust moves don't read as a trend.
export function sentimentOf(netPct, band = 0.3) {
  if (netPct > band) return "accumulating";
  if (netPct < -band) return "distributing";
  return "balanced";
}

// ── the whole thing ─────────────────────────────────────────────────────────────────────────────
// Assigns every whale to a cohort, lays each cohort out as a grid of cubes on its own platform
// (clusters in a row along X, centred on the origin), and computes per-cohort behaviour. All world
// coordinates so the 3D page just consumes them; the card ignores geometry and reads the aggregates.
export function buildCohorts(wallets, opts = {}) {
  const PITCH = opts.pitch ?? 2.2;      // cube-to-cube spacing
  const PAD = opts.pad ?? 2.0;          // platform margin around the grid
  const GAP = opts.gap ?? 7.0;          // empty ground between cohort platforms
  const dead = opts.dead ?? 0.005;

  const whales = (wallets || []).filter(w => w && w.bal >= WHALE_FLOOR);
  const bals = whales.map(w => w.bal);
  const ages = whales.map(w => w.days || 0);
  const minBal = whales.length ? Math.min(...bals) : 1;
  const maxBal = whales.length ? Math.max(...bals) : 1;
  const minDay = whales.length ? Math.min(...ages) : 0;
  const maxDay = whales.length ? Math.max(...ages) : 1;
  const ageU = d => (maxDay > minDay ? ((d || 0) - minDay) / (maxDay - minDay) : 0.5);

  // First pass: bucket + grid dimensions so we can lay the platforms out along X.
  const buckets = COHORTS.map(() => []);
  for (const w of whales) { const i = cohortIndex(w.bal); if (i >= 0) buckets[i].push(w); }

  let cursor = 0;
  const laid = COHORTS.map((c, i) => {
    const ws = buckets[i].slice().sort((a, b) => b.bal - a.bal);   // biggest first, fills front-left
    const n = ws.length;
    const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
    const rows = Math.max(1, Math.ceil(n / cols));
    const gridW = cols * PITCH, gridD = rows * PITCH;
    const platW = gridW + PAD * 2, platD = gridD + PAD * 2;
    const cx = cursor + platW / 2;
    cursor += platW + GAP;
    return { c, ws, n, cols, rows, gridW, gridD, platW, platD, cx };
  });
  const totalW = Math.max(0, cursor - GAP);
  const shift = totalW / 2;                                        // recentre the whole row on origin

  let maxPlatD = 0;
  const cohorts = laid.map(L => {
    maxPlatD = Math.max(maxPlatD, L.platD);
    const center = { x: L.cx - shift, z: 0 };
    let buy = 0, sell = 0, flat = 0, held = 0, net = 0;
    const walletsOut = L.ws.map((w, j) => {
      const row = Math.floor(j / L.cols), col = j % L.cols;
      const x = center.x - L.gridW / 2 + (col + 0.5) * PITCH;
      const z = -L.gridD / 2 + (row + 0.5) * PITCH;
      const flow = flowState(w.d30, w.bal, dead);
      if (flow === "buy") buy++; else if (flow === "sell") sell++; else flat++;
      held += w.bal; net += (w.d30 || 0);
      return {
        a: w.a, bal: w.bal, days: w.days || 0, d30: w.d30 || 0,
        ageU: ageU(w.days), hU: heightUnit(w.bal, minBal, maxBal), flow, x, z,
      };
    });
    const netPct = held > 0 ? (net / held) * 100 : 0;
    return { ...L.c, center, platform: { w: L.platW, d: L.platD }, n: L.n, cols: L.cols, rows: L.rows,
      held, net, netPct, buy, sell, flat, sentiment: sentimentOf(netPct), wallets: walletsOut };
  });

  return { cohorts, minBal, maxBal, minDay, maxDay,
    bounds: { width: totalW, depth: maxPlatD },
    total: whales.length, moved: cohorts.reduce((s, c) => s + c.buy + c.sell, 0) };
}
