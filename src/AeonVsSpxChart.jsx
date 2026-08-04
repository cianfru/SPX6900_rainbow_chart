import { useMemo, useState, useEffect } from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
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
    const baseAt = new Map(st.baseSeries);
    const rows = series.map(([d, r]) => {
      const b = baseAt.get(d);
      return { ts: Date.parse(d), ratio: r, base: b, hi: b * st.bandMult(0.5), lo: b * st.bandMult(-0.5) };
    });
    // Domain must span EVERY drawn series, not just the ratio: the ±0.5σ bands (and the
    // baseline) can dip below the ratio's own min or poke above its max, and a domain floored
    // to the ratio alone silently clips the green lower band off the bottom of the chart.
    let dmin = Infinity, dmax = -Infinity;
    for (const rw of rows) {
      for (const v of [rw.ratio, rw.base, rw.hi, rw.lo]) {
        if (v > 0) { if (v < dmin) dmin = v; if (v > dmax) dmax = v; }
      }
    }
    return { rows, ...st, rmin: dmin, rmax: dmax, sv };
  }, [market]);

  if (!market) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading…</div>;
  if (!model) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Not enough overlapping price data yet.</div>;
  const { rows, base, cur, z, state, rmin, rmax, pctVsBase, pct, sv } = model;
  const step = Math.max(1, Math.round(rows.length / 6));
  const xTicks = rows.filter((_, i) => i % step === 0 || i === rows.length - 1).map(r => r.ts);

  const Tip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (<TipBox title={new Date(d.ts).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}>
      <div><span style={{ color: "#2dd4bf" }}>AEON floor</span> = <span style={{ fontFamily: MONO }}>{fmt(d.ratio)} SPX</span></div>
      {d.base > 0 && <div style={{ color: "#94a3b8" }}>baseline <span style={{ fontFamily: MONO }}>{fmt(d.base)}</span> · <span style={{ fontFamily: MONO, color: d.ratio >= d.base ? "#fb7185" : "#34d399" }}>{(d.ratio / d.base - 1 >= 0 ? "+" : "") + ((d.ratio / d.base - 1) * 100).toFixed(0)}%</span></div>}
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
          <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="ts" type="number" domain={["dataMin", "dataMax"]} ticks={xTicks} scale="time"
            tickFormatter={fShort} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
          <YAxis type="number" scale="log" domain={[rmin * 0.9, rmax * 1.1]} allowDataOverflow tickFormatter={v => fmt(v)}
            tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 44 : 56}
            label={{ value: "AEON floor (SPX coins)", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 12, fontFamily: SANS, style: { textAnchor: "middle" } }} />
          <Tooltip content={<Tip />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
          {/* Bands track the trailing baseline rather than spanning all history — see aeon-spx-value.js */}
          <Area type="monotone" dataKey="hi" stroke="#fb7185" strokeOpacity={0.5} strokeWidth={1} strokeDasharray="5 5" fill="none" dot={false} isAnimationActive={false} />
          <Area type="monotone" dataKey="lo" stroke="#34d399" strokeOpacity={0.5} strokeWidth={1} strokeDasharray="5 5" fill="none" dot={false} isAnimationActive={false} />
          <Area type="monotone" dataKey="base" stroke="#94a3b8" strokeWidth={1.8} strokeDasharray="7 5" fill="none" dot={false} isAnimationActive={false} />
          <Area type="monotone" dataKey="ratio" stroke={state.c} strokeWidth={2.5} fill="url(#axsG)" dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        AEON floor (USD, 7-day median) ÷ SPX6900 price = the floor priced in SPX coins. Baseline is the TRAILING 12-month median, not a flat full-history line: the ratio fell structurally from ~45,800 SPX in late 2023 to ~2,100 now because SPX itself appreciated ~130×, so averaging across that would compare today against a regime that cannot recur (and flattered — it read the floor ask at the 59th percentile when against the last year it is the 98th). Bands are ±0.5σ of the deviation from that baseline, so they track the regime. A relative-value read across the two projects — not a forecast. Floor from on-chain sales, SPX from the cleaned daily price series. The same ratio and the same verdict math feed the listings page, so the two can never disagree.
      </div>
    </div>
  );
}
