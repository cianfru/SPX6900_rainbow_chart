// WHO owns the supply, three ways — the interactive versions of the whale, wallet-size
// and wealth-ladder cards.
//
// HODL waves answer how long supply has sat still, and say nothing about who is sitting
// on it. These do: a wallet-size cut (whales, and where the supply they shed landed),
// and a dollar-value cut of the same wallets.
//
// One file because all three read the same weekly rows out of onchain.json and share a
// stacked-wave chassis; three files would have been three copies of the zoom, tooltip
// and axis wiring.
import { useMemo, useState, useEffect } from "react";
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, ReferenceArea, ReferenceLine,
} from "recharts";
import { SPX_ONCHAIN } from "./spx-onchain.js";
import { loadOnchain } from "./history-data.js";
import ChartZoomHint from "./ChartZoomHint.jsx";
import { SANS, MONO, MAX_W, Metric, TipBox, ZoomBar, Explain } from "./chart-ui.jsx";
import { useDragZoom } from "./use-drag-zoom.js";

const fShort = t => new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
// "Jul 25" reads as a day of the month; the peak label needs the year spelled out.
const fMonth = t => new Date(t).toLocaleDateString("en-US", { month: "short", year: "numeric" });
const fLong = t => new Date(t).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
const fInt = n => Math.round(n).toLocaleString("en-US");

/** The weekly on-chain rows, live file first and the bundle as the fallback. */
function useOnchain() {
  const [live, setLive] = useState(null);
  useEffect(() => {
    let cancelled = false;
    loadOnchain().then(d => { if (!cancelled && d) setLive(d); });
    return () => { cancelled = true; };
  }, []);
  return live || SPX_ONCHAIN;
}

/** Shared zoom + visible-window plumbing, so the three charts behave identically. */
function useWindow(all) {
  const { zoom, setZoom, selL, selR, onDown, onMove, onUp, zoomed } = useDragZoom(
    (a, b) => all.filter(r => r.ts >= a && r.ts <= b).length >= 2);
  const view = useMemo(() => {
    if (all.length < 2) return null;
    const [x0, x1] = zoom ?? [all[0].ts, all.at(-1).ts];
    const vis = all.filter(r => r.ts >= x0 && r.ts <= x1);
    if (vis.length < 2) return null;
    const step = Math.max(1, Math.round(vis.length / 6));
    return {
      vis, xDomain: [x0, x1], cur: all.at(-1),
      xTicks: vis.filter((_, i) => i % step === 0 || i === vis.length - 1).map(r => r.ts),
    };
  }, [all, zoom]);
  return { view, zoom, setZoom, selL, selR, onDown, onMove, onUp, zoomed };
}

const Empty = () => (
  <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Not enough on-chain data yet.</div>
);
const Caption = ({ accent, children }) => (
  <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
    {children} Drag to zoom. Not financial advice.
  </div>
);

// ── shared stacked-wave renderer ────────────────────────────────────────────
function Waves({ bands, view, isMobile, preview, accent, zoomProps, tip }) {
  const { selL, selR, onDown, onMove, onUp } = zoomProps;
  return (
    <div style={{ position: "relative" }}>
      {!preview && <ChartZoomHint />}
      <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
        <AreaChart data={view.vis} margin={{ top: 10, right: isMobile ? 8 : 20, bottom: 24, left: isMobile ? 0 : 12 }}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
          style={{ cursor: "crosshair", userSelect: "none" }}>
          <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="ts" type="number" domain={view.xDomain} ticks={view.xTicks} scale="time" allowDataOverflow
            tickFormatter={fShort} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
          <YAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} allowDataOverflow
            tickFormatter={v => v + "%"} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 44 : 54} />
          <Tooltip content={tip} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
          {bands.map(b => (
            <Area key={b.key} type="monotone" dataKey={b.key} stackId="1" stroke={b.c} strokeWidth={0.5}
              fill={b.c} fillOpacity={0.82} dot={false} isAnimationActive={false} name={b.label} />
          ))}
          {selL != null && selR != null && selL !== selR && (
            <ReferenceArea x1={selL} x2={selR} strokeOpacity={0.4} stroke="#e2e8f0" fill="#e2e8f0" fillOpacity={0.1} />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const Legend = ({ bands, cur, fmt, isMobile }) => (
  <div style={{ display: "flex", gap: isMobile ? 10 : 18, justifyContent: "center", flexWrap: "wrap", marginTop: 10 }}>
    {bands.slice().reverse().map(b => (
      <span key={b.key} style={{ fontFamily: SANS, fontSize: 12, color: "#94a3b8", display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 11, height: 11, borderRadius: 3, background: b.c, display: "inline-block" }} />
        {b.label} <span style={{ fontFamily: MONO, color: "#cbd5e1" }}>{fmt(cur, b)}</span>
      </span>
    ))}
  </div>
);

// ── 1. wallet-size waves ────────────────────────────────────────────────────
const SIZE_BANDS = [
  { key: "t0", label: "<1k", c: "#fb7185" },
  { key: "t1", label: "1k–10k", c: "#f59e0b" },
  { key: "t2", label: "10k–100k", c: "#84cc16" },
  { key: "t3", label: "100k–1M", c: "#22d3ee" },
  { key: "t4", label: "1M+", c: "#818cf8" },
];

function SizeTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <TipBox title={fLong(d.ts)}>
      {SIZE_BANDS.slice().reverse().map(b => (
        <div key={b.key}><span style={{ color: b.c }}>{b.label}</span>: <span style={{ fontFamily: MONO }}>{d[b.key].toFixed(1)}%</span> of supply</div>
      ))}
    </TipBox>
  );
}

export function WalletWavesChart({ isMobile, preview = false }) {
  const rows = useOnchain();
  const all = useMemo(() => rows
    .filter(r => Array.isArray(r.tiers) && r.tiers.length === 5 && r.holders > 1000)
    .map(r => ({ ts: Date.parse(r.d), t0: r.tiers[0], t1: r.tiers[1], t2: r.tiers[2], t3: r.tiers[3], t4: r.tiers[4] }))
    .filter(r => Number.isFinite(r.ts)).sort((a, b) => a.ts - b.ts), [rows]);
  const z = useWindow(all);
  if (!z.view) return <Empty />;
  const { cur } = z.view, first = all[0];

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="Who actually owns SPX6900, by the size of their stack?" accent="#818cf8">
        Every coin coloured by <strong style={{ color: "#e2e8f0" }}>how big the wallet holding it is</strong> — the same idea as HODL waves, cut by size instead of age.
        Million-coin wallets held <strong style={{ color: "#818cf8" }}>{first.t4.toFixed(0)}%</strong> of supply at launch and hold <strong style={{ color: "#818cf8" }}>{cur.t4.toFixed(0)}%</strong> now.
        The points they gave up went to the <strong style={{ color: "#84cc16" }}>tiers just below</strong>, not to dust.
      </Explain>
      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <Metric label="held by 1M+ wallets" value={cur.t4.toFixed(0) + "%"} color="#818cf8" sub={`${(first.t4 - cur.t4).toFixed(0)} points off launch`} />
        <Metric label="held by 10k–1M wallets" value={(cur.t2 + cur.t3).toFixed(0) + "%"} color="#22d3ee" sub={`from ${(first.t2 + first.t3).toFixed(0)}%`} />
      </div>
      <ZoomBar zoomed={z.zoomed} onReset={() => z.setZoom(null)} accent="#818cf8" />
      <Waves bands={SIZE_BANDS} view={z.view} isMobile={isMobile} preview={preview} zoomProps={z} tip={<SizeTip />} />
      <Legend bands={SIZE_BANDS} cur={cur} isMobile={isMobile} fmt={(c, b) => c[b.key].toFixed(1) + "%"} />
      <Caption>
        <strong style={{ color: "#818cf8" }}>Wallet-size waves</strong> — SPX6900&apos;s ETH-native supply split by how many coins the holding wallet has.
        Bands are absolute coin counts, and the coin&apos;s price has moved a great deal, so a 1M+ wallet meant something different in 2023 than it does now: this measures ownership of the supply, not wealth.
      </Caption>
    </div>
  );
}

// ── 2. the wealth ladder ────────────────────────────────────────────────────
// HEADCOUNT per dollar bracket, never share of supply. A supply split by dollar
// bracket is ~83% the coin's price move wearing a distribution chart's clothes
// (measured: hold price constant and only 17% of the movement survives). How many
// wallets are worth over $100k is honestly a price story and reads as one.
const USD_BANDS = [
  { key: "w4", label: "$100k+", c: "#818cf8" },
  { key: "w3", label: "$10k–100k", c: "#22d3ee" },
  { key: "w2", label: "$1k–10k", c: "#84cc16" },
  { key: "w1", label: "$100–1k", c: "#f59e0b" },
  { key: "w0", label: "<$100", c: "#fb7185" },
];

function WealthTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <TipBox title={`${fLong(d.ts)} · SPX at $${d.spot < 1 ? d.spot.toFixed(4) : d.spot.toFixed(2)}`}>
      {USD_BANDS.slice().reverse().map(b => (
        <div key={b.key}><span style={{ color: b.c }}>{b.label}</span>: <span style={{ fontFamily: MONO }}>{fInt(d[b.key + "n"])}</span> wallets ({d[b.key].toFixed(1)}%)</div>
      ))}
    </TipBox>
  );
}

export function WealthWavesChart({ isMobile, preview = false }) {
  const rows = useOnchain();
  const all = useMemo(() => rows
    .filter(r => Array.isArray(r.wealth) && r.wealth.length === 5 && r.holders > 1000)
    .map(r => {
      const n = r.wealth.reduce((a, b) => a + b, 0);
      const o = { ts: Date.parse(r.d), spot: r.spot, n };
      // Stacked richest-first so the thin top brackets sit on the baseline, where a
      // fraction of a percent is legible instead of pinned against the 100% line.
      [4, 3, 2, 1, 0].forEach(i => { o[`w${i}`] = n ? 100 * r.wealth[i] / n : 0; o[`w${i}n`] = r.wealth[i]; });
      return o;
    })
    .filter(r => Number.isFinite(r.ts) && r.n > 0).sort((a, b) => a.ts - b.ts), [rows]);
  const z = useWindow(all);
  const peak = useMemo(() => all.reduce((best, r) => (r.w4n > best.w4n ? r : best), all[0] ?? { w4n: 0 }), [all]);
  if (!z.view) return <Empty />;
  const { cur } = z.view;

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="How many holders are sitting on real money?" accent="#818cf8">
        The same wallets as the size chart, sorted by <strong style={{ color: "#e2e8f0" }}>what they were worth in dollars</strong> that week.{" "}
        <strong style={{ color: "#818cf8" }}>{fInt(peak.w4n)}</strong> wallets held over $100k at the {fMonth(peak.ts)} top; <strong style={{ color: "#818cf8" }}>{fInt(cur.w4n)}</strong> do now.
        The brackets move with the price — that is the point of the chart, not a flaw in it.
      </Explain>
      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <Metric label="wallets over $100k" value={fInt(cur.w4n)} color="#818cf8" sub={`${fInt(peak.w4n)} at the peak`} />
        <Metric label="wallets over $10k" value={fInt(cur.w4n + cur.w3n)} color="#22d3ee" sub={`of ${fInt(cur.n)} holders`} />
      </div>
      <ZoomBar zoomed={z.zoomed} onReset={() => z.setZoom(null)} accent="#818cf8" />
      <Waves bands={USD_BANDS} view={z.view} isMobile={isMobile} preview={preview} zoomProps={z} tip={<WealthTip />} />
      <Legend bands={USD_BANDS} cur={cur} isMobile={isMobile} fmt={(c, b) => fInt(c[b.key + "n"])} />
      <Caption>
        <strong style={{ color: "#818cf8" }}>The wealth ladder</strong> — the share of holders sitting in each dollar bracket, week by week.
        This counts <strong style={{ color: "#cbd5e1" }}>wallets, not supply</strong>, on purpose: splitting the supply by dollar bracket would mostly be a chart of the price wearing a distribution chart&apos;s clothes.
      </Caption>
    </div>
  );
}

// ── 3. the whale cohort ─────────────────────────────────────────────────────
function WhaleTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <TipBox title={fLong(d.ts)}>
      <div><span style={{ color: "#f472b6" }}>whale share</span>: <span style={{ fontFamily: MONO }}>{d.pct.toFixed(1)}%</span> of supply</div>
      <div><span style={{ color: "#38bdf8" }}>whale count</span>: <span style={{ fontFamily: MONO }}>{fInt(d.n)}</span> wallets</div>
    </TipBox>
  );
}

export function WhalesChart({ isMobile, preview = false }) {
  const rows = useOnchain();
  const all = useMemo(() => rows
    .filter(r => r.whalePct > 0 && r.holders > 1000)
    .map(r => ({ ts: Date.parse(r.d), pct: r.whalePct, n: r.whaleN }))
    .filter(r => Number.isFinite(r.ts)).sort((a, b) => a.ts - b.ts), [rows]);
  const z = useWindow(all);
  if (!z.view) return <Empty />;
  const { cur, vis } = z.view, first = all[0];
  // Count and share live on very different scales, so the count rides a second series
  // normalised into the share's axis rather than a second y-axis (this project does
  // not draw dual-scale axes — two scales invite a comparison the data cannot support).
  const maxN = Math.max(...vis.map(r => r.n), 1);
  const data = vis.map(r => ({ ...r, nScaled: 100 * r.n / maxN }));

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="What have the biggest wallets been doing?" accent="#f472b6">
        A <strong style={{ color: "#e2e8f0" }}>whale</strong> here is any wallet holding at least <strong style={{ color: "#e2e8f0" }}>0.1% of holder supply</strong> — a size threshold, not a fixed top-N,
        so the count and the share can move independently. They have: the count has sat near <strong style={{ color: "#38bdf8" }}>{fInt(cur.n)}</strong> for two years while their share fell
        from <strong style={{ color: "#f472b6" }}>{first.pct.toFixed(0)}%</strong> to <strong style={{ color: "#f472b6" }}>{cur.pct.toFixed(0)}%</strong>. Same wallets, steadily less of the float.
      </Explain>
      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <Metric label="whale share of supply" value={cur.pct.toFixed(0) + "%"} color="#f472b6" sub={`from ${first.pct.toFixed(0)}% at launch`} />
        <Metric label="whale wallets" value={fInt(cur.n)} color="#38bdf8" sub="holding 0.1%+ each" />
      </div>
      <ZoomBar zoomed={z.zoomed} onReset={() => z.setZoom(null)} accent="#f472b6" />
      <div style={{ position: "relative" }}>
        {!preview && <ChartZoomHint />}
        <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
          <LineChart data={data} margin={{ top: 10, right: isMobile ? 8 : 20, bottom: 24, left: isMobile ? 0 : 12 }}
            onMouseDown={z.onDown} onMouseMove={z.onMove} onMouseUp={z.onUp} onMouseLeave={z.onUp}
            style={{ cursor: "crosshair", userSelect: "none" }}>
            <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="ts" type="number" domain={z.view.xDomain} ticks={z.view.xTicks} scale="time" allowDataOverflow
              tickFormatter={fShort} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
            <YAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} allowDataOverflow
              tickFormatter={v => v + "%"} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 44 : 54} />
            <Tooltip content={<WhaleTip />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
            <ReferenceLine y={50} stroke="rgba(255,255,255,0.18)" strokeDasharray="4 6" />
            <Line type="monotone" dataKey="pct" stroke="#f472b6" strokeWidth={2.4} dot={false} isAnimationActive={false} name="share of supply" />
            <Line type="monotone" dataKey="nScaled" stroke="#38bdf8" strokeWidth={1.6} strokeDasharray="5 5" dot={false} isAnimationActive={false} name="count (scaled)" />
            {z.selL != null && z.selR != null && z.selL !== z.selR && (
              <ReferenceArea x1={z.selL} x2={z.selR} strokeOpacity={0.4} stroke="#e2e8f0" fill="#e2e8f0" fillOpacity={0.1} />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <Caption>
        <strong style={{ color: "#f472b6" }}>Whale supply</strong> — the solid line is the share of holder supply in wallets of 0.1% or more.
        The dashed line is <strong style={{ color: "#38bdf8" }}>how many such wallets there are</strong>, drawn against the same axis as a proportion of its own peak ({fInt(maxN)}) so the two shapes can be compared without a second scale.
        Exchanges, LP pools, the bridge and the burn address are excluded.
      </Caption>
    </div>
  );
}
