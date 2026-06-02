import { useState, useMemo, useCallback, useEffect } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, ReferenceLine
} from "recharts";
import { DEFAULT_RAW, fetchLivePrices } from "./data.js";
import {
  buildModel, BAND_LABELS, TARGETS,
  dayN, ds, bandVal, bandIndex,
  whenHitsCenter, whenHitsBand,
} from "./models.js";
import HolderscanDashboard from "./HolderscanDashboard.jsx";

const SANS = "'Space Grotesk', system-ui, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";
const LED = "'DSEG7 Classic', ui-monospace, monospace";
const MAX_W = 1400;

// Frosted-glass card style. Pass an rgb string + alpha to tint the fill.
const glass = (rgb = "255, 255, 255", alpha = 0.05, blur = 14) => ({
  background: `rgba(${rgb}, ${alpha})`,
  backdropFilter: `blur(${blur}px)`,
  WebkitBackdropFilter: `blur(${blur}px)`,
  border: "1px solid rgba(255, 255, 255, 0.12)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.10), 0 8px 30px rgba(0,0,0,0.35)",
});

// Rainbow aurora blobs that drift slowly behind the glass (matches the chart's bands).
const AURORA = [
  { c: "#6366f1", top: "-10%", left: "-8%",  size: "48vw", anim: "aurora-1 26s" },
  { c: "#3b82f6", top: "8%",   left: "60%",  size: "44vw", anim: "aurora-2 30s" },
  { c: "#06b6d4", top: "46%",  left: "-12%", size: "42vw", anim: "aurora-3 24s" },
  { c: "#22c55e", top: "62%",  left: "58%",  size: "46vw", anim: "aurora-1 29s" },
  { c: "#f59e0b", top: "36%",  left: "82%",  size: "34vw", anim: "aurora-2 33s" },
  { c: "#dc2626", top: "78%",  left: "18%",  size: "38vw", anim: "aurora-3 27s" },
];

// Track viewport width so we can size things responsively for phones/tablets.
function useViewport() {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1400);
  useEffect(() => {
    const onResize = () => setW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return w;
}

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

const CRYPTO_MILESTONES = [
  { price: 11.71,  label: "PEPE ATH MC",     mc: "$11B",  c: "#4ade80" },
  { price: 13.84,  label: "BTC @ $1K MC",    mc: "$13B",  c: "#f59e0b" },
  { price: 42.60,  label: "SHIB ATH MC",     mc: "$40B",  c: "#f43f5e" },
  { price: 94.57,  label: "DOGE ATH MC",     mc: "$89B",  c: "#c2a633" },
  { price: 197,    label: "BTC @ $10K MC",   mc: "$185B", c: "#fb923c" },
  { price: 2130,   label: "BTC @ $100K MC",  mc: "$2T",   c: "#f97316" },
];

const fD = s => new Date(s).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
const dateToTs = dateStr => new Date(dateStr).getTime();
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

export default function App() {
  // `priceData` is bundled history + any new live points beyond the last bundled date.
  // The MODEL FIT is always computed from DEFAULT_RAW (bundled) only, so the
  // rainbow shape is stable and never changes when fresh data arrives.
  const vw = useViewport();
  const isMobile = vw < 640;
  const isTablet = vw < 980;

  const [priceData, setPriceData] = useState(DEFAULT_RAW);
  const [, setDataStatus] = useState(null);
  const [hi, setHi] = useState(1); // default 10Y
  const [tg, setTg] = useState(new Set([0, 1, 2, 4])); // includes $6,900 by default
  const [showMilestones, setShowMilestones] = useState(true);
  const HZ = [
    { l: "5Y", y: 5 },
    { l: "10Y", y: 10 },
    { l: "20Y", y: 20 },
    { l: "30Y", y: 30 },
    { l: "Auto", y: null }, // auto-fit to highest selected target
  ];

  // Extend bundled prices with any newer live points only — do not replace history.
  const applyLive = useCallback((livePrices, source) => {
    const bundledLast = DEFAULT_RAW[DEFAULT_RAW.length - 1].date;
    const newer = livePrices.filter(p => p.date > bundledLast);
    if (newer.length === 0) {
      setDataStatus(`Up to date · bundled covers latest (${source})`);
      return;
    }
    setPriceData([...DEFAULT_RAW, ...newer]);
    setDataStatus(`Live · +${newer.length} fresh pts from ${source}`);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchLivePrices().then(({ prices, source }) => {
      if (cancelled || prices.length === 0) return;
      applyLive(prices, source);
    }).catch(err => {
      if (!cancelled) setDataStatus(`Using bundled data (${err.message})`);
    });
    return () => { cancelled = true; };
  }, [applyLive]);

  // Fit the model ON BUNDLED DATA ONLY. This is the stable historical record
  // we curated — daily live data shouldn't reshape the rainbow.
  const m = useMemo(() => buildModel(DEFAULT_RAW), []);

  // Auto-fit horizon: extend until the center band reaches the highest selected target.
  const endDay = useMemo(() => {
    const horizon = HZ[hi];
    if (horizon.y != null) return Math.round(horizon.y * 365.25);
    const selectedTargets = [...tg].map(i => TARGETS[i].price);
    if (selectedTargets.length === 0) return Math.round(10 * 365.25);
    const topTarget = Math.max(...selectedTargets);
    const hit = whenHitsCenter(m, topTarget);
    // Pad ~15% so the target line isn't hugging the right edge
    const fallback = 30 * 365.25;
    const day = hit ? hit.d * 1.15 : fallback;
    return Math.round(Math.min(day, fallback));
  }, [m, hi, tg, HZ]);
  const tt = useCallback(i => setTg(p => {
    const n = new Set(p);
    n.has(i) ? n.delete(i) : n.add(i);
    return n;
  }), []);

  const data = useMemo(() => {
    const firstDay = dayN(priceData[0].date);
    const leadStart = Math.max(1, firstDay - 60);
    const pts = [];
    const pushPoint = (d, dateStr, price) => {
      const e = { date: dateStr, ts: dateToTs(dateStr), price };
      for (let i = 0; i < 9; i++) {
        e[`b${i}`] = [bandVal(m, d, i), bandVal(m, d, i + 1)];
      }
      e.reg = Math.exp(m.predict(d));
      pts.push(e);
    };
    for (let d = leadStart; d < firstDay; d += 3) {
      pushPoint(d, ds(d), null);
    }
    priceData.forEach(d => {
      pushPoint(dayN(d.date), d.date, d.price);
    });
    const lastDay = dayN(priceData[priceData.length - 1].date);
    const years = endDay / 365.25;
    const step = years > 25 ? 30 : years > 15 ? 14 : 6;
    for (let d = lastDay + step; d <= endDay; d += step) {
      pushPoint(d, ds(d), null);
    }
    return pts;
  }, [m, endDay, priceData]);

  const last = priceData[priceData.length - 1];
  const ld = dayN(last.date);
  const cb = BAND_LABELS[bandIndex(m, last.price, ld)];
  // LED price: the lit value plus an "all segments on" ghost (8.8.8) behind it
  const priceNum = fP(last.price).replace(/^\$/, "");
  const priceGhost = priceNum.replace(/[0-9]/g, "8");

  // Compute yMin/yMax from the actual band values so bands never get clipped.
  // No artificial cap: at long horizons the top band legitimately grows large,
  // and capping it makes the rainbow appear flat-topped (visual distortion).
  const { yMin, yMax } = useMemo(() => {
    let minB = Infinity, maxB = 0;
    for (const d of data) {
      const lo = d.b0?.[0];
      const hi = d.b8?.[1];
      if (lo != null && lo > 0 && lo < minB) minB = lo;
      if (hi != null && hi > maxB) maxB = hi;
    }
    let yMaxCalc = maxB;
    tg.forEach(i => { if (TARGETS[i].price > yMaxCalc) yMaxCalc = TARGETS[i].price * 1.3; });
    if (showMilestones) CRYPTO_MILESTONES.forEach(ms => { if (ms.price > yMaxCalc) yMaxCalc = ms.price * 1.3; });
    return {
      yMin: minB * 0.6,
      yMax: yMaxCalc * 1.3,
    };
  }, [data, tg, showMilestones]);

  const logT = [0.00001, 0.0001, 0.001, 0.01, 0.1, 1, 10, 100, 1000, 10000, 100000].filter(v => v >= yMin * 0.5 && v <= yMax * 2);

  const { xDomain, xT } = useMemo(() => {
    if (data.length === 0) return { xDomain: ["auto", "auto"], xT: [] };
    const startTs = data[0].ts;
    const endTs = data[data.length - 1].ts;
    const years = (endTs - startTs) / (365.25 * 86400 * 1000);
    // Pick year-step that gives ~8-12 labels regardless of horizon
    const yearStep = years > 24 ? 4 : years > 12 ? 2 : 1;
    const monthMod = years > 6 ? 12 : 6;
    const ticks = [];
    const startYear = new Date(startTs).getFullYear();
    const endYear = new Date(endTs).getFullYear();
    for (let yr = startYear; yr <= endYear + 1; yr++) {
      if (yr % yearStep !== 0) continue;
      for (let mo = 0; mo < 12; mo += monthMod) {
        const ts = new Date(yr, mo, 1).getTime();
        if (ts >= startTs && ts <= endTs) ticks.push(ts);
      }
    }
    return { xDomain: [startTs, endTs], xT: ticks };
  }, [data]);

  const ms = useMemo(() => TARGETS.filter((_, i) => tg.has(i)).map(t => ({
    ...t,
    sell: whenHitsBand(m, t.price, 8),
    center: whenHitsCenter(m, t.price),
    fire: whenHitsBand(m, t.price, 0),
  })), [m, tg]);

  return (
    <div style={{
      position: "relative", isolation: "isolate",
      width: "100%", minHeight: "100vh",
      background: `radial-gradient(1100px 540px at 50% -8%, ${cb.c}24, transparent 60%), #020208`,
      transition: "background 0.6s ease",
      fontFamily: SANS, color: "#e2e8f0",
      padding: isMobile ? "18px 12px 40px" : "32px 20px 48px",
    }}>
      {/* Rainbow aurora mesh */}
      <div aria-hidden="true" style={{
        position: "fixed", inset: 0, zIndex: -2, overflow: "hidden", pointerEvents: "none",
      }}>
        {AURORA.map((b, i) => (
          <div key={i} style={{
            position: "absolute", top: b.top, left: b.left,
            width: b.size, height: b.size, borderRadius: "50%",
            background: `radial-gradient(circle, ${b.c} 0%, transparent 70%)`,
            opacity: 0.32, filter: "blur(40px)", willChange: "transform",
            animation: `${b.anim} ease-in-out infinite`,
          }} />
        ))}
      </div>

      {/* Animated starfield backdrop */}
      <div aria-hidden="true" style={{
        position: "fixed", top: 0, left: 0, width: "100%", height: "calc(100% + 200px)",
        zIndex: -1, pointerEvents: "none",
        backgroundRepeat: "repeat", backgroundSize: "200px 200px",
        backgroundImage: [
          "radial-gradient(1px 1px at 24px 28px, rgba(255,255,255,0.28), transparent 100%)",
          "radial-gradient(1px 1px at 76px 96px, rgba(255,255,255,0.18), transparent 100%)",
          "radial-gradient(1.6px 1.6px at 142px 52px, rgba(196,181,253,0.22), transparent 100%)",
          "radial-gradient(1.2px 1.2px at 168px 150px, rgba(255,255,255,0.14), transparent 100%)",
        ].join(","),
        animation: "star-drift 26s linear infinite",
      }} />

      {/* Header */}
      <div style={{ maxWidth: MAX_W, margin: "0 auto 24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: isMobile ? 10 : 18, flexWrap: "nowrap" }}>
          <img
            src="/spx6900.gif"
            alt="SPX6900"
            style={{
              height: isMobile ? 44 : 84, width: "auto", flexShrink: 0,
              filter: "invert(1)",
              mixBlendMode: "screen",
            }}
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
          <h1 style={{
            fontFamily: SANS, fontSize: isMobile ? 26 : isTablet ? 36 : 44, fontWeight: 700, margin: 0,
            letterSpacing: "-0.02em", lineHeight: 1.05, textAlign: "center",
            background: "linear-gradient(90deg,#6366f1,#3b82f6,#06b6d4,#22c55e,#84cc16,#f59e0b,#ea580c,#dc2626,#8b0000,#6366f1)",
            backgroundSize: "200% auto",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            animation: "title-shimmer 8s ease-in-out infinite alternate",
          }}>
            SPX6900 Rainbow Chart
          </h1>
          <img
            src="/spx6900.gif"
            alt="SPX6900"
            style={{
              height: isMobile ? 44 : 84, width: "auto", flexShrink: 0,
              filter: "invert(1)",
              mixBlendMode: "screen",
              transform: "scaleX(-1)",
            }}
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        </div>
        <div style={{ fontFamily: MONO, fontSize: isMobile ? 11 : 13, color: "#94a3b8", letterSpacing: 0.6, marginTop: 10, textAlign: "center" }}>
          LOGARITHMIC REGRESSION · {m.name.toUpperCase()} · R²={m.r2.toFixed(3)} · σ={m.std.toFixed(3)}
          <span style={{ color: "#64748b" }}> · {priceData.length} points (bundled fit)</span>
        </div>
      </div>

      {/* About panel — always visible */}
      <div style={{
        maxWidth: MAX_W, margin: "0 auto 20px", padding: isMobile ? "16px 16px" : "20px 26px",
        ...glass("99, 102, 241", 0.08),
        borderRadius: 10, fontFamily: SANS, fontSize: isMobile ? 14 : 15,
        color: "#cbd5e1", lineHeight: 1.7,
      }}>
        <div style={{ fontWeight: 700, color: "#c4b5fd", marginBottom: 10, fontSize: isMobile ? 16 : 18 }}>About This Chart</div>
        <p style={{ marginBottom: 12 }}>
          The <strong style={{ color: "#f1f5f9" }}>SPX6900 Rainbow Chart</strong> is a fun, long-term way to
          visualize where the price of SPX6900 sits relative to its historical trend. It plots the price on a{" "}
          <strong style={{ color: "#f1f5f9" }}>logarithmic scale</strong> and overlays colored &ldquo;rainbow&rdquo;
          bands that range from undervalued (cooler blues/greens) to overvalued (hotter oranges/reds). It is{" "}
          <em>not</em> financial advice or a price prediction — just a lighthearted lens on the bigger picture.
        </p>
        <p style={{ marginBottom: 12 }}>
          It&apos;s directly inspired by the famous{" "}
          <a
            href="https://www.blockchaincenter.net/en/bitcoin-rainbow-chart/"
            target="_blank" rel="noopener noreferrer"
            style={{ color: "#c4b5fd", fontWeight: 600 }}
          >
            Bitcoin Rainbow Chart
          </a>. That chart was originally created in 2014 by Reddit user{" "}
          <strong style={{ color: "#f1f5f9" }}>azop</strong>, who posted log-scale charts with rainbow color bands
          in the /r/Bitcoin community to give people some perspective (and &ldquo;hopium&rdquo;) during the brutal
          post-MtGox bear market. In 2019, blockchaincenter.net turned it into an always-up-to-date live version,
          combining it with a logarithmic regression fit (originally{" "}
          <span style={{ fontFamily: MONO, color: "#c4b5fd" }}>y = 2.9065·ln(x) − 19.493</span> from
          Bitcointalk user <em>trolololo</em>) to give the rainbow its characteristic flattening &ldquo;bow&rdquo;
          shape. The Bitcoin Rainbow Chart was always meant as a meme and a look at history — never a serious model —
          and the same spirit applies here.
        </p>
        <div style={{ fontWeight: 700, color: "#c4b5fd", margin: "16px 0 8px", fontSize: 16 }}>How It Works</div>
        <p style={{ marginBottom: 12 }}>
          This chart fits a <strong style={{ color: "#f1f5f9" }}>weighted log-quadratic regression</strong> to
          SPX6900 price history. The model is{" "}
          <span style={{ fontFamily: MONO, color: "#c4b5fd" }}>ln(P) = a×(ln t)² + b×ln t + c</span>{" "}
          — the squared term captures the S-curve shape that early-stage memecoins follow.
        </p>
        <p style={{ marginBottom: 12 }}>
          The colored bands are <strong style={{ color: "#f1f5f9" }}>asymmetric percentile bands</strong> built
          from actual residuals (p2 to p98), so they widen during bubble phases naturally rather than assuming
          normal distribution.
        </p>
        <p style={{ fontSize: 13, color: "#94a3b8" }}>
          Data: bundled historical baseline (Aug 2023 launch onward) merged with live updates from{" "}
          <strong>GeckoTerminal</strong> (Uniswap pool), falling back to Coinbase/Bybit. Supply: ~939M.
        </p>
      </div>

      {/* Current verdict banner */}
      <div style={{
        maxWidth: MAX_W, margin: "0 auto 20px", padding: isMobile ? "18px 18px" : "22px 30px",
        background: `linear-gradient(135deg, ${cb.c}26, ${cb.c}0a)`,
        backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
        border: `1.5px solid ${cb.c}66`,
        borderRadius: 14,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.12), 0 0 50px ${cb.c}24, 0 8px 30px rgba(0,0,0,0.35)`,
        overflow: "hidden",
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: isMobile ? 14 : 28, flexWrap: "wrap",
        }}>
          <img
            src="/spx6900logo.png"
            alt="SPX6900"
            style={{
              height: isMobile ? 54 : 84, width: "auto", flexShrink: 0,
              filter: `drop-shadow(0 0 16px ${cb.c}55)`,
            }}
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
          <div style={{
            display: "flex", alignItems: "baseline", justifyContent: "center",
            flexWrap: "wrap", gap: isMobile ? "0 10px" : "0 14px",
            textAlign: "center",
          }}>
            <span style={{ fontFamily: SANS, fontSize: isMobile ? 15 : 22, color: "#94a3b8" }}>is at</span>
            <span style={{ display: "inline-flex", alignItems: "baseline", gap: 5 }}>
              <span style={{
                fontFamily: MONO, fontSize: isMobile ? 16 : 22, fontWeight: 700, color: cb.c, opacity: 0.85,
              }}>
                $
              </span>
              <span style={{ position: "relative", display: "inline-block" }}>
                {/* dim "all segments on" backdrop */}
                <span aria-hidden="true" style={{
                  position: "absolute", left: 0, top: 0,
                  fontFamily: LED, fontSize: isMobile ? 24 : 34, letterSpacing: "0.04em",
                  color: cb.c, opacity: 0.16, pointerEvents: "none",
                }}>
                  {priceGhost}
                </span>
                {/* lit value */}
                <span style={{
                  position: "relative",
                  fontFamily: LED, fontSize: isMobile ? 24 : 34, letterSpacing: "0.04em",
                  color: cb.c, textShadow: `0 0 6px ${cb.c}, 0 0 18px ${cb.c}cc`,
                }}>
                  {priceNum}
                </span>
              </span>
            </span>
            <span style={{ fontFamily: SANS, fontSize: isMobile ? 15 : 22, color: "#94a3b8" }}>and is a</span>
            <span style={{
              fontFamily: SANS, fontSize: isMobile ? 32 : 48, fontWeight: 800, lineHeight: 1.02,
              letterSpacing: "-0.02em", color: cb.c, textShadow: `0 0 24px ${cb.c}66`,
            }}>
              {cb.l}
            </span>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div style={{ maxWidth: MAX_W, margin: "0 auto 14px", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{
          display: "flex", borderRadius: 7, overflow: "hidden",
          ...glass("255, 255, 255", 0.04),
        }}>
          {HZ.map((h, i) => (
            <button key={i} onClick={() => setHi(i)} style={{
              fontFamily: SANS, fontSize: isMobile ? 13 : 14, fontWeight: 600, padding: isMobile ? "8px 12px" : "8px 18px", border: "none", cursor: "pointer",
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
      </div>

      {/* Chart */}
      <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
        <ResponsiveContainer width="100%" height={isMobile ? 440 : isTablet ? 580 : 720}>
          <ComposedChart data={data} margin={{ top: 10, right: isMobile ? 64 : 130, bottom: 24, left: isMobile ? 0 : 12 }}>
            <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.07)" vertical={false} />
            <XAxis
              dataKey="ts"
              type="number"
              scale="time"
              domain={xDomain}
              ticks={xT}
              tickFormatter={ts => fD(new Date(ts).toISOString().slice(0, 10))}
              tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 13, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false}
              allowDataOverflow={false}
              interval="preserveStartEnd"
              minTickGap={isMobile ? 32 : 8}
            />
            <YAxis
              scale="log" domain={[yMin, yMax]} ticks={logT} tickFormatter={fT}
              tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 13, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 46 : 68}
              allowDataOverflow
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
                  value: isMobile ? t.label : `${t.label}  ${t.mc}`, position: "right",
                  fill: t.c, fontSize: isMobile ? 10 : 12, fontFamily: MONO, fontWeight: 700,
                  offset: 6,
                }}
              />
            ) : null)}

            {showMilestones && CRYPTO_MILESTONES.map((ms, i) => ms.price <= yMax ? (
              <ReferenceLine
                key={`ms${i}`} y={ms.price} stroke={ms.c}
                strokeDasharray="2 4" strokeWidth={1.2} strokeOpacity={0.5}
                label={{
                  value: isMobile ? ms.label : `${ms.label} (${ms.mc})`, position: "insideTopLeft",
                  fill: ms.c, fontSize: isMobile ? 9 : 11, fontFamily: SANS, fontWeight: 600,
                  offset: 4,
                }}
              />
            ) : null)}

            <ReferenceLine
              x={dateToTs(last.date)} stroke="rgba(255,255,255,0.3)" strokeDasharray="2 3" strokeWidth={1.2}
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
            Target Timeline
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${isMobile ? 150 : 200}px), 1fr))`,
            gap: 12,
          }}>
            {ms.map((t, i) => (
              <div key={i} style={{
                background: `${t.c}12`, border: `1px solid ${t.c}45`,
                backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.10), 0 8px 30px rgba(0,0,0,0.35)",
                borderRadius: 10, padding: "16px 18px",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                  <span style={{ fontSize: isMobile ? 22 : 26, fontWeight: 700, color: t.c, fontFamily: MONO }}>{t.label}</span>
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
          ...glass("255, 255, 255", 0.04),
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
        Single-cycle fit on a memecoin. Not financial advice. Supply ~939M.
      </div>
    </div>
  );
}
