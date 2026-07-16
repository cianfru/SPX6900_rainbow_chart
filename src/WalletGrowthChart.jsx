import { useMemo, useState, useEffect } from "react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceArea,
} from "recharts";
import { CHAIN_WALLETS } from "./chain-wallets.js";
import { loadChainWallets } from "./history-data.js";
import ChartZoomHint from "./ChartZoomHint.jsx";
import { SANS, MONO, MAX_W, Metric, TipBox, ZoomBar } from "./chart-ui.jsx";
import { useDragZoom } from "./use-drag-zoom.js";

// bottom → top of the stack; brand colours (ETH grey, Base blue, Solana purple)
const CH = [
  { key: "eth", label: "Ethereum", c: "#98a2b7" },
  { key: "base", label: "Base", c: "#3b82f6" },
  { key: "sol", label: "Solana", c: "#9945ff" },
];
const fK = n => n >= 1000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + "k" : String(Math.round(n));
const fShort = t => new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit" });

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const total = d.eth + d.base + d.sol;
  return (
    <TipBox title={new Date(d.ts).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}>
      {CH.slice().reverse().map(b => (
        <div key={b.key}><span style={{ color: b.c }}>{b.label}</span>: <span style={{ fontFamily: MONO }}>{d[b.key].toLocaleString("en-US")}</span></div>
      ))}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.15)", marginTop: 4, paddingTop: 4 }}>Total: <span style={{ fontFamily: MONO, color: "#4ade80" }}>{total.toLocaleString("en-US")}</span></div>
    </TipBox>
  );
}

// Multi-chain wallet growth — holder headcount across Ethereum, Base and Solana,
// stacked, from launch. Headcount is legitimately multi-chain (holders ≠ value).
// NOTE: bundled data (src/chain-wallets.js) — refreshed when the per-chain Dune
// queries are re-run, not weekly (unlike the /onchain.json cards).
export default function WalletGrowthChart({ isMobile, preview = false }) {
  const [live, setLive] = useState(null);
  useEffect(() => {
    let cancelled = false;
    loadChainWallets().then(d => { if (!cancelled && d) setLive(d); });
    return () => { cancelled = true; };
  }, []);
  const all = useMemo(
    () => (live || CHAIN_WALLETS).map(r => ({ ts: Date.parse(r.d), eth: r.eth || 0, base: r.base || 0, sol: r.sol || 0 }))
      .filter(r => Number.isFinite(r.ts)).sort((a, b) => a.ts - b.ts),
    [live]);

  const { zoom, setZoom, selL, selR, onDown, onMove, onUp, zoomed } = useDragZoom(
    (a, b) => all.filter(r => r.ts >= a && r.ts <= b).length >= 2);

  const view = useMemo(() => {
    if (all.length < 2) return null;
    const [x0, x1] = zoom ?? [all[0].ts, all.at(-1).ts];
    const vis = all.filter(r => r.ts >= x0 && r.ts <= x1);
    if (vis.length < 2) return null;
    const step = Math.max(1, Math.round(vis.length / 6));
    const xTicks = vis.filter((_, i) => i % step === 0 || i === vis.length - 1).map(r => r.ts);
    const cur = all.at(-1);
    return { vis, xDomain: [x0, x1], xTicks, cur, total: cur.eth + cur.base + cur.sol };
  }, [all, zoom]);

  if (!view) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Not enough data yet.</div>;
  const { cur, total } = view;

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: isMobile ? 14 : 26, justifyContent: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <Metric label="total wallets" value={total.toLocaleString("en-US")} color="#4ade80" sub="3 chains" />
        {CH.map(c => <Metric key={c.key} label={c.label} value={fK(cur[c.key])} color={c.c} sub="wallets" />)}
      </div>

      <ZoomBar zoomed={zoomed} onReset={() => setZoom(null)} accent="#4ade80" />

      <div style={{ position: "relative" }}>
        {!preview && <ChartZoomHint />}
        <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
          <AreaChart data={view.vis} margin={{ top: 10, right: isMobile ? 8 : 20, bottom: 24, left: isMobile ? 0 : 12 }}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} style={{ cursor: "crosshair", userSelect: "none" }}>
            <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="ts" type="number" domain={view.xDomain} ticks={view.xTicks} scale="time" allowDataOverflow
              tickFormatter={fShort} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
            <YAxis type="number" tickFormatter={fK} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 44 : 56} />
            <Tooltip content={<Tip />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
            {CH.map(b => (
              <Area key={b.key} type="monotone" dataKey={b.key} stackId="1" stroke={b.c} strokeWidth={0.5}
                fill={b.c} fillOpacity={0.82} dot={false} isAnimationActive={false} name={b.label} />
            ))}
            {selL != null && selR != null && selL !== selR && (
              <ReferenceArea x1={selL} x2={selR} strokeOpacity={0.4} stroke="#e2e8f0" fill="#e2e8f0" fillOpacity={0.1} />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        <strong style={{ color: "#4ade80" }}>Wallet growth</strong> — wallets holding SPX6900 on <span style={{ color: CH[0].c }}>Ethereum</span>, <span style={{ color: CH[1].c }}>Base</span> and <span style={{ color: CH[2].c }}>Solana</span>, from launch.
        Headcount is multi-chain (Base &amp; Solana lead on wallets, Ethereum on value). Wallets, not people — and the Base step is a real airdrop distribution. Drag to zoom. Not financial advice.
      </div>
    </div>
  );
}
