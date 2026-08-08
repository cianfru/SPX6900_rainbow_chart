import { useMemo, useState, useEffect } from "react";
import { ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { AEON_SALES } from "./aeon-sales.js";
import { loadAeonSales } from "./history-data.js";
import { SANS, MONO, MAX_W, Metric, TipBox, Explain } from "./chart-ui.jsx";

const fShort = t => new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const fmtEth = v => (v < 0.1 ? v.toFixed(3) : v.toFixed(2)) + "Ξ";
const fmtUsd = v => "$" + (v >= 1000 ? (v / 1000).toFixed(1) + "k" : Math.round(v));

// Project Aeon — floor price (ETH or USD) + monthly trading volume from the marketplace
// sale log. Floor = 3-sale-day rolling median of daily lows (one cheap sale ≠ the floor,
// but AEON is thin so a longer window buries a real step-down for weeks).
export default function AeonFloorChart({ isMobile }) {
  const [data, setData] = useState(AEON_SALES);
  const [unit, setUnit] = useState("ETH");
  useEffect(() => { let c = false; loadAeonSales().then(d => { if (!c && d) setData(d); }); return () => { c = true; }; }, []);

  const { rows, months, cur } = useMemo(() => {
    const daily = (data.daily || []).filter(r => r.floorEth > 0).map(r => ({ ...r, ts: Date.parse(r.d) })).sort((a, b) => a.ts - b.ts);
    // Rolling-median floor over the last 3 sale-DAYS (not 7): AEON is thin — a 7-sale-day window spans
    // ~3 weeks, so a real floor step-down (e.g. 0.63 → 0.53) took far too long to show. 3 still filters a
    // single outlier sale but tracks a genuine multi-sale move within days.
    const roll = (i, key) => median(daily.slice(Math.max(0, i - 2), i + 1).map(r => r[key]));
    const rows = daily.map((r, i) => ({ ts: r.ts, eth: roll(i, "floorEth"), usd: roll(i, "floorUsd") }));
    const mon = new Map();
    for (const r of daily) { const k = r.d.slice(0, 7); const g = mon.get(k) || { ve: 0, vu: 0 }; g.ve += r.volEth; g.vu += r.volUsd; mon.set(k, g); }
    const months = [...mon.entries()].map(([k, v]) => ({ ts: Date.parse(k + "-01"), ...v })).sort((a, b) => a.ts - b.ts);
    return { rows, months, cur: data.current || {} };
  }, [data]);

  if (rows.length < 10) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Not enough sales data yet.</div>;

  const isEth = unit === "ETH";
  const floorKey = isEth ? "eth" : "usd";
  const volKey = isEth ? "ve" : "vu";
  const fmt = isEth ? fmtEth : fmtUsd;
  const topVenue = Object.entries(data.marketplaces || {}).sort((a, b) => b[1] - a[1])[0];

  const Tip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <TipBox title={new Date(d.ts).toLocaleDateString("en-US", { month: "long", year: "numeric" })}>
        {d[floorKey] != null && <div><span style={{ color: "#2dd4bf" }}>floor</span>: <span style={{ fontFamily: MONO }}>{fmt(d[floorKey])}</span></div>}
        {d[volKey] != null && <div><span style={{ color: "#94a3b8" }}>volume</span>: <span style={{ fontFamily: MONO }}>{isEth ? Math.round(d[volKey]) + "Ξ" : fmtUsd(d[volKey])}</span></div>}
      </TipBox>
    );
  };
  // merge floor rows + monthly volume onto one time axis for the composed chart
  const merged = useMemo(() => {
    const volAt = new Map(months.map(m => [m.ts, m]));
    return rows.map(r => { const mk = Date.UTC(new Date(r.ts).getUTCFullYear(), new Date(r.ts).getUTCMonth(), 1); const v = volAt.get(mk); return { ts: r.ts, [floorKey]: r[floorKey], [volKey]: v ? v[volKey] : null }; });
  }, [rows, months, floorKey, volKey]);
  const step = Math.max(1, Math.round(merged.length / 6));
  const xTicks = merged.filter((_, i) => i % step === 0 || i === merged.length - 1).map(r => r.ts);

  const tbtn = active => ({
    padding: "5px 16px", borderRadius: 8, fontFamily: SANS, fontSize: 13, cursor: "pointer",
    border: "1px solid " + (active ? "rgba(45,212,191,0.55)" : "rgba(255,255,255,0.12)"),
    background: active ? "rgba(45,212,191,0.16)" : "transparent", color: active ? "#5eead4" : "#94a3b8",
  });

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="What has the floor done, and how much trades?" accent="#2dd4bf">
        The <strong style={{ color: "#2dd4bf" }}>floor price</strong> (lowest sale, 3-sale-day median) and monthly <strong style={{ color: "#94a3b8" }}>trading volume</strong> since mint.
        Toggle {isEth ? "to USD" : "to ETH"} — the two diverge when ETH&apos;s own price moves. {data.totalSales?.toLocaleString?.()} sales for {Math.round(data.totalVolEth || 0).toLocaleString()}Ξ (${((data.totalVolUsd || 0) / 1e6).toFixed(1)}M) all-time.
      </Explain>
      <div style={{ display: "flex", gap: isMobile ? 14 : 28, justifyContent: "center", marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <Metric label="floor" value={isEth ? fmtEth(cur.floorEth) : fmtUsd(cur.floorUsd)} color="#2dd4bf" />
        <Metric label="all-time volume" value={isEth ? Math.round(data.totalVolEth).toLocaleString() + "Ξ" : "$" + ((data.totalVolUsd) / 1e6).toFixed(1) + "M"} color="#fbbf24" />
        <Metric label="total sales" value={data.totalSales?.toLocaleString?.()} color="#94a3b8" />
        {topVenue && <Metric label="top venue" value={topVenue[0]} color="#f472b6" sub={Math.round(topVenue[1]).toLocaleString() + "Ξ"} />}
        <div style={{ display: "flex", gap: 6 }}>
          {["ETH", "USD"].map(u => <button key={u} style={tbtn(unit === u)} onClick={() => setUnit(u)}>{u}</button>)}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
        <ComposedChart data={merged} margin={{ top: 10, right: isMobile ? 8 : 16, bottom: 24, left: isMobile ? 0 : 14 }}>
          <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="ts" type="number" domain={["dataMin", "dataMax"]} ticks={xTicks} scale="time"
            tickFormatter={fShort} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
          <YAxis yAxisId="floor" scale="log" domain={["auto", "auto"]} tickFormatter={fmt}
            tick={{ fill: "#2dd4bf", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 52 : 64} />
          <YAxis yAxisId="vol" orientation="right" tickFormatter={v => isEth ? Math.round(v) + "Ξ" : fmtUsd(v)}
            tick={{ fill: "#64748b", fontSize: isMobile ? 9 : 11, fontFamily: MONO }}
            axisLine={false} tickLine={false} width={isMobile ? 44 : 56} />
          <Tooltip content={<Tip />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
          <Bar yAxisId="vol" dataKey={volKey} fill="#64748b" fillOpacity={0.4} isAnimationActive={false} barSize={isMobile ? 4 : 7} />
          <Line yAxisId="floor" type="monotone" dataKey={floorKey} stroke="#2dd4bf" strokeWidth={3} dot={false} isAnimationActive={false} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        <strong style={{ color: "#2dd4bf" }}>Floor &amp; sales</strong> — floor (bars = monthly volume) from on-chain marketplace trades (ETH, WETH and Blur-pool ETH). The line is a 3-sale-day median of daily lows (a realized-sale floor); the <strong style={{ color: "#2dd4bf" }}>floor</strong> readout above is today&apos;s lowest sale, updated daily.
      </div>
    </div>
  );
}
