// Interactive SPX6900-vs-Bitcoin analog explorer (hidden route #btc-explorer).
// Drag three knobs — shift (which BTC date = today), time-scale, and beta
// (amplitude/maturity) — and watch the overlay, live correlation, and the
// forward projection update. Anchored at SPX's price today. Illustrative only.
import { useState, useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine, Tooltip,
} from "recharts";
import { DEFAULT_RAW } from "./data.js";
import { BTC_HISTORY, BTC_FIRST_DATE } from "./btc-history.js";

const DAY = 86400000, YR = 365.25;
const SPX0 = new Date(DEFAULT_RAW[0].date).getTime();
const spxPts = DEFAULT_RAW.map(r => ({ age: Math.round((new Date(r.date).getTime() - SPX0) / DAY), ln: Math.log(r.price) }));
const spxMaxAge = spxPts.at(-1).age;
const spxNow = DEFAULT_RAW.at(-1).price;
const btcMaxAge = BTC_HISTORY.at(-1)[0];
const BTC0 = new Date(BTC_FIRST_DATE).getTime();

const interp = (pts, getA, getV, a) => {
  if (a <= getA(pts[0])) return getV(pts[0]);
  if (a >= getA(pts.at(-1))) return getV(pts.at(-1));
  let lo = 0, hi = pts.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (getA(pts[m]) <= a) lo = m; else hi = m; }
  const f = (a - getA(pts[lo])) / (getA(pts[hi]) - getA(pts[lo]) || 1);
  return getV(pts[lo]) + (getV(pts[hi]) - getV(pts[lo])) * f;
};
const spxLnAt = a => interp(spxPts, p => p.age, p => p.ln, a);
const btcLnAt = a => interp(BTC_HISTORY, p => p[0], p => Math.log(p[1]), a);
const fmtDate = days => new Date(BTC0 + days * DAY).toISOString().slice(0, 10);
const fmtP = p => p >= 1 ? "$" + p.toFixed(2) : "$" + p.toFixed(4);

const PRESETS = [
  { name: "2019–22 cycle (best fit)", shift: 3395, scale: 1.0, beta: 3.0 },
  { name: "2019–22, beta→2", shift: 3395, scale: 1.0, beta: 2.0 },
  { name: "Genesis 2010 (raw)", shift: 0, scale: 1.0, beta: 1.0 },
  { name: "Genesis, −125d", shift: -125, scale: 1.0, beta: 1.0 },
];

function Slider({ label, value, set, min, max, step, fmt }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", color: "#94a3b8", fontSize: 13, fontFamily: "var(--mono)" }}>
        <span>{label}</span><span style={{ color: "#e2e8f0" }}>{fmt ? fmt(value) : value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => set(+e.target.value)} style={{ width: "100%", accentColor: "#4ade80" }} />
    </div>
  );
}

export default function BtcAnalogExplorer() {
  const [shift, setShift] = useState(3395);
  const [scale, setScale] = useState(1.0);
  const [beta, setBeta] = useState(3.0);
  const [fut, setFut] = useState(6.5);

  const { data, stats } = useMemo(() => {
    const btcDay = age => shift + age * scale;
    const btcNowDay = btcDay(spxMaxAge);
    const lnBtcNow = btcLnAt(btcNowDay);
    const lnSpxNow = Math.log(spxNow);
    const proj = age => Math.exp(lnSpxNow + beta * (btcLnAt(btcDay(age)) - lnBtcNow));

    // correlation over SPX's actual points
    const xs = [], ys = [];
    for (const p of spxPts) { const bd = btcDay(p.age); if (bd >= 0 && bd <= btcMaxAge) { xs.push(p.ln); ys.push(btcLnAt(bd)); } }
    let r = NaN;
    if (xs.length > 5) { const n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; } r = sxy / Math.sqrt(sxx * syy); }

    const futCap = fut * YR;
    const ages = [];
    for (let a = 0; a <= futCap; a += 7) ages.push(a);
    if (!ages.includes(spxMaxAge)) { ages.push(spxMaxAge); ages.sort((p, q) => p - q); }
    const data = ages.map(age => {
      const bd = btcDay(age);
      const validBtc = bd >= 0 && bd <= btcMaxAge;
      const pv = validBtc ? proj(age) : null;
      return {
        x: +(age / YR).toFixed(3),
        spx: age <= spxMaxAge ? Math.exp(spxLnAt(age)) : null,
        btcPast: validBtc && age <= spxMaxAge ? pv : null,
        btcFut: validBtc && age >= spxMaxAge ? pv : null,
      };
    });

    // projection peak/bottom in the future leg
    let peak = { p: 0, age: 0 };
    for (const age of ages) { if (age <= spxMaxAge) continue; const bd = btcDay(age); if (bd < 0 || bd > btcMaxAge) continue; const pv = proj(age); if (pv > peak.p) peak = { p: pv, age }; }
    let bottom = { p: Infinity, age: 0 };
    for (const age of ages) { if (age <= spxMaxAge || age >= peak.age) continue; const bd = btcDay(age); if (bd < 0 || bd > btcMaxAge) continue; const pv = proj(age); if (pv < bottom.p) bottom = { p: pv, age }; }

    return { data, stats: { r, btcNowDay, peak, bottom, lnBtcNow } };
  }, [shift, scale, beta, fut]);

  const vals = data.flatMap(d => [d.spx, d.btcPast, d.btcFut].filter(v => v != null));
  const yMin = Math.min(...vals) * 0.8, yMax = Math.max(...vals) * 1.3;
  const todayX = +(spxMaxAge / YR).toFixed(3);
  const moFromNow = age => Math.round((age - spxMaxAge) / 30.44);

  return (
    <div style={{ background: "#020208", color: "#e2e8f0", minHeight: "100vh", padding: "28px 22px", fontFamily: "var(--sans)" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <h1 style={{ fontSize: 26, margin: "0 0 4px" }}>SPX6900 × Bitcoin — analog explorer</h1>
        <p style={{ color: "#475569", fontSize: 14, margin: "0 0 20px" }}>
          Drag the knobs to align SPX against any slice of BTC history, then read the projected path. Anchored at SPX's price today.
          <b style={{ color: "#64748b" }}> Illustrative — not a forecast.</b>
        </p>

        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 300px", minWidth: 280 }}>
            <Slider label="Shift — which BTC date = SPX's first day" value={shift} set={setShift} min={-300} max={5400} step={25}
              fmt={v => `${v}d (${fmtDate(v)})`} />
            <Slider label="Time-scale (BTC days per SPX day)" value={scale} set={setScale} min={0.5} max={2.5} step={0.05}
              fmt={v => `${v.toFixed(2)}×`} />
            <Slider label="Beta — SPX amplitude vs BTC (maturity)" value={beta} set={setBeta} min={0.5} max={3.5} step={0.1}
              fmt={v => `${v.toFixed(1)}×`} />
            <Slider label="Show ahead" value={fut} set={setFut} min={3} max={7} step={0.5} fmt={v => `${v}y`} />

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
              {PRESETS.map(p => (
                <button key={p.name} onClick={() => { setShift(p.shift); setScale(p.scale); setBeta(p.beta); }}
                  style={{ fontSize: 12, padding: "6px 10px", background: "rgba(255,255,255,0.04)", color: "#94a3b8", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, cursor: "pointer" }}>
                  {p.name}
                </button>
              ))}
            </div>

            <div style={{ marginTop: 20, padding: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, fontFamily: "var(--mono)", fontSize: 14, lineHeight: 1.9 }}>
              <div>fit <b style={{ color: stats.r > 0.85 ? "#4ade80" : stats.r > 0.6 ? "#fbbf24" : "#f87171" }}>r = {isNaN(stats.r) ? "—" : stats.r.toFixed(3)}</b></div>
              <div style={{ color: "#94a3b8" }}>today ≈ BTC <b style={{ color: "#e2e8f0" }}>{fmtDate(stats.btcNowDay)}</b> ({fmtP(Math.exp(stats.lnBtcNow))})</div>
              {stats.bottom.p < Infinity && <div style={{ color: "#94a3b8" }}>↓ projected bottom <b style={{ color: "#f87171" }}>{fmtP(stats.bottom.p)}</b> (+{moFromNow(stats.bottom.age)}mo)</div>}
              {stats.peak.p > 0 && <div style={{ color: "#94a3b8" }}>↑ projected peak <b style={{ color: "#4ade80" }}>{fmtP(stats.peak.p)}</b> ({(stats.peak.p / spxNow).toFixed(0)}×, +{moFromNow(stats.peak.age)}mo)</div>}
            </div>
          </div>

          <div style={{ flex: "2 1 560px", minWidth: 340, height: 460 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 10, right: 16, bottom: 6, left: 4 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="x" type="number" domain={[0, +(fut).toFixed(1)]} tickFormatter={v => `${v}y`} stroke="#475569" tick={{ fontSize: 12 }} />
                <YAxis scale="log" domain={[yMin, yMax]} tickFormatter={v => v >= 1 ? `$${v}` : `$${v}`} stroke="#475569" tick={{ fontSize: 12 }} width={62} />
                <Tooltip contentStyle={{ background: "#0a0a14", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                  formatter={(v, n) => [v == null ? "—" : fmtP(v), n]} labelFormatter={l => `${l}y`} />
                <ReferenceLine x={todayX} stroke="#64748b" strokeDasharray="4 5" label={{ value: "TODAY", fill: "#94a3b8", fontSize: 12, position: "top" }} />
                <Line dataKey="btcPast" stroke="#f7931a" strokeOpacity={0.4} strokeWidth={2} dot={false} isAnimationActive={false} name="BTC analog (fit)" connectNulls />
                <Line dataKey="btcFut" stroke="#f7931a" strokeWidth={2.5} strokeDasharray="7 6" dot={false} isAnimationActive={false} name="BTC analog (ahead)" connectNulls />
                <Line dataKey="spx" stroke="#4ade80" strokeWidth={2.6} dot={false} isAnimationActive={false} name="SPX6900 (actual)" connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
            <p style={{ color: "#334155", fontSize: 12, textAlign: "center", marginTop: 6 }}>
              green = SPX actual · orange = BTC analog (dashed = projected ahead) · log scale · NOT financial advice
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
