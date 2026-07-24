// PROJECT AEON — holder cards off the transfer reconstruction (public/aeon-onchain.json):
//   • renderAeonOwnersCard   — owners over time, stacked by holding tier (multicolour)
//   • renderAeonConcentrationCard — top-10 / top-50 owner share over time
//   • renderAeonBehaviourCard — monthly holders entering (buying) vs exiting (selling)
// All read data.series[{ d, owners, dist:{one,small,mid,whale}, top10, top50, entered, exited }].
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const F = "sans-serif";
const bg = (W, H, id) => `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#${id})"/>`;
const rows = data => (data.series || []).filter(r => r && r.owners > 0).map(r => ({ ...r, ts: Date.parse(r.d) }));
const yearLabels = (t0, t1, x, yPix) => { let s = ""; for (let yr = new Date(t0).getUTCFullYear(); yr <= new Date(t1).getUTCFullYear(); yr++) { const t = Date.UTC(yr, 0, 1); if (t < t0 || t > t1) continue; s += `<text x="${x(t).toFixed(1)}" y="${yPix}" fill="#a3aec0" font-size="24" text-anchor="middle" font-family="${F}">${yr}</text>`; } return s; };

// ── Owners over time, stacked by holding tier ──────────────────────────────
const TIERS = [
  { k: "one", label: "1 token", c: "#2dd4bf" },
  { k: "small", label: "2–5", c: "#3b82f6" },
  { k: "mid", label: "6–10", c: "#a855f7" },
  { k: "whale", label: "11+", c: "#fb7185" },
];
export function aeonOwnersSvg(data, opts = {}) {
  const r = rows(data); if (r.length < 30) return null;
  const cur = r.at(-1);
  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 84, mR = 150, mT = 152, mB = 92, pW = W - mL - mR, pH = H - mT - mB;
  const t0 = r[0].ts, t1 = cur.ts;
  const ymax = Math.max(...r.map(p => p.owners)) * 1.05 || 1;
  const x = t => mL + ((t - t0) / ((t1 - t0) || 1)) * pW;
  const y = v => mT + (1 - v / ymax) * pH;
  const cum = (d, i) => { let s = 0; for (let k = 0; k <= i; k++) s += d[TIERS[k].k] || 0; return s; };
  let ribbons = "";
  for (let i = 0; i < TIERS.length; i++) {
    const top = r.map(p => `${x(p.ts).toFixed(1)},${y(cum(p.dist, i)).toFixed(1)}`);
    const bot = r.map(p => `${x(p.ts).toFixed(1)},${y(i === 0 ? 0 : cum(p.dist, i - 1)).toFixed(1)}`).reverse();
    ribbons += `<polygon points="${top.join(" ")} ${bot.join(" ")}" fill="${TIERS[i].c}" fill-opacity="0.85" stroke="#05050e" stroke-width="0.6"/>`;
  }
  let yl = ""; for (let g = 0; g <= 4; g++) { const v = ymax * g / 4; yl += `<text x="${mL - 12}" y="${(y(v) + 7).toFixed(1)}" fill="#a3aec0" font-size="21" text-anchor="end" font-family="${F}">${Math.round(v)}</text>`; }
  let legend = "", pv = -1e9;
  for (let i = TIERS.length - 1; i >= 0; i--) { const mid = (i === 0 ? 0 : cum(cur.dist, i - 1)) + (cur.dist[TIERS[i].k] || 0) / 2; let yy = Math.max(mT + 12, Math.min(mT + pH - 6, y(mid))); if (yy < pv + 26) yy = pv + 26; pv = yy; legend += `<rect x="${W - mR + 14}" y="${(yy - 9).toFixed(1)}" width="14" height="14" rx="3" fill="${TIERS[i].c}"/><text x="${W - mR + 34}" y="${(yy + 3).toFixed(1)}" fill="#cbd5e1" font-size="18" font-family="${F}">${esc(TIERS[i].label + " · " + (cur.dist[TIERS[i].k] || 0))}</text>`; }
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${bg(W, H, "aobg")}
<text x="60" y="56" fill="#e2e8f0" font-size="36" font-weight="800" font-family="${F}" letter-spacing="1">PROJECT AEON — OWNERS OVER TIME</text>
<text x="60" y="90" fill="#94a3b8" font-size="21" font-family="${F}">Distinct holders since mint, split by how many AEON each holds.</text>
<text x="60" y="128" fill="#2dd4bf" font-size="28" font-weight="800" font-family="${F}">${cur.owners.toLocaleString()} owners — ${cur.dist.one} hold a single AEON</text>
${ribbons}${yl}${yearLabels(t0, t1, x, H - 48)}${legend}
<text x="60" y="${H - 20}" fill="#6b7688" font-size="18" font-family="${F}">${esc("on-chain · distinct current owners by tokens-held tier · reconstructed from transfers")}</text></svg>`;
}
export const renderAeonOwnersCard = (data, o = {}) => { const s = aeonOwnersSvg(data, o); return s ? png(s, o.W ?? 1200) : null; };

// ── Concentration: top-10 / top-50 owner share over time ───────────────────
export function aeonConcentrationSvg(data, opts = {}) {
  const r = rows(data); if (r.length < 30) return null;
  const cur = r.at(-1);
  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 84, mR = 60, mT = 152, mB = 92, pW = W - mL - mR, pH = H - mT - mB;
  const t0 = r[0].ts, t1 = cur.ts;
  const ymax = Math.min(100, Math.max(...r.map(p => p.top50)) * 1.15 || 50);
  const x = t => mL + ((t - t0) / ((t1 - t0) || 1)) * pW;
  const y = v => mT + (1 - v / ymax) * pH;
  const line = (key, c, fill) => {
    const pts = r.map(p => `${x(p.ts).toFixed(1)},${y(p[key]).toFixed(1)}`);
    const area = `<polygon points="${x(t0).toFixed(1)},${y(0).toFixed(1)} ${pts.join(" ")} ${x(t1).toFixed(1)},${y(0).toFixed(1)}" fill="${c}" fill-opacity="${fill}"/>`;
    return area + `<polyline points="${pts.join(" ")}" fill="none" stroke="${c}" stroke-width="3.5"/>`;
  };
  let yl = ""; for (let g = 0; g <= 4; g++) { const v = ymax * g / 4; yl += `<line x1="${mL}" y1="${y(v).toFixed(1)}" x2="${mL + pW}" y2="${y(v).toFixed(1)}" stroke="rgba(255,255,255,0.06)"/><text x="${mL - 12}" y="${(y(v) + 7).toFixed(1)}" fill="#a3aec0" font-size="21" text-anchor="end" font-family="${F}">${v.toFixed(0)}%</text>`; }
  const legend = `<rect x="${mL + 6}" y="${mT + 8}" width="14" height="14" rx="3" fill="#fbbf24"/><text x="${mL + 26}" y="${mT + 20}" fill="#cbd5e1" font-size="19" font-family="${F}">Top 50 · ${cur.top50.toFixed(0)}%</text><rect x="${mL + 6}" y="${mT + 34}" width="14" height="14" rx="3" fill="#fb7185"/><text x="${mL + 26}" y="${mT + 46}" fill="#cbd5e1" font-size="19" font-family="${F}">Top 10 · ${cur.top10.toFixed(0)}%</text>`;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${bg(W, H, "acbg")}
<text x="60" y="56" fill="#e2e8f0" font-size="36" font-weight="800" font-family="${F}" letter-spacing="1">PROJECT AEON — CONCENTRATION</text>
<text x="60" y="90" fill="#94a3b8" font-size="21" font-family="${F}">Share of the collection held by the biggest wallets, over time.</text>
<text x="60" y="128" fill="#fbbf24" font-size="28" font-weight="800" font-family="${F}">Top 10 wallets hold ${cur.top10.toFixed(0)}% · top 50 hold ${cur.top50.toFixed(0)}%</text>
${line("top50", "#fbbf24", 0.16)}${line("top10", "#fb7185", 0.2)}${yl}${yearLabels(t0, t1, x, H - 48)}${legend}
<text x="60" y="${H - 20}" fill="#6b7688" font-size="18" font-family="${F}">${esc("on-chain · top-N owners' share of the 3,333 supply · lower = more distributed")}</text></svg>`;
}
export const renderAeonConcentrationCard = (data, o = {}) => { const s = aeonConcentrationSvg(data, o); return s ? png(s, o.W ?? 1200) : null; };

// ── Holder behaviour: monthly wallets entering (buying) vs exiting (selling) ─
export function aeonBehaviourSvg(data, opts = {}) {
  const r = rows(data); if (r.length < 30) return null;
  // Aggregate weekly enter/exit → monthly; drop the mint month (huge one-off spike).
  const mon = new Map();
  for (const p of r) { const k = p.d.slice(0, 7); const m = mon.get(k) || { entered: 0, exited: 0 }; m.entered += p.entered || 0; m.exited += p.exited || 0; mon.set(k, m); }
  let months = [...mon.entries()].map(([k, v]) => ({ k, ts: Date.parse(k + "-01"), ...v }));
  months.sort((a, b) => a.ts - b.ts);
  const mintMax = Math.max(...months.map(m => m.entered));
  months = months.filter(m => m.entered < mintMax); // skip the mint-frenzy month
  if (months.length < 6) return null;
  const cur = months.at(-1);
  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 70, mR = 60, mT = 152, mB = 92, pW = W - mL - mR, pH = H - mT - mB;
  const t0 = months[0].ts, t1 = cur.ts;
  const amax = Math.max(1, ...months.map(m => Math.max(m.entered, m.exited))) * 1.1;
  const x = t => mL + ((t - t0) / ((t1 - t0) || 1)) * pW;
  const y0 = mT + pH / 2;                       // zero line (buyers up, sellers down)
  const half = pH / 2, hOf = v => (v / amax) * half;
  const bw = Math.max(3, pW / months.length * 0.4);
  let bars = "";
  for (const m of months) {
    const cx = x(m.ts);
    bars += `<rect x="${(cx - bw).toFixed(1)}" y="${(y0 - hOf(m.entered)).toFixed(1)}" width="${bw.toFixed(1)}" height="${hOf(m.entered).toFixed(1)}" fill="#34d399" fill-opacity="0.9"/>`;
    bars += `<rect x="${cx.toFixed(1)}" y="${y0.toFixed(1)}" width="${bw.toFixed(1)}" height="${hOf(m.exited).toFixed(1)}" fill="#fb7185" fill-opacity="0.9"/>`;
  }
  const netTot = months.reduce((s, m) => s + m.entered - m.exited, 0);
  let yl = ""; for (const [v, yy] of [[amax, y0 - half], [0, y0], [amax, y0 + half]]) { yl += `<line x1="${mL}" y1="${yy.toFixed(1)}" x2="${mL + pW}" y2="${yy.toFixed(1)}" stroke="rgba(255,255,255,${yy === y0 ? 0.25 : 0.06})"/><text x="${mL - 10}" y="${(yy + 6).toFixed(1)}" fill="#a3aec0" font-size="19" text-anchor="end" font-family="${F}">${Math.round(v)}</text>`; }
  const legend = `<rect x="${mL + 6}" y="${mT + 6}" width="14" height="14" rx="3" fill="#34d399"/><text x="${mL + 26}" y="${mT + 18}" fill="#cbd5e1" font-size="18" font-family="${F}">wallets entering (buying)</text><rect x="${mL + 6}" y="${mT + 30}" width="14" height="14" rx="3" fill="#fb7185"/><text x="${mL + 26}" y="${mT + 42}" fill="#cbd5e1" font-size="18" font-family="${F}">wallets exiting (selling out)</text>`;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${bg(W, H, "abbg")}
<text x="60" y="56" fill="#e2e8f0" font-size="36" font-weight="800" font-family="${F}" letter-spacing="1">PROJECT AEON — HOLDER FLOW</text>
<text x="60" y="90" fill="#94a3b8" font-size="21" font-family="${F}">Wallets joining vs leaving the holder base each month (mint excluded).</text>
<text x="60" y="128" fill="${netTot >= 0 ? "#34d399" : "#fb7185"}" font-size="28" font-weight="800" font-family="${F}">Net ${netTot >= 0 ? "+" : ""}${netTot} wallets since mint · ${cur.entered} in / ${cur.exited} out last month</text>
${bars}${yl}${yearLabels(t0, t1, x, H - 48)}${legend}
<text x="60" y="${H - 20}" fill="#6b7688" font-size="18" font-family="${F}">${esc("on-chain · a wallet 'enters' when its balance crosses 0→held, 'exits' when it sells to zero")}</text></svg>`;
}
export const renderAeonBehaviourCard = (data, o = {}) => { const s = aeonBehaviourSvg(data, o); return s ? png(s, o.W ?? 1200) : null; };
