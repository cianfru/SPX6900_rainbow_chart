import { useMemo, useState, useEffect } from "react";
import {
  ResponsiveContainer, ComposedChart, Bar, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceArea,
} from "recharts";
import { loadExitFlow, loadPriceHistory } from "./history-data.js";
import ChartZoomHint from "./ChartZoomHint.jsx";
import LiveFlowStrip from "./LiveFlowStrip.jsx";
import { SANS, MONO, MAX_W, Metric, TipBox, ZoomBar, Explain } from "./chart-ui.jsx";
import { useDragZoom } from "./use-drag-zoom.js";

const GRN = "#4ade80", RED = "#f43f5e", PRICE = "#94a3b8";
const fShort = t => new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
const fN = n => n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n);
const fSpx = v => v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : v >= 1e3 ? Math.round(v / 1e3) + "k" : String(Math.round(v));
const fP = p => p == null ? "—" : p < 0.01 ? "$" + p.toFixed(4) : "$" + p.toFixed(2);

function Tip({ active, payload, cumulative, spx }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const unit = spx ? " SPX" : "";
  const f = spx ? fSpx : (v => v.toLocaleString());
  const pk = cumulative ? (spx ? "cumSpxP" : "cumProfit") : (spx ? "spxP" : "profit");
  const lk = cumulative ? (spx ? "cumSpxL" : "cumLoss") : (spx ? "spxL" : "loss");
  const verb = cumulative ? "left" : "sold";
  return (
    <TipBox title={new Date(d.ts).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}>
      <div><span style={{ color: GRN }}>{verb} in profit</span>: <span style={{ fontFamily: MONO }}>{f(d[pk])}{unit}</span></div>
      <div><span style={{ color: RED }}>{verb} at a loss</span>: <span style={{ fontFamily: MONO }}>{f(d[lk])}{unit}</span></div>
      {!cumulative && d.price != null && <div style={{ marginTop: 3, color: "#cbd5e1" }}>price then: <span style={{ fontFamily: MONO }}>{fP(d.price)}</span></div>}
    </TipBox>
  );
}

// "Who left — and did they leave in profit?" The realized exit of everyone who dropped below the
// 5,000-SPX bar, per day, split green (sold above their entry) / red (below), over the price line.
// The counterintuitive read: the churn was overwhelmingly profit-taking; losses only cluster in the
// drawdown. NOT NUPL (that's the unrealized P/L of who's STILL here) — this is who's GONE.
export default function ExitFlowChart({ isMobile }) {
  const [doc, setDoc] = useState(null);
  const [px, setPx] = useState(null);
  const [cumulative, setCumulative] = useState(false);
  const [metric, setMetric] = useState("wallets");   // "wallets" | "spx"
  useEffect(() => {
    let off = false;
    loadExitFlow().then(d => { if (!off) setDoc(d ?? false); });
    loadPriceHistory().then(p => { if (!off) setPx(Array.isArray(p) ? p : []); });
    return () => { off = true; };
  }, []);

  // SPX amounts arrive with the pipeline's 5-tuple rows ([date, profitN, lossN, spxProfit, spxLoss]);
  // older 3-tuple data has none → the SPX toggle only shows once the data carries it.
  const hasSpx = !!doc?.days?.some(d => d.length >= 5 && (d[3] || d[4]));
  const spx = metric === "spx" && hasSpx;

  const all = useMemo(() => {
    if (!doc?.days) return [];
    const pmap = new Map((px || []).map(r => [r.date, +r.price]));
    const rows = doc.days.map(([date, profit, loss, spxP = 0, spxL = 0]) =>
      ({ ts: Date.parse(date), date, profit, loss, total: profit + loss, spxP, spxL }))
      .filter(r => Number.isFinite(r.ts)).sort((a, b) => a.ts - b.ts);
    // forward-fill price (exit days may not all have a price-history row) + accumulate the running splits
    let lastP = null, cp = 0, cl = 0, csp = 0, csl = 0;
    for (const r of rows) {
      const p = pmap.get(r.date); if (p > 0) lastP = p;
      r.price = lastP;
      r.cumProfit = (cp += r.profit); r.cumLoss = (cl += r.loss);
      r.cumSpxP = (csp += r.spxP); r.cumSpxL = (csl += r.spxL);
    }
    return rows;
  }, [doc, px]);

  const { zoom, setZoom, selL, selR, onDown, onMove, onUp, zoomed } = useDragZoom(
    (a, b) => all.filter(r => r.ts >= a && r.ts <= b).length >= 2);

  const view = useMemo(() => {
    if (all.length < 2) return null;
    const [x0, x1] = zoom ?? [all[0].ts, all.at(-1).ts];
    const vis = all.filter(r => r.ts >= x0 && r.ts <= x1);
    if (vis.length < 2) return null;
    const step = Math.max(1, Math.round(vis.length / 6));
    const xTicks = vis.filter((_, i) => i % step === 0 || i === vis.length - 1).map(r => r.ts);
    const prices = vis.map(r => r.price).filter(p => p > 0);
    const pMin = prices.length ? Math.min(...prices) : 0.001, pMax = prices.length ? Math.max(...prices) : 1;
    return { vis, xDomain: [x0, x1], xTicks, pDomain: [pMin * 0.85, pMax * 1.15] };
  }, [all, zoom]);

  if (doc === false) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Exit data is being rebuilt — check back after the next on-chain refresh.</div>;
  if (!view) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading exit history…</div>;

  const o = doc.overall || {};
  const btn = on => ({
    padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontFamily: SANS, fontSize: 13, fontWeight: 600,
    background: on ? "rgba(94,234,212,0.16)" : "rgba(255,255,255,0.05)",
    border: `1px solid ${on ? "#5eead4" : "rgba(255,255,255,0.14)"}`, color: on ? "#5eead4" : "#94a3b8",
  });
  const seg = on => ({
    padding: "6px 12px", cursor: "pointer", fontFamily: SANS, fontSize: 13, fontWeight: 600, border: "none",
    background: on ? "rgba(94,234,212,0.16)" : "transparent", color: on ? "#5eead4" : "#94a3b8",
  });

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="Who left SPX6900 — and did they sell green or red?" accent={GRN}>
        Every wallet that <strong style={{ color: "#e2e8f0" }}>left the holder base</strong>, counted on the day it dropped out, split by whether it sold
        <strong style={{ color: GRN }}> above</strong> or <strong style={{ color: RED }}>below</strong> its entry price.
        The churn was overwhelmingly <strong style={{ color: GRN }}>profit-taking</strong> — {o.profitPct}% left green; losses only cluster in the drawdown.
        Not NUPL (that&apos;s the unrealized P/L of who&apos;s <em>still here</em>) — this is who&apos;s gone.
      </Explain>

      <LiveFlowStrip isMobile={isMobile} />

      <div style={{ display: "flex", gap: isMobile ? 14 : 30, justifyContent: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <Metric label="left in profit" value={(o.profitPct ?? 0) + "%"} color={GRN} sub={`${(o.profit ?? 0).toLocaleString()} wallets`} />
        <Metric label="left at a loss" value={(100 - (o.profitPct ?? 0)) + "%"} color={RED} sub={`${(o.loss ?? 0).toLocaleString()} wallets`} />
        <Metric label="total departed" value={fN(o.left ?? 0)} color="#cbd5e1" sub="wallets, was a holder now gone" />
        {hasSpx && <Metric label="of SPX that left" value={(o.spxProfitPct ?? 0) + "%"} color="#5eead4" sub="sold in profit (size-weighted)" />}
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 10, flexWrap: "wrap" }}>
        {hasSpx && (
          <div style={{ display: "inline-flex", borderRadius: 8, overflow: "hidden", border: "1px solid rgba(255,255,255,0.14)", marginRight: 4 }}>
            <button onClick={() => setMetric("wallets")} style={{ ...seg(!spx), borderRight: "1px solid rgba(255,255,255,0.12)" }}>Wallets</button>
            <button onClick={() => setMetric("spx")} style={seg(spx)}>SPX dumped</button>
          </div>
        )}
        <button onClick={() => setCumulative(false)} style={btn(!cumulative)}>Per day</button>
        <button onClick={() => setCumulative(true)} style={btn(cumulative)}>Cumulative</button>
      </div>

      <ZoomBar zoomed={zoomed} onReset={() => setZoom(null)} accent={GRN} />

      <div style={{ position: "relative" }}>
        <ChartZoomHint />
        <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
          <ComposedChart data={view.vis} margin={{ top: 10, right: isMobile ? 8 : 22, bottom: 24, left: isMobile ? 0 : 12 }}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} style={{ cursor: "crosshair", userSelect: "none" }}>
            <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="ts" type="number" domain={view.xDomain} ticks={view.xTicks} scale="time" allowDataOverflow
              tickFormatter={fShort} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
            <YAxis yAxisId="n" type="number" allowDataOverflow
              tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 44 : 56}
              tickFormatter={spx ? fSpx : fN} />
            {!cumulative && (
              <YAxis yAxisId="price" orientation="right" type="number" scale="log" domain={view.pDomain} allowDataOverflow
                tick={{ fill: PRICE, fontSize: isMobile ? 9 : 11, fontFamily: MONO }} tickFormatter={fP}
                axisLine={{ stroke: "rgba(255,255,255,0.1)" }} tickLine={false} width={isMobile ? 44 : 56} />
            )}
            <Tooltip content={<Tip cumulative={cumulative} spx={spx} />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
            {cumulative ? (
              <>
                <Area yAxisId="n" type="monotone" dataKey={spx ? "cumSpxP" : "cumProfit"} stackId="c" stroke={GRN} strokeWidth={0.5} fill={GRN} fillOpacity={0.55} dot={false} isAnimationActive={false} name="profit" />
                <Area yAxisId="n" type="monotone" dataKey={spx ? "cumSpxL" : "cumLoss"} stackId="c" stroke={RED} strokeWidth={0.5} fill={RED} fillOpacity={0.6} dot={false} isAnimationActive={false} name="loss" />
              </>
            ) : (
              <>
                <Bar yAxisId="n" dataKey={spx ? "spxP" : "profit"} stackId="d" fill={GRN} isAnimationActive={false} name="profit" />
                <Bar yAxisId="n" dataKey={spx ? "spxL" : "loss"} stackId="d" fill={RED} isAnimationActive={false} name="loss" />
                <Line yAxisId="price" type="monotone" dataKey="price" stroke={PRICE} strokeWidth={1.6} dot={false} isAnimationActive={false} name="price" opacity={0.7} />
              </>
            )}
            {selL != null && selR != null && selL !== selR && (
              <ReferenceArea yAxisId="n" x1={selL} x2={selR} strokeOpacity={0.4} stroke="#e2e8f0" fill="#e2e8f0" fillOpacity={0.1} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* legend */}
      <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap", marginTop: 10 }}>
        {[["Sold in profit", GRN], ["Sold at a loss", RED], ["Price then", PRICE]].map(([lbl, c]) => (
          <span key={lbl} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: SANS, fontSize: 12.5, color: "#a7b3c6" }}>
            <span style={{ width: 11, height: 11, borderRadius: 3, background: c }} /> {lbl}
          </span>
        ))}
      </div>

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        <strong style={{ color: GRN }}>How holders left</strong> — {spx
          ? (cumulative ? "the running total of SPX that dropped out of strong hands, green (sold in profit) vs red (at a loss)" : "SPX that left the holder base each day, green if sold above entry, red if below, over the price line")
          : (cumulative ? "the running total of departures, green (in profit) vs red (at a loss)" : "one bar per day: departing holders, green if they sold above their entry, red if below, over the price line")}.
        {hasSpx && <> The <strong style={{ color: "#5eead4" }}>SPX dumped</strong> view weights by size — one whale outweighs fifty shrimp — measuring each departing wallet&rsquo;s holding the moment before it fell below 5,000 SPX (the position that left; an outflow proxy, since on-chain can&rsquo;t separate a sale from a transfer).</>}
        {" "}An exit is dated to the transfer that drops the wallet below the bar. Profit/loss is exit price vs entry price (≈ the price when it crossed the bar; a realized-P/L proxy). Reconstructed on-chain, daily. Drag to zoom. Not financial advice.
      </div>
    </div>
  );
}
