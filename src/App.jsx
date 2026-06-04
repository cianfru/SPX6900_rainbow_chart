import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis,
  CartesianGrid, ReferenceLine
} from "recharts";
import { DEFAULT_RAW, fetchLivePrices, fetchSpotPrice } from "./data.js";
import {
  buildModel, BAND_LABELS, TARGETS,
  dayN, ds, bandVal, bandIndex,
  whenHitsCenter, whenHitsBand,
} from "./models.js";
import HolderscanDashboard from "./HolderscanDashboard.jsx";
import RiskChart from "./RiskChart.jsx";
import DrawdownChart from "./DrawdownChart.jsx";
import SpxBtcChart from "./SpxBtcChart.jsx";
import RelativeChart from "./RelativeChart.jsx";
import SupplyConviction from "./SupplyConviction.jsx";
import { generatePine } from "./pine.js";

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

// Socials & donations
const X_URL = "https://x.com/cianfru";

// Example DCA / risk framework, keyed to band index (0 = Fire Sale … 8 = Max Bubble).
const SCALE_PLAN = [
  { side: "buy",  action: "Accumulate aggressively", note: "Deploy ~25% of dry powder" },
  { side: "buy",  action: "Accumulate",              note: "Deploy ~20% of dry powder" },
  { side: "buy",  action: "Keep accumulating",       note: "Deploy ~15% of dry powder" },
  { side: "buy",  action: "Light DCA buys",          note: "Deploy ~10% of dry powder" },
  { side: "hold", action: "Hold — fair value",       note: "Sit tight, no action" },
  { side: "sell", action: "Start trimming",          note: "Sell ~10% of your stack" },
  { side: "sell", action: "Take profit",             note: "Sell ~20% of your stack" },
  { side: "sell", action: "Take profit",             note: "Sell ~35% of your stack" },
  { side: "sell", action: "De-risk hard",            note: "Sell ~50% of your stack" },
];

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


// Line icons (Lucide-style) for the chart tabs; inherit the pill's color via currentColor.
function TabIcon({ name }) {
  const p = { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", style: { flexShrink: 0 } };
  switch (name) {
    case "rainbow": return (<svg {...p}><path d="M3 16a9 9 0 0 1 18 0" /><path d="M6 16a6 6 0 0 1 12 0" /><path d="M9 16a3 3 0 0 1 6 0" /></svg>);
    case "risk": return (<svg {...p}><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>);
    case "drawdown": return (<svg {...p}><polyline points="22 17 13.5 8.5 8.5 13.5 2 7" /><polyline points="16 17 22 17 22 11" /></svg>);
    case "spxbtc": return (<svg {...p}><path d="M8 3 4 7l4 4" /><path d="M4 7h16" /><path d="M16 21l4-4-4-4" /><path d="M20 17H4" /></svg>);
    case "relative": return (<svg {...p}><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" /><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" /><path d="M7 21h10" /><path d="M12 3v18" /><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" /></svg>);
    case "supply": return (<svg {...p}><path d="M6 3h12l4 6-10 13L2 9Z" /><path d="M11 3 8 9l4 13 4-13-3-6" /><path d="M2 9h20" /></svg>);
    case "holders": return (<svg {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>);
    default: return null;
  }
}

// Unified nav: Rainbow (hero) + the six indicator charts, each with its own neon color.
const NAV_TABS = [
  ["rainbow", "Rainbow", "#a78bfa"],
  ["risk", "Risk", "#f59e0b"],
  ["drawdown", "Drawdown", "#f87171"],
  ["spxbtc", "SPX/BTC", "#f7931a"],
  ["relative", "Relative", "#22d3ee"],
  ["supply", "Supply", "#34d399"],
  ["holders", "Holders", "#60a5fa"],
];

export default function App() {
  // `priceData` is bundled history + any new live points beyond the last bundled date.
  // The MODEL FIT is always computed from DEFAULT_RAW (bundled) only, so the
  // rainbow shape is stable and never changes when fresh data arrives.
  const vw = useViewport();
  const isMobile = vw < 640;
  const isTablet = vw < 980;

  const [priceData, setPriceData] = useState(DEFAULT_RAW);
  const [, setDataStatus] = useState(null);
  const [tickFlash, setTickFlash] = useState({ key: 0, dir: null }); // up/down flash on price move
  const prevPriceRef = useRef(null); // last live spot price, for tick direction
  const [hi, setHi] = useState(1); // default 10Y
  const [tg, setTg] = useState(new Set([0, 1, 2, 4])); // includes $6,900 by default
  const [showMilestones, setShowMilestones] = useState(true);
  const [showPine, setShowPine] = useState(false);
  const [pineCopied, setPineCopied] = useState(false);
  const [showDry, setShowDry] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [tab, setTab] = useState("risk");
  const [view, setView] = useState("rainbow"); // which nav item is highlighted
  const [relWhich, setRelWhich] = useState("BTC"); // Relative chart asset (driven by nav dropdown)
  const [relRect, setRelRect] = useState(null);    // Relative tab rect, for the hover menu
  const relBtnRef = useRef(null);
  const relTimer = useRef(null);
  const navRef = useRef(null);
  const chartBoxRef = useRef(null);   // wrapper div, for measuring the plot area
  // Crosshair elements updated imperatively (no React re-render while moving).
  const vLineRef = useRef(null);
  const hLineRef = useRef(null);
  const dotRef = useRef(null);
  const boxRef = useRef(null);
  const dateRef = useRef(null);
  const priceRef = useRef(null);
  const bandRef = useRef(null);
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

  // Upsert the live spot price as "today"'s point so the headline LED, the NOW
  // band and the price line all reflect the latest on-chain price in place.
  const upsertSpot = useCallback((price) => {
    const today = new Date().toISOString().slice(0, 10);
    setPriceData(prev => {
      const lastPt = prev[prev.length - 1];
      if (lastPt.date === today) {
        if (lastPt.price === price) return prev; // no change
        const next = prev.slice();
        next[next.length - 1] = { date: today, price };
        return next;
      }
      if (today > lastPt.date) return [...prev, { date: today, price }];
      // Clock skew / pre-open edge case: just refresh the latest point's price.
      const next = prev.slice();
      next[next.length - 1] = { ...lastPt, price };
      return next;
    });
  }, []);

  // Poll the live spot price so it refreshes without a full page reload.
  useEffect(() => {
    let cancelled = false;
    let timer;
    const POLL_MS = 5_000;
    const tick = async () => {
      try {
        const { price, source } = await fetchSpotPrice();
        if (!cancelled && price > 0) {
          // Flash green/red only when the price actually moves between ticks.
          const prev = prevPriceRef.current;
          if (prev != null && price !== prev) {
            setTickFlash(t => ({ key: t.key + 1, dir: price > prev ? "up" : "down" }));
          }
          prevPriceRef.current = price;
          upsertSpot(price);
          setDataStatus(`Live · ${source} spot`);
        }
      } catch { /* keep last known price; try again next tick */ }
      if (!cancelled) timer = setTimeout(tick, POLL_MS);
    };
    tick();
    const onVisible = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [upsertSpot]);

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
  const bIdx = bandIndex(m, last.price, ld);
  const cb = BAND_LABELS[bIdx];
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

  // Free crosshair: map any cursor position in the plot to (date, price, band)
  // and update the overlay DOM directly — no setState, so it tracks instantly.
  const hideCursor = () => {
    [vLineRef, hLineRef, dotRef, boxRef].forEach(r => { if (r.current) r.current.style.display = "none"; });
  };
  const handleChartMove = (e) => {
    const box = chartBoxRef.current;
    if (!box) return;
    const bg = box.querySelector(".recharts-cartesian-grid-bg") || box.querySelector(".recharts-cartesian-grid");
    if (!bg) return;
    const cr = box.getBoundingClientRect();
    const gr = bg.getBoundingClientRect();
    const left = gr.left - cr.left, top = gr.top - cr.top, width = gr.width, height = gr.height;
    const x = e.clientX - cr.left, y = e.clientY - cr.top;
    if (width <= 0 || height <= 0 || x < left || x > left + width || y < top || y > top + height) {
      hideCursor();
      return;
    }
    const fx = (x - left) / width;
    const ts = xDomain[0] + fx * (xDomain[1] - xDomain[0]);
    const fy = (y - top) / height;
    const price = Math.exp(Math.log(yMax) - fy * (Math.log(yMax) - Math.log(yMin)));
    const bl = BAND_LABELS[bandIndex(m, price, dayN(new Date(ts)))];

    const v = vLineRef.current, h = hLineRef.current, d = dotRef.current, b = boxRef.current;
    if (!v || !h || !d || !b) return;
    v.style.display = "block"; v.style.left = x + "px"; v.style.top = top + "px"; v.style.height = height + "px";
    h.style.display = "block"; h.style.left = left + "px"; h.style.top = y + "px"; h.style.width = width + "px";
    d.style.display = "block"; d.style.left = (x - 4) + "px"; d.style.top = (y - 4) + "px";
    d.style.background = bl.c; d.style.boxShadow = `0 0 8px ${bl.c}`;
    b.style.display = "block";
    b.style.left = (x > left + width * 0.62 ? x - 186 : x + 14) + "px";
    b.style.top = Math.min(Math.max(y - 30, top), top + height - 96) + "px";
    b.style.borderColor = bl.c + "80";
    dateRef.current.textContent = new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    priceRef.current.textContent = fP(price);
    bandRef.current.textContent = "● " + bl.l;
    bandRef.current.style.color = bl.c;
  };

  const scrollTop = () => { setView("rainbow"); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const goChart = (id) => {
    if (id === "rainbow") { scrollTop(); return; }
    setView(id); setTab(id);
    requestAnimationFrame(() => {
      const el = document.getElementById("more-charts");
      if (!el) return;
      const navH = navRef.current?.offsetHeight ?? 0;
      const y = el.getBoundingClientRect().top + window.scrollY - navH - 8;
      window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
    });
  };

  const pineCode = useMemo(() => generatePine(m), [m]);
  const copyPine = () => {
    navigator.clipboard?.writeText(pineCode).then(() => {
      setPineCopied(true);
      setTimeout(() => setPineCopied(false), 1800);
    });
  };
  const downloadPine = () => {
    const blob = new Blob([pineCode], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "spx6900_rainbow_bands.pine";
    a.click();
    URL.revokeObjectURL(url);
  };

  const openRel = () => {
    clearTimeout(relTimer.current);
    if (relBtnRef.current) setRelRect(relBtnRef.current.getBoundingClientRect());
  };
  const closeRel = () => {
    relTimer.current = setTimeout(() => setRelRect(null), 160);
  };
  const pickRel = (id) => { clearTimeout(relTimer.current); setRelWhich(id); setRelRect(null); goChart("relative"); };

  const navIcon = (rgb, glow, color = "#e2e8f0") => ({
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: 38, height: 38, borderRadius: 9, cursor: "pointer", textDecoration: "none",
    color, ...glass(rgb, 0.10), border: "1px solid transparent", boxShadow: "none", "--glow": glow,
  });
  const navActions = (
    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
      <button className="pill" onClick={() => setShowPine(true)} title="TradingView indicator" style={navIcon("59, 130, 246", "rgba(59,130,246,0.6)")}>
        <img src="/tradingview-logo.png" alt="" style={{ height: 18, width: 18, borderRadius: "50%", display: "block" }} />
      </button>
      <a className="pill" href={X_URL} target="_blank" rel="noopener noreferrer" title="@cianfru" style={navIcon("255, 255, 255", "rgba(226,232,240,0.5)")}>
        <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
      </a>
    </div>
  );

  return (
    <div style={{
      position: "relative", isolation: "isolate",
      width: "100%", minHeight: "100vh",
      background: `radial-gradient(1100px 540px at 50% -8%, ${cb.c}24, transparent 60%), #020208`,
      transition: "background 0.6s ease",
      fontFamily: SANS, color: "#e2e8f0",
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

      {/* Unified sticky nav — minimal */}
      <nav ref={navRef} style={{
        position: "sticky", top: 0, zIndex: 50, width: "100%",
        background: "rgba(6, 8, 18, 0.35)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
      }}>
        <div style={{
          maxWidth: MAX_W, margin: "0 auto", padding: isMobile ? "0 10px" : "0 18px",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <div className="no-scrollbar" style={{
            display: "flex", gap: 7, alignItems: "center",
            flex: 1, justifyContent: isMobile ? "flex-start" : "center",
            flexWrap: "nowrap", overflowX: isMobile ? "auto" : "visible", padding: "9px 2px",
            WebkitOverflowScrolling: "touch", scrollbarWidth: "none",
          }}>
            {NAV_TABS.map(([id, label, c]) => {
              const active = view === id;
              const pillStyle = {
                display: "inline-flex", alignItems: "center", gap: 0, whiteSpace: "nowrap", flexShrink: 0,
                fontFamily: SANS, fontSize: 13.5, fontWeight: 600, padding: "8px 13px", borderRadius: 9,
                background: "transparent",
                border: `1px solid ${active ? c + "cc" : "transparent"}`,
                boxShadow: active ? `0 0 14px ${c}55` : "none",
                color: active ? "#f8fafc" : "#94a3b8", "--glow": c,
              };
              const iconWrap = <span style={{ color: c, display: "inline-flex" }}><TabIcon name={id} /></span>;
              const showLabel = !isMobile || active; // mobile: only the selected tab shows its label
              const labelStyle = {
                display: "inline-block", overflow: "hidden", whiteSpace: "nowrap",
                maxWidth: showLabel ? 160 : 0, opacity: showLabel ? 1 : 0, marginLeft: showLabel ? 6 : 0,
                transition: "max-width .26s ease, opacity .2s ease, margin-left .26s ease",
              };
              if (id === "relative") {
                const caretStyle = {
                  display: "inline-block", overflow: "hidden", fontSize: 10,
                  maxWidth: showLabel ? 14 : 0, opacity: showLabel ? 0.6 : 0, marginLeft: showLabel ? 4 : 0,
                  transition: "max-width .26s ease, opacity .2s ease, margin-left .26s ease",
                };
                return (
                  <button key={id} ref={relBtnRef} className="pill" onClick={() => goChart(id)} title={label}
                    onMouseEnter={openRel} onMouseLeave={closeRel} style={pillStyle}>
                    {iconWrap}<span style={labelStyle}>{label}</span><span style={caretStyle}>▾</span>
                  </button>
                );
              }
              return (
                <button key={id} className="pill" onClick={() => goChart(id)} title={label} style={pillStyle}>
                  {iconWrap}<span style={labelStyle}>{label}</span>
                </button>
              );
            })}
          </div>
          {navActions}
        </div>
      </nav>

      {/* Relative-value hover dropdown */}
      {relRect && !isMobile && (
        <div onMouseEnter={openRel} onMouseLeave={closeRel} style={{
          position: "fixed", top: relRect.bottom + 6, left: relRect.left, zIndex: 60,
          ...glass("14, 16, 30", 0.92, 14), borderRadius: 10, padding: 6, minWidth: 168,
          display: "flex", flexDirection: "column", gap: 3,
        }}>
          {[["BTC", "vs Bitcoin"], ["ETH", "vs Ethereum"], ["SOL", "vs Solana"], ["BASKET", "vs Majors"]].map(([id, label]) => (
            <button key={id} className="pill" onClick={() => pickRel(id)} style={{
              textAlign: "left", padding: "8px 12px", borderRadius: 7, cursor: "pointer",
              background: "transparent", border: `1px solid ${relWhich === id ? "rgba(99,102,241,0.5)" : "transparent"}`,
              color: relWhich === id ? "#f8fafc" : "#cbd5e1", fontFamily: SANS, fontSize: 13.5, fontWeight: 600,
              "--glow": "rgba(99,102,241,0.6)", whiteSpace: "nowrap",
            }}>{label}</button>
          ))}
        </div>
      )}

      {/* Content */}
      <div style={{ padding: isMobile ? "16px 12px 40px" : "26px 20px 52px" }}>
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
            alt=""
            aria-hidden="true"
            style={{
              height: isMobile ? 44 : 84, width: "auto", flexShrink: 0,
              filter: "invert(1)",
              mixBlendMode: "screen",
              transform: "scaleX(-1)",
            }}
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        </div>
        <div style={{ marginTop: 12, textAlign: "center" }}>
          <div style={{
            fontFamily: SANS, fontWeight: 600, fontSize: isMobile ? 15 : 20,
            color: "#cbd5e1", letterSpacing: 0.2, lineHeight: 1.35,
          }}>
            Logarithmic regression valuation bands for{" "}
            <span style={{ color: "#93c5fd", fontWeight: 700 }}>SPX6900</span>
          </div>
        </div>
      </div>

      {/* About (collapsible) */}
      <div style={{
        maxWidth: MAX_W, margin: "0 auto 20px",
        ...glass("99, 102, 241", 0.08),
        borderRadius: 10, overflow: "hidden",
      }}>
        <button onClick={() => setShowAbout(v => !v)} style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: isMobile ? "13px 16px" : "15px 22px", cursor: "pointer",
          background: "transparent", border: "none",
          fontFamily: SANS, fontSize: isMobile ? 15 : 17, fontWeight: 700, color: "#c4b5fd",
        }}>
          <span>About this chart</span>
          <span style={{ color: "#94a3b8", transition: "transform 0.2s", transform: showAbout ? "rotate(180deg)" : "none" }}>▾</span>
        </button>
        {showAbout && (
          <div style={{
            padding: isMobile ? "0 16px 16px" : "0 22px 20px",
            fontFamily: SANS, fontSize: isMobile ? 14 : 15, color: "#cbd5e1", lineHeight: 1.7,
          }}>
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
        )}
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
                {/* lit value — flashes green/red on each price move, then settles to band color */}
                <span
                  key={tickFlash.key}
                  style={{
                    position: "relative", display: "inline-block",
                    fontFamily: LED, fontSize: isMobile ? 24 : 34, letterSpacing: "0.04em",
                    color: cb.c, textShadow: `0 0 6px ${cb.c}, 0 0 18px ${cb.c}cc`,
                    ...(tickFlash.dir ? {
                      "--flash": tickFlash.dir === "up" ? "#22e07a" : "#ff5247",
                      animation: "price-tick 0.7s ease",
                    } : null),
                  }}
                >
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

      {/* Rainbow chart — the hero, always visible */}
      {/* Controls */}
      <div style={{ maxWidth: MAX_W, margin: "0 auto 14px", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {HZ.map((h, i) => (
            <button key={i} onClick={() => setHi(i)}
              className={`neon-pill${i === hi ? " active" : ""}`}
              style={{
                fontFamily: SANS, fontSize: isMobile ? 13 : 14, fontWeight: 600, padding: isMobile ? "7px 12px" : "8px 16px", borderRadius: 7,
                color: i === hi ? "#f8fafc" : "#94a3b8", "--glow": "#3b82f6",
              }}>{h.l}</button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {TARGETS.map((t, i) => (
            <button key={i} onClick={() => tt(i)}
              className={`neon-pill${tg.has(i) ? " active" : ""}`}
              style={{
                fontFamily: SANS, fontSize: 13, fontWeight: 600, padding: "7px 12px", borderRadius: 6,
                color: tg.has(i) ? "#f8fafc" : "#94a3b8", "--glow": t.c,
              }}>
              <span style={{ fontFamily: MONO }}>{t.label}</span> <span style={{ opacity: 0.55, fontSize: 11 }}>{t.mc}</span>
            </button>
          ))}
        </div>

        <button onClick={() => setShowMilestones(!showMilestones)}
          className={`neon-pill${showMilestones ? " active" : ""}`}
          style={{
          fontFamily: SANS, fontSize: 13, fontWeight: 600, padding: "7px 12px", borderRadius: 6,
          color: showMilestones ? "#f8fafc" : "#94a3b8", "--glow": "#fb923c",
        }}>Crypto Milestones</button>
      </div>

      {/* Chart */}
      <div
        ref={chartBoxRef}
        onMouseMove={handleChartMove}
        onMouseLeave={hideCursor}
        style={{ maxWidth: MAX_W, margin: "0 auto", position: "relative" }}
      >
        <ResponsiveContainer width="100%" height={isMobile ? 440 : isTablet ? 580 : 720}>
          <ComposedChart data={data} margin={{ top: 10, right: isMobile ? 64 : 130, bottom: 24, left: isMobile ? 0 : 12 }}>
            <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.07)" vertical={false} fill="transparent" />
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

        {/* Free crosshair overlay — positioned imperatively in handleChartMove */}
        <div ref={vLineRef} style={{ position: "absolute", display: "none", left: 0, top: 0, width: 1, background: "rgba(255,255,255,0.4)", pointerEvents: "none" }} />
        <div ref={hLineRef} style={{ position: "absolute", display: "none", left: 0, top: 0, height: 1, background: "rgba(255,255,255,0.4)", pointerEvents: "none" }} />
        <div ref={dotRef} style={{ position: "absolute", display: "none", left: 0, top: 0, width: 8, height: 8, borderRadius: "50%", pointerEvents: "none" }} />
        <div ref={boxRef} style={{
          position: "absolute", display: "none", left: 0, top: 0, width: 172, pointerEvents: "none",
          background: "rgba(4,4,12,0.97)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10,
          padding: "10px 13px", fontFamily: SANS, backdropFilter: "blur(8px)",
        }}>
          <div ref={dateRef} style={{ fontFamily: MONO, fontSize: 12, color: "#94a3b8", marginBottom: 4 }} />
          <div ref={priceRef} style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, color: "#f8fafc", lineHeight: 1.1 }} />
          <div ref={bandRef} style={{ fontSize: 13, fontWeight: 700, marginTop: 3 }} />
        </div>
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

      {/* Scale-in / scale-out plan */}
      <div style={{ maxWidth: MAX_W, margin: "32px auto 0" }}>
        <div style={{
          fontFamily: SANS, fontSize: 14, fontWeight: 700, color: "#cbd5e1", marginBottom: 4,
          letterSpacing: 1.2, textTransform: "uppercase",
        }}>
          Scale-In / Scale-Out Plan
        </div>
        <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", marginBottom: 12, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <span>Example risk framework — buy more when it&apos;s historically cheap, take profit when it&apos;s hot. Not financial advice.</span>
          <button onClick={() => setShowDry(v => !v)} style={{
            fontFamily: SANS, fontSize: 12, fontWeight: 600, color: "#93c5fd", cursor: "pointer",
            background: "rgba(59,130,246,0.10)", border: "1px solid rgba(59,130,246,0.3)", borderRadius: 6, padding: "2px 9px",
          }}>
            {showDry ? "Hide" : "What's “dry powder”?"}
          </button>
        </div>
        {showDry && (
          <div style={{
            ...glass("59, 130, 246", 0.08), borderRadius: 10, padding: "11px 15px", marginBottom: 12,
            fontFamily: SANS, fontSize: 13, color: "#cbd5e1", lineHeight: 1.6,
          }}>
            <strong style={{ color: "#f1f5f9" }}>Dry powder</strong> = the cash or stablecoins you&apos;ve set aside specifically to buy dips. So &ldquo;deploy ~25% of dry powder&rdquo; means putting a quarter of <em>that reserve</em> to work — not a quarter of everything you own.
          </div>
        )}
        <div style={{ ...glass("255, 255, 255", 0.04), borderRadius: 12, padding: isMobile ? "6px 8px" : "8px 12px" }}>
          {BAND_LABELS.map((_, i) => i).reverse().map((i, pos, arr) => {
            const bl = BAND_LABELS[i];
            const p = SCALE_PLAN[i];
            const isNow = i === bIdx;
            const sc = p.side === "buy" ? "#4ade80" : p.side === "sell" ? "#f87171" : "#94a3b8";
            const sideLabel = p.side === "buy" ? "BUY" : p.side === "sell" ? "SELL" : "HOLD";
            return (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: isMobile ? 10 : 16,
                padding: isMobile ? "10px 8px" : "11px 12px",
                borderRadius: 9,
                background: isNow ? `${bl.c}24` : "transparent",
                border: `1px solid ${isNow ? bl.c + "80" : "transparent"}`,
                borderBottom: isNow ? `1px solid ${bl.c}80` : (pos < arr.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "1px solid transparent"),
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: isMobile ? 92 : 150, flexShrink: 0 }}>
                  <span style={{
                    width: 11, height: 11, borderRadius: 3, background: bl.c, flexShrink: 0,
                    boxShadow: isNow ? `0 0 8px ${bl.c}` : "none",
                  }} />
                  <span style={{ fontFamily: SANS, fontSize: isMobile ? 13 : 14, fontWeight: isNow ? 700 : 600, color: isNow ? "#f1f5f9" : "#cbd5e1" }}>
                    {bl.l}
                  </span>
                </div>
                <div style={{ flex: 1, fontFamily: SANS, fontSize: isMobile ? 12.5 : 14, color: "#cbd5e1", minWidth: 0 }}>
                  {p.action}
                  <span style={{ display: isMobile ? "block" : "inline", color: "#64748b", fontSize: 12.5, marginLeft: isMobile ? 0 : 8 }}>
                    {p.note}
                  </span>
                </div>
                <span style={{
                  fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: 0.6, whiteSpace: "nowrap",
                  color: sc, background: `${sc}1f`, border: `1px solid ${sc}55`,
                  padding: "3px 9px", borderRadius: 6, flexShrink: 0,
                  boxShadow: isNow ? `0 0 10px ${sc}55` : "none",
                }}>
                  {isNow ? `${sideLabel} · NOW` : sideLabel}
                </span>
              </div>
            );
          })}
        </div>
      </div>

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

      {/* More charts — selected from the top nav */}
      <div id="more-charts" style={{ maxWidth: MAX_W, margin: "44px auto 0", scrollMarginTop: isMobile ? 130 : 74 }}>
        <div style={{
          fontFamily: SANS, fontSize: 13, fontWeight: 700, color: "#94a3b8", marginBottom: 16,
          letterSpacing: 1.4, textTransform: "uppercase", textAlign: "center",
        }}>
          {(NAV_TABS.find(([id]) => id === tab) || ["", "Chart"])[1]}
        </div>
        {tab === "risk" && <RiskChart series={priceData} m={m} isMobile={isMobile} />}
        {tab === "drawdown" && <DrawdownChart series={priceData} isMobile={isMobile} />}
        {tab === "spxbtc" && <SpxBtcChart series={priceData} isMobile={isMobile} />}
        {tab === "relative" && <RelativeChart series={priceData} isMobile={isMobile} which={relWhich} setWhich={setRelWhich} />}
        {tab === "supply" && <SupplyConviction price={last.price} isMobile={isMobile} />}
        {tab === "holders" && <HolderscanDashboard />}
      </div>

      <div style={{
        maxWidth: MAX_W, margin: "16px auto 0", fontFamily: SANS, fontSize: 12,
        color: "#64748b", textAlign: "center", lineHeight: 1.6,
      }}>
        Single-cycle fit on a memecoin. Not financial advice. Supply ~939M.
      </div>
      </div>{/* end content */}

      {/* TradingView / Pine Script modal */}
      {showPine && (
        <div
          onClick={() => setShowPine(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 100, padding: isMobile ? 12 : 24,
            background: "rgba(2,2,8,0.72)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 780, maxHeight: "86vh", display: "flex", flexDirection: "column",
              borderRadius: 14, overflow: "hidden", ...glass("20, 24, 40", 0.55, 20),
            }}
          >
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
              padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.1)",
            }}>
              <div>
                <div style={{ fontFamily: SANS, fontSize: 17, fontWeight: 700, color: "#f1f5f9" }}>
                  TradingView Indicator
                </div>
                <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#94a3b8", marginTop: 2 }}>
                  Pine Script® v6 · paste into Pine Editor and &ldquo;Add to chart&rdquo; (use a log price scale)
                </div>
              </div>
              <button onClick={() => setShowPine(false)} style={{
                fontFamily: SANS, fontSize: 20, lineHeight: 1, color: "#94a3b8", cursor: "pointer",
                background: "transparent", border: "none", padding: 6,
              }}>×</button>
            </div>

            <div style={{ display: "flex", gap: 8, padding: "12px 20px", flexWrap: "wrap" }}>
              <button onClick={copyPine} style={{
                fontFamily: SANS, fontSize: 13, fontWeight: 600, padding: "8px 14px", borderRadius: 7, cursor: "pointer",
                color: pineCopied ? "#4ade80" : "#e2e8f0", ...glass("59, 130, 246", 0.12),
              }}>
                {pineCopied ? "✓ Copied!" : "Copy code"}
              </button>
              <button onClick={downloadPine} style={{
                fontFamily: SANS, fontSize: 13, fontWeight: 600, padding: "8px 14px", borderRadius: 7, cursor: "pointer",
                color: "#e2e8f0", ...glass("34, 197, 94", 0.12),
              }}>
                ↓ Download .pine
              </button>
            </div>

            <pre style={{
              margin: 0, padding: "0 20px 20px", overflow: "auto", flex: 1, minWidth: 0,
              fontFamily: MONO, fontSize: 12, lineHeight: 1.55, color: "#cbd5e1",
              whiteSpace: "pre", tabSize: 2,
            }}>
              {pineCode}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
