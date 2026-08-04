import { useMemo, useState, useEffect } from "react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceArea,
  PieChart, Pie, Cell,
} from "recharts";
import { loadOnchain } from "./history-data.js";
import ChartZoomHint from "./ChartZoomHint.jsx";
import { SANS, MONO, MAX_W, TipBox, ZoomBar, Explain } from "./chart-ui.jsx";
import { useDragZoom } from "./use-drag-zoom.js";

const PAL = ["#f7931a", "#f6465d", "#a78bfa", "#22d3ee", "#4ade80", "#fbbf24", "#60a5fa", "#fb7185", "#94a3b8"];
const TOP = 8;
const fShort = t => new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
const fM = v => (Math.abs(v) >= 1 ? v.toFixed(1) + "M" : Math.round(v * 1000) + "K");

// SPX on exchanges, split by venue (Kraken/Bybit/Coinbase…). Stacked area over time + a
// current market-share donut. From the FIFO engine's per-address balances. Location map, not a signal.
export default function CexVenuesChart({ isMobile, preview = false }) {
  const [live, setLive] = useState(null);
  useEffect(() => { let off = false; loadOnchain().then(d => { if (!off) setLive(d ?? false); }); return () => { off = true; }; }, []);

  const model = useMemo(() => {
    if (!live) return live; // null (loading) or false (failed)
    const oc = live.filter(r => r.cexVenues && Object.keys(r.cexVenues).length);
    if (oc.length < 10) return "empty";
    const cur = oc.at(-1).cexVenues;
    const ranked = Object.entries(cur).sort((a, b) => b[1] - a[1]);
    const named = ranked.slice(0, TOP).map(([k]) => k);
    const hasOther = ranked.length > TOP;
    const venues = hasOther ? [...named, "Other"] : named;
    const data = oc.map(r => {
      const o = { ts: Date.parse(r.d) }; let other = 0;
      for (const [k, v] of Object.entries(r.cexVenues)) { if (named.includes(k)) o[k] = v / 1e6; else other += v; }
      named.forEach(k => { if (o[k] == null) o[k] = 0; });
      if (hasOther) o.Other = other / 1e6;
      return o;
    }).filter(r => Number.isFinite(r.ts));
    const total = ranked.reduce((s, [, v]) => s + v, 0);
    const donut = venues.map((v, i) => ({ name: v, value: v === "Other" ? ranked.slice(TOP).reduce((s, [, x]) => s + x, 0) : cur[v], c: PAL[Math.min(i, PAL.length - 1)] }));
    return { data, venues, donut, total, cur };
  }, [live]);

  const all = model && model !== "empty" ? model.data : [];
  const { zoom, setZoom, selL, selR, onDown, onMove, onUp, zoomed } = useDragZoom(
    (a, b) => all.filter(r => r.ts >= a && r.ts <= b).length >= 2);

  const view = useMemo(() => {
    if (all.length < 2) return null;
    const [x0, x1] = zoom ?? [all[0].ts, all.at(-1).ts];
    const vis = all.filter(r => r.ts >= x0 && r.ts <= x1);
    if (vis.length < 2) return null;
    const step = Math.max(1, Math.round(vis.length / 6));
    return { vis, xDomain: [x0, x1], xTicks: vis.filter((_, i) => i % step === 0 || i === vis.length - 1).map(r => r.ts) };
  }, [all, zoom]);

  if (live == null) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading on-chain data…</div>;
  if (model === "empty" || live === false || !view) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Per-venue data is being computed — check back after the next weekly refresh.</div>;

  const { venues, donut, total } = model;
  const col = i => PAL[Math.min(i, PAL.length - 1)];
  const Tip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <TipBox title={new Date(d.ts).toLocaleDateString("en-US", { month: "long", year: "numeric" })}>
        {venues.slice().reverse().map((v, ri) => { const i = venues.indexOf(v); return (
          <div key={v}><span style={{ color: col(i) }}>{v}</span>: <span style={{ fontFamily: MONO }}>{fM(d[v] || 0)}</span></div>); })}
      </TipBox>
    );
  };

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="Which exchanges custody SPX6900 — and how has that shifted?" accent={PAL[0]}>
        Every coin on a <strong style={{ color: "#e2e8f0" }}>tagged exchange wallet</strong>, stacked by venue. SPX launched DEX-native, then filled exchange wallets as listings landed.
        <strong style={{ color: PAL[0] }}>Kraken</strong> currently holds the largest share, with the rest spread across the mid-tier venues. Venue holdings shift over time — a location map, not a signal.
      </Explain>

      <ZoomBar zoomed={zoomed} onReset={() => setZoom(null)} accent={PAL[0]} />

      <div style={{ position: "relative" }}>
        {!preview && <ChartZoomHint />}
        <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
          <AreaChart data={view.vis} margin={{ top: 10, right: isMobile ? 8 : 20, bottom: 24, left: isMobile ? 0 : 12 }}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} style={{ cursor: "crosshair", userSelect: "none" }}>
            <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="ts" type="number" domain={view.xDomain} ticks={view.xTicks} scale="time" allowDataOverflow
              tickFormatter={fShort} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
            <YAxis tickFormatter={v => fM(v)} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 44 : 56} />
            <Tooltip content={<Tip />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
            {venues.map((v, i) => (
              <Area key={v} type="monotone" dataKey={v} stackId="1" stroke={col(i)} strokeWidth={0.5} fill={col(i)} fillOpacity={0.78} dot={false} isAnimationActive={false} name={v} />
            ))}
            {selL != null && selR != null && selL !== selR && (
              <ReferenceArea x1={selL} x2={selR} strokeOpacity={0.4} stroke="#e2e8f0" fill="#e2e8f0" fillOpacity={0.1} />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* current market-share donut */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: isMobile ? 8 : 40, marginTop: 20 }}>
        <div style={{ width: isMobile ? 220 : 260, height: isMobile ? 220 : 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={donut} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={isMobile ? 58 : 70} outerRadius={isMobile ? 100 : 120} paddingAngle={1} stroke="#0b1020" strokeWidth={2} isAnimationActive={false}>
                {donut.map((d, i) => <Cell key={d.name} fill={d.c} />)}
              </Pie>
              <Tooltip content={({ active, payload }) => active && payload?.length ? (
                <TipBox title={payload[0].payload.name}><span style={{ fontFamily: MONO }}>{fM(payload[0].payload.value / 1e6)} · {Math.round(100 * payload[0].payload.value / total)}%</span></TipBox>) : null} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr", gap: "4px 18px", fontFamily: SANS, fontSize: 13 }}>
          {donut.map((d, i) => (
            <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 7, whiteSpace: "nowrap" }}>
              <span style={{ width: 11, height: 11, borderRadius: 3, background: d.c, flex: "0 0 auto" }} />
              <span style={{ color: "#cbd5e1" }}>{d.name}</span>
              <span style={{ color: d.c, fontFamily: MONO, fontWeight: 700 }}>{Math.round(100 * d.value / total)}%</span>
            </div>
          ))}
        </div>
      </div>

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 18, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        SPX6900 held on <strong style={{ color: PAL[0] }}>tagged exchange wallets</strong>, by venue — a comprehensive on-chain sweep of {venues.length - (venues.includes("Other") ? 1 : 0)}+ exchanges. Shares are Ethereum-native only. A location map, not a signal. Drag to zoom. Not financial advice.
      </div>
    </div>
  );
}
