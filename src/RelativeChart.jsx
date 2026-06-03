import { useState, useEffect, useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { fetchMajors } from "./data.js";
import { buildModel, bandVal, bandIndex, BAND_LABELS, dayN } from "./models.js";

const SANS = "'Space Grotesk', system-ui, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";
const MAX_W = 1400;
const fMon = ts => new Date(ts).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
const fR = v => {
  if (v == null) return "";
  if (v >= 100) return v.toFixed(0);
  if (v >= 1) return v.toFixed(2);
  if (v >= 0.01) return v.toFixed(3);
  return v.toExponential(1);
};

// nearest asset price on/before a date
function makeLookup(asset) {
  const sorted = [...asset].sort((a, b) => a.date.localeCompare(b.date));
  const dates = sorted.map(a => a.date);
  return d => {
    let lo = 0, hi = dates.length - 1, ans = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (dates[m] <= d) { ans = m; lo = m + 1; } else hi = m - 1; }
    return ans >= 0 ? sorted[ans].price : null;
  };
}

function alignRatio(spx, asset) {
  const at = makeLookup(asset);
  const out = [];
  for (const s of spx) {
    const p = at(s.date);
    if (p > 0) out.push({ date: s.date, price: s.price / p });
  }
  return out;
}

// SPX performance vs an equal-weight basket of the majors, both rebased to the first common date.
function alignBasket(spx, majors) {
  const syms = Object.keys(majors);
  const lookups = syms.map(k => makeLookup(majors[k]));
  const out = [];
  let baseSpx = null;
  const baseAsset = [];
  for (const s of spx) {
    const vals = lookups.map(fn => fn(s.date));
    if (vals.some(v => !v || v <= 0)) continue;
    if (baseSpx == null) {
      baseSpx = s.price;
      vals.forEach((v, i) => { baseAsset[i] = v; });
    }
    const basketNorm = vals.reduce((sum, v, i) => sum + v / baseAsset[i], 0) / syms.length;
    out.push({ date: s.date, price: (s.price / baseSpx) / basketNorm });
  }
  return out;
}

function RatioTip({ active, payload, label, unit }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  if (d.ratio == null) return null;
  const bl = BAND_LABELS[d.band];
  return (
    <div style={{
      background: "rgba(4,4,12,0.97)", border: `1px solid ${bl.c}80`, borderRadius: 10,
      padding: "11px 14px", fontFamily: SANS, fontSize: 13, color: "#cbd5e1",
    }}>
      <div style={{ fontFamily: MONO, fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>
        {new Date(label).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 700, color: "#f8fafc" }}>{fR(d.ratio)} {unit}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: bl.c, marginTop: 2 }}>● {bl.l}</div>
    </div>
  );
}

const OPTIONS = [
  ["BTC", "vs BTC", "BTC"],
  ["ETH", "vs ETH", "ETH"],
  ["SOL", "vs SOL", "SOL"],
  ["BASKET", "vs Majors", "×"],
];

export default function RelativeChart({ series, isMobile }) {
  const [majors, setMajors] = useState(null);
  const [status, setStatus] = useState("loading");
  const [which, setWhich] = useState("BTC");

  useEffect(() => {
    let cancelled = false;
    fetchMajors()
      .then(p => { if (!cancelled) { setMajors(p); setStatus("ok"); } })
      .catch(e => { if (!cancelled) setStatus(e.message || "failed"); });
    return () => { cancelled = true; };
  }, []);

  const ratioSeries = useMemo(() => {
    if (!majors) return [];
    if (which === "BASKET") return alignBasket(series, majors);
    return majors[which] ? alignRatio(series, majors[which]) : [];
  }, [series, majors, which]);

  const fit = useMemo(() => (ratioSeries.length > 20 ? buildModel(ratioSeries) : null), [ratioSeries]);

  const data = useMemo(() => {
    if (!fit) return [];
    return ratioSeries.map(d => {
      const day = dayN(d.date);
      const e = { date: d.date, ts: new Date(d.date).getTime(), ratio: d.price, band: bandIndex(fit, d.price, day) };
      for (let i = 0; i < 9; i++) e["b" + i] = [bandVal(fit, day, i), bandVal(fit, day, i + 1)];
      return e;
    });
  }, [fit, ratioSeries]);

  const cur = data.length ? data[data.length - 1] : null;
  const bl = cur ? BAND_LABELS[cur.band] : null;
  const opt = OPTIONS.find(o => o[0] === which);
  const unit = opt ? opt[2] : "";

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "center", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {OPTIONS.map(([id, lbl]) => (
          <button key={id} onClick={() => setWhich(id)} style={{
            fontFamily: SANS, fontSize: 13, fontWeight: 600, padding: "7px 14px", borderRadius: 7, cursor: "pointer",
            border: `1px solid ${which === id ? "rgba(99,102,241,0.5)" : "rgba(255,255,255,0.1)"}`,
            background: which === id ? "rgba(99,102,241,0.16)" : "transparent",
            color: which === id ? "#c7d2fe" : "#94a3b8",
          }}>{lbl}</button>
        ))}
      </div>

      {status === "loading" && <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 40 }}>Loading majors…</div>}
      {status !== "loading" && status !== "ok" && <div style={{ textAlign: "center", fontFamily: SANS, color: "#f87171", padding: 40 }}>Couldn&apos;t load data: {status}</div>}

      {status === "ok" && cur && bl && (
        <>
          <div style={{ textAlign: "center", marginBottom: 14 }}>
            <div style={{ fontFamily: MONO, fontSize: 12, color: "#94a3b8", letterSpacing: 1.2 }}>
              SPX6900 {opt[1].toUpperCase()} — RAINBOW VALUATION
            </div>
            <div style={{ fontFamily: SANS, fontSize: isMobile ? 24 : 32, fontWeight: 800, color: bl.c, textShadow: `0 0 22px ${bl.c}55` }}>
              {bl.l}
            </div>
            <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", marginTop: 2 }}>
              SPX6900 is historically {cur.band <= 3 ? "cheap" : cur.band >= 5 ? "expensive" : "fairly valued"} {opt[1]}
            </div>
          </div>

          <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
            <ComposedChart data={data} margin={{ top: 10, right: isMobile ? 14 : 30, bottom: 24, left: isMobile ? 0 : 12 }}>
              <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.07)" vertical={false} />
              <XAxis
                dataKey="ts" type="number" scale="time" domain={["dataMin", "dataMax"]}
                tickFormatter={fMon} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
                axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} minTickGap={isMobile ? 40 : 30}
              />
              <YAxis
                scale="log" domain={["auto", "auto"]} tickFormatter={fR}
                tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
                axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 48 : 64}
              />
              <Tooltip content={<RatioTip unit={unit} />} />
              {Array.from({ length: 9 }).map((_, i) => (
                <Area key={`b${i}`} dataKey={`b${i}`} fill={BAND_LABELS[i].c} fillOpacity={0.38} stroke="none" isAnimationActive={false} activeDot={false} />
              ))}
              <Line dataKey="ratio" stroke="#ffffff" strokeWidth={2.5} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>

          <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.6 }}>
            SPX6900 priced in {which === "BASKET" ? "an equal-weight BTC/ETH/SOL basket" : which}, with its own logarithmic-regression rainbow.
            Blue = SPX historically cheap {opt[1]}; red = expensive. Something TradingView can&apos;t draw. Not financial advice.
          </div>
        </>
      )}
    </div>
  );
}
