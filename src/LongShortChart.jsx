import { useMemo, useState, useEffect } from "react";
import {
  ResponsiveContainer, ComposedChart, Bar, Cell, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, ReferenceArea, ReferenceDot,
} from "recharts";
import { loadLongShort } from "./history-data.js";
import { useHyperliquidLive } from "./hl-live.js";
import { SANS, MONO, MAX_W, Metric, TipBox, ZoomBar } from "./chart-ui.jsx";
import { useDragZoom } from "./use-drag-zoom.js";

const fPrice = p => (p < 1 ? "$" + p.toFixed(p < 0.01 ? 4 : 3) : "$" + p.toLocaleString(undefined, { maximumFractionDigits: 2 }));
const fPct = v => `${v >= 0 ? "+" : ""}${v.toFixed(Math.abs(v) >= 100 ? 0 : 1)}%`;
const fOI = v => (v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : v >= 1e3 ? (v / 1e3).toFixed(0) + "k" : Math.round(v));
const yearOf = t => new Date(t).getUTCFullYear();
const DAY = 86400000;
const LONG = "#34d399", SHORT = "#f87171", PRICE = "#38bdf8";
const toAPR = hourly => hourly * 24 * 365 * 100; // day's mean hourly rate → APR %

function Tip({ active, payload, neutral }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <TipBox title={new Date(d.ts).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}>
      {d.price != null && <div>Price: <span style={{ fontFamily: MONO, color: PRICE }}>{fPrice(d.price)}</span></div>}
      <div>Funding (APR): <span style={{ fontFamily: MONO, fontWeight: 700, color: d.dev >= 0 ? LONG : SHORT }}>{fPct(d.apr)}</span></div>
      <div style={{ color: "#94a3b8" }}>{fPct(d.dev)} vs neutral ({d.dev >= 0 ? "long-leaning" : "short-leaning"})</div>
    </TipBox>
  );
}

// On-chain POSITIONING from Hyperliquid (unmanipulable, SPX's CEX futures geo-block
// our collection). Bars are the perp FUNDING rate NORMALISED to its neutral baseline:
// Hyperliquid charges a structural ~+10% APR even in a balanced market, so we pivot on
// that (the median), not 0, otherwise "just neutral" reads as "crowd long." Above
// neutral (green) = extra demand to be long; below (red) = leaning short. Price overlaid.
// Data-gated: funding backfilled, OI accrues daily. Drag to zoom.
export default function LongShortChart({ series, isMobile }) {
  const [ls, setLs] = useState(null);
  useEffect(() => { let c = false; loadLongShort().then(d => { if (!c) setLs(d); }); return () => { c = true; }; }, []);
  // Live market pulse straight from Hyperliquid's WebSocket (funding / OI / mark price stream in while
  // the chart is open). The daily banker still owns the history; this only refreshes the leading edge.
  const live = useHyperliquidLive("SPX");

  const priceByDate = useMemo(() => {
    const m = new Map();
    for (const r of (series || [])) m.set(r.date, r.price);
    return m;
  }, [series]);

  // Full series + the stable neutral baseline (median funding), computed once so the
  // pivot and colours don't shift as you zoom.
  const { allRows, neutral, curOI } = useMemo(() => {
    if (!ls) return { allRows: null };
    const f = ls.filter(r => r.hlFunding != null).sort((a, b) => a.date.localeCompare(b.date));
    if (!f.length) return { allRows: [] };
    const aprs = f.map(r => toAPR(r.hlFunding));
    const sorted = [...aprs].sort((a, b) => a - b);
    const neutral = sorted[Math.floor(sorted.length / 2)]; // median ≈ HL's structural baseline
    const allRows = f.map((r, i) => ({ ts: Date.parse(r.date), date: r.date, apr: aprs[i], dev: aprs[i] - neutral, price: priceByDate.get(r.date) ?? null }));
    const oiRow = ls.filter(r => r.hlOI != null).at(-1);
    return { allRows, neutral, curOI: oiRow?.hlOI ?? null };
  }, [ls, priceByDate]);

  const { zoom, setZoom, selL, selR, onDown, onMove, onUp, zoomed } = useDragZoom(
    (a, b) => (allRows || []).filter(r => r.ts >= a && r.ts <= b).length >= 2);

  const view = useMemo(() => {
    if (!allRows || !allRows.length) return null;
    const [x0, x1] = zoom ?? [allRows[0].ts, allRows.at(-1).ts];
    const rows = allRows.filter(r => r.ts >= x0 && r.ts <= x1);
    let dMin = 0, dMax = 0, pMin = Infinity, pMax = -Infinity;
    for (const r of rows) { if (r.dev < dMin) dMin = r.dev; if (r.dev > dMax) dMax = r.dev; if (r.price != null) { if (r.price < pMin) pMin = r.price; if (r.price > pMax) pMax = r.price; } }
    // absolute-APR ticks (nice round values) mapped into dev-space, so the axis reads
    // real APR while bars pivot on the neutral line (dev = 0).
    const aLo = dMin + neutral, aHi = dMax + neutral;
    const span = aHi - aLo, step = span > 400 ? 100 : span > 160 ? 50 : span > 60 ? 25 : 10;
    const aprTicks = [];
    for (let a = Math.ceil(aLo / step) * step; a <= aHi; a += step) aprTicks.push(a - neutral);
    const spanDays = (x1 - x0) / DAY, monthly = spanDays <= 400;
    const xTicks = [];
    if (monthly) {
      const d0 = new Date(x0);
      for (let m = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), 1)); m.getTime() <= x1; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))) if (m.getTime() >= x0 - 40 * DAY) xTicks.push(m.getTime());
    } else {
      const d0 = new Date(x0);
      for (let m = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), 1)); m.getTime() <= x1; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 3, 1))) if (m.getTime() >= x0 - 45 * DAY) xTicks.push(m.getTime());
    }
    const pad = Math.max(5, (dMax - dMin) * 0.1);
    return {
      rows, xDomain: [x0, x1], xTicks,
      devDomain: [dMin - pad, dMax + pad], aprTicks,
      priceDomain: [(pMin === Infinity ? 0.01 : pMin) * 0.7, (pMax === -Infinity ? 1 : pMax) * 1.4],
      cur: { apr: rows.at(-1)?.apr ?? allRows.at(-1).apr, dev: rows.at(-1)?.dev ?? allRows.at(-1).dev, price: rows.at(-1)?.price },
    };
  }, [allRows, neutral, zoom]);

  if (allRows === null) return <Loading isMobile={isMobile} text="Loading on-chain positioning…" />;
  if (allRows.length === 0) return <Loading isMobile={isMobile} text="Collecting on-chain positioning, fills in as the daily banker runs." />;

  const { rows, xDomain, xTicks, devDomain, aprTicks, priceDomain, cur } = view;
  const pTicks = [0.0001, 0.001, 0.01, 0.1, 1, 10].filter(v => v >= priceDomain[0] && v <= priceDomain[1]);
  const dragProps = { onMouseDown: onDown, onMouseMove: onMove, onMouseUp: onUp, onMouseLeave: onUp, style: { cursor: "crosshair", userSelect: "none" } };

  // LIVE pulse: prefer the streaming Hyperliquid values over the banked daily ones when connected.
  const liveApr = live.funding != null ? toAPR(live.funding) : null;
  const isLive = live.connected && liveApr != null;
  const apr = isLive ? liveApr : cur.apr;
  const dev = isLive ? liveApr - neutral : cur.dev;
  const oi = isLive && live.oi != null ? live.oi : curOI;
  const price = isLive && live.markPx != null ? live.markPx : cur.price;
  // Pulsing marker at the live price, only when the view still includes the leading edge (not zoomed away).
  const lastTs = allRows.at(-1).ts;
  const showLiveDot = isLive && price != null && xDomain[1] >= lastTs - DAY && xDomain[0] <= lastTs;
  const LivePulse = ({ cx, cy }) => (cx == null || cy == null) ? null : (
    <g>
      <circle cx={cx} cy={cy} r={9} fill="none" stroke={PRICE} strokeWidth={1.5}>
        <animate attributeName="r" values="5;15" dur="1.5s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.7;0" dur="1.5s" repeatCount="indefinite" />
      </circle>
      <circle cx={cx} cy={cy} r={4.5} fill={PRICE} stroke="#0b1220" strokeWidth={1.5} />
    </g>
  );

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <style>{`@keyframes lsPulse{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(52,211,153,.5)}50%{opacity:.55;box-shadow:0 0 0 5px rgba(52,211,153,0)}}`}</style>

      <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 8, fontFamily: MONO, fontSize: 11.5, letterSpacing: "0.06em",
          padding: "4px 12px", borderRadius: 999,
          color: isLive ? "#6ee7b7" : "#94a3b8",
          background: isLive ? "rgba(52,211,153,0.1)" : "rgba(148,163,184,0.08)",
          border: `1px solid ${isLive ? "rgba(52,211,153,0.4)" : "rgba(148,163,184,0.25)"}`,
        }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: isLive ? LONG : "#64748b", animation: isLive ? "lsPulse 1.5s ease-in-out infinite" : "none" }} />
          {isLive ? "LIVE · Hyperliquid" : "connecting to Hyperliquid…"}
        </span>
      </div>

      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <Metric label="funding (APR)" value={fPct(apr)} color={dev >= 0 ? LONG : SHORT} sub={`${fPct(dev)} vs neutral · ${dev >= 0 ? "long-leaning" : "short-leaning"}`} />
        {oi != null && <Metric label="open interest" value={fOI(oi) + " SPX"} color="#a78bfa" sub={isLive ? "live · perp" : "Hyperliquid perp"} />}
        {price != null && <Metric label="mark price" value={fPrice(price)} color={PRICE} sub={isLive ? "live" : "daily"} />}
        {isLive && live.vlm != null && <Metric label="24h volume" value={"$" + fOI(live.vlm)} color="#94a3b8" sub="Hyperliquid" />}
      </div>

      <ZoomBar zoomed={zoomed} onReset={() => setZoom(null)} accent={LONG} viewing="Viewing a selected window." />

      <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
        <ComposedChart data={rows} margin={{ top: 10, right: isMobile ? 8 : 20, bottom: 24, left: isMobile ? 0 : 12 }} barCategoryGap={0} {...dragProps}>
          <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="ts" type="number" domain={xDomain} ticks={xTicks} scale="time" allowDataOverflow
            tickFormatter={t => new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit" })} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} minTickGap={isMobile ? 40 : 24} />
          <YAxis yAxisId="dev" orientation="right" type="number" domain={devDomain} ticks={aprTicks} allowDataOverflow
            tickFormatter={v => Math.round(v + neutral) + "%"} tick={{ fill: "#94a3b8", fontSize: isMobile ? 9 : 11, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 44 : 56} />
          <YAxis yAxisId="price" type="number" scale="log" domain={priceDomain} ticks={pTicks} allowDataOverflow
            tickFormatter={v => (v < 1 ? "$" + v : "$" + v.toLocaleString())} tick={{ fill: PRICE, fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 46 : 58} />
          <Tooltip content={<Tip neutral={neutral} />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
          <ReferenceLine yAxisId="dev" y={0} stroke="rgba(255,255,255,0.5)" strokeDasharray="6 6"
            label={{ value: `neutral ≈ ${Math.round(neutral)}% APR`, position: "insideTopLeft", fill: "#94a3b8", fontSize: 11, fontFamily: MONO }} />
          <Bar yAxisId="dev" dataKey="dev" isAnimationActive={false} name="funding vs neutral">
            {rows.map((r, i) => <Cell key={i} fill={r.dev >= 0 ? LONG : SHORT} fillOpacity={0.85} />)}
          </Bar>
          <Line yAxisId="price" type="monotone" dataKey="price" stroke={PRICE} strokeWidth={1.5} dot={false} isAnimationActive={false} name="price" connectNulls />
          {showLiveDot && (
            <ReferenceDot yAxisId="price" x={lastTs} y={price} shape={LivePulse} ifOverflow="hidden" isFront />
          )}
          {selL != null && selR != null && selL !== selR && (
            <ReferenceArea yAxisId="price" x1={selL} x2={selR} strokeOpacity={0.3} stroke={LONG} fill={LONG} fillOpacity={0.12} />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 880, marginInline: "auto" }}>
        On-chain perp <strong style={{ color: "#e2e8f0" }}>funding rate</strong> from <strong>Hyperliquid</strong>, annualised and <strong>normalised to its neutral baseline</strong>
        (~{Math.round(neutral)}% APR, what longs pay even in a balanced book). <span style={{ color: LONG }}>Green</span> = above neutral (extra demand to be long),
        <span style={{ color: SHORT }}> red</span> = below (leaning short). On-chain and <em>unmanipulable</em>. Extremes are a contrarian tell, not a timing signal.
        The figures up top <strong style={{ color: "#6ee7b7" }}>stream live</strong> from Hyperliquid's WebSocket; the bars are the daily funding history.
        <strong style={{ color: "#7dd3fc" }}> Drag to zoom.</strong> Not financial advice.
      </div>
    </div>
  );
}

function Loading({ isMobile, text }) {
  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto", height: isMobile ? 360 : 480, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, fontSize: 14, color: "#64748b", textAlign: "center", padding: "0 20px" }}>
      {text}
    </div>
  );
}
