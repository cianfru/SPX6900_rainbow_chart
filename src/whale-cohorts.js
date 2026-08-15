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

// ── CITY cohorts — the WHOLE city, not just whales ────────────────────────────────────────────────
// SPX City's residency bar is 5,000 SPX, so a "citizen" is any wallet ≥ 5,000. Six size cohorts span
// the full city from the residency floor up; the top four boundaries are IDENTICAL to the whale
// COHORTS above, so the whale slice nests exactly. Warm (small/new) → cool (big) so size reads as
// colour, same as the 3D city. Used by build-city-history.mjs + CityHistoryChart.jsx.
export const CITY_FLOOR = 5e3;
export const CITY_COHORTS = [
  { key: "c0", lo: 5e3,  hi: 25e3,     label: "5k–25k",    accent: "#f97316" },
  { key: "c1", lo: 25e3, hi: 1e5,      label: "25k–100k",  accent: "#fbbf24" },
  { key: "c2", lo: 1e5,  hi: 25e4,     label: "100k–250k", accent: "#a3e635" },
  { key: "c3", lo: 25e4, hi: 1e6,      label: "250k–1M",   accent: "#34d399" },
  { key: "c4", lo: 1e6,  hi: 5e6,      label: "1M–5M",     accent: "#22d3ee" },
  { key: "c5", lo: 5e6,  hi: Infinity, label: "5M+",       accent: "#818cf8" },
];

export function cityCohortIndex(bal) {
  for (let i = 0; i < CITY_COHORTS.length; i++) if (bal >= CITY_COHORTS[i].lo && bal < CITY_COHORTS[i].hi) return i;
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
  // Which net-flow window drives the beams/sentiment: "d30" (default), "d7" or "d1". Falls back
  // to d30 if a wallet is missing the chosen key (old data), so the card + tests are unaffected.
  const flowKey = opts.flowKey || "d30";
  const flowOf = w => { const v = w[flowKey]; return Number.isFinite(v) ? v : (w.d30 || 0); };

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
      const fv = flowOf(w);
      const flow = flowState(fv, w.bal, dead);
      if (flow === "buy") buy++; else if (flow === "sell") sell++; else flat++;
      held += w.bal; net += fv;
      return {
        a: w.a, bal: w.bal, days: w.days || 0, d30: w.d30 || 0, net: fv,
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

const shortAddr = a => a.slice(0, 6) + "…" + a.slice(-4);

// CLUSTER CITY: same idea as buildCohorts, but the groups are ENTITIES (one owner's linked wallets)
// instead of size cohorts. Each cluster's member wallets become a mini-grid of cubes on their own
// platform, and the cluster platforms are laid out in a 2D grid on the ground (a "district" per
// owner). Returns the IDENTICAL model shape buildCohorts does, so the same three.js scene renders it:
//   height = wallet balance · colour = wallet holding age · beam = wallet 30d flow (buy/sell) ·
//   platform sentiment = the cluster's net 30d flow (accumulating / distributing / balanced).
// Reads the per-member walletBal / walletFlow / walletAge the engine emits; before that data lands
// every cluster is skipped and `cohorts` is empty (the page shows its data-gated state).
export function buildClusterGroups(entities, opts = {}) {
  const PITCH = opts.pitch ?? 1.8;      // cube-to-cube spacing inside a cluster
  const PAD = opts.pad ?? 1.6;          // platform margin around a cluster's grid
  const GAP = opts.gap ?? 5.0;          // empty ground between cluster platforms
  const dead = opts.dead ?? 0.005;
  const TOP = opts.top ?? 48;           // how many clusters (biggest owners) to place

  const elig = (entities || [])
    .filter(e => e && !e.flagged && e.walletFlow && (e.bal || 0) > 0)
    .sort((a, b) => (b.bal || 0) - (a.bal || 0))
    .slice(0, TOP)
    .map(e => {
      const wb = e.walletBal || {}, wf = e.walletFlow || {}, wg = e.walletAge || {};
      const members = (e.wallets || [])
        .map(a => ({ a, bal: wb[a] || 0, net: wf[a] || 0, days: wg[a] || 0 }))
        .filter(m => m.bal > 0)
        .sort((x, y) => y.bal - x.bal);
      return { e, members };
    })
    .filter(g => g.members.length);

  const allMembers = elig.flatMap(g => g.members);
  const bals = allMembers.map(m => m.bal), ages = allMembers.map(m => m.days);
  const minBal = allMembers.length ? Math.min(...bals) : 1;
  const maxBal = allMembers.length ? Math.max(...bals) : 1;
  const minDay = allMembers.length ? Math.min(...ages) : 0;
  const maxDay = allMembers.length ? Math.max(...ages) : 1;
  const ageU = d => (maxDay > minDay ? ((d || 0) - minDay) / (maxDay - minDay) : 0.5);

  // each cluster's own mini-grid footprint
  const laid = elig.map(g => {
    const n = g.members.length;
    const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
    const rows = Math.max(1, Math.ceil(n / cols));
    const gridW = cols * PITCH, gridD = rows * PITCH;
    return { g, n, cols, rows, gridW, gridD, platW: gridW + PAD * 2, platD: gridD + PAD * 2 };
  });

  // lay the cluster platforms in a roughly-square 2D grid, row-major (biggest first, front-left);
  // column widths + row depths come from the largest platform in each grid line so nothing overlaps.
  const G = Math.max(1, Math.ceil(Math.sqrt(laid.length)));
  const colW = new Array(G).fill(0), rowD = [];
  laid.forEach((L, i) => { const c = i % G, r = Math.floor(i / G); colW[c] = Math.max(colW[c], L.platW); rowD[r] = Math.max(rowD[r] || 0, L.platD); });
  const colX = []; { let x = 0; for (let c = 0; c < G; c++) { colX[c] = x + colW[c] / 2; x += colW[c] + GAP; } }
  const rowZ = []; { let z = 0; for (let r = 0; r < rowD.length; r++) { rowZ[r] = z + rowD[r] / 2; z += rowD[r] + GAP; } }
  const totalW = colX.length ? colX[G - 1] + colW[G - 1] / 2 : 0;
  const totalD = rowZ.length ? rowZ[rowD.length - 1] + rowD[rowD.length - 1] / 2 : 0;
  const sx = totalW / 2, sz = totalD / 2;

  const cohorts = laid.map((L, i) => {
    const gc = i % G, gr = Math.floor(i / G);
    const center = { x: colX[gc] - sx, z: rowZ[gr] - sz };
    let buy = 0, sell = 0, flat = 0, held = 0, net = 0;
    const walletsOut = L.g.members.map((m, j) => {
      const row = Math.floor(j / L.cols), col = j % L.cols;
      const x = center.x - L.gridW / 2 + (col + 0.5) * PITCH;
      const z = center.z - L.gridD / 2 + (row + 0.5) * PITCH;
      const flow = flowState(m.net, m.bal, dead);
      if (flow === "buy") buy++; else if (flow === "sell") sell++; else flat++;
      held += m.bal; net += m.net;
      return { a: m.a, bal: m.bal, days: m.days, d30: m.net, net: m.net,
        ageU: ageU(m.days), hU: heightUnit(m.bal, minBal, maxBal), flow, x, z };
    });
    const d30 = Number.isFinite(L.g.e.d30) ? L.g.e.d30 : net;   // authoritative entity net flow
    const denom = (L.g.e.bal || held) || 1;
    return { id: L.g.e.id, label: shortAddr(L.g.e.id), center, platform: { w: L.platW, d: L.platD },
      n: L.n, cols: L.cols, rows: L.rows, size: L.g.e.size, bal: L.g.e.bal,
      held, net: d30, netPct: (d30 / denom) * 100, buy, sell, flat, sentiment: sentimentOf((d30 / denom) * 100),
      wallets: walletsOut };
  });

  return { cohorts, minBal, maxBal, minDay, maxDay, bounds: { width: totalW, depth: totalD },
    total: allMembers.length, moved: cohorts.reduce((s, c) => s + c.buy + c.sell, 0) };
}
