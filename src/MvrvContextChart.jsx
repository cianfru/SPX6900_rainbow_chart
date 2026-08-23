import { useMemo, useState, useEffect } from "react";
import {
  ResponsiveContainer, ComposedChart, Line, Scatter, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, ReferenceArea,
} from "recharts";
import { loadHistory, loadBtcMvrv, loadPriceHistory } from "./history-data.js";
import { mvrvHistory } from "./mvrv-data.js";
import ChartZoomHint from "./ChartZoomHint.jsx";
import { SANS, MONO, MAX_W, Metric, TipBox, ZoomBar, Explain, ViewTabs } from "./chart-ui.jsx";
import { useDragZoom } from "./use-drag-zoom.js";

const BTC = "#f7931a", SPX = "#a78bfa", MATCH = "#e879f9";
const MATCH_BAND = 0.12; // ±12% of SPX's MVRV counts as "Bitcoin at the same level"
const YR = 365.25 * 86400000;
// Bitcoin's true inception (genesis block, 2009-01-03). Its on-chain MVRV record only BEGINS ~2 years
// later (realized cap needs a real transaction history + market price), so in the age view BTC's line
// honestly starts at age ~2 — we never pretend 2011 is BTC's "age 0".
const BTC_GENESIS = Date.UTC(2009, 0, 3);
const fMvrv = v => v.toFixed(2) + "×";
const fAge = a => (a === Math.round(a) ? a + "y" : a.toFixed(1) + "y");
const fYear = t => new Date(t).getFullYear();
const fFull = t => new Date(t).toLocaleDateString("en-US", { month: "short", year: "numeric" });
const ordinal = n => { const v = n % 100; return n + (["th", "st", "nd", "rd"][(v - 20) % 10] || ["th", "st", "nd", "rd"][v] || "th"); };
// Join a list into "a, b and c".
const andList = xs => xs.length <= 1 ? (xs[0] || "") : xs.slice(0, -1).join(", ") + " and " + xs.at(-1);

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

// Age-view tooltip: recharts hands each line's own point, so show every series present at that age.
function AgeTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const age = payload[0]?.payload?.age;
  return (
    <TipBox title={age != null ? `${age.toFixed(1)} years in` : ""}>
      {payload.map((p, i) => (
        <div key={i}>{p.name} MVRV: <span style={{ fontFamily: MONO, color: p.stroke }}>{fMvrv(p.value)}</span></div>
      ))}
    </TipBox>
  );
}

// MVRV in context: overlay SPX6900's (short) MVRV on Bitcoin's ~decade of MVRV history.
// MVRV is unitless (market-cap ÷ realized-cap), so the two are directly comparable even
// though BTC has years of it and SPX only weeks. Answers "are we down/heated similarly to
// some Bitcoin moment?", SPX's current MVRV is a marker line across BTC's cheap→heated map.
export default function MvrvContextChart({ isMobile, preview = false }) {
  const [btc, setBtc] = useState(null);
  const [spxHist, setSpxHist] = useState(null);
  const [px, setPx] = useState(null);   // CI-cleaned dense price, see mvrv-data.js
  const [viewMode, setViewMode] = useState("age");   // "age" (since inception, default) | "calendar"
  useEffect(() => {
    let cancelled = false;
    loadBtcMvrv().then(d => { if (!cancelled) setBtc(d?.points || []); });
    loadHistory().then(d => { if (!cancelled) setSpxHist(d); });
    loadPriceHistory().then(d => { if (!cancelled) setPx(d); });
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
    // Zones from BTC's OWN distribution, self-consistent, no hardcoded thresholds.
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

  // SPX6900's OWN MVRV trail = price ÷ realized price (avg cost basis). Full launch→now
  // path from the on-chain Dune realized-cost backfill, with the live HolderScan snapshots
  // extending the tail, drawn on BTC's timeline at its real dates (recent/right region).
  const spxSeries = useMemo(() => {
    if (!spxHist) return [];
    return mvrvHistory(spxHist, px).map(r => ({ ts: r.ts, mvrv: r.p / r.be }));
  }, [spxHist, px]);
  const spx = spxSeries.length ? { mvrv: spxSeries.at(-1).mvrv, ts: spxSeries.at(-1).ts } : null;

  // "See the similarities": the Bitcoin moments when BTC's MVRV was within ±band of
  // where SPX6900 sits today, clustered into periods (a >120-day gap starts a new one).
  // Answers "Bitcoin last looked this cheap in …" directly.
  const similar = useMemo(() => {
    if (!data?.rows?.length || !spx) return null;
    const lo = spx.mvrv * (1 - MATCH_BAND), hi = spx.mvrv * (1 + MATCH_BAND);
    const hits = data.rows.filter(r => r.mvrv >= lo && r.mvrv <= hi);
    if (!hits.length) return { lo, hi, periods: [], years: [] };
    const periods = [];
    for (const r of hits) {
      const last = periods.at(-1);
      if (!last || r.ts - last.end > 120 * 86400000) periods.push({ start: r.ts, end: r.ts });
      else last.end = r.ts;
    }
    const years = [...new Set(periods.map(p => fYear(p.start)))];
    return { lo, hi, periods, years };
  }, [data, spx]);

  const { zoom, setZoom, selL, selR, onDown, onMove, onUp, zoomed } = useDragZoom(
    (a, b) => data?.rows && data.rows.filter(r => r.ts >= a && r.ts <= b).length >= 2);

  const view = useMemo(() => {
    if (!data?.rows || data.rows.length < 2) return null;
    const fullX = [data.rows[0].ts, data.rows.at(-1).ts];
    const [x0, x1] = zoom ?? fullX;
    // tag each visible point that sits at SPX's level so we can dot the matches
    const vis = data.rows.filter(r => r.ts >= x0 && r.ts <= x1).map(r => ({
      ...r, match: similar && r.mvrv >= similar.lo && r.mvrv <= similar.hi ? r.mvrv : null,
    }));
    if (vis.length < 2) return null;
    let yMin = Infinity, yMax = -Infinity;
    for (const r of vis) { if (r.mvrv < yMin) yMin = r.mvrv; if (r.mvrv > yMax) yMax = r.mvrv; }
    if (spx) { yMin = Math.min(yMin, spx.mvrv); yMax = Math.max(yMax, spx.mvrv); }
    const years = new Set(vis.map(r => fYear(r.ts)));
    const xTicks = [...years].map(y => Date.UTC(y, 0, 1)).filter(t => t >= x0 && t <= x1);
    return { vis, xDomain: [x0, x1], xTicks, yDomain: [yMin * 0.85, yMax * 1.12] };
  }, [data, zoom, spx, similar]);

  // "Since inception" — the two MVRV paths aligned by AGE (years since each asset's genesis), so SPX's
  // first three years sit directly over Bitcoin's, to see whether the early cycle rhymes. SPX's launch
  // is its own age 0; BTC's is the 2009 genesis, so its line honestly begins at ~age 2 (see BTC_GENESIS).
  const ageView = useMemo(() => {
    if (!data?.rows?.length || !spxSeries.length) return null;
    const spxInception = spxSeries[0].ts;
    const spxAgePts = spxSeries.map(r => ({ age: (r.ts - spxInception) / YR, mvrv: r.mvrv })).filter(r => r.age >= 0 && r.mvrv > 0);
    const spxMaxAge = spxAgePts.length ? spxAgePts.at(-1).age : 3;
    // show a couple of years past SPX's current age so BTC's "what came next" is visible for context
    const xMax = Math.max(5, Math.ceil(spxMaxAge) + 1);
    const btcAgePts = data.rows.map(r => ({ age: (r.ts - BTC_GENESIS) / YR, mvrv: r.mvrv })).filter(r => r.age >= 0 && r.age <= xMax && r.mvrv > 0);
    let yMin = Infinity, yMax = -Infinity;
    for (const r of [...spxAgePts, ...btcAgePts]) { if (r.mvrv < yMin) yMin = r.mvrv; if (r.mvrv > yMax) yMax = r.mvrv; }
    if (!Number.isFinite(yMin)) return null;
    const xTicks = []; for (let a = 0; a <= xMax; a++) xTicks.push(a);
    const btcFirstAge = btcAgePts.length ? btcAgePts[0].age : null;
    return { spxAgePts, btcAgePts, spxMaxAge, btcFirstAge, xDomain: [0, xMax], xTicks, yDomain: [yMin * 0.85, yMax * 1.12] };
  }, [data, spxSeries]);

  if (btc == null || spxHist == null) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading MVRV history…</div>;
  if (!data?.rows?.length) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Bitcoin MVRV context is being banked, this fills in once its monthly data build has run.</div>;
  if (!view) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Not enough history in this range.</div>;

  const z = data.zones;
  const spxPct = spx ? pctRank(data.sorted, spx.mvrv) : null;
  // Honest read from the ACTUAL percentile: "cheaper than N% of Bitcoin's history".
  const cheaperThan = spxPct != null ? 100 - spxPct : null;
  const matchYears = similar?.years?.length ? andList(similar.years.map(String)) : null;

  const zone = (y1, y2, fill, label) => (y1 != null && y2 != null && y2 > y1) ? (
    <ReferenceArea y1={y1} y2={y2} fill={fill} fillOpacity={0.10} stroke="none"
      label={preview ? undefined : { value: label, position: "insideLeft", fill, fontSize: 10.5, fontFamily: MONO, opacity: 0.9 }} />
  ) : null;

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="Is SPX6900 as cheap as Bitcoin was at its bottoms?" accent="#a78bfa">
        MVRV (price vs holders' average cost) is <em>unitless</em>, so it compares across coins even though their histories differ wildly.
        This drops SPX's current MVRV onto Bitcoin's whole decade, the <strong style={{ color: "#e879f9" }}>dots</strong> mark the weeks BTC last sat this cheap. A rhyme with history, not a forecast.
      </Explain>
      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <Metric label="SPX6900 MVRV" value={spx ? fMvrv(spx.mvrv) : "-"} color={SPX} sub={spx ? (spx.mvrv >= 1 ? "in profit" : "underwater") : "banking"} />
        <Metric label="Bitcoin MVRV" value={fMvrv(data.btcCur)} color={BTC} sub="today" />
        {spxPct != null && <Metric label="on BTC's history" value={ordinal(spxPct)} color="#22d3ee" sub="percentile" />}
      </div>

      <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
        <ViewTabs tabs={[["age", "Since inception"], ["calendar", "BTC full history"]]} value={viewMode} onChange={setViewMode} />
      </div>

      {viewMode === "calendar" && (<>
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
            {/* SPX6900's neighbourhood, the ±band whose crossings are the "similar" BTC moments */}
            {similar && <ReferenceArea y1={similar.lo} y2={similar.hi} fill={SPX} fillOpacity={0.14} stroke="none" />}
            {spx && <ReferenceLine y={spx.mvrv} stroke={SPX} strokeWidth={1.6} strokeOpacity={0.95}
              label={preview ? undefined : { value: `SPX today ${fMvrv(spx.mvrv)}`, position: "insideTopRight", fill: SPX, fontSize: 12, fontWeight: 700, fontFamily: MONO }} />}
            <Tooltip content={<Tip />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
            <Line type="monotone" dataKey="mvrv" stroke={BTC} strokeWidth={1.5} dot={false} isAnimationActive={false} name="BTC MVRV" />
            {/* highlight the Bitcoin points sitting at SPX's level today, the "we've been here" moments */}
            <Scatter dataKey="match" fill={MATCH} isAnimationActive={false} shape="circle" legendType="none" />
            {/* SPX6900's own MVRV path, drawn on Bitcoin's timeline at its real dates. It was
                pulled once as redundant with the dedicated mvrv page, but the question this
                chart gets asked is "how does SPX's history compare", and a marker for today
                cannot answer that. MVRV is unitless, which is what makes the overlay fair. */}
            <Line data={spxSeries} type="monotone" dataKey="mvrv" stroke={SPX} strokeWidth={1.7}
              dot={false} isAnimationActive={false} name="SPX6900 MVRV" />
            {selL != null && selR != null && selL !== selR && (
              <ReferenceArea x1={selL} x2={selR} strokeOpacity={0.4} stroke={SPX} fill={SPX} fillOpacity={0.12} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      </>)}

      {viewMode === "age" && ageView && (
        <div style={{ position: "relative" }}>
          <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
            <ComposedChart margin={{ top: 10, right: isMobile ? 8 : 20, bottom: 24, left: isMobile ? 0 : 12 }}>
              <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
              {zone(z.hot, z.max, "#f87171", "hot")}
              {zone(z.warm, z.hot, "#fbbf24", "warm")}
              {zone(z.fair, z.warm, "#4ade80", "fair")}
              {zone(z.cheap, z.fair, "#38bdf8", "cheap")}
              {zone(z.min, z.cheap, "#818cf8", "capitulation")}
              <XAxis dataKey="age" type="number" domain={ageView.xDomain} ticks={ageView.xTicks} allowDataOverflow
                tickFormatter={fAge} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
                axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false}
                label={preview ? undefined : { value: "years since inception", position: "insideBottom", offset: -12, fill: "#94a3b8", fontSize: 11, fontFamily: MONO }} />
              <YAxis type="number" scale="log" domain={ageView.yDomain} allowDataOverflow
                tickFormatter={fMvrv} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
                axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 52 : 66} />
              <ReferenceLine y={1} stroke="rgba(255,255,255,0.45)" strokeDasharray="5 5"
                label={preview ? undefined : { value: "break-even 1×", position: "insideBottomRight", fill: "#94a3b8", fontSize: 10.5, fontFamily: MONO }} />
              {/* today's SPX age — where SPX's line ends */}
              {!preview && <ReferenceLine x={ageView.spxMaxAge} stroke={SPX} strokeDasharray="4 4" strokeOpacity={0.6}
                label={{ value: `SPX today · ${fAge(ageView.spxMaxAge)}`, position: "insideTopLeft", fill: SPX, fontSize: 11, fontFamily: MONO }} />}
              {/* where BTC's on-chain MVRV record begins (~age 2) — honest marker, not a data gap we hide */}
              {ageView.btcFirstAge != null && !preview && <ReferenceLine x={ageView.btcFirstAge} stroke={BTC} strokeDasharray="3 6" strokeOpacity={0.5}
                label={{ value: `BTC data starts · ${fAge(ageView.btcFirstAge)}`, position: "insideTopRight", fill: BTC, fontSize: 10.5, fontFamily: MONO }} />}
              <Tooltip content={<AgeTip />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
              <Line data={ageView.btcAgePts} dataKey="mvrv" type="monotone" stroke={BTC} strokeWidth={1.6} dot={false} isAnimationActive={false} name="BTC" />
              <Line data={ageView.spxAgePts} dataKey="mvrv" type="monotone" stroke={SPX} strokeWidth={2.2} dot={false} isAnimationActive={false} name="SPX6900" />
            </ComposedChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", gap: 18, justifyContent: "center", marginTop: 6, fontFamily: MONO, fontSize: 12 }}>
            <span style={{ color: SPX }}>● SPX6900</span><span style={{ color: BTC }}>● Bitcoin</span>
          </div>
        </div>
      )}

      {viewMode === "calendar" && spx && (matchYears || cheaperThan != null) && (
        <div style={{ fontFamily: SANS, fontSize: isMobile ? 13 : 14, color: "#cbd5e1", textAlign: "center", marginTop: 14, lineHeight: 1.6, maxWidth: 820, marginInline: "auto" }}>
          At <strong style={{ color: SPX }}>{fMvrv(spx.mvrv)}</strong>, SPX6900&apos;s average holder is <strong style={{ color: spx.mvrv >= 1 ? "#4ade80" : "#f87171" }}>{spx.mvrv >= 1 ? "in profit" : "underwater"}</strong>
          {cheaperThan != null && <>, cheaper on MVRV than <strong style={{ color: "#22d3ee" }}>{cheaperThan}%</strong> of Bitcoin&apos;s entire history</>}.
          {matchYears && <> Bitcoin last traded this cheap at its <strong style={{ color: MATCH }}>{matchYears}</strong> cycle bottoms <span style={{ color: MATCH }}>●</span>.</>}
        </div>
      )}
      {viewMode === "age" && (
        <div style={{ fontFamily: SANS, fontSize: isMobile ? 13 : 14, color: "#cbd5e1", textAlign: "center", marginTop: 14, lineHeight: 1.6, maxWidth: 820, marginInline: "auto" }}>
          Both MVRV paths aligned by <strong style={{ color: "#e2e8f0" }}>age since launch</strong>, SPX6900&apos;s first {ageView ? Math.floor(ageView.spxMaxAge) : 3} years over Bitcoin&apos;s. A rhyme in the early cycle, not a forecast.
        </div>
      )}
      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 10, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        {viewMode === "age" ? (
          <><strong style={{ color: SPX }}>SPX6900</strong> and <strong style={{ color: BTC }}>Bitcoin</strong> MVRV (market-cap ÷ realized-cap, unitless) on one axis of <strong>years since each coin&apos;s inception</strong>. Bitcoin&apos;s on-chain MVRV record only begins ~2 years after genesis (realized cap needs a real transaction history and market price), so its line starts there — the earliest years genuinely can&apos;t be reconstructed. Zones are Bitcoin&apos;s own MVRV quantiles, a reference not a target. A rhyme, not a forecast. Not financial advice.</>
        ) : (
          <><strong style={{ color: BTC }}>Bitcoin&apos;s MVRV</strong> over its whole history (market-cap ÷ realized-cap, unitless, so it&apos;s comparable across coins);
          the <strong style={{ color: SPX }}>SPX6900 band</strong> marks where its MVRV sits today, and the <strong style={{ color: MATCH }}>dots</strong> are the Bitcoin weeks at that same level.
          The zones are Bitcoin&apos;s own MVRV quantiles, a reference, not a target. SPX6900 has ~one cycle of MVRV vs Bitcoin&apos;s decade, so read it as a rhyme, not a forecast. Drag to zoom. Not financial advice.</>
        )}
      </div>
    </div>
  );
}
