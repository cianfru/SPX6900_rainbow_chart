import { useState, useMemo, useCallback } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, ReferenceLine
} from "recharts";
import { RAW, D0 } from "./data.js";
import {
  MODELS, BAND_LABELS, TARGETS,
  dayN, ds, bandVal, bandIndex,
  whenHitsCenter, whenHitsBand,
} from "./models.js";

const mono = "'JetBrains Mono', monospace";

const fP = v => {
  if (v == null) return "";
  if (v >= 10000) return "$" + (v / 1000).toFixed(0) + "k";
  if (v >= 1000) return "$" + v.toFixed(0);
  if (v >= 1) return "$" + v.toFixed(2);
  if (v >= 0.01) return "$" + v.toFixed(3);
  if (v >= 0.001) return "$" + v.toFixed(4);
  return "$" + v.toExponential(1);
};

const fT = v => {
  if (v >= 1000) return "$" + (v / 1000).toFixed(0) + "k";
  if (v >= 1) return "$" + v.toFixed(0);
  if (v >= 0.01) return "$" + v.toFixed(2);
  return "$" + v.toFixed(3);
};

const fD = s => new Date(s).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
const fW = w => w ? w.dt.toLocaleDateString("en-US", { month: "short", year: "numeric" }) : ">50 yr";

function Tip({ active, payload, model }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  const day = dayN(d.date);
  const m = model;
  const proj = d.price == null;
  const bi = d.price != null ? bandIndex(m, d.price, day) : null;
  const center = Math.exp(m.predict(day));
  const sellLine = Math.exp(m.predict(day) + m.bands[8]);
  const fireLine = Math.exp(m.predict(day) + m.bands[0]);

  return (
    <div style={{
      background: "rgba(4,4,12,0.97)", border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 8, padding: "10px 14px", fontFamily: mono, fontSize: 11,
      color: "#94a3b8", lineHeight: 1.7, maxWidth: 260, backdropFilter: "blur(8px)"
    }}>
      <div style={{ fontWeight: 700, color: "#f1f5f9", fontSize: 12, marginBottom: 2 }}>
        {new Date(d.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        {proj && <span style={{ color: "#475569", fontWeight: 400 }}> · projected</span>}
      </div>
      {d.price != null && (
        <>
          <div>Price: <span style={{ color: "#f8fafc", fontWeight: 600 }}>{fP(d.price)}</span></div>
          <div>Band: <span style={{ color: BAND_LABELS[bi].c, fontWeight: 600 }}>{BAND_LABELS[bi].l}</span></div>
        </>
      )}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: 4, paddingTop: 4, fontSize: 10 }}>
        <div>Center: {fP(center)}</div>
        <div style={{ color: "#dc2626" }}>SELL (p98): {fP(sellLine)}</div>
        <div style={{ color: "#6366f1" }}>Fire (p2): {fP(fireLine)}</div>
        <div style={{ color: "#475569", fontSize: 9, marginTop: 2 }}>Day {day}</div>
      </div>
    </div>
  );
}

function ModelCard({ mod, selected, onClick }) {
  return (
    <button onClick={onClick} style={{
      fontFamily: mono, fontSize: 10, padding: "8px 12px", borderRadius: 6, cursor: "pointer",
      border: selected ? "1px solid rgba(139,92,246,0.5)" : "1px solid rgba(255,255,255,0.06)",
      background: selected ? "rgba(139,92,246,0.08)" : "rgba(255,255,255,0.02)",
      color: selected ? "#c4b5fd" : "#64748b", textAlign: "left",
      transition: "all 0.15s ease",
    }}>
      <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 1 }}>{mod.name}</div>
      <div style={{ opacity: 0.65, fontSize: 9 }}>{mod.desc}</div>
      <div style={{ opacity: 0.4, fontSize: 9, marginTop: 2 }}>
        R²={mod.r2.toFixed(3)} · {mod.bandType === "percentile" ? "percentile bands" : "σ bands"}
      </div>
    </button>
  );
}

export default function App() {
  const [mk, setMk] = useState("logquad");
  const [hi, setHi] = useState(1);
  const [tg, setTg] = useState(new Set([0, 1, 2]));
  const [showAbout, setShowAbout] = useState(false);
  const HZ = [{ l: "5Y", y: 5 }, { l: "10Y", y: 10 }, { l: "15Y", y: 15 }];

  const m = MODELS[mk];
  const endDay = Math.round(HZ[hi].y * 365.25);
  const tt = useCallback(i => setTg(p => {
    const n = new Set(p);
    n.has(i) ? n.delete(i) : n.add(i);
    return n;
  }), []);

  const data = useMemo(() => {
    const pts = RAW.map(d => {
      const day = dayN(d.date);
      const e = { date: d.date, price: d.price };
      for (let i = 0; i < 9; i++) {
        e[`b${i}`] = [bandVal(m, day, i), bandVal(m, day, i + 1)];
      }
      e.reg = Math.exp(m.predict(day));
      return e;
    });
    const lastDay = dayN(RAW[RAW.length - 1].date);
    const step = 6;
    for (let d = lastDay + step; d <= endDay; d += step) {
      const e = { date: ds(d), price: null };
      for (let i = 0; i < 9; i++) {
        e[`b${i}`] = [bandVal(m, d, i), bandVal(m, d, i + 1)];
      }
      e.reg = Math.exp(m.predict(d));
      pts.push(e);
    }
    return pts;
  }, [m, endDay]);

  const last = RAW[RAW.length - 1];
  const ld = dayN(last.date);
  const cb = BAND_LABELS[bandIndex(m, last.price, ld)];

  let yMax = 0;
  data.forEach(d => {
    const t = bandVal(m, dayN(d.date), 9);
    if (t > yMax) yMax = t;
  });
  tg.forEach(i => { if (TARGETS[i].price > yMax) yMax = TARGETS[i].price; });
  yMax *= 1.3;
  const yMin = 0.0003;
  const logT = [0.001, 0.01, 0.1, 1, 10, 100, 1000, 10000, 100000].filter(v => v >= yMin * 0.5 && v <= yMax * 2);

  const xT = useMemo(() => {
    const t = [], s = new Set(), iv = endDay > 3000 ? 12 : 6;
    data.forEach(d => {
      const dt = new Date(d.date);
      if (dt.getMonth() % iv === 0) {
        const k = `${dt.getFullYear()}-${Math.floor(dt.getMonth() / iv)}`;
        if (!s.has(k)) { s.add(k); t.push(d.date); }
      }
    });
    return t;
  }, [data, endDay]);

  const ms = useMemo(() => TARGETS.filter((_, i) => tg.has(i)).map(t => ({
    ...t,
    sell: whenHitsBand(m, t.price, 8),
    center: whenHitsCenter(m, t.price),
    fire: whenHitsBand(m, t.price, 0),
  })), [m, tg]);

  return (
    <div style={{
      width: "100%", minHeight: "100vh", background: "#020208",
      fontFamily: "'Inter', system-ui, sans-serif", color: "#e2e8f0",
      padding: "20px 12px 32px",
    }}>
      {/* Header */}
      <div style={{ maxWidth: 1200, margin: "0 auto 16px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <h1 style={{
            fontFamily: mono, fontSize: 22, fontWeight: 700, margin: 0,
            background: "linear-gradient(90deg,#6366f1,#3b82f6,#06b6d4,#22c55e,#84cc16,#f59e0b,#ea580c,#dc2626,#8b0000)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>
            SPX6900 Rainbow Chart
          </h1>
          <button onClick={() => setShowAbout(!showAbout)} style={{
            fontFamily: mono, fontSize: 9, padding: "3px 8px", borderRadius: 4, cursor: "pointer",
            border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)",
            color: "#64748b",
          }}>
            {showAbout ? "Hide" : "About"}
          </button>
        </div>
        <div style={{ fontFamily: mono, fontSize: 10, color: "#334155", letterSpacing: 0.8, marginTop: 2 }}>
          LOGARITHMIC REGRESSION · {m.name.toUpperCase()} · R²={m.r2.toFixed(3)}
          {m.bandType === "percentile" ? " · ASYMMETRIC PERCENTILE BANDS" : " · SYMMETRIC σ BANDS"}
        </div>
      </div>

      {/* About panel */}
      {showAbout && (
        <div style={{
          maxWidth: 1200, margin: "0 auto 12px", padding: "14px 18px",
          background: "rgba(99, 102, 241, 0.04)", border: "1px solid rgba(99, 102, 241, 0.15)",
          borderRadius: 8, fontFamily: "'Inter', system-ui, sans-serif", fontSize: 12,
          color: "#94a3b8", lineHeight: 1.7,
        }}>
          <div style={{ fontWeight: 700, color: "#c4b5fd", marginBottom: 6, fontSize: 13 }}>How It Works</div>
          <p style={{ marginBottom: 8 }}>
            This chart fits a <strong style={{ color: "#e2e8f0" }}>logarithmic regression model</strong> to
            SPX6900 price data, similar to Bitcoin&apos;s famous rainbow chart. The colored bands represent
            statistical zones — from &quot;Fire Sale&quot; (historically cheap) to &quot;Max Bubble&quot; (historically expensive).
          </p>
          <div style={{ fontWeight: 600, color: "#94a3b8", marginBottom: 4, fontSize: 11 }}>Model Improvements</div>
          <ul style={{ paddingLeft: 18, marginBottom: 8, fontSize: 11 }}>
            <li><strong style={{ color: "#c4b5fd" }}>Log-Quadratic:</strong> Adds curvature (ln²) to capture the S-shape inflection that memecoins exhibit.</li>
            <li><strong style={{ color: "#c4b5fd" }}>Weighted Recent:</strong> Exponential weighting gives recent data ~20× more influence than early noise.</li>
            <li><strong style={{ color: "#c4b5fd" }}>Asymmetric Bands:</strong> Uses actual percentiles (p2, p7, p16... p98) instead of symmetric σ, producing wider tops during bubble phases.</li>
            <li><strong style={{ color: "#c4b5fd" }}>Offset Power Law:</strong> Virtual origin at ~Nov 2022 gives the best simple linear fit in log-log space.</li>
          </ul>
          <p style={{ fontSize: 10, color: "#475569" }}>
            All models are fit at build time using weighted least squares — no external ML libraries needed.
            Supply: ~939M. Data source: CoinGecko.
          </p>
        </div>
      )}

      {/* Model selector */}
      <div style={{ maxWidth: 1200, margin: "0 auto 10px", display: "flex", gap: 6, flexWrap: "wrap" }}>
        {Object.values(MODELS).map(mod => (
          <ModelCard key={mod.key} mod={mod} selected={mod.key === mk} onClick={() => setMk(mod.key)} />
        ))}
      </div>

      {/* Controls */}
      <div style={{ maxWidth: 1200, margin: "0 auto 10px", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{
          display: "flex", background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.06)", borderRadius: 5, overflow: "hidden",
        }}>
          {HZ.map((h, i) => (
            <button key={i} onClick={() => setHi(i)} style={{
              fontFamily: mono, fontSize: 10, padding: "5px 13px", border: "none", cursor: "pointer",
              background: i === hi ? "rgba(59,130,246,0.12)" : "transparent",
              color: i === hi ? "#93c5fd" : "#475569",
              borderRight: i < 2 ? "1px solid rgba(255,255,255,0.04)" : "none",
              transition: "all 0.15s ease",
            }}>{h.l}</button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {TARGETS.map((t, i) => (
            <button key={i} onClick={() => tt(i)} style={{
              fontFamily: mono, fontSize: 9, padding: "4px 8px", borderRadius: 4, cursor: "pointer",
              border: `1px solid ${tg.has(i) ? t.c + "70" : "rgba(255,255,255,0.05)"}`,
              background: tg.has(i) ? t.c + "12" : "transparent",
              color: tg.has(i) ? t.c : "#334155",
              transition: "all 0.15s ease",
            }}>{t.label} <span style={{ opacity: 0.5 }}>{t.mc}</span></button>
          ))}
        </div>

        <div style={{
          fontFamily: mono, fontSize: 10, color: "#94a3b8", padding: "4px 10px",
          background: "rgba(255,255,255,0.03)", borderRadius: 4,
          border: "1px solid rgba(255,255,255,0.06)",
        }}>
          <span style={{ color: cb.c, fontSize: 14 }}>●</span> {fP(last.price)} · <span style={{ color: cb.c }}>{cb.l}</span>
        </div>
      </div>

      {/* Chart */}
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <ResponsiveContainer width="100%" height={500}>
          <ComposedChart data={data} margin={{ top: 8, right: 48, bottom: 16, left: 4 }}>
            <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.025)" vertical={false} />
            <XAxis
              dataKey="date" ticks={xT} tickFormatter={fD}
              tick={{ fill: "#1e293b", fontSize: 9, fontFamily: mono }}
              axisLine={{ stroke: "rgba(255,255,255,0.04)" }} tickLine={false}
            />
            <YAxis
              scale="log" domain={[yMin, yMax]} ticks={logT} tickFormatter={fT}
              tick={{ fill: "#1e293b", fontSize: 9, fontFamily: mono }}
              axisLine={{ stroke: "rgba(255,255,255,0.04)" }} tickLine={false} width={50}
            />
            <Tooltip content={<Tip model={m} />} />

            {Array.from({ length: 9 }).map((_, i) => (
              <Area
                key={`b${i}`} dataKey={`b${i}`} fill={BAND_LABELS[i].c}
                fillOpacity={0.2} stroke="none" isAnimationActive={false} activeDot={false}
              />
            ))}

            {TARGETS.map((t, i) => tg.has(i) && t.price <= yMax ? (
              <ReferenceLine
                key={`tgt${i}`} y={t.price} stroke={t.c}
                strokeDasharray="5 3" strokeWidth={1} strokeOpacity={0.5}
                label={{
                  value: `${t.label}  ${t.mc}`, position: "right",
                  fill: t.c, fontSize: 9, fontFamily: mono, fontWeight: 600,
                }}
              />
            ) : null)}

            <ReferenceLine
              x={last.date} stroke="rgba(255,255,255,0.08)" strokeDasharray="2 3"
              label={{ value: "NOW", position: "top", fill: "#334155", fontSize: 8, fontFamily: mono }}
            />

            <Line
              dataKey="reg" stroke="rgba(255,255,255,0.15)" strokeWidth={1}
              strokeDasharray="3 5" dot={false} isAnimationActive={false} activeDot={false}
            />
            <Line
              dataKey="price" stroke="#ffffff" strokeWidth={2.5} dot={false}
              isAnimationActive={false} connectNulls={false}
              activeDot={{ r: 3.5, fill: "#fff", stroke: cb.c, strokeWidth: 2 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Band legend */}
      <div style={{
        maxWidth: 1200, margin: "6px auto 0", display: "flex", justifyContent: "center",
        gap: "4px 14px", flexWrap: "wrap",
      }}>
        {[...BAND_LABELS].reverse().map((b, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 4,
            fontFamily: mono, fontSize: 9, color: "#475569",
          }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: b.c, opacity: 0.55 }} />
            {b.l}
          </div>
        ))}
      </div>

      {/* Milestones */}
      {ms.length > 0 && (
        <div style={{ maxWidth: 1200, margin: "18px auto 0" }}>
          <div style={{
            fontFamily: mono, fontSize: 10, color: "#334155", marginBottom: 6,
            letterSpacing: 1, textTransform: "uppercase",
          }}>
            Target Timeline — {m.name}
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: `repeat(${Math.min(ms.length, 5)}, 1fr)`,
            gap: 6,
          }}>
            {ms.map((t, i) => (
              <div key={i} style={{
                background: `${t.c}08`, border: `1px solid ${t.c}20`,
                borderRadius: 8, padding: "10px 12px", fontFamily: mono,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: t.c }}>{t.label}</span>
                  <span style={{ fontSize: 9, color: "#475569" }}>{t.mc}</span>
                </div>
                <div style={{ fontSize: 10, color: "#64748b", lineHeight: 2.0 }}>
                  {[
                    ["▲", "#dc2626", "SELL", t.sell],
                    ["●", "#f59e0b", "Center", t.center],
                    ["▼", "#6366f1", "Fire", t.fire],
                  ].map(([icon, ic, lab, w], j) => (
                    <div key={j} style={{ display: "flex", justifyContent: "space-between" }}>
                      <span><span style={{ color: ic }}>{icon}</span> {lab}</span>
                      <span style={{ color: "#cbd5e1", fontWeight: 600 }}>{fW(w)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Model details footer */}
      <div style={{ maxWidth: 1200, margin: "14px auto 0", display: "flex", gap: 6, flexWrap: "wrap" }}>
        <div style={{
          flex: "1 1 500px", padding: "10px 14px",
          background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.04)",
          borderRadius: 6, fontFamily: mono, fontSize: 10, color: "#334155", lineHeight: 1.7,
        }}>
          <span style={{ color: "#475569", fontWeight: 600 }}>{m.name}:</span> {m.formula} · R²={m.r2.toFixed(4)} σ={m.std.toFixed(4)}
          <br /><span style={{ color: "#1e293b" }}>{m.note}</span>
        </div>
      </div>

      <div style={{
        maxWidth: 1200, margin: "8px auto 0", fontFamily: mono, fontSize: 9,
        color: "#1e293b", textAlign: "center", lineHeight: 1.6,
      }}>
        Single-cycle fit on a memecoin. Not financial advice. Supply ~939M. Data: CoinGecko.
      </div>
    </div>
  );
}
