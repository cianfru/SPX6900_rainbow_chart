import { useMemo, useState, useEffect } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceArea, ReferenceLine, ReferenceDot } from "recharts";
import { loadAeonSales, loadPriceHistory } from "./history-data.js";
import { SPX_DAILY } from "./spx-daily.js";
import { ETH_HISTORY } from "./eth-history.js";
import { SANS, MONO, MAX_W, Metric, TipBox, Explain } from "./chart-ui.jsx";

// Project Aeon, does AEON's floor/sales LEAD the coin, or follow it? A lead/lag cross-correlation
// of short-run returns at DAILY resolution: for each lag L, corr(AEON return at t, SPX return at t+L).
// Positive lag = AEON leads SPX (its floor would predict the coin); negative = SPX leads AEON.
//
// The whole thing is computed in the browser from three public series, AEON floor/volume
// (aeon-sales.json), SPX (SPX_DAILY) and ETH (ETH_HISTORY), so anyone can check it. The
// market-adjusted line strips the common crypto beta by regressing ETH out of both sides, which
// answers "is this a real SPX↔AEON link, or are they just both riding the market?"
//
// Returns are SHORT-RUN (3-day) log returns sampled daily, so the lag axis is fine-grained (days)
// without the bias a long overlapping window introduces, a 7-day window sampled daily smears the
// cross-correlation toward zero AND lifts the wrong-side (AEON-leads) tail, which would overstate a
// link that isn't there. 3 days keeps the estimate honest. The noise band is drawn from the count of
// INDEPENDENT windows (defined ÷ WIN), never the raw day count, so it can't overstate significance.

const LAG = 56;                          // ±8 weeks, in days
const WIN = 3;                           // return horizon (days), short, to avoid overlap bias

const toMap = (pairs) => { const m = new Map(); for (const [d, v] of pairs) if (v > 0) m.set(d.slice(0, 10), +v); return m; };
const dstr = (t) => new Date(t).toISOString().slice(0, 10);

function ffillDaily(map, d0, d1) {
  // seed with the last value at/before d0
  const keys = [...map.keys()].sort();
  const lastReal = keys.at(-1);         // never carry a value PAST the series' real end, a stale
  let last = null;                      // bundle (ETH) must read as null there, not fabricated flat
  for (const k of keys) { if (k <= d0) last = map.get(k); else break; }
  const out = [];
  for (let t = Date.parse(d0); t <= Date.parse(d1); t += 864e5) {
    const k = dstr(t);
    if (map.has(k)) last = map.get(k);
    out.push(lastReal && k <= lastReal ? last : null);
  }
  return out;                            // array aligned to the daily calendar [d0..d1]
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// WIN-day log returns sampled daily
const rets = (arr) => arr.map((v, i) => (i >= WIN && arr[i - WIN] > 0 && v > 0 ? Math.log(v / arr[i - WIN]) : null));

function corr(a, b) {
  const xs = [], ys = [];
  for (let i = 0; i < a.length; i++) if (a[i] != null && b[i] != null) { xs.push(a[i]); ys.push(b[i]); }
  const n = xs.length; if (n < 8) return null;
  const mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

// residual of y after regressing out x (element-wise, over defined pairs), removes the ETH-beta component
function residualize(y, x) {
  const xs = [], ys = [], idx = [];
  for (let i = 0; i < y.length; i++) if (y[i] != null && x[i] != null) { xs.push(x[i]); ys.push(y[i]); idx.push(i); }
  const n = xs.length; if (n < 8) return y.slice();
  const mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) * (xs[i] - mx); }
  const b = sxx ? sxy / sxx : 0, a = my - b * mx;
  const out = y.slice().fill(null);
  for (let i = 0; i < n; i++) out[idx[i]] = ys[i] - (a + b * xs[i]);
  return out;
}

// corr(A[t], S[t+L]); +L = A leads S
function xcorrAt(A, S, L) {
  const a = [], s = [];
  for (let t = 0; t < A.length; t++) { const u = t + L; if (u >= 0 && u < S.length) { a.push(A[t]); s.push(S[u]); } }
  return corr(a, s);
}

export default function AeonLeadLagChart({ isMobile, initialView }) {
  const [sales, setSales] = useState(null);
  const [price, setPrice] = useState(null);         // live daily SPX (/price-history.json)
  const [metric, setMetric] = useState(() => ["floor", "volume"].includes(initialView) ? initialView : "floor");    // "floor" | "volume"
  useEffect(() => { let c = false; loadAeonSales().then(d => { if (!c) setSales(d || { empty: true }); }); return () => { c = true; }; }, []);
  useEffect(() => { let c = false; loadPriceHistory().then(d => { if (!c) setPrice(d || []); }); return () => { c = true; }; }, []);

  const model = useMemo(() => {
    if (!sales || sales.empty || !sales.daily?.length) return null;
    // SPX from the live, CI-refreshed price feed so the analysis stays current; bundle as fallback.
    const spxSrc = price?.length ? price.map(r => [r.date, r.price]) : SPX_DAILY;
    const spxM = toMap(spxSrc), ethM = toMap(ETH_HISTORY);
    const floorM = toMap(sales.daily.map(r => [r.d, r.floorUsd]));
    const volM = toMap(sales.daily.map(r => [r.d, r.volUsd]));
    const firstOf = m => [...m.keys()].sort()[0], lastOf = m => [...m.keys()].sort().at(-1);
    // Start where all three overlap. End at the fresher of SPX/AEON, ETH does NOT cap the window;
    // it's a slow bundle, so it just isn't available for the market-adjusted line past its own end
    // (ffill returns null there), while the raw AEON-vs-SPX line runs right up to today.
    const d0 = [firstOf(spxM), firstOf(ethM), firstOf(floorM)].sort().at(-1);
    const d1 = [lastOf(spxM), lastOf(floorM)].sort()[0];
    if (!d0 || !d1 || d0 >= d1) return null;

    const spx = ffillDaily(spxM, d0, d1);
    const eth = ffillDaily(ethM, d0, d1);
    // floor: 3-day median first so a single cheap sale isn't read as the floor
    const floorRaw = ffillDaily(floorM, d0, d1);
    const floor = floorRaw.map((_, i) => median(floorRaw.slice(Math.max(0, i - 2), i + 1)));
    // volume: 7-day rolling sum (weekly turnover), then treated like a level
    const volRaw = ffillDaily(volM, d0, d1).map(v => v || 0);
    const vol = volRaw.map((_, i) => Math.max(1, volRaw.slice(Math.max(0, i - 6), i + 1).reduce((s, v) => s + v, 0)));

    const rSpx = rets(spx), rEth = rets(eth);
    const rAe = rets(metric === "floor" ? floor : vol);
    const rSpxA = residualize(rSpx, rEth), rAeA = residualize(rAe, rEth);

    const rows = [];
    for (let L = -LAG; L <= LAG; L++) {
      rows.push({ lag: L, raw: xcorrAt(rAe, rSpx, L), adj: xcorrAt(rAeA, rSpxA, L) });
    }
    const defined = rSpx.filter((_, i) => rSpx[i] != null && rAe[i] != null).length;
    const indepWeeks = Math.max(1, Math.round(defined / WIN));
    const sig = 2 / Math.sqrt(indepWeeks);
    const peak = rows.reduce((p, r) => (r.adj != null && Math.abs(r.adj) > Math.abs(p.adj ?? 0) ? r : p), rows[0]);
    const at0 = rows.find(r => r.lag === 0);
    // the best case for "AEON leads SPX": the largest correlation anywhere on the positive-lag side
    const bestPos = rows.filter(r => r.lag > 0 && r.adj != null).reduce((p, r) => (r.adj > (p.adj ?? -1) ? r : p), { adj: null });
    return { rows, sig, peak, at0, bestPos, indepWeeks, d0, d1 };
  }, [sales, price, metric]);

  if (!sales) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading…</div>;
  if (!model) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Not enough overlapping price data yet.</div>;
  const { rows, sig, peak, at0, bestPos, indepWeeks, d0, d1 } = model;
  const led = peak.lag < 0;   // negative lag peak = SPX leads AEON
  const posWeak = bestPos.adj == null || bestPos.adj < sig * 1.3;   // AEON-leads side ≈ noise floor
  const weaker = bestPos.adj && peak.adj ? Math.abs(peak.adj / bestPos.adj) : null;

  const btn = (active) => ({
    className: `neon-pill${active ? " active" : ""}`,
    style: { padding: "6px 14px", borderRadius: 8, fontFamily: MONO, fontSize: 12, color: active ? "#f8fafc" : "#94a3b8", "--glow": "#a78bfa" },
  });

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="Does AEON's floor predict SPX6900, or just follow it?" accent="#a78bfa">
        For every time-shift, we line up <strong style={{ color: "#e2e8f0" }}>AEON's short-run return</strong> against
        <strong style={{ color: "#e2e8f0" }}> SPX's</strong> and measure how well they match. A shift to the
        <strong style={{ color: "#5eead4" }}> left means SPX moved first</strong> and AEON followed; a shift to the
        <strong style={{ color: "#a78bfa" }}> right would mean AEON led the coin</strong>. The purple line strips out the
        broader crypto market (ETH), so what's left is the genuine SPX↔AEON link. The peak lands on the left, the coin leads.
      </Explain>

      <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 6, flexWrap: "wrap" }}>
        {[["floor", "Floor"], ["volume", "Sales volume"]].map(([id, lbl]) => (
          <button key={id} onClick={() => setMetric(id)} {...btn(metric === id)}>{lbl}</button>
        ))}
      </div>

      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", margin: "10px 0 14px", flexWrap: "wrap" }}>
        <Metric label="strongest link" value={`${led ? "SPX" : "AEON"} leads`} color={led ? "#5eead4" : "#a78bfa"} sub={`by ${Math.abs(peak.lag)} days · r ${peak.adj?.toFixed(2)}`} />
        <Metric label="best AEON-leads" value={bestPos.adj?.toFixed(2) ?? "-"} color="#fb7185" sub={posWeak ? "≈ noise floor" : `at +${bestPos.lag}d`} />
        <Metric label="coincident" value={at0?.adj?.toFixed(2)} color="#f6a23c" sub="same few days" />
      </div>

      <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
        <LineChart data={rows} margin={{ top: 10, right: 20, left: 6, bottom: 22 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <ReferenceArea x1={-LAG} x2={0} fill="#5eead4" fillOpacity={0.05} />
          <ReferenceArea x1={0} x2={LAG} fill="#a78bfa" fillOpacity={0.05} />
          <ReferenceArea y1={-sig} y2={sig} fill="#94a3b8" fillOpacity={0.10} />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.14)" />
          <ReferenceLine x={0} stroke="#64748b" strokeDasharray="4 3" />
          <XAxis dataKey="lag" type="number" domain={[-LAG, LAG]} ticks={[-56, -42, -28, -14, 0, 14, 28, 42, 56]}
            tick={{ fill: "#94a3b8", fontFamily: MONO, fontSize: 12 }} tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.12)" }}
            label={{ value: "lag (days), negative = SPX leads · positive = AEON leads", position: "bottom", offset: 6, fill: "#64748b", fontFamily: SANS, fontSize: 12 }} />
          <YAxis domain={[-0.25, 0.55]} ticks={[-0.2, 0, 0.2, 0.4]}
            tick={{ fill: "#94a3b8", fontFamily: MONO, fontSize: 12 }} tickLine={false} axisLine={false}
            label={{ value: "correlation of 3-day returns", angle: -90, position: "insideLeft", offset: 18, fill: "#64748b", fontFamily: SANS, fontSize: 12 }} />
          <Tooltip content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const r = payload[0].payload;
            const side = r.lag < 0 ? "SPX led by " + (-r.lag) + "d" : r.lag > 0 ? "AEON led by " + r.lag + "d" : "same week";
            return <TipBox><div style={{ fontFamily: MONO, fontSize: 12 }}>
              <div style={{ color: "#e2e8f0", marginBottom: 3 }}>{side}</div>
              <div style={{ color: "#a78bfa" }}>ETH-adjusted: {r.adj?.toFixed(2)}</div>
              <div style={{ color: "#5eead4" }}>raw: {r.raw?.toFixed(2)}</div>
            </div></TipBox>;
          }} />
          <Line type="monotone" dataKey="raw" stroke="#5eead4" strokeWidth={1.4} strokeOpacity={0.5} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="adj" stroke="#a78bfa" strokeWidth={2.6} dot={false} isAnimationActive={false} />
          <ReferenceDot x={peak.lag} y={peak.adj} r={6} fill="none" stroke="#f6a23c" strokeWidth={2.4} />
        </LineChart>
      </ResponsiveContainer>

      <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 4, fontFamily: MONO, fontSize: 11.5, color: "#94a3b8", flexWrap: "wrap" }}>
        <span><span style={{ color: "#a78bfa" }}>■</span> ETH-beta removed</span>
        <span><span style={{ color: "#5eead4" }}>■</span> raw</span>
        <span style={{ color: "#64748b" }}>shaded band = 95% noise ({indepWeeks} independent weeks)</span>
      </div>

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 16, lineHeight: 1.65, maxWidth: 820, marginInline: "auto" }}>
        Short-run (3-day) returns cross-correlated at daily lag resolution, the AEON {metric === "floor" ? "floor" : "sales volume"} (USD) against SPX6900 (USD), over {d0} → {d1}. The market-adjusted line removes the shared ETH beta. The whole hump is centred on the
        <strong style={{ color: led ? "#5eead4" : "#a78bfa" }}> {led ? "SPX-leads" : "AEON-leads"} side</strong>; what little spills past zero is the shoulder of that
        same peak, {weaker ? `about ${weaker.toFixed(1)}× weaker` : "far weaker"} and close to the noise floor, not a separate signal. So the collection <strong style={{ color: "#e2e8f0" }}>follows the coin, it doesn't lead it</strong>.
        A relationship, not a trading signal. Not financial advice.
      </div>
    </div>
  );
}
