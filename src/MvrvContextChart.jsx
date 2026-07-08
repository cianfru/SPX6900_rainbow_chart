import { useMemo, useState, useEffect } from "react";
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, ReferenceArea,
} from "recharts";
import { SUPPLY } from "./data.js";
import { loadHistory, loadBtcMvrv } from "./history-data.js";
import ChartZoomHint from "./ChartZoomHint.jsx";
import { SANS, MONO, MAX_W, Metric, TipBox, ZoomBar } from "./chart-ui.jsx";
import { useDragZoom } from "./use-drag-zoom.js";

const BTC = "#f7931a", SPX = "#a78bfa";
const fMvrv = v => v.toFixed(2) + "×";
const fYear = t => new Date(t).getFullYear();
const fFull = t => new Date(t).toLocaleDateString("en-US", { month: "short", year: "numeric" });

// Percentile of `v` within a SORTED ascending array (0–100).
function pctRank(sorted, v) {
  if (!sorted.length) return null;
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] <= v) lo = m + 1; else hi = m; }
  return Math.round((lo / sorted.length) * 100);
}
// Value at a given percentile (0–1) of a sorted ascending array.
const quantile = (sorted, q) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : null;

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <TipBox title={fFull(d.ts)}>
      <div>BTC MVRV: <span style={{ fontFamily: MONO, color: BTC }}>{fMvrv(d.mvrv)}</span></div>
    </TipBox>
  );
}

// MVRV in context: overlay SPX6900's (short) MVRV on Bitcoin's ~decade of MVRV history.
// MVRV is unitless (market-cap ÷ realized-cap), so the two are directly comparable even
// though BTC has years of it and SPX only weeks. Answers "are we down/heated similarly to
// some Bitcoin moment?" — SPX's current MVRV is a marker line across BTC's cheap→heated map.
export default function MvrvContextChart({ isMobile, preview = false }) {
  const [btc, setBtc] = useState(null);
  const [spxHist, setSpxHist] = useState(null);
  useEffect(() => {
    let cancelled = false;
    loadBtcMvrv().then(d => { if (!cancelled) setBtc(d?.points || []); });
    loadHistory().then(d => { if (!cancelled) setSpxHist(d); });
    return () => { cancelled = true; };
  }, []);

  const data = useMemo(() => {
    if (!btc) return null;
    const rows = btc
      .map(([d, v]) => ({ ts: new Date(d + "T00:00:00Z").getTime(), mvrv: v }))
      .filter(r => Number.isFinite(r.ts) && r.mvrv > 0)
      .sort((a, b) => a.ts - b.ts);
    if (!rows.length) return { rows: [] };
    const sorted = rows.map(r => r.mvrv).sort((a, b) => a - b);
    // Zones from BTC's OWN distribution — self-consistent, no hardcoded thresholds.
    const zones = {
      cheap: quantile(sorted, 0.15),
      fair: quantile(sorted, 0.50),
      warm: quantile(sorted, 0.80),
      hot: quantile(sorted, 0.95),
      max: sorted.at(-1),
      min: sorted[0],
    };
    return { rows, sorted, zones, btcCur: rows.at(-1).mvrv };
  }, [btc]);

  // SPX's current MVRV = price ÷ realized price (avg cost basis), from the latest snapshot.
  const spx = useMemo(() => {
    if (!spxHist?.length) return null;
    const good = spxHist.filter(r => r.be > 0 && r.p > 0);
    if (!good.length) return null;
    const cur = good.at(-1);
    return { mvrv: cur.p / cur.be, date: cur.d, price: cur.p, be: cur.be };
  }, [spxHist]);

  const { zoom, setZoom, selL, selR, onDown, onMove, onUp, zoomed } = useDragZoom(
    (a, b) => data?.rows && data.rows.filter(r => r.ts >= a && r.ts <= b).length >= 2);

  const view = useMemo(() => {
    if (!data?.rows || data.rows.length < 2) return null;
    const fullX = [data.rows[0].ts, data.rows.at(-1).ts];
    const [x0, x1] = zoom ?? fullX;
    const vis = data.rows.filter(r => r.ts >= x0 && r.ts <= x1);
    if (vis.length < 2) return null;
    let yMin = Infinity, yMax = -Infinity;
    for (const r of vis) { if (r.mvrv < yMin) yMin = r.mvrv; if (r.mvrv > yMax) yMax = r.mvrv; }
    if (spx) { yMin = Math.min(yMin, spx.mvrv); yMax = Math.max(yMax, spx.mvrv); }
    const years = new Set(vis.map(r => fYear(r.ts)));
    const xTicks = [...years].map(y => Date.UTC(y, 0, 1)).filter(t => t >= x0 && t <= x1);
    return { vis, xDomain: [x0, x1], xTicks, yDomain: [yMin * 0.85, yMax * 1.12] };
  }, [data, zoom, spx]);

  if (btc == null || spxHist == null) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading MVRV history…</div>;
  if (!data?.rows?.length) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Bitcoin MVRV context is being banked — this fills in once its monthly data build has run.</div>;
  if (!view) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Not enough history in this range.</div>;

  const z = data.zones;
  const spxPct = spx ? pctRank(data.sorted, spx.mvrv) : null;
  // Honest read: where SPX's MVRV sits on BTC's map.
  const spxBand = !spx ? "" : spx.mvrv < z.cheap ? "cheaper than 85% of Bitcoin's history"
    : spx.mvrv < z.fair ? "in Bitcoin's cheap-to-fair range"
    : spx.mvrv < z.warm ? "around Bitcoin's median"
    : spx.mvrv < z.hot ? "in Bitcoin's warm zone" : "in Bitcoin's historically hot zone";

  const zone = (y1, y2, fill, label) => (y1 != null && y2 != null && y2 > y1) ? (
    <ReferenceArea y1={y1} y2={y2} fill={fill} fillOpacity={0.10} stroke="none"
      label={preview ? undefined : { value: label, position: "insideLeft", fill, fontSize: 10.5, fontFamily: MONO, opacity: 0.9 }} />
  ) : null;

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <Metric label="SPX6900 MVRV" value={spx ? fMvrv(spx.mvrv) : "—"} color={SPX} sub={spx ? (spx.mvrv >= 1 ? "in profit" : "underwater") : "banking"} />
        <Metric label="Bitcoin MVRV" value={fMvrv(data.btcCur)} color={BTC} sub="today" />
        {spxPct != null && <Metric label="on BTC's history" value={spxPct + "th"} color="#22d3ee" sub="percentile" />}
      </div>

      <ZoomBar zoomed={zoomed} onReset={() => setZoom(null)} accent={SPX} />

      <div style={{ position: "relative" }}>
        {!preview && <ChartZoomHint />}
        <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
          <ComposedChart data={view.vis} margin={{ top: 10, right: isMobile ? 8 : 20, bottom: 24, left: isMobile ? 0 : 12 }}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} style={{ cursor: "crosshair", userSelect: "none" }}>
            <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
            {zone(z.hot, z.max, "#f87171", "hot")}
            {zone(z.warm, z.hot, "#fbbf24", "warm")}
            {zone(z.fair, z.warm, "#4ade80", "fair")}
            {zone(z.cheap, z.fair, "#38bdf8", "cheap")}
            {zone(z.min, z.cheap, "#818cf8", "capitulation")}
            <XAxis dataKey="ts" type="number" domain={view.xDomain} ticks={view.xTicks} scale="time" allowDataOverflow
              tickFormatter={fYear} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
            <YAxis type="number" scale="log" domain={view.yDomain} allowDataOverflow
              tickFormatter={fMvrv} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 52 : 66} />
            <ReferenceLine y={1} stroke="rgba(255,255,255,0.45)" strokeDasharray="5 5"
              label={preview ? undefined : { value: "break-even 1×", position: "insideBottomRight", fill: "#94a3b8", fontSize: 10.5, fontFamily: MONO }} />
            {spx && <ReferenceLine y={spx.mvrv} stroke={SPX} strokeWidth={2.2} strokeOpacity={0.95}
              label={preview ? undefined : { value: `SPX today ${fMvrv(spx.mvrv)}`, position: "insideTopRight", fill: SPX, fontSize: 12, fontWeight: 700, fontFamily: MONO }} />}
            <Tooltip content={<Tip />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
            <Line type="monotone" dataKey="mvrv" stroke={BTC} strokeWidth={2} dot={false} isAnimationActive={false} name="BTC MVRV" />
            {selL != null && selR != null && selL !== selR && (
              <ReferenceArea x1={selL} x2={selR} strokeOpacity={0.4} stroke={SPX} fill={SPX} fillOpacity={0.12} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        <strong style={{ color: BTC }}>Bitcoin&apos;s MVRV</strong> over its whole history (market-cap ÷ realized-cap — unitless, so it&apos;s comparable across coins),
        with the <strong style={{ color: SPX }}>SPX6900 line</strong> marking where its MVRV sits today.
        {spx && <> Right now SPX6900 is <strong style={{ color: "#cbd5e1" }}>{spxBand}</strong> — {spx.mvrv >= 1 ? "the average holder is in profit" : "the average holder is underwater"}.</>}
        {" "}The zones are Bitcoin&apos;s own MVRV quantiles, a reference, not a target — SPX6900&apos;s MVRV history is only weeks old and grows daily, so read this as a rhyme, not a forecast. Drag to zoom. Not financial advice.
      </div>
    </div>
  );
}
