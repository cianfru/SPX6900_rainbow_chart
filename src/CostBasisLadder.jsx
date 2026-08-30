import { useMemo, useState, useEffect } from "react";
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from "recharts";
import { loadUrpdHistory } from "./history-data.js";
import ChartZoomHint from "./ChartZoomHint.jsx";
import { SANS, MONO, MAX_W, Metric, TipBox, ZoomBar, Explain, ViewTabs } from "./chart-ui.jsx";
import { useDragZoom } from "./use-drag-zoom.js";
import { buildLadder, shareInProfit, meanOf, hasCointime, LADDER_PCTS, ladderColor } from "./cost-basis-ladder.js";

const fShort = t => new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
const fFull = t => new Date(t).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
const usd = v => {
  if (!(v > 0)) return "—";
  if (v >= 1000) return "$" + Math.round(v).toLocaleString();
  if (v >= 1) return "$" + v.toFixed(2);
  if (v >= 0.01) return "$" + v.toFixed(3);
  return "$" + v.toFixed(5);
};
const PCT_KEYS = LADDER_PCTS.map(p => "p" + p);
const COLORS = LADDER_PCTS.map((_, i) => ladderColor(i, LADDER_PCTS.length));

// Nice log-spaced ticks (1·2·5 × 10^k) inside [lo, hi].
function logTicks(lo, hi) {
  const t = [];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++)
    for (const m of [1, 2, 5]) { const v = m * 10 ** e; if (v >= lo * 0.999 && v <= hi * 1.001) t.push(v); }
  return t;
}

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <TipBox title={fFull(d.ts)}>
      <div>price: <span style={{ fontFamily: MONO, color: "#f8fafc" }}>{usd(d.spot)}</span></div>
      <div>median cost basis (p50): <span style={{ fontFamily: MONO, color: "#e2e8f0" }}>{usd(d.p50)}</span></div>
      {d.prof != null && <div>in profit: <span style={{ fontFamily: MONO, color: d.prof >= 0.5 ? "#4ade80" : "#fb7185" }}>{Math.round(d.prof * 100)}%</span></div>}
      <div style={{ color: "#94a3b8", marginTop: 3 }}>range: {usd(d.p20)} → {usd(d.p95)}</div>
    </TipBox>
  );
}

// COST BASIS DISTRIBUTION — the cost-basis histogram (urpd-history.json) read as a percentile ladder
// over time, with price woven through. p50 = median cost basis; price above the top bands = nearly
// everyone in profit, sinking into the low bands = capitulation / support. Supply-weighted by default;
// cointime-weighted (amount × days held → conviction supply) once the engine emits pctCoin.
export default function CostBasisLadder({ isMobile, preview = false }) {
  const [hist, setHist] = useState(undefined);   // undefined loading · null none · object ok
  const [weight, setWeight] = useState("supply");
  useEffect(() => { let off = false; loadUrpdHistory().then(d => { if (!off) setHist(d ?? null); }); return () => { off = true; }; }, []);

  const coinReady = useMemo(() => hasCointime(hist), [hist]);
  const field = weight === "cointime" && coinReady ? "pctCoin" : "pct";

  const all = useMemo(() => {
    if (!hist) return null;
    const lad = buildLadder(hist, { field });
    if (!lad) return null;
    // attach the week's supply-in-profit (from the raw histogram, aligned by date) for the tooltip/metric
    const byDate = new Map(hist.weeks.map(w => [w.d, w]));
    for (const r of lad.rows) {
      const w = byDate.get(new Date(r.ts).toISOString().slice(0, 10));
      r.prof = w ? shareInProfit(hist.edges, w[field] || w.pct, r.spot) : null;
    }
    return lad.rows;
  }, [hist, field]);

  const { zoom, setZoom, selL, selR, onDown, onMove, onUp, zoomed } = useDragZoom(
    (a, b) => all && all.filter(r => r.ts >= a && r.ts <= b).length >= 2);

  const view = useMemo(() => {
    if (!all || all.length < 2) return null;
    const fullX = [all[0].ts, all.at(-1).ts];
    const [x0, x1] = zoom ?? fullX;
    const vis = all.filter(r => r.ts >= x0 && r.ts <= x1);
    if (vis.length < 2) return null;
    const step = Math.max(1, Math.round(vis.length / 6));
    const xTicks = vis.filter((_, i) => i % step === 0 || i === vis.length - 1).map(r => r.ts);
    let lo = Infinity, hi = -Infinity;
    for (const r of vis) { for (const k of PCT_KEYS) { const v = r[k]; if (v > 0) { if (v < lo) lo = v; if (v > hi) hi = v; } } if (r.spot > 0) { if (r.spot < lo) lo = r.spot; if (r.spot > hi) hi = r.spot; } }
    if (!(lo > 0) || !(hi > 0)) return null;
    lo *= 0.82; hi *= 1.18;
    return { vis, xDomain: [x0, x1], xTicks, yDomain: [lo, hi], yTicks: logTicks(lo, hi), cur: all.at(-1) };
  }, [all, zoom]);

  if (hist === undefined) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading on-chain data…</div>;
  if (!view) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Not enough on-chain data yet.</div>;

  const cur = view.cur;
  // realized price = the MEAN cost basis (what MVRV / the realized-price chart show). The median (p50)
  // sits below it because the distribution is right-skewed (a cohort bought high near the tops).
  const lastWk = hist.weeks.at(-1);
  const realized = meanOf(hist.edges, lastWk[field] || lastWk.pct);
  const tabs = coinReady ? [["supply", "Supply-weighted"], ["cointime", "Cointime-weighted"]] : [["supply", "Supply-weighted"]];

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="What did SPX6900 holders actually pay — and where does price sit in that?" accent="#f59e0b">
        Every coin's <strong style={{ color: "#e2e8f0" }}>cost basis</strong> (the price it was last acquired at) forms a distribution. These bands are its
        <strong style={{ color: "#e2e8f0" }}> percentiles</strong>: <strong style={{ color: "#f87171" }}>p95</strong> is where the dearest coins bought, <strong style={{ color: "#d946ef" }}>p20</strong> the cheapest, and
        <strong style={{ color: "#e2e8f0" }}> p50</strong> is the median. The <strong style={{ color: "#fbbf24" }}>realized price</strong> (the dashed amber line) is the <em>average</em> cost basis — the number MVRV uses; it sits <em>above</em> the median because a cohort bought high near the tops. When <strong style={{ color: "#f8fafc" }}>price</strong> rides above the top bands almost everyone is in profit; sinking into the low bands, those become real support — the prices people actually paid, not a drawn line.
      </Explain>

      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <Metric label="price" value={usd(cur.spot)} color="#f8fafc" />
        {realized > 0 && <Metric label="realized price" value={usd(realized)} color="#fbbf24" sub="avg cost basis" />}
        <Metric label="median" value={usd(cur.p50)} color="#7dd3fc" sub="p50 · half bought below" />
        <Metric label="in profit" value={cur.prof != null ? Math.round(cur.prof * 100) + "%" : "—"} color={cur.prof >= 0.5 ? "#4ade80" : "#fb7185"} sub={weight === "cointime" ? "cointime-weighted" : "of supply"} />
      </div>

      {!preview && tabs.length > 1 && <ViewTabs tabs={tabs} value={weight} onChange={setWeight} />}

      <ZoomBar zoomed={zoomed} onReset={() => setZoom(null)} accent="#f59e0b" />

      <div style={{ position: "relative" }}>
        {!preview && <ChartZoomHint />}
        <ResponsiveContainer width="100%" height={isMobile ? 420 : 580}>
          <ComposedChart data={view.vis} margin={{ top: 10, right: isMobile ? 10 : 22, bottom: 24, left: isMobile ? 2 : 14 }}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} style={{ cursor: "crosshair", userSelect: "none" }}>
            <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="ts" type="number" domain={view.xDomain} ticks={view.xTicks} scale="time" allowDataOverflow
              tickFormatter={fShort} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
            <YAxis type="number" scale="log" domain={view.yDomain} ticks={view.yTicks} allowDataOverflow
              tickFormatter={usd} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 52 : 66} />
            <Tooltip content={<Tip />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
            {PCT_KEYS.map((k, i) => (
              <Line key={k} type="monotone" dataKey={k} stroke={COLORS[i]} strokeWidth={1.3} dot={false} isAnimationActive={false} name={LADDER_PCTS[i] + "th %"} />
            ))}
            <Line type="monotone" dataKey="spot" stroke="#ffffff" strokeWidth={2.1} dot={false} isAnimationActive={false} name="price" />
            <ReferenceLine y={cur.spot} stroke="#ffffff" strokeWidth={1} strokeDasharray="4 5" strokeOpacity={0.5}
              label={preview ? undefined : { value: usd(cur.spot), position: "right", fill: "#f8fafc", fontSize: 10.5, fontFamily: MONO }} />
            {realized > 0 && <ReferenceLine y={realized} stroke="#fbbf24" strokeWidth={1} strokeDasharray="2 5" strokeOpacity={0.7}
              label={preview ? undefined : { value: "realized " + usd(realized), position: "insideTopLeft", fill: "#fbbf24", fontSize: 10.5, fontFamily: MONO }} />}
            {selL != null && selR != null && selL !== selR && (
              <ReferenceLine x={selL} stroke="#f59e0b" strokeOpacity={0.3} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {!preview && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "5px 12px", justifyContent: "center", marginTop: 14, fontFamily: MONO, fontSize: 11.5 }}>
          {LADDER_PCTS.map((p, i) => (
            <span key={p} style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "#c8d1de" }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: COLORS[i], display: "inline-block" }} />
              p{p} <b style={{ color: "#e2e8f0", fontWeight: 600 }}>{usd(cur["p" + p])}</b>
            </span>
          ))}
        </div>
      )}

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 14, lineHeight: 1.65, maxWidth: 940, marginInline: "auto" }}>
        Percentiles of the on-chain cost-basis distribution (FIFO lot prices of currently-held supply), daily, log price axis.
        {" "}{weight === "cointime" ? "Cointime-weighted: each coin counts by amount × days held, so long-held conviction supply dominates." : "Supply-weighted: every coin counts equally."}
        {" "}ETH-native (Base/Solana are Wormhole-bridged and can't be cost-traced). A valuation position, not a signal. Drag to zoom. Not financial advice.
      </div>
    </div>
  );
}
