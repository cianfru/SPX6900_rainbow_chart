import { useMemo, useState, useEffect } from "react";
import {
  ResponsiveContainer, ComposedChart, Bar, Cell, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from "recharts";
import { loadLongShort } from "./history-data.js";
import { SANS, MONO, MAX_W, Metric, TipBox } from "./chart-ui.jsx";

const fPrice = p => (p < 1 ? "$" + p.toFixed(p < 0.01 ? 4 : 3) : "$" + p.toLocaleString(undefined, { maximumFractionDigits: 2 }));
const fPct = v => `${v >= 0 ? "+" : ""}${v.toFixed(v >= 100 || v <= -100 ? 0 : 1)}%`;
const fOI = v => (v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : v >= 1e3 ? (v / 1e3).toFixed(0) + "k" : Math.round(v));
const yearOf = t => new Date(t).getUTCFullYear();
const LONG = "#34d399", SHORT = "#f87171", PRICE = "#38bdf8";
// Hyperliquid funds hourly; our banked value is the day's MEAN hourly rate. Annualise
// to an APR the way traders read it: × 24 × 365.
const toAPR = hourly => hourly * 24 * 365 * 100;

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <TipBox title={new Date(d.ts).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}>
      {d.price != null && <div>Price: <span style={{ fontFamily: MONO, color: PRICE }}>{fPrice(d.price)}</span></div>}
      <div>Funding (APR): <span style={{ fontFamily: MONO, fontWeight: 700, color: d.apr >= 0 ? LONG : SHORT }}>{fPct(d.apr)}</span> <span style={{ color: "#94a3b8" }}>({d.apr >= 0 ? "longs pay" : "shorts pay"})</span></div>
    </TipBox>
  );
}

// On-chain POSITIONING from Hyperliquid (unmanipulable — SPX's CEX futures geo-block
// our data collection). The bars are the perp FUNDING rate: positive = longs pay
// shorts (crowd leaning long / paying to hold longs), negative = shorts pay (crowd
// leaning short). Price overlaid. Extremes are a contrarian tell, not a timing signal.
// Data-gated: funding history is backfilled; open interest accrues daily.
export default function LongShortChart({ series, isMobile }) {
  const [ls, setLs] = useState(null);
  useEffect(() => { let c = false; loadLongShort().then(d => { if (!c) setLs(d); }); return () => { c = true; }; }, []);

  const priceByDate = useMemo(() => {
    const m = new Map();
    for (const r of (series || [])) m.set(r.date, r.price);
    return m;
  }, [series]);

  const { rows, cur, xTicks, xDomain, aprTicks, aprDomain, priceDomain } = useMemo(() => {
    if (!ls) return { rows: null };
    const f = ls.filter(r => r.hlFunding != null).sort((a, b) => a.date.localeCompare(b.date));
    if (!f.length) return { rows: [] };
    const rows = f.map(r => ({ ts: Date.parse(r.date), date: r.date, apr: toAPR(r.hlFunding), price: priceByDate.get(r.date) ?? null }));
    let aMin = 0, aMax = 0, pMin = Infinity, pMax = -Infinity;
    for (const r of rows) { if (r.apr < aMin) aMin = r.apr; if (r.apr > aMax) aMax = r.apr; if (r.price != null) { if (r.price < pMin) pMin = r.price; if (r.price > pMax) pMax = r.price; } }
    // symmetric-ish APR axis with NICE round ticks around the 0 pivot.
    const top = Math.max(Math.abs(aMin), Math.abs(aMax)) * 1.12;
    const step = top > 200 ? 100 : top > 80 ? 50 : top > 30 ? 20 : 10;
    const aprTicks = [];
    for (let v = -Math.ceil(top / step) * step; v <= top + 1; v += step) aprTicks.push(v);
    // quarterly x ticks (data spans ~18 months → year-only would show ~1 mark).
    const xTicks = [], last = rows.at(-1).ts, d0 = new Date(rows[0].ts);
    for (let m = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), 1)); m.getTime() <= last; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 3, 1))) {
      if (m.getTime() >= rows[0].ts - 45 * 86400000) xTicks.push(m.getTime());
    }
    const oiRow = ls.filter(r => r.hlOI != null).at(-1);
    return {
      rows, cur: { apr: rows.at(-1).apr, price: rows.at(-1).price, oi: oiRow?.hlOI ?? null },
      xTicks, xDomain: [rows[0].ts, last], aprTicks, aprDomain: [aprTicks[0], aprTicks.at(-1)],
      priceDomain: [(pMin === Infinity ? 0.01 : pMin) * 0.7, (pMax === -Infinity ? 1 : pMax) * 1.4],
    };
  }, [ls, priceByDate]);

  if (rows === null) return <Loading isMobile={isMobile} text="Loading on-chain positioning…" />;
  if (rows.length === 0) return <Loading isMobile={isMobile} text="Collecting on-chain positioning — fills in as the daily banker runs." />;

  const pTicks = [0.0001, 0.001, 0.01, 0.1, 1, 10].filter(v => v >= priceDomain[0] && v <= priceDomain[1]);

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: isMobile ? 18 : 34, justifyContent: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <Metric label="funding (APR)" value={fPct(cur.apr)} color={cur.apr >= 0 ? LONG : SHORT} sub={cur.apr >= 0 ? "longs pay shorts" : "shorts pay longs"} />
        {cur.oi != null && <Metric label="open interest" value={fOI(cur.oi) + " SPX"} color="#a78bfa" sub="Hyperliquid perp" />}
        {cur.price != null && <Metric label="price" value={fPrice(cur.price)} color={PRICE} sub="live" />}
      </div>

      <ResponsiveContainer width="100%" height={isMobile ? 380 : 520}>
        <ComposedChart data={rows} margin={{ top: 10, right: isMobile ? 8 : 20, bottom: 24, left: isMobile ? 0 : 12 }} barCategoryGap={0}>
          <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="ts" type="number" domain={xDomain} ticks={xTicks} scale="time" allowDataOverflow
            tickFormatter={t => new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit" })} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} minTickGap={isMobile ? 40 : 24} />
          <YAxis yAxisId="apr" orientation="right" type="number" domain={aprDomain} ticks={aprTicks} allowDataOverflow
            tickFormatter={v => Math.round(v) + "%"} tick={{ fill: "#94a3b8", fontSize: isMobile ? 9 : 11, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 44 : 56} />
          <YAxis yAxisId="price" type="number" scale="log" domain={priceDomain} ticks={pTicks} allowDataOverflow
            tickFormatter={v => (v < 1 ? "$" + v : "$" + v.toLocaleString())} tick={{ fill: PRICE, fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 46 : 58} />
          <Tooltip content={<Tip />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
          <ReferenceLine yAxisId="apr" y={0} stroke="rgba(255,255,255,0.5)" strokeDasharray="6 6"
            label={{ value: "neutral (0%)", position: "insideTopLeft", fill: "#94a3b8", fontSize: 11, fontFamily: MONO }} />
          <Bar yAxisId="apr" dataKey="apr" isAnimationActive={false} name="funding APR">
            {rows.map((r, i) => <Cell key={i} fill={r.apr >= 0 ? LONG : SHORT} fillOpacity={0.85} />)}
          </Bar>
          <Line yAxisId="price" type="monotone" dataKey="price" stroke={PRICE} strokeWidth={2} dot={false} isAnimationActive={false} name="price" connectNulls />
        </ComposedChart>
      </ResponsiveContainer>

      <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 880, marginInline: "auto" }}>
        On-chain perpetual <strong style={{ color: "#e2e8f0" }}>funding rate</strong> from <strong>Hyperliquid</strong> (annualised), with <span style={{ color: PRICE }}>price</span> overlaid.
        <span style={{ color: LONG }}> Green</span> = longs pay shorts (crowd leaning long), <span style={{ color: SHORT }}>red</span> = shorts pay (crowd leaning short).
        On-chain and <em>unmanipulable</em> — SPX's CEX futures geo-block our collection, so this is the honest positioning read. Extremes tend to be a contrarian tell, not a timing signal. Not financial advice.
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
