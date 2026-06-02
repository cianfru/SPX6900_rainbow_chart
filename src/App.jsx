import { useState, useMemo, useCallback, useEffect } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, ReferenceLine
} from "recharts";
import { DEFAULT_RAW, fetchCoinGeckoData } from "./data.js";
import {
  buildModels, BAND_LABELS, TARGETS,
  dayN, ds, bandVal, bandIndex,
  whenHitsCenter, whenHitsBand,
} from "./models.js";
import HolderscanDashboard from "./HolderscanDashboard.jsx";

const SANS = "'Space Grotesk', system-ui, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, monospace";
const MAX_W = 1400;

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

// Market cap milestones: SPX price if it matched these market caps (supply 939M)
const CRYPTO_MILESTONES = [
  { price: 11.71,  label: "PEPE ATH MC",     mc: "$11B",  c: "#4ade80" },
  { price: 13.84,  label: "BTC @ $1K MC",    mc: "$13B",  c: "#f59e0b" },
  { price: 42.60,  label: "SHIB ATH MC",     mc: "$40B",  c: "#f43f5e" },
  { price: 94.57,  label: "DOGE ATH MC",     mc: "$89B",  c: "#c2a633" },
  { price: 197,    label: "BTC @ $10K MC",   mc: "$185B", c: "#fb923c" },
  { price: 2130,   label: "BTC @ $100K MC",  mc: "$2T",   c: "#f97316" },
];

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
      background: "rgba(4,4,12,0.97)", border: "1px solid rgba(255,255,255,0.18)",
      borderRadius: 10, padding: "14px 18px", fontFamily: SANS, fontSize: 14,
      color: "#cbd5e1", lineHeight: 1.7, maxWidth: 320, backdropFilter: "blur(8px)"
    }}>
      <div style={{ fontWeight: 700, color: "#f8fafc", fontSize: 15, marginBottom: 4 }}>
        {new Date(d.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        {proj && <span style={{ color: "#64748b", fontWeight: 400, fontSize: 13 }}> · projected</span>}
      </div>
      {d.price != null && (
        <>
          <div>Price: <span style={{ color: "#f8fafc", fontWeight: 700, fontFamily: MONO }}>{fP(d.price)}</span></div>
          <div>Band: <span style={{ color: BAND_LABELS[bi].c, fontWeight: 700 }}>{BAND_LABELS[bi].l}</span></div>
        </>
      )}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", marginTop: 6, paddingTop: 6, fontSize: 13 }}>
        <div>Center: <span style={{ fontFamily: MONO }}>{fP(center)}</span></div>
        <div style={{ color: "#dc2626" }}>SELL (p98): <span style={{ fontFamily: MONO }}>{fP(sellLine)}</span></div>
        <div style={{ color: "#6366f1" }}>Fire (p2): <span style={{ fontFamily: MONO }}>{fP(fireLine)}</span></div>
        <div style={{ color: "#64748b", fontSize: 12, marginTop: 3 }}>Day {day}</div>
      </div>
    </div>
  );
}

function ModelCard({ mod, selected, onClick }) {
  return (
    <button onClick={onClick} style={{
      fontFamily: SANS, fontSize: 14, padding: "12px 16px", borderRadius: 8, cursor: "pointer",
      border: selected ? "1px solid rgba(139,92,246,0.5)" : "1px solid rgba(255,255,255,0.12)",
      background: selected ? "rgba(139,92,246,0.1)" : "rgba(255,255,255,0.03)",
      color: selected ? "#c4b5fd" : "#e2e8f0", textAlign: "left",
      transition: "all 0.15s ease",
    }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 3 }}>{mod.name}</div>
      <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 4 }}>{mod.desc}</div>
      <div style={{ opacity: 0.55, fontSize: 11, fontFamily: MONO }}>
        R²={mod.r2.toFixed(3)} · {mod.bandType === "percentile" ? "percentile" : "σ"} bands
      </div>
    </button>
  );
}

export default function App() {
  const [rawData, setRawData] = useState(DEFAULT_RAW);
  const [dataStatus, setDataStatus] = useState(null);
  const [mk, setMk] = useState("logquad");
  const [hi, setHi] = useState(1);
  const [tg, setTg] = useState(new Set([0, 1, 2]));
  const [showAbout, setShowAbout] = useState(false);
  const [showMilestones, setShowMilestones] = useState(true);
  const HZ = [{ l: "5Y", y: 5 }, { l: "10Y", y: 10 }, { l: "15Y", y: 15 }];

  useEffect(() => {
    let cancelled = false;
    fetchCoinGeckoData().then(data => {
      if (!cancelled && data.length > 0) {
        setRawData(data);
        setDataStatus(`Live · ${data.length} points from CoinGecko`);
      }
    }).catch(() => {
      if (!cancelled) setDataStatus("Using bundled data (CoinGecko unavailable)");
    });
    return () => { cancelled = true; };
  }, []);

  const MODELS = useMemo(() => buildModels(rawData), [rawData]);
  const m = MODELS[mk];
  const endDay = Math.round(HZ[hi].y * 365.25);
  const tt = useCallback(i => setTg(p => {
    const n = new Set(p);
    n.has(i) ? n.delete(i) : n.add(i);
    return n;
  }), []);

  const handleFetchData = useCallback(async () => {
    setDataStatus("loading");
    try {
      const data = await fetchCoinGeckoData();
      if (data.length > rawData.length) {
        setRawData(data);
        setDataStatus(`Loaded ${data.length} data points from CoinGecko`);
      } else {
        setDataStatus(`CoinGecko returned ${data.length} points (current: ${rawData.length})`);
      }
    } catch (err) {
      setDataStatus(`Failed: ${err.message}. CoinGecko may require browser access.`);
    }
  }, [rawData.length]);

  const data = useMemo(() => {
    const firstDay = dayN(rawData[0].date);
    const leadStart = Math.max(1, firstDay - 60);
    const pts = [];
    for (let d = leadStart; d < firstDay; d += 3) {
      const e = { date: ds(d), price: null };
      for (let i = 0; i < 9; i++) {
        e[`b${i}`] = [bandVal(m, d, i), bandVal(m, d, i + 1)];
      }
      e.reg = Math.exp(m.predict(d));
      pts.push(e);
    }
    rawData.forEach(d => {
      const day = dayN(d.date);
      const e = { date: d.date, price: d.price };
      for (let i = 0; i < 9; i++) {
        e[`b${i}`] = [bandVal(m, day, i), bandVal(m, day, i + 1)];
      }
      e.reg = Math.exp(m.predict(day));
      pts.push(e);
    });
    const lastDay = dayN(rawData[rawData.length - 1].date);
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
  }, [m, endDay, rawData]);

  const last = rawData[rawData.length - 1];
  const ld = dayN(last.date);
  const cb = BAND_LABELS[bandIndex(m, last.price, ld)];

  let yMax = 0;
  data.forEach(d => {
    const t = bandVal(m, dayN(d.date), 9);
    if (t > yMax) yMax = t;
  });
  tg.forEach(i => { if (TARGETS[i].price > yMax) yMax = TARGETS[i].price; });
  if (showMilestones) CRYPTO_MILESTONES.forEach(ms => { if (ms.price > yMax) yMax = ms.price; });
  yMax *= 1.3;
  const yMin = 0.0001;
  const logT = [0.0001, 0.001, 0.01, 0.1, 1, 10, 100, 1000, 10000, 100000].filter(v => v >= yMin * 0.5 && v <= yMax * 2);

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
      fontFamily: SANS, color: "#e2e8f0",
      padding: "32px 20px 48px",
    }}>
      {/* Header */}
      <div style={{ maxWidth: MAX_W, margin: "0 auto 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          <h1 style={{
            fontFamily: SANS, fontSize: 44, fontWeight: 700, margin: 0,
            letterSpacing: "-0.02em", lineHeight: 1,
            background: "linear-gradient(90deg,#6366f1,#3b82f6,#06b6d4,#22c55e,#84cc16,#f59e0b,#ea580c,#dc2626,#8b0000)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>
            SPX6900 Rainbow Chart
          </h1>
          <button onClick={() => setShowAbout(!showAbout)} style={{
            fontFamily: SANS, fontSize: 13, fontWeight: 600, padding: "7px 14px", borderRadius: 6, cursor: "pointer",
            border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.05)",
            color: "#94a3b8",
          }}>
            {showAbout ? "Hide About" : "About"}
          </button>
          <button onClick={handleFetchData} disabled={dataStatus === "loading"} style={{
            fontFamily: SANS, fontSize: 13, fontWeight: 600, padding: "7px 14px", borderRadius: 6, cursor: "pointer",
            border: "1px solid rgba(34,197,94,0.3)", background: "rgba(34,197,94,0.08)",
            color: dataStatus === "loading" ? "#475569" : "#4ade80",
            opacity: dataStatus === "loading" ? 0.5 : 1,
          }}>
            {dataStatus === "loading" ? "Loading..." : "Refresh Data"}
          </button>
          {dataStatus && dataStatus !== "loading" && (
            <span style={{ fontFamily: MONO, fontSize: 12, color: dataStatus.startsWith("Failed") ? "#f87171" : "#4ade80" }}>
              {dataStatus}
            </span>
          )}
        </div>
        <div style={{ fontFamily: MONO, fontSize: 13, color: "#94a3b8", letterSpacing: 0.8, marginTop: 10 }}>
          LOGARITHMIC REGRESSION · {m.name.toUpperCase()} · R²={m.r2.toFixed(3)}
          {m.bandType === "percentile" ? " · ASYMMETRIC PERCENTILE BANDS" : " · SYMMETRIC σ BANDS"}
          <span style={{ color: "#64748b" }}> · {rawData.length} data points</span>
        </div>
      </div>

      {/* About panel */}
      {showAbout && (
        <div style={{
          maxWidth: MAX_W, margin: "0 auto 20px", padding: "20px 26px",
          background: "rgba(99, 102, 241, 0.06)", border: "1px solid rgba(99, 102, 241, 0.2)",
          borderRadius: 10, fontFamily: SANS, fontSize: 15,
          color: "#cbd5e1", lineHeight: 1.7,
        }}>
          <div style={{ fontWeight: 700, color: "#c4b5fd", marginBottom: 10, fontSize: 18 }}>How It Works</div>
          <p style={{ marginBottom: 12 }}>
            This chart fits a <strong style={{ color: "#f1f5f9" }}>logarithmic regression model</strong> to
            SPX6900 price data, similar to Bitcoin&apos;s famous rainbow chart. The colored bands represent
            statistical zones — from &quot;Fire Sale&quot; (historically cheap) to &quot;Max Bubble&quot; (historically expensive).
          </p>
          <div style={{ fontWeight: 700, color: "#e2e8f0", marginBottom: 6, fontSize: 15 }}>Model Improvements</div>
          <ul style={{ paddingLeft: 22, marginBottom: 12, fontSize: 14 }}>
            <li><strong style={{ color: "#c4b5fd" }}>Log-Quadratic:</strong> Adds curvature (ln²) to capture the S-shape inflection that memecoins exhibit.</li>
            <li><strong style={{ color: "#c4b5fd" }}>Weighted Recent:</strong> Exponential weighting gives recent data ~20× more influence than early noise.</li>
            <li><strong style={{ color: "#c4b5fd" }}>Asymmetric Bands:</strong> Uses actual percentiles (p2, p7, p16... p98) instead of symmetric σ, producing wider tops during bubble phases.</li>
            <li><strong style={{ color: "#c4b5fd" }}>Offset Power Law:</strong> Virtual origin at ~Nov 2022 gives the best simple linear fit in log-log space.</li>
          </ul>
          <p style={{ fontSize: 13, color: "#94a3b8" }}>
            All models are fit in-browser using weighted least squares — no external ML libraries.
            Click &quot;Refresh Data&quot; to pull the latest from CoinGecko. Supply: ~939M. Data source: CoinGecko.
          </p>
        </div>
      )}

      {/* Model selector */}
      <div style={{ maxWidth: MAX_W, margin: "0 auto 14px", display: "grid", gap: 10,
        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        {Object.values(MODELS).map(mod => (
          <ModelCard key={mod.key} mod={mod} selected={mod.key === mk} onClick={() => setMk(mod.key)} />
        ))}
      </div>

      {/* Controls */}
      <div style={{ maxWidth: MAX_W, margin: "0 auto 14px", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{
          display: "flex", background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.12)", borderRadius: 7, overflow: "hidden",
        }}>
          {HZ.map((h, i) => (
            <button key={i} onClick={() => setHi(i)} style={{
              fontFamily: SANS, fontSize: 14, fontWeight: 600, padding: "8px 18px", border: "none", cursor: "pointer",
              background: i === hi ? "rgba(59,130,246,0.18)" : "transparent",
              color: i === hi ? "#93c5fd" : "#94a3b8",
              borderRight: i < 2 ? "1px solid rgba(255,255,255,0.08)" : "none",
              transition: "all 0.15s ease",
            }}>{h.l}</button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {TARGETS.map((t, i) => (
            <button key={i} onClick={() => tt(i)} style={{
              fontFamily: SANS, fontSize: 13, fontWeight: 600, padding: "7px 12px", borderRadius: 6, cursor: "pointer",
              border: `1px solid ${tg.has(i) ? t.c + "70" : "rgba(255,255,255,0.1)"}`,
              background: tg.has(i) ? t.c + "18" : "transparent",
              color: tg.has(i) ? t.c : "#94a3b8",
              transition: "all 0.15s ease",
            }}>
              <span style={{ fontFamily: MONO }}>{t.label}</span> <span style={{ opacity: 0.55, fontSize: 11 }}>{t.mc}</span>
            </button>
          ))}
        </div>

        <button onClick={() => setShowMilestones(!showMilestones)} style={{
          fontFamily: SANS, fontSize: 13, fontWeight: 600, padding: "7px 12px", borderRadius: 6, cursor: "pointer",
          border: `1px solid ${showMilestones ? "rgba(251,146,60,0.4)" : "rgba(255,255,255,0.1)"}`,
          background: showMilestones ? "rgba(251,146,60,0.1)" : "transparent",
          color: showMilestones ? "#fb923c" : "#94a3b8",
          transition: "all 0.15s ease",
        }}>Crypto Milestones</button>

        <div style={{
          fontFamily: SANS, fontSize: 14, fontWeight: 600, color: "#e2e8f0", padding: "7px 14px",
          background: "rgba(255,255,255,0.04)", borderRadius: 6,
          border: "1px solid rgba(255,255,255,0.12)",
        }}>
          <span style={{ color: cb.c, fontSize: 18, marginRight: 4 }}>●</span>
          <span style={{ fontFamily: MONO }}>{fP(last.price)}</span>
          <span style={{ color: cb.c, marginLeft: 8 }}>{cb.l}</span>
        </div>
      </div>

      {/* Chart */}
      <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
        <ResponsiveContainer width="100%" height={720}>
          <ComposedChart data={data} margin={{ top: 10, right: 130, bottom: 24, left: 12 }}>
            <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.07)" vertical={false} />
            <XAxis
              dataKey="date" ticks={xT} tickFormatter={fD}
              tick={{ fill: "#cbd5e1", fontSize: 13, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false}
            />
            <YAxis
              scale="log" domain={[yMin, yMax]} ticks={logT} tickFormatter={fT}
              tick={{ fill: "#cbd5e1", fontSize: 13, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={68}
            />
            <Tooltip content={<Tip model={m} />} />

            {Array.from({ length: 9 }).map((_, i) => (
              <Area
                key={`b${i}`} dataKey={`b${i}`} fill={BAND_LABELS[i].c}
                fillOpacity={0.38} stroke="none" isAnimationActive={false} activeDot={false}
              />
            ))}

            {TARGETS.map((t, i) => tg.has(i) && t.price <= yMax ? (
              <ReferenceLine
                key={`tgt${i}`} y={t.price} stroke={t.c}
                strokeDasharray="5 3" strokeWidth={1.2} strokeOpacity={0.75}
                label={{
                  value: `${t.label}  ${t.mc}`, position: "right",
                  fill: t.c, fontSize: 12, fontFamily: MONO, fontWeight: 700,
                  offset: 6,
                }}
              />
            ) : null)}

            {showMilestones && CRYPTO_MILESTONES.map((ms, i) => ms.price <= yMax ? (
              <ReferenceLine
                key={`ms${i}`} y={ms.price} stroke={ms.c}
                strokeDasharray="2 4" strokeWidth={1.2} strokeOpacity={0.5}
                label={{
                  value: `${ms.label} (${ms.mc})`, position: "insideTopLeft",
                  fill: ms.c, fontSize: 11, fontFamily: SANS, fontWeight: 600,
                  offset: 4,
                }}
              />
            ) : null)}

            <ReferenceLine
              x={last.date} stroke="rgba(255,255,255,0.3)" strokeDasharray="2 3" strokeWidth={1.2}
              label={{ value: "NOW", position: "top", fill: "#e2e8f0", fontSize: 12, fontFamily: SANS, fontWeight: 700 }}
            />

            <Line
              dataKey="reg" stroke="rgba(255,255,255,0.35)" strokeWidth={1.2}
              strokeDasharray="3 5" dot={false} isAnimationActive={false} activeDot={false}
            />
            <Line
              dataKey="price" stroke="#ffffff" strokeWidth={3} dot={false}
              isAnimationActive={false} connectNulls={false}
              activeDot={{ r: 5, fill: "#fff", stroke: cb.c, strokeWidth: 2.5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Band legend */}
      <div style={{
        maxWidth: MAX_W, margin: "12px auto 0", display: "flex", justifyContent: "center",
        gap: "8px 22px", flexWrap: "wrap",
      }}>
        {[...BAND_LABELS].reverse().map((b, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 7,
            fontFamily: SANS, fontSize: 13, fontWeight: 500, color: "#cbd5e1",
          }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: b.c, opacity: 0.85 }} />
            {b.l}
          </div>
        ))}
      </div>

      {/* Milestones */}
      {ms.length > 0 && (
        <div style={{ maxWidth: MAX_W, margin: "32px auto 0" }}>
          <div style={{
            fontFamily: SANS, fontSize: 14, fontWeight: 700, color: "#cbd5e1", marginBottom: 12,
            letterSpacing: 1.2, textTransform: "uppercase",
          }}>
            Target Timeline — {m.name}
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: `repeat(${Math.min(ms.length, 5)}, 1fr)`,
            gap: 12,
          }}>
            {ms.map((t, i) => (
              <div key={i} style={{
                background: `${t.c}0d`, border: `1px solid ${t.c}38`,
                borderRadius: 10, padding: "16px 18px",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                  <span style={{ fontSize: 26, fontWeight: 700, color: t.c, fontFamily: MONO }}>{t.label}</span>
                  <span style={{ fontSize: 13, color: "#94a3b8", fontFamily: MONO }}>{t.mc}</span>
                </div>
                <div style={{ fontSize: 14, color: "#cbd5e1", lineHeight: 2.1, fontFamily: SANS }}>
                  {[
                    ["▲", "#dc2626", "SELL", t.sell],
                    ["●", "#f59e0b", "Center", t.center],
                    ["▼", "#6366f1", "Fire", t.fire],
                  ].map(([icon, ic, lab, w], j) => (
                    <div key={j} style={{ display: "flex", justifyContent: "space-between" }}>
                      <span><span style={{ color: ic, marginRight: 6 }}>{icon}</span> {lab}</span>
                      <span style={{ color: "#f1f5f9", fontWeight: 600, fontFamily: MONO }}>{fW(w)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Holder Analytics */}
      <HolderscanDashboard />

      {/* Model details footer */}
      <div style={{ maxWidth: MAX_W, margin: "24px auto 0", display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={{
          flex: "1 1 500px", padding: "16px 20px",
          background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 8, fontFamily: SANS, fontSize: 13, color: "#94a3b8", lineHeight: 1.7,
        }}>
          <span style={{ color: "#f1f5f9", fontWeight: 700 }}>{m.name}: </span>
          <span style={{ fontFamily: MONO }}>{m.formula}</span>
          <span style={{ fontFamily: MONO }}> · R²={m.r2.toFixed(4)} · σ={m.std.toFixed(4)}</span>
          <br /><span style={{ color: "#64748b" }}>{m.note}</span>
        </div>
      </div>

      <div style={{
        maxWidth: MAX_W, margin: "16px auto 0", fontFamily: SANS, fontSize: 12,
        color: "#64748b", textAlign: "center", lineHeight: 1.6,
      }}>
        Single-cycle fit on a memecoin. Not financial advice. Supply ~939M. Data: CoinGecko.
      </div>
    </div>
  );
}
