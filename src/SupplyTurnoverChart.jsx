import { useMemo, useState, useEffect } from "react";
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Legend,
} from "recharts";
import { SPX_ONCHAIN } from "./spx-onchain.js";
import { loadOnchain } from "./history-data.js";
import { HORIZONS, turnoverOf, turnoverSeries } from "./turnover.js";
import { SANS, MONO, MAX_W, Metric, TipBox, ViewTabs, Explain } from "./chart-ui.jsx";

const DORMANT = "#64748b";
const fShort = t => new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
const RANGES = [[90, "90d"], [365, "1y"], [0, "All"]];

// SUPPLY TURNOVER — of all held SPX, how much last changed hands within each horizon. The mirror of
// HODL Waves (held→) read as turnover (moved→). Cumulative brackets from the FIFO age distribution.
export default function SupplyTurnoverChart({ isMobile, preview = false }) {
  const [live, setLive] = useState(null);
  const [tab, setTab] = useState("ladder");
  const [range, setRange] = useState(365);
  useEffect(() => { let off = false; loadOnchain().then(d => { if (!off && d) setLive(d); }); return () => { off = true; }; }, []);
  const onchain = live || SPX_ONCHAIN;

  const cur = useMemo(() => turnoverOf(onchain.at(-1)), [onchain]);
  // which horizons the data actually supports (sub-week needs ageFine)
  const rows = useMemo(() => (cur ? HORIZONS.filter(h => cur[h.key] != null) : []), [cur]);
  const hasFine = !!cur?.fine;

  const series = useMemo(() => {
    const s = turnoverSeries(onchain);
    if (s.length < 2) return null;
    const vis = range > 0 ? s.slice(-range) : s;
    if (vis.length < 2) return null;
    const step = Math.max(1, Math.round(vis.length / 6));
    const xTicks = vis.filter((_, i) => i % step === 0 || i === vis.length - 1).map(r => r.ts);
    return { vis, xTicks };
  }, [onchain, range]);

  if (!cur) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Not enough on-chain data yet.</div>;

  const pillLine = tab === "over" ? rows.filter(h => ["d1", "w1", "m1", "y1"].includes(h.key)) : rows;

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="How much of SPX6900 actually changes hands — and over what horizon?" accent="#fb923c">
        Every coin is placed by <strong style={{ color: "#e2e8f0" }}>when it last moved</strong>. Each bar is the share of all held SPX that
        changed hands <strong style={{ color: "#e2e8f0" }}>within</strong> that window — so <strong style={{ color: "#fb923c" }}>~{Math.round(cur.m1)}%</strong> turns over in a month,
        while <strong style={{ color: DORMANT }}>{Math.round(cur.dormant)}%</strong> has sat still for a year or more. Held ≠ frozen — it just moves slowly.
      </Explain>

      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <Metric label="moved in a month" value={Math.round(cur.m1) + "%"} color="#fb923c" sub="monthly turnover" />
        <Metric label="moved within a year" value={Math.round(cur.y1) + "%"} color="#38bdf8" sub="held ≠ frozen" />
        <Metric label="dormant 1yr+" value={Math.round(cur.dormant) + "%"} color={DORMANT} sub="hasn't moved" />
      </div>
      <div style={{ textAlign: "center", fontFamily: MONO, fontSize: 11, color: "#64748b", marginBottom: 12 }}>Ethereum-native · from per-wallet holding age (FIFO)</div>

      <div style={{ display: "flex", justifyContent: "center", gap: 14, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
        <ViewTabs tabs={[["ladder", "Turnover ladder"], ["over", "Over time"]]} value={tab} onChange={setTab} />
        {tab === "over" && <ViewTabs tabs={RANGES} value={range} onChange={setRange} />}
      </div>

      {tab === "ladder" ? (
        <div style={{ maxWidth: 760, margin: "0 auto", padding: isMobile ? "4px 4px" : "4px 12px" }}>
          {rows.map(h => {
            const v = cur[h.key];
            return (
              <div key={h.key} style={{ display: "flex", alignItems: "center", gap: 12, margin: "9px 0" }}>
                <span style={{ flex: "0 0 auto", width: isMobile ? 96 : 132, textAlign: "right", fontFamily: SANS, fontSize: isMobile ? 12.5 : 14, color: "#cbd5e1" }}>
                  moved &lt; {h.label}
                </span>
                <div style={{ flex: 1, height: isMobile ? 22 : 26, background: "rgba(255,255,255,0.05)", borderRadius: 4, overflow: "hidden", position: "relative" }}>
                  <div style={{ width: `${Math.min(100, v)}%`, height: "100%", background: h.c, opacity: 0.9, borderRadius: 4, transition: "width .3s" }} />
                </div>
                <span style={{ flex: "0 0 auto", width: 52, fontFamily: MONO, fontSize: isMobile ? 13 : 15, fontWeight: 700, color: h.c, textAlign: "right" }}>{v}%</span>
              </div>
            );
          })}
          {/* the complement — supply that has NOT moved in a year */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "16px 0 4px", paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
            <span style={{ flex: "0 0 auto", width: isMobile ? 96 : 132, textAlign: "right", fontFamily: SANS, fontSize: isMobile ? 12.5 : 14, color: "#94a3b8" }}>dormant 1 year+</span>
            <div style={{ flex: 1, height: isMobile ? 22 : 26, background: "rgba(255,255,255,0.05)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ width: `${Math.min(100, cur.dormant)}%`, height: "100%", background: DORMANT, opacity: 0.85, borderRadius: 4 }} />
            </div>
            <span style={{ flex: "0 0 auto", width: 52, fontFamily: MONO, fontSize: isMobile ? 13 : 15, fontWeight: 700, color: DORMANT, textAlign: "right" }}>{cur.dormant}%</span>
          </div>
          {!hasFine && !preview && (
            <div style={{ fontFamily: MONO, fontSize: 11.5, color: "#64748b", textAlign: "center", marginTop: 16, lineHeight: 1.6 }}>
              The 24‑hour and 1‑week brackets fill in on the next daily on‑chain refresh (the finer buckets ship with it).
            </div>
          )}
        </div>
      ) : series ? (
        <ResponsiveContainer width="100%" height={isMobile ? 400 : 540}>
          <ComposedChart data={series.vis} margin={{ top: 10, right: isMobile ? 8 : 16, bottom: 24, left: isMobile ? 0 : 8 }}>
            <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="ts" type="number" domain={["dataMin", "dataMax"]} ticks={series.xTicks} scale="time" allowDataOverflow
              tickFormatter={fShort} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
            <YAxis domain={[0, "auto"]} tickFormatter={v => v + "%"} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 36 : 46} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
            <Tooltip content={<TrendTip rows={pillLine} />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
            {!preview && <Legend wrapperStyle={{ fontFamily: MONO, fontSize: 11 }} />}
            {pillLine.map(h => (
              <Line key={h.key} dataKey={h.key} name={`moved < ${h.label}`} stroke={h.c} strokeWidth={1.9} dot={false} isAnimationActive={false} connectNulls />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 40 }}>Not enough history yet.</div>
      )}

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 16, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        <strong style={{ color: "#94a3b8" }}>Supply turnover</strong> — the share of held SPX that last changed hands within each window, cumulative, from our FIFO reconstruction of every wallet&apos;s coins.
        The mirror of <strong style={{ color: "#94a3b8" }}>HODL Waves</strong>: same data, read as velocity instead of conviction.
        <strong style={{ color: "#94a3b8" }}> Ethereum-native</strong> (Base &amp; Solana are bridged). Not financial advice.
      </div>
    </div>
  );
}

function TrendTip({ active, payload, label, rows }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload || {};
  return (
    <TipBox title={new Date(label).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}>
      {rows.map(h => (row[h.key] == null ? null : (
        <div key={h.key}><span style={{ color: h.c }}>moved &lt; {h.label}</span>: <span style={{ fontFamily: MONO, color: "#e2e8f0" }}>{row[h.key]}%</span></div>
      )))}
    </TipBox>
  );
}
