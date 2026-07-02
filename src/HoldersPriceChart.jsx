import { useMemo, useState, useEffect } from "react";
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceArea,
} from "recharts";
import ChartZoomHint from "./ChartZoomHint.jsx";
import { loadHistory } from "./history-data.js";

const SANS = "'Space Grotesk', system-ui, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";
const MAX_W = 1400;
const DAY = 86400000;
const HOLDERS = "#4ade80", PRICE = "#38bdf8";
const fPrice = p => (p < 1 ? "$" + p.toFixed(p < 0.01 ? 4 : 3) : "$" + p.toLocaleString(undefined, { maximumFractionDigits: 2 }));
const fNum = n => Math.round(n).toLocaleString("en-US");
const fPct = v => `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`;
const fShort = t => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background: "rgba(4,4,12,0.97)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 10, padding: "12px 16px", fontFamily: SANS, fontSize: 13, color: "#cbd5e1" }}>
      <div style={{ fontWeight: 700, color: "#f8fafc", marginBottom: 4 }}>{new Date(d.ts).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</div>
      <div>Holders: <span style={{ fontFamily: MONO, color: HOLDERS }}>{fNum(d.holders)}</span></div>
      <div>Price: <span style={{ fontFamily: MONO, color: PRICE }}>{fPrice(d.price)}</span></div>
    </div>
  );
}

function Metric({ label, value, color = "#f8fafc", sub }) {
  return (
    <div style={{ textAlign: "center", minWidth: 96 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, color: "#94a3b8", letterSpacing: 1.1, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 700, color }}>{value}</div>
      {sub && <div style={{ fontFamily: SANS, fontSize: 11, color: "#64748b" }}>{sub}</div>}
    </div>
  );
}

// Holder count (left) vs SPX price (right) over time — does accumulation hold
// through price swings? Conviction shows when holders keep climbing on red days.
export default function HoldersPriceChart({ isMobile, preview = false }) {
  const [history, setHistory] = useState(null);
  useEffect(() => {
    let cancelled = false;
    loadHistory().then(d => { if (!cancelled) setHistory(d); });
    return () => { cancelled = true; };
  }, []);

  const all = useMemo(() => {
    if (!history) return null;
    const rows = [];
    for (const r of history) if (r.holders != null && r.p > 0) rows.push({ ts: new Date(r.d).getTime(), date: r.d, holders: r.holders, price: r.p });
    rows.sort((a, b) => a.ts - b.ts);
    return rows;
  }, [history]);

  const [zoom, setZoom] = useState(null);
  const [selL, setSelL] = useState(null);
  const [selR, setSelR] = useState(null);

  const view = useMemo(() => {
    if (!all || all.length < 2) return null;
    const fullX = [all[0].ts, all.at(-1).ts];
    const [x0, x1] = zoom ?? fullX;
    const vis = all.filter(r => r.ts >= x0 && r.ts <= x1);
    if (vis.length < 2) return null;
    let hMin = Infinity, hMax = -Infinity, pMin = Infinity, pMax = -Infinity;
    for (const r of vis) { if (r.holders < hMin) hMin = r.holders; if (r.holders > hMax) hMax = r.holders; if (r.price < pMin) pMin = r.price; if (r.price > pMax) pMax = r.price; }
    const hPad = Math.max((hMax - hMin) * 0.25, 20);
    const spanDays = (x1 - x0) / DAY;
    const step = Math.max(1, Math.round(vis.length / 6));
    const xTicks = vis.filter((_, i) => i % step === 0 || i === vis.length - 1).map(r => r.ts);
    const hDelta = vis.at(-1).holders - vis[0].holders;
    const pChange = vis.at(-1).price / vis[0].price - 1;
    return {
      vis, xDomain: [x0, x1], xTicks,
      hDomain: [hMin - hPad, hMax + hPad], pDomain: [pMin * 0.9, pMax * 1.1],
      hNow: all.at(-1).holders, hDelta, pChange, start: vis[0], end: vis.at(-1), spanDays,
    };
  }, [all, zoom]);

  const onDown = e => { if (e && e.activeLabel != null) { setSelL(e.activeLabel); setSelR(e.activeLabel); } };
  const onMove = e => { if (selL != null && e && e.activeLabel != null) setSelR(e.activeLabel); };
  const onUp = () => {
    if (selL != null && selR != null && selL !== selR && all) {
      const [a, b] = selL < selR ? [selL, selR] : [selR, selL];
      if (all.filter(r => r.ts >= a && r.ts <= b).length >= 2) setZoom([a, b]);
    }
    setSelL(null); setSelR(null);
  };

  if (all == null) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading holder history…</div>;
  if (!view) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Not enough holder history yet — we started banking daily snapshots recently; this fills in as it accumulates.</div>;

  const zoomed = !!zoom;
  const pTicks = [0.0001, 0.001, 0.01, 0.1, 0.2, 0.3, 0.5, 1, 2, 5, 10].filter(v => v >= view.pDomain[0] && v <= view.pDomain[1]);

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <Metric label="holders now" value={fNum(view.hNow)} color={HOLDERS} sub="on-chain wallets" />
        <Metric label={zoomed ? "window growth" : "growth"} value={`${view.hDelta >= 0 ? "+" : ""}${fNum(view.hDelta)}`} color={view.hDelta >= 0 ? HOLDERS : "#f87171"} sub={`${fShort(view.start.ts)} → ${fShort(view.end.ts)}`} />
        <Metric label="price" value={fPct(view.pChange)} color={view.pChange >= 0 ? "#4ade80" : "#f87171"} sub="over the window" />
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 10 }}>
        <span style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b" }}>{zoomed ? "Viewing a selected window." : "Drag across the chart to zoom into any period."}</span>
        {zoomed && (
          <button onClick={() => setZoom(null)} className="pill" style={{ fontFamily: SANS, fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 7, cursor: "pointer", background: "transparent", border: "1px solid rgba(56,189,248,0.4)", color: "#7dd3fc", "--glow": "#38bdf8" }}>⤢ Reset zoom</button>
        )}
      </div>

      <div style={{ position: "relative" }}>
        {!preview && <ChartZoomHint />}
        <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
          <ComposedChart data={view.vis} margin={{ top: 10, right: isMobile ? 4 : 14, bottom: 24, left: isMobile ? 0 : 12 }}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} style={{ cursor: "crosshair", userSelect: "none" }}>
            <defs>
              <linearGradient id="hpFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={HOLDERS} stopOpacity={0.22} /><stop offset="100%" stopColor={HOLDERS} stopOpacity={0} /></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="ts" type="number" domain={view.xDomain} ticks={view.xTicks} scale="time" allowDataOverflow
              tickFormatter={fShort} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
            <YAxis yAxisId="holders" type="number" domain={view.hDomain} allowDataOverflow
              tickFormatter={fNum} tick={{ fill: HOLDERS, fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 52 : 66} />
            <YAxis yAxisId="price" orientation="right" type="number" scale="log" domain={view.pDomain} ticks={pTicks} allowDataOverflow
              tickFormatter={v => (v < 1 ? "$" + v : "$" + v)} tick={{ fill: PRICE, fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 44 : 56} />
            <Tooltip content={<Tip />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
            <Line yAxisId="holders" type="monotone" dataKey="holders" stroke={HOLDERS} strokeWidth={2.6} dot={false} isAnimationActive={false} name="holders" fill="url(#hpFill)" />
            <Line yAxisId="price" type="monotone" dataKey="price" stroke={PRICE} strokeWidth={1.8} strokeOpacity={0.9} dot={false} isAnimationActive={false} name="price" />
            {selL != null && selR != null && selL !== selR && (
              <ReferenceArea yAxisId="holders" x1={selL} x2={selR} strokeOpacity={0.4} stroke={PRICE} fill={PRICE} fillOpacity={0.12} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: "flex", gap: 18, justifyContent: "center", marginTop: 12 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: SANS, fontSize: 13, color: "#cbd5e1" }}><span style={{ width: 14, height: 3, borderRadius: 2, background: HOLDERS }} />Holders (left)</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: SANS, fontSize: 13, color: "#cbd5e1" }}><span style={{ width: 14, height: 3, borderRadius: 2, background: PRICE }} />SPX price (right)</span>
      </div>

      <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 880, marginInline: "auto" }}>
        The holder base (<span style={{ color: HOLDERS }}>green, left</span>) against <span style={{ color: PRICE }}>SPX price</span> (right) over time. The story to watch:
        whether accumulation <strong style={{ color: "#cbd5e1" }}>keeps climbing through price swings</strong> — conviction shows when holders grow on red days.
        Daily on-chain snapshots (banked recently, so it fills in as it accumulates). <strong style={{ color: "#7dd3fc" }}>Drag to zoom.</strong> Not financial advice.
      </div>
    </div>
  );
}
