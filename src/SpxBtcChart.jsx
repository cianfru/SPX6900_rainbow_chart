import { useState, useEffect, useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceArea,
} from "recharts";
import { fetchBtcHistory } from "./data.js";
import { SANS, MONO, MAX_W, TipBox, ZoomBar } from "./chart-ui.jsx";
import { useDragZoom, timeWindow } from "./use-drag-zoom.js";

const fMon = ts => new Date(ts).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
const fSats = v => (v >= 1000 ? (v / 1000).toFixed(2) + "k" : v >= 10 ? v.toFixed(0) : v.toFixed(1));

// Align BTC daily prices to the SPX series (largest BTC date ≤ each SPX date) and
// express the price in satoshis: SPX/BTC × 1e8.
function buildRatio(spx, btc) {
  const sorted = [...btc].sort((a, b) => a.date.localeCompare(b.date));
  const dates = sorted.map(b => b.date);
  const btcAt = d => {
    let lo = 0, hi = dates.length - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (dates[mid] <= d) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans >= 0 ? sorted[ans].price : null;
  };
  const out = [];
  for (const s of spx) {
    const bp = btcAt(s.date);
    if (bp) out.push({ date: s.date, ts: new Date(s.date).getTime(), sats: (s.price / bp) * 1e8 });
  }
  return out;
}

function RatioTip({ active, payload }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <TipBox>
      <div style={{ fontWeight: 700, color: "#f8fafc", marginBottom: 4 }}>
        {new Date(d.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
      </div>
      <div>SPX in BTC: <span style={{ fontFamily: MONO, fontWeight: 700, color: "#f59e0b" }}>{fSats(d.sats)} sats</span></div>
    </TipBox>
  );
}

export default function SpxBtcChart({ series, isMobile }) {
  const [btc, setBtc] = useState(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let cancelled = false;
    fetchBtcHistory()
      .then(({ prices }) => { if (!cancelled) { setBtc(prices); setStatus("ok"); } })
      .catch(e => { if (!cancelled) setStatus(e.message || "failed"); });
    return () => { cancelled = true; };
  }, []);

  const data = useMemo(() => (btc ? buildRatio(series, btc) : []), [series, btc]);
  const { zoom, setZoom, selL, selR, onDown, onMove, onUp, zoomed } = useDragZoom(
    (a, b) => data.filter(d => d.ts >= a && d.ts <= b).length >= 2);
  const view = useMemo(() => (data.length ? timeWindow(data, zoom) : null), [data, zoom]);
  const cur = data.length ? data[data.length - 1] : null;
  const perf = data.length > 1 ? (data[data.length - 1].sats / data[0].sats - 1) * 100 : 0;
  const perfColor = perf >= 0 ? "#4ade80" : "#f87171";

  if (status === "loading") {
    return <div style={{ maxWidth: MAX_W, margin: "40px auto", textAlign: "center", fontFamily: SANS, color: "#64748b" }}>Loading BTC data…</div>;
  }
  if (status !== "ok") {
    return <div style={{ maxWidth: MAX_W, margin: "40px auto", textAlign: "center", fontFamily: SANS, color: "#f87171" }}>Couldn&apos;t load BTC data: {status}</div>;
  }

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: isMobile ? 28 : 56, justifyContent: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: MONO, fontSize: 12, color: "#94a3b8", letterSpacing: 1.2 }}>SPX IN BITCOIN</div>
          <div style={{ fontFamily: MONO, fontSize: isMobile ? 34 : 46, fontWeight: 700, color: "#f59e0b", textShadow: "0 0 22px rgba(245,158,11,0.4)" }}>
            {cur ? fSats(cur.sats) : "-"} <span style={{ fontSize: isMobile ? 16 : 22, color: "#cbd5e1" }}>sats</span>
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: MONO, fontSize: 12, color: "#94a3b8", letterSpacing: 1.2 }}>VS BTC SINCE LAUNCH</div>
          <div style={{ fontFamily: MONO, fontSize: isMobile ? 34 : 46, fontWeight: 700, color: perfColor }}>
            {perf >= 0 ? "+" : ""}{perf.toFixed(0)}%
          </div>
        </div>
      </div>

      <ZoomBar zoomed={zoomed} onReset={() => setZoom(null)} accent="#f59e0b" />

      <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
        <ComposedChart data={view?.vis ?? data} margin={{ top: 10, right: isMobile ? 14 : 30, bottom: 24, left: isMobile ? 0 : 12 }}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} style={{ cursor: "crosshair", userSelect: "none" }}>
          <defs>
            <linearGradient id="btcFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.07)" vertical={false} />
          <XAxis
            dataKey="ts" type="number" scale="time" domain={view?.xDomain ?? ["dataMin", "dataMax"]} ticks={view?.xTicks} allowDataOverflow
            tickFormatter={view?.fmtX ?? fMon} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} minTickGap={isMobile ? 40 : 30}
          />
          <YAxis
            scale="log" domain={["auto", "auto"]} tickFormatter={fSats}
            tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 40 : 52}
          />
          <Tooltip content={<RatioTip />} />
          <Area type="monotone" dataKey="sats" stroke="#f59e0b" strokeWidth={1.5} fill="url(#btcFill)" isAnimationActive={false} />
          {selL != null && selR != null && selL !== selR && (
            <ReferenceArea x1={selL} x2={selR} strokeOpacity={0.3} stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.1} />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.6 }}>
        SPX6900 priced in Bitcoin (satoshis), log scale. Rising = SPX outperforming BTC; falling = Bitcoin winning. Not financial advice.
      </div>
    </div>
  );
}
