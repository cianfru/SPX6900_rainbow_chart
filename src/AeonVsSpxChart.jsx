import { useMemo, useState, useEffect } from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, ReferenceArea } from "recharts";
import { loadAeonMarket } from "./history-data.js";
import { zStats, ordinal } from "./aeon-spx-value.js";
import { SANS, MONO, MAX_W, Metric, TipBox, Explain } from "./chart-ui.jsx";

const fShort = t => new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
const fmt = v => v >= 1000 ? (v / 1000).toFixed(1) + "k" : Math.round(v);

// Project Aeon — floor price expressed IN SPX6900 (how many SPX coins buy one AEON floor),
// vs its own baseline. Below the baseline = the AEON floor is CHEAP relative to SPX; above
// = EXPENSIVE. Ties the two projects: if you hold SPX, is AEON cheap right now?
//
// The ratio series is computed ONCE in build-aeon-market.mjs (`spxValue.floorSeries`) and
// the verdict math lives in aeon-spx-value.js, both shared with the listings chart — this
// page used to rebuild the ratio itself off the SPX_DAILY bundle, which meant two
// implementations, two SPX sources, and a standing chance of the two disagreeing on air.
export default function AeonVsSpxChart({ isMobile }) {
  const [market, setMarket] = useState(null);
  useEffect(() => { let c = false; loadAeonMarket().then(d => { if (!c) setMarket(d || { empty: true }); }); return () => { c = true; }; }, []);

  const model = useMemo(() => {
    const sv = market && !market.empty ? market.spxValue : null;
    const series = sv?.floorSeries;
    if (!series?.length) return null;
    const st = zStats(series);
    if (!st) return null;
    const rows = series.map(([d, r]) => ({ ts: Date.parse(d), ratio: r }));
    return { rows, ...st, rmin: st.min, rmax: st.max, sv };
  }, [market]);

  if (!market) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading…</div>;
  if (!model) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Not enough overlapping price data yet.</div>;
  const { rows, base, cur, z, band, state, rmin, rmax, pctVsBase, pct, sv } = model;
  const step = Math.max(1, Math.round(rows.length / 6));
  const xTicks = rows.filter((_, i) => i % step === 0 || i === rows.length - 1).map(r => r.ts);

  const Tip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (<TipBox title={new Date(d.ts).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}>
      <div><span style={{ color: "#2dd4bf" }}>AEON floor</span> = <span style={{ fontFamily: MONO }}>{fmt(d.ratio)} SPX</span></div>
    </TipBox>);
  };

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="Is the AEON floor cheap or expensive versus SPX6900?" accent={state.c}>
        The Project&nbsp;AEON floor priced <strong style={{ color: "#e2e8f0" }}>in SPX6900</strong> — how many SPX coins one floor costs — against its own <strong style={{ color: "#94a3b8" }}>baseline</strong>.
        <strong style={{ color: "#34d399" }}> Below the baseline = cheap</strong> (the floor buys for fewer SPX than usual); <strong style={{ color: "#fb7185" }}>above = expensive</strong>. A relative-value read for anyone holding both.
      </Explain>

      <div style={{ display: "flex", gap: isMobile ? 16 : 34, justifyContent: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <Metric label="AEON floor now" value={fmt(cur) + " SPX"} color="#2dd4bf" />
        <Metric label="vs baseline" value={(pctVsBase >= 0 ? "+" : "") + pctVsBase.toFixed(0) + "%"} color={state.c} sub={fmt(base) + " SPX typical"} />
        <Metric label="right now" value={state.t.toUpperCase()} color={state.c} sub={(z >= 0 ? "+" : "") + z.toFixed(1) + "σ"} />
        {pct != null && <Metric label="vs own history" value={ordinal(pct)} color="#c084fc" sub="percentile" />}
      </div>

      <ResponsiveContainer width="100%" height={isMobile ? 380 : 500}>
        <AreaChart data={rows} margin={{ top: 10, right: isMobile ? 10 : 20, bottom: 24, left: isMobile ? 4 : 14 }}>
          <defs><linearGradient id="axsG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={state.c} stopOpacity={0.28} /><stop offset="100%" stopColor={state.c} stopOpacity={0.03} /></linearGradient></defs>
          {/* cheap / expensive zones */}
          <ReferenceArea y1={band(0.5)} y2={rmax * 1.05} fill="#fb7185" fillOpacity={0.07} />
          <ReferenceArea y1={rmin * 0.95} y2={band(-0.5)} fill="#34d399" fillOpacity={0.07} />
          <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="ts" type="number" domain={["dataMin", "dataMax"]} ticks={xTicks} scale="time"
            tickFormatter={fShort} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
          <YAxis type="number" scale="log" domain={[rmin * 0.9, rmax * 1.1]} allowDataOverflow tickFormatter={v => fmt(v)}
            tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 44 : 56}
            label={{ value: "AEON floor (SPX coins)", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 12, fontFamily: SANS, style: { textAnchor: "middle" } }} />
          <Tooltip content={<Tip />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
          <ReferenceLine y={base} stroke="#94a3b8" strokeDasharray="6 5" strokeWidth={1.5} label={{ value: "baseline", position: "insideTopRight", fill: "#94a3b8", fontSize: 11, fontFamily: SANS }} />
          <Area type="monotone" dataKey="ratio" stroke={state.c} strokeWidth={2.5} fill="url(#axsG)" dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        AEON floor (USD, 7-day median) ÷ SPX6900 price = the floor priced in SPX coins. Baseline is the full-history median; the green/red bands are ±0.5σ of the log-ratio. A relative-value read across the two projects — not a forecast. Floor from on-chain sales, SPX from the cleaned daily price series. The same ratio and the same verdict math feed the listings page, so the two can never disagree.
      </div>
    </div>
  );
}
