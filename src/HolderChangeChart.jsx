import { useMemo, useState, useEffect } from "react";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Legend,
} from "recharts";
import { SPX_ONCHAIN } from "./spx-onchain.js";
import { loadOnchain } from "./history-data.js";
import { holderChangeSeries, WEALTH_TIERS } from "./holder-change.js";
import { SANS, MONO, MAX_W, Metric, TipBox, ViewTabs, Explain } from "./chart-ui.jsx";

const LINE = "#c084fc";
const fShort = t => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const RANGES = [[90, "90d"], [365, "1y"], [0, "All"]];

function Tip({ active, payload, label, tiers }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload || {};
  return (
    <TipBox title={new Date(label).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}>
      {tiers.map(t => {
        const v = row[t.key] || 0; if (!v) return null;
        return <div key={t.key}><span style={{ color: t.color }}>{t.label}</span>: <span style={{ fontFamily: MONO, color: v > 0 ? "#4ade80" : "#fb7185" }}>{v > 0 ? "+" : ""}{v}</span> wallets</div>;
      })}
      {row.pctAbove100 != null && <div style={{ color: LINE, marginTop: 3 }}>{row.pctAbove100}% of wallets over $100</div>}
    </TipBox>
  );
}

// HOLDER CHANGE BREAKDOWN — daily net change in wallet count per dollar bracket (are the bigger wallets
// accumulating, distributing or sitting still?) + the share of wallets worth over $100.
export default function HolderChangeChart({ isMobile, preview = false }) {
  const [live, setLive] = useState(null);
  const [range, setRange] = useState(90);
  const [showDust, setShowDust] = useState(false);   // include the <$100 tier (noisy dust) or not
  useEffect(() => { let off = false; loadOnchain().then(d => { if (!off && d) setLive(d); }); return () => { off = true; }; }, []);
  const all = useMemo(() => holderChangeSeries(live || SPX_ONCHAIN), [live]);
  const tiers = useMemo(() => WEALTH_TIERS.filter(t => showDust || t.big), [showDust]);

  const view = useMemo(() => {
    if (all.length < 2) return null;
    const vis = range > 0 ? all.slice(-range) : all;
    if (vis.length < 2) return null;
    const step = Math.max(1, Math.round(vis.length / 6));
    const xTicks = vis.filter((_, i) => i % step === 0 || i === vis.length - 1).map(r => r.ts);
    return { vis, xTicks, cur: all.at(-1) };
  }, [all, range]);

  if (!view) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Not enough on-chain data yet.</div>;

  const cur = view.cur;
  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="Are the bigger wallets accumulating, distributing, or staying put?" accent={LINE}>
        Each bar is a day&apos;s <strong style={{ color: "#e2e8f0" }}>net change</strong> in how many wallets sit in a dollar bracket — <strong style={{ color: "#4ade80" }}>up</strong> = more wallets joined that bracket, <strong style={{ color: "#fb7185" }}>down</strong> = fewer.
        The purple line is the share of wallets worth over $100. Headcount, not supply — so it reads the crowd, not the coin price.
      </Explain>
      <div style={{ display: "flex", gap: isMobile ? 14 : 28, justifyContent: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <Metric label="wallets > $100" value={cur.pctAbove100 != null ? cur.pctAbove100 + "%" : "—"} color={LINE} sub="of all holders" />
        <Metric label="$100k+ wallets Δ today" value={(cur.t4 > 0 ? "+" : "") + cur.t4} color={cur.t4 >= 0 ? "#4ade80" : "#fb7185"} sub="net new whales" />
      </div>
      <div style={{ textAlign: "center", fontFamily: MONO, fontSize: 11, color: "#64748b", marginBottom: 10 }}>Ethereum-native · per-wallet from the FIFO engine</div>

      <div style={{ display: "flex", justifyContent: "center", gap: 14, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        <ViewTabs tabs={RANGES} value={range} onChange={setRange} />
        <button onClick={() => setShowDust(s => !s)} style={{
          fontFamily: MONO, fontSize: 11.5, cursor: "pointer", padding: "4px 10px", borderRadius: 0,
          background: showDust ? "rgba(100,116,139,0.18)" : "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.14)", color: showDust ? "#cbd5e1" : "#7c8a9e",
        }}>{showDust ? "hide < $100" : "show < $100"}</button>
      </div>

      <ResponsiveContainer width="100%" height={isMobile ? 400 : 540}>
        <ComposedChart data={view.vis} margin={{ top: 10, right: isMobile ? 8 : 16, bottom: 24, left: isMobile ? 0 : 8 }} stackOffset="sign">
          <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="ts" type="number" domain={["dataMin", "dataMax"]} ticks={view.xTicks} scale="time" allowDataOverflow
            tickFormatter={fShort} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
          <YAxis yAxisId="l" tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 34 : 46} />
          <YAxis yAxisId="r" orientation="right" domain={["auto", "auto"]} tickFormatter={v => v + "%"}
            tick={{ fill: LINE, fontSize: isMobile ? 10 : 12, fontFamily: MONO }} axisLine={false} tickLine={false} width={isMobile ? 34 : 46} />
          <ReferenceLine yAxisId="l" y={0} stroke="rgba(255,255,255,0.35)" />
          <Tooltip content={<Tip tiers={tiers} />} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
          {!preview && <Legend wrapperStyle={{ fontFamily: MONO, fontSize: 11 }} />}
          {tiers.map(t => (
            <Bar key={t.key} yAxisId="l" dataKey={t.key} stackId="a" name={t.label} fill={t.color} isAnimationActive={false} />
          ))}
          <Line yAxisId="r" dataKey="pctAbove100" name="% wallets > $100" stroke={LINE} strokeWidth={1.8} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        Daily net change in the number of wallets in each dollar bracket (value = balance × price that day), from our FIFO reconstruction of every wallet.
        <strong style={{ color: "#94a3b8" }}> Ethereum-native</strong> — per-wallet values need the traceable chain (Base &amp; Solana are bridged; they&apos;re counted in Wallet Growth, not here).
        Bars up = wallets joined the bracket, down = left it; the line is the share worth over $100. Headcount, not supply. Not financial advice.
      </div>
    </div>
  );
}
