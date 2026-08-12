import { useMemo, useState, useEffect } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceArea,
} from "recharts";
import { loadWhaleCohortHistory } from "./history-data.js";
import { COHORTS } from "./whale-cohorts.js";
import ChartZoomHint from "./ChartZoomHint.jsx";
import { SANS, MONO, MAX_W, Metric, TipBox, ZoomBar, Explain, ViewTabs } from "./chart-ui.jsx";
import { useDragZoom } from "./use-drag-zoom.js";

// Cohorts are stacked bottom→top from smallest to biggest, so "how the base broadened" reads up the
// stack. Colours + labels come from whale-cohorts.js so this can't drift from the 3D page / the card.
const BANDS = COHORTS.map((c, i) => ({ key: `c${i}`, label: c.label, c: c.accent }));
const fShort = t => new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
const total = d => BANDS.reduce((s, b) => s + (d[b.key] || 0), 0);

function Tip({ active, payload, mode }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <TipBox title={new Date(d.ts).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}>
      {BANDS.slice().reverse().map(b => (
        <div key={b.key}><span style={{ color: b.c }}>{b.label}</span>: <span style={{ fontFamily: MONO }}>{d[b.key]}</span></div>
      ))}
      <div style={{ marginTop: 4, borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 4 }}>
        <span style={{ color: "#e2e8f0" }}>total whales</span>: <span style={{ fontFamily: MONO }}>{total(d)}</span>
      </div>
    </TipBox>
  );
}

// Whale counts over time, how many wallets sit in each size cohort (100–250k / 250k–1M / 1M–5M /
// 5M+), week by week, reconstructed from the city time-machine. The evolution story: the base
// broadened while the mega-whales thinned. A holder-structure read, not a signal.
export default function WhaleCohortsChart({ isMobile, initialView }) {
  const [doc, setDoc] = useState(null);
  const [stacked, setStacked] = useState(() => initialView === "stacked");
  useEffect(() => {
    let cancelled = false;
    loadWhaleCohortHistory().then(d => { if (!cancelled) setDoc(d ?? false); });
    return () => { cancelled = true; };
  }, []);

  const all = useMemo(() => {
    if (!doc?.rows) return [];
    return doc.rows.map(r => {
      const o = { ts: Date.parse(r[0]) };
      BANDS.forEach((b, i) => { o[b.key] = r[i + 1] || 0; });
      return o;
    }).filter(r => Number.isFinite(r.ts)).sort((a, b) => a.ts - b.ts);
  }, [doc]);

  const { zoom, setZoom, selL, selR, onDown, onMove, onUp, zoomed } = useDragZoom(
    (a, b) => all.filter(r => r.ts >= a && r.ts <= b).length >= 2);

  const view = useMemo(() => {
    if (all.length < 2) return null;
    const [x0, x1] = zoom ?? [all[0].ts, all.at(-1).ts];
    const vis = all.filter(r => r.ts >= x0 && r.ts <= x1);
    if (vis.length < 2) return null;
    const step = Math.max(1, Math.round(vis.length / 6));
    const xTicks = vis.filter((_, i) => i % step === 0 || i === vis.length - 1).map(r => r.ts);
    const yMax = stacked
      ? Math.max(...vis.map(total))
      : Math.max(...vis.flatMap(r => BANDS.map(b => r[b.key])));
    return { vis, xDomain: [x0, x1], xTicks, yMax: Math.ceil(yMax / 50) * 50 || 50 };
  }, [all, zoom, stacked]);

  if (doc === false) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Whale history is being rebuilt, check back after the next on-chain refresh.</div>;
  if (!view) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading whale history…</div>;

  const cur = all.at(-1), first = all[0];
  const mega = BANDS.at(-1).key;

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="How has SPX6900's whale population changed?" accent="#22d3ee">
        Every wallet over <strong style={{ color: "#e2e8f0" }}>100,000 SPX</strong>, counted week by week and split into four size cohorts.
        The base <strong style={{ color: BANDS[0].c }}>broadened</strong>, more mid-size whales over time, while the <strong style={{ color: BANDS[3].c }}>biggest hands (5M+) thinned</strong> as early mega-whales split or trimmed. Structure, not price.
      </Explain>

      <div style={{ display: "flex", gap: isMobile ? 14 : 30, justifyContent: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <Metric label="whales now" value={total(cur).toLocaleString()} color="#22d3ee" sub="wallets ≥100k SPX" />
        <Metric label="5M+ mega-whales" value={`${cur[mega]}`} color={BANDS[3].c} sub={`${first[mega]} at launch`} />
      </div>

      <ViewTabs tabs={[["lines", "Lines"], ["stacked", "Stacked"]]} value={stacked ? "stacked" : "lines"} onChange={k => setStacked(k === "stacked")} />

      <ZoomBar zoomed={zoomed} onReset={() => setZoom(null)} accent="#22d3ee" />

      <div style={{ position: "relative" }}>
        <ChartZoomHint />
        <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
          <ComposedChart data={view.vis} margin={{ top: 10, right: isMobile ? 8 : 20, bottom: 24, left: isMobile ? 0 : 12 }}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} style={{ cursor: "crosshair", userSelect: "none" }}>
            <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="ts" type="number" domain={view.xDomain} ticks={view.xTicks} scale="time" allowDataOverflow
              tickFormatter={fShort} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
            <YAxis type="number" domain={[0, view.yMax]} allowDataOverflow
              tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 40 : 52} />
            <Tooltip content={<Tip mode={stacked} />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
            {stacked
              ? BANDS.map(b => (
                  <Area key={b.key} type="monotone" dataKey={b.key} stackId="1" stroke={b.c} strokeWidth={0.5}
                    fill={b.c} fillOpacity={0.8} dot={false} isAnimationActive={false} name={b.label} />
                ))
              : BANDS.map(b => (
                  <Line key={b.key} type="monotone" dataKey={b.key} stroke={b.c} strokeWidth={1.7}
                    dot={false} isAnimationActive={false} name={b.label} />
                ))}
            {selL != null && selR != null && selL !== selR && (
              <ReferenceArea x1={selL} x2={selR} strokeOpacity={0.4} stroke="#e2e8f0" fill="#e2e8f0" fillOpacity={0.1} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* legend */}
      <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap", marginTop: 10 }}>
        {BANDS.map(b => (
          <span key={b.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: SANS, fontSize: 12.5, color: "#a7b3c6" }}>
            <span style={{ width: 11, height: 11, borderRadius: 3, background: b.c }} /> {b.label}
          </span>
        ))}
      </div>

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        <strong style={{ color: "#22d3ee" }}>Whale counts over time</strong>, wallets ≥100k SPX in each size cohort, reconstructed {doc?.res === "daily" ? "daily" : "weekly"} from the on-chain archive
        (net balances; infra excluded). A wallet moves between cohorts as it grows or shrinks; the live snapshot counts a touch fewer using finer per-lot ages. Drag to zoom. Not financial advice.
      </div>
    </div>
  );
}
