import { useMemo, useState, useEffect } from "react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceArea,
} from "recharts";
import { SPX_ONCHAIN } from "./spx-onchain.js";
import { loadOnchain } from "./history-data.js";
import { HORIZONS, turnoverOf, turnoverStack } from "./turnover.js";
import ChartZoomHint from "./ChartZoomHint.jsx";
import { SANS, MONO, MAX_W, Metric, TipBox, ViewTabs, Explain, ZoomBar } from "./chart-ui.jsx";
import { useDragZoom } from "./use-drag-zoom.js";

const DORMANT = "#64748b";
const fShort = t => new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit" });

// SUPPLY TURNOVER — of all held SPX, how much last changed hands within each horizon. The mirror of
// HODL Waves read as velocity (moved→) not conviction (held→). Two views: a HODL-waves-style stacked
// "waves" over time (fresh/traded at the bottom, dormant on top) + a cumulative "now" ladder.
export default function SupplyTurnoverChart({ isMobile, preview = false }) {
  const [live, setLive] = useState(null);
  const [tab, setTab] = useState("waves");
  useEffect(() => { let off = false; loadOnchain().then(d => { if (!off && d) setLive(d); }); return () => { off = true; }; }, []);
  const onchain = live || SPX_ONCHAIN;

  const cur = useMemo(() => turnoverOf(onchain.at(-1)), [onchain]);
  const rows = useMemo(() => (cur ? HORIZONS.filter(h => cur[h.key] != null) : []), [cur]);
  const hasFine = !!cur?.fine;
  const stack = useMemo(() => turnoverStack(onchain), [onchain]);

  const { zoom, setZoom, selL, selR, onDown, onMove, onUp, zoomed } = useDragZoom(
    (a, b) => (stack ? stack.data.filter(r => r.ts >= a && r.ts <= b).length >= 2 : false));

  const wave = useMemo(() => {
    if (!stack) return null;
    const [x0, x1] = zoom ?? [stack.data[0].ts, stack.data.at(-1).ts];
    const vis = stack.data.filter(r => r.ts >= x0 && r.ts <= x1);
    if (vis.length < 2) return null;
    const step = Math.max(1, Math.round(vis.length / 6));
    const xTicks = vis.filter((_, i) => i % step === 0 || i === vis.length - 1).map(r => r.ts);
    return { vis, xDomain: [x0, x1], xTicks };
  }, [stack, zoom]);

  if (!cur) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Not enough on-chain data yet.</div>;

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="How much of SPX6900 actually changes hands — and over what horizon?" accent="#fb923c">
        Every coin coloured by <strong style={{ color: "#e2e8f0" }}>how recently it last moved</strong> — warm (bottom) = just traded, cool (top) = dormant for a year+.
        About <strong style={{ color: "#fb923c" }}>{Math.round(cur.m1)}%</strong> turns over in a month and <strong style={{ color: "#38bdf8" }}>{Math.round(cur.y1)}%</strong> within a year, while <strong style={{ color: "#818cf8" }}>{Math.round(cur.dormant)}%</strong> has sat still for over a year. Held ≠ frozen.
      </Explain>

      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <Metric label="moved in a month" value={Math.round(cur.m1) + "%"} color="#fb923c" sub="monthly turnover" />
        <Metric label="moved within a year" value={Math.round(cur.y1) + "%"} color="#38bdf8" sub="held ≠ frozen" />
        <Metric label="dormant 1yr+" value={Math.round(cur.dormant) + "%"} color="#818cf8" sub="hasn't moved" />
      </div>
      <div style={{ textAlign: "center", fontFamily: MONO, fontSize: 11, color: "#64748b", marginBottom: 12 }}>Ethereum-native · from per-wallet holding age (FIFO)</div>

      <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
        <ViewTabs tabs={[["waves", "Turnover waves"], ["ladder", "Now"]]} value={tab} onChange={setTab} />
      </div>

      {tab === "waves" ? (
        wave ? (
          <>
            <ZoomBar zoomed={zoomed} onReset={() => setZoom(null)} accent="#fb923c" />
            <div style={{ position: "relative" }}>
              {!preview && <ChartZoomHint />}
              <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
                <AreaChart data={wave.vis} margin={{ top: 10, right: isMobile ? 8 : 20, bottom: 24, left: isMobile ? 0 : 12 }}
                  onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} style={{ cursor: "crosshair", userSelect: "none" }}>
                  <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="ts" type="number" domain={wave.xDomain} ticks={wave.xTicks} scale="time" allowDataOverflow
                    tickFormatter={fShort} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
                    axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
                  <YAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} allowDataOverflow
                    tickFormatter={v => v + "%"} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
                    axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 44 : 54} />
                  <Tooltip content={<WaveTip bands={stack.bands} />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
                  {stack.bands.map(b => (
                    <Area key={b.key} type="monotone" dataKey={b.key} stackId="1" stroke={b.c} strokeWidth={0.5}
                      fill={b.c} fillOpacity={0.82} dot={false} isAnimationActive={false} name={b.label} />
                  ))}
                  {selL != null && selR != null && selL !== selR && (
                    <ReferenceArea x1={selL} x2={selR} strokeOpacity={0.4} stroke="#e2e8f0" fill="#e2e8f0" fillOpacity={0.1} />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
            {/* legend, warm → cool */}
            <div style={{ display: "flex", justifyContent: "center", gap: isMobile ? 10 : 16, flexWrap: "wrap", marginTop: 10 }}>
              {stack.bands.map(b => (
                <span key={b.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: MONO, fontSize: 11.5, color: "#94a3b8" }}>
                  <span style={{ width: 11, height: 11, borderRadius: 3, background: b.c }} />{b.label}
                </span>
              ))}
            </div>
            {!hasFine && !preview && (
              <div style={{ fontFamily: MONO, fontSize: 11.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.6 }}>
                The fresh layer splits into 24‑hour / 1‑week / 1‑month bands on the next daily on‑chain refresh.
              </div>
            )}
          </>
        ) : <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 40 }}>Not enough history yet.</div>
      ) : (
        <div style={{ maxWidth: 760, margin: "0 auto", padding: isMobile ? "4px 4px" : "4px 12px" }}>
          {rows.map(h => (
            <div key={h.key} style={{ display: "flex", alignItems: "center", gap: 12, margin: "9px 0" }}>
              <span style={{ flex: "0 0 auto", width: isMobile ? 96 : 132, textAlign: "right", fontFamily: SANS, fontSize: isMobile ? 12.5 : 14, color: "#cbd5e1" }}>moved &lt; {h.label}</span>
              <div style={{ flex: 1, height: isMobile ? 22 : 26, background: "rgba(255,255,255,0.05)", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${Math.min(100, cur[h.key])}%`, height: "100%", background: h.c, opacity: 0.9, borderRadius: 4, transition: "width .3s" }} />
              </div>
              <span style={{ flex: "0 0 auto", width: 52, fontFamily: MONO, fontSize: isMobile ? 13 : 15, fontWeight: 700, color: h.c, textAlign: "right" }}>{cur[h.key]}%</span>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "16px 0 4px", paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
            <span style={{ flex: "0 0 auto", width: isMobile ? 96 : 132, textAlign: "right", fontFamily: SANS, fontSize: isMobile ? 12.5 : 14, color: "#94a3b8" }}>dormant 1 year+</span>
            <div style={{ flex: 1, height: isMobile ? 22 : 26, background: "rgba(255,255,255,0.05)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ width: `${Math.min(100, cur.dormant)}%`, height: "100%", background: DORMANT, opacity: 0.85, borderRadius: 4 }} />
            </div>
            <span style={{ flex: "0 0 auto", width: 52, fontFamily: MONO, fontSize: isMobile ? 13 : 15, fontWeight: 700, color: DORMANT, textAlign: "right" }}>{cur.dormant}%</span>
          </div>
          {!hasFine && !preview && (
            <div style={{ fontFamily: MONO, fontSize: 11.5, color: "#64748b", textAlign: "center", marginTop: 16, lineHeight: 1.6 }}>
              The 24‑hour and 1‑week brackets fill in on the next daily on‑chain refresh.
            </div>
          )}
        </div>
      )}

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 16, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        <strong style={{ color: "#fb923c" }}>Supply turnover</strong> — SPX6900&apos;s held supply split by how recently each coin last changed hands, warm (just moved) at the bottom, cool (dormant) on top.
        The mirror of <strong style={{ color: "#818cf8" }}>HODL Waves</strong>: same FIFO reconstruction, read as velocity instead of conviction. <strong style={{ color: "#94a3b8" }}>Ethereum-native</strong> (Base &amp; Solana are bridged). Drag to zoom. Not financial advice.
      </div>
    </div>
  );
}

function WaveTip({ active, payload, label, bands }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload || {};
  return (
    <TipBox title={new Date(label).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}>
      {bands.slice().reverse().map(b => (
        <div key={b.key}><span style={{ color: b.c }}>{b.label}</span>: <span style={{ fontFamily: MONO, color: "#e2e8f0" }}>{(row[b.key] ?? 0).toFixed(1)}%</span></div>
      ))}
    </TipBox>
  );
}
