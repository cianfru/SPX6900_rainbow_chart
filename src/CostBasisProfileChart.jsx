import { useMemo, useState, useEffect, useRef } from "react";
import { SPX_URPD } from "./spx-urpd.js";
import { loadUrpd, loadPriceHistory, loadHistory } from "./history-data.js";
import { SANS, MONO, MAX_W, Metric, Explain } from "./chart-ui.jsx";

// COST-BASIS PROFILE — a volume-profile of SPX6900: the price line over time on the right, and where
// the held supply was BOUGHT as horizontal bars hugging the left price axis (the URPD cost-basis
// distribution, rotated so each bag lines up with its price level). Green = bought below spot (in
// profit), red = above (underwater). The spot line is LIVE (/api/spot) and the profit split recomputes
// against it; the bags are the daily FIFO reconstruction. "Where are the bags, versus price."

const GRN = "#34d399", RED = "#fb7185", LINE = "#93a4c4", SPOT = "#f8fafc";
const fp = p => p == null ? "—" : p >= 1 ? "$" + p.toFixed(2) : "$" + p.toFixed(p >= 0.1 ? 3 : 4);
const fShort = ts => new Date(ts).toLocaleDateString("en-US", { month: "short", year: "2-digit" });

export default function CostBasisProfileChart({ isMobile, preview = false, price = null }) {
  const [urpd, setUrpd] = useState(null);
  const [px, setPx] = useState(null);       // price-history line
  const [snap, setSnap] = useState(null);   // latest daily snapshot price (spot fallback)
  const [liveSpot, setLiveSpot] = useState(null);
  const [hov, setHov] = useState(null);     // hovered bucket index
  const wrap = useRef(null);
  const [tip, setTip] = useState({ x: 0, y: 0 });

  useEffect(() => {
    let off = false;
    loadUrpd().then(d => { if (!off && d) setUrpd(d); });
    loadPriceHistory().then(h => { if (!off && Array.isArray(h)) setPx(h); });
    loadHistory().then(h => { if (!off && Array.isArray(h) && h.length) setSnap(h.at(-1)?.p ?? null); });
    return () => { off = true; };
  }, []);
  // live spot: poll /api/spot (near-real-time) unless a live price was passed in
  useEffect(() => {
    if (Number.isFinite(price) && price > 0) return;
    let off = false, t;
    const pull = () => fetch("/api/spot").then(r => r.json()).then(d => { if (!off && d?.price > 0) setLiveSpot(d.price); }).catch(() => {});
    pull(); t = setInterval(pull, 30000);
    return () => { off = true; clearInterval(t); };
  }, [price]);

  const u = urpd || SPX_URPD;
  const spot = (Number.isFinite(price) && price > 0) ? price
    : (Number.isFinite(liveSpot) && liveSpot > 0) ? liveSpot
    : (Number.isFinite(snap) && snap > 0) ? snap : (u?.spot ?? 0);

  const model = useMemo(() => {
    const buckets = (u?.buckets || []).filter(b => b.hi > 0);
    if (!buckets.length) return null;
    const line = (px && px.length ? px : []).map(r => ({ t: Date.parse(r.date), p: +r.price })).filter(r => Number.isFinite(r.t) && r.p > 0);
    // downsample the line for a clean draw
    const step = Math.max(1, Math.floor(line.length / 320));
    const lineD = line.filter((_, i) => i % step === 0 || i === line.length - 1);
    const bkts = buckets.map((b, i) => ({ i, lo: b.lo, hi: b.hi, mid: Math.sqrt(b.lo * b.hi), pct: b.pct, inProfit: Math.sqrt(b.lo * b.hi) < spot }));
    const inProfit = bkts.reduce((a, b) => a + (b.inProfit ? b.pct : 0), 0);
    const wall = bkts.reduce((m, b) => (b.pct > (m?.pct ?? -1) ? b : m), null);
    const maxPct = Math.max(...bkts.map(b => b.pct), 1e-4);
    const lows = [...bkts.map(b => b.lo), ...lineD.map(r => r.p), spot].filter(v => v > 0);
    return { bkts, lineD, inProfit, wall, maxPct, pMin: Math.min(...lows), pMax: Math.max(...bkts.map(b => b.hi), ...lineD.map(r => r.p), spot) };
  }, [u, px, spot]);

  if (!model) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading cost-basis data…</div>;
  const { bkts, lineD, inProfit, wall, maxPct, pMin, pMax } = model;

  // geometry (single SVG so the bars and the price line share one price scale exactly)
  const W = 1200, H = isMobile ? 480 : 580;
  const mL = 58, mR = 14, mT = 18, mB = 40;
  const plotW = W - mL - mR, plotH = H - mT - mB;
  const BW = plotW * (isMobile ? 0.36 : 0.30);
  const GAP = 16;
  const lineX0 = mL + BW + GAP, lineW = W - mR - lineX0;
  const yLo = Math.log(pMin * 0.95), yHi = Math.log(pMax * 1.06);
  const yOf = p => mT + plotH * (1 - (Math.log(p) - yLo) / (yHi - yLo));
  const tMin = lineD.length ? lineD[0].t : 0, tMax = lineD.length ? lineD.at(-1).t : 1;
  const xOf = t => lineX0 + lineW * (tMax > tMin ? (t - tMin) / (tMax - tMin) : 1);
  const barLen = pct => Math.max(pct > 0 ? 1.5 : 0, (pct / maxPct) * (BW - 4));

  const linePath = lineD.map((r, i) => `${i ? "L" : "M"}${xOf(r.t).toFixed(1)} ${yOf(r.p).toFixed(1)}`).join(" ");
  const priceTicks = [0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1, 2].filter(v => v >= pMin * 0.95 && v <= pMax * 1.06);
  const tSpan = tMax - tMin, xTicks = [];
  if (lineD.length) for (let k = 0; k <= 5; k++) { const t = tMin + (tSpan * k) / 5; xTicks.push(t); }

  const spotY = yOf(spot);
  const spotBucket = bkts.find(b => spot >= b.lo && spot < b.hi);

  // hit-test the cost-basis bars from the cursor (one handler on the wrap — more reliable than
  // per-rect enter events on SVG). Converts wrap-relative px → viewBox coords (uniform scale, since
  // the SVG is width:100% with a fixed viewBox), then finds the bucket whose price band holds the y.
  const onMove = e => {
    const el = wrap.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const rx = e.clientX - r.left, ry = e.clientY - r.top;
    setTip({ x: rx, y: ry });
    const scale = W / (el.clientWidth || W);
    const vx = rx * scale, vy = ry * scale;
    if (vx < mL || vx > mL + BW) { setHov(null); return; }
    let found = null;
    for (const b of bkts) { if (vy >= yOf(b.hi) && vy <= yOf(b.lo)) { found = b.i; break; } }
    setHov(found);
  };

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="Where was SPX6900 bought — and where is that versus price?" accent={GRN}>
        The price line on the right, and <strong style={{ color: "#e2e8f0" }}>where the held supply was bought</strong> as bars on the left,
        each lined up with its price. <strong style={{ color: GRN }}>Green</strong> bought below spot (in profit),
        <strong style={{ color: RED }}> red</strong> above it (underwater). The white spot line is <strong style={{ color: "#e2e8f0" }}>live</strong>; the bags are the daily on-chain reconstruction.
      </Explain>

      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 10, flexWrap: "wrap" }}>
        <Metric label="spot" value={fp(spot)} color="#e2e8f0" sub="live" />
        <Metric label="supply in profit" value={inProfit.toFixed(0) + "%"} color={inProfit >= 50 ? GRN : RED} sub="bought below spot" />
        {wall && <Metric label="biggest wall" value={wall.pct.toFixed(1) + "%"} color="#f6a23c" sub={`at ${fp(wall.mid)}`} />}
      </div>

      <div ref={wrap} style={{ position: "relative", width: "100%" }} onMouseMove={onMove} onMouseLeave={() => setHov(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
          {/* price gridlines + labels (shared axis) */}
          {priceTicks.map(v => (
            <g key={v}>
              <line x1={mL} y1={yOf(v)} x2={W - mR} y2={yOf(v)} stroke="rgba(255,255,255,0.05)" />
              <text x={mL - 6} y={yOf(v) + 4} textAnchor="end" fontSize="15" fontFamily={MONO} fill="#8b98ad">{fp(v)}</text>
            </g>
          ))}
          {/* divider between profile and price panels */}
          <line x1={lineX0 - GAP / 2} y1={mT} x2={lineX0 - GAP / 2} y2={mT + plotH} stroke="rgba(255,255,255,0.08)" />

          {/* cost-basis bars, anchored to the left axis, one per price bucket */}
          {bkts.map(b => {
            const yTop = yOf(b.hi), yBot = yOf(b.lo);
            const h = Math.max(1.5, yBot - yTop - 1);
            const on = hov === b.i;
            return (
              <rect key={b.i} x={mL} y={yTop + 0.5} width={barLen(b.pct)} height={h} rx={1.5}
                fill={b.inProfit ? GRN : RED} fillOpacity={on ? 1 : (b.pct > 0 ? 0.82 : 0)}
                stroke={b === spotBucket ? SPOT : "none"} strokeOpacity={0.6} strokeWidth={b === spotBucket ? 1 : 0} />
            );
          })}
          {/* price line */}
          <path d={linePath} fill="none" stroke={LINE} strokeWidth={1.8} strokeOpacity={0.9} />

          {/* live spot line across both panels */}
          <line x1={mL} y1={spotY} x2={W - mR} y2={spotY} stroke={SPOT} strokeWidth={1.2} strokeDasharray="5 5" strokeOpacity={0.85} />
          <circle cx={xOf(tMax)} cy={spotY} r={4} fill={SPOT} />
          <text x={W - mR} y={spotY - 7} textAnchor="end" fontSize="15" fontWeight="700" fontFamily={MONO} fill={SPOT}>spot {fp(spot)}</text>

          {/* time axis under the price panel */}
          {xTicks.map((t, k) => (
            <text key={k} x={xOf(t)} y={H - 12} textAnchor="middle" fontSize="14" fontFamily={MONO} fill="#8b98ad">{fShort(t)}</text>
          ))}
          {/* panel labels */}
          <text x={mL} y={H - 12} fontSize="13" fontFamily={SANS} fill="#64748b">← cost basis (held supply)</text>
        </svg>

        {hov != null && bkts[hov] && (
          <div style={{
            position: "absolute", left: Math.min(tip.x + 14, (wrap.current?.clientWidth || 600) - 190), top: Math.max(0, tip.y - 10),
            pointerEvents: "none", background: "#0a0e1c", border: "1px solid #234", borderRadius: 9, padding: "8px 11px",
            fontFamily: SANS, fontSize: 12.5, boxShadow: "0 8px 26px rgba(0,0,0,0.55)", minWidth: 150,
          }}>
            <div style={{ color: "#e2e8f0", fontWeight: 700, fontFamily: MONO }}>{fp(bkts[hov].lo)} – {fp(bkts[hov].hi)}</div>
            <div style={{ color: bkts[hov].inProfit ? GRN : RED, fontFamily: MONO }}>{bkts[hov].pct.toFixed(1)}% of held supply</div>
            <div style={{ color: "#94a3b8" }}>bought here — {bkts[hov].inProfit ? "in profit" : "underwater"}</div>
          </div>
        )}
      </div>

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        A cost-basis profile — the held supply&rsquo;s acquisition price (from the local FIFO reconstruction) as horizontal bars on the left,
        aligned to the same log price axis as the line. <strong style={{ color: GRN }}>{inProfit.toFixed(0)}% sits in profit</strong>{wall ? <>, and the heaviest wall is around <strong style={{ color: "#f6a23c" }}>{fp(wall.mid)}</strong></> : null}.
        Spot is live (updates every ~30s); the profit split recomputes against it; the bags refresh daily. Hover a bar for its price band. A holder-cost position, not a signal.
      </div>
    </div>
  );
}
