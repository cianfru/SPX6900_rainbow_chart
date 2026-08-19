import { useEffect, useMemo, useRef, useState } from "react";
import { loadWhaleEntry } from "./history-data.js";
import { SANS, MONO, MAX_W, Explain, ViewTabs } from "./chart-ui.jsx";

// WHEN THE WHALES BOUGHT — every wallet ≥100k SPX as a glowing orb sitting on the SPX price curve at
// the point it bought (coin-weighted entry date × average price paid), sized by its bag, green if the
// bag is in profit / red if underwater. The reveal: whales are NOT mostly early — a bright red swarm
// sits up near the 2025 highs (bought high, holding underwater), a few green giants down at the launch
// lows. Interactive: hover a whale for its numbers, click to open it on Zerion. Ungated. Canvas so
// hundreds of glowing bubbles stay smooth. Shares src/whale-entry.js with the rotation card + build.

const short = a => a.slice(0, 6) + "…" + a.slice(-4);
const kM = v => { const x = Math.abs(v); return x >= 1e6 ? (v / 1e6).toFixed(x / 1e6 < 10 ? 1 : 0) + "M" : Math.round(v / 1e3) + "k"; };
const fmtDate = t => new Date(t).toLocaleDateString(undefined, { year: "numeric", month: "short" });
const fmtPrice = p => (p >= 1 ? "$" + p.toFixed(2) : "$" + p.toFixed(p < 0.01 ? 4 : 3));

const BANDS = [
  { key: "all", label: "All whales", lo: 0 },
  { key: "s", label: "100k–1M", lo: 1e5, hi: 1e6 },
  { key: "m", label: "1M–5M", lo: 1e6, hi: 5e6 },
  { key: "l", label: "5M+", lo: 5e6, hi: Infinity },
];
const PMIN = 0.001, PMAX = 2.6, LGMIN = Math.log10(PMIN), LGMAX = Math.log10(PMAX);

export default function WhaleEntryChart({ isMobile, price }) {
  const wrap = useRef(null), cvs = useRef(null);
  const [data, setData] = useState(undefined);   // undefined loading · null failed · object ok
  const [band, setBand] = useState("all");
  const [hover, setHover] = useState(null);       // { w, x, y }
  const [w, setW] = useState(900);
  const geomRef = useRef([]);                     // [{w, x, y, r}] screen positions for hit-testing

  useEffect(() => { let off = false; loadWhaleEntry().then(d => { if (!off) setData(d ?? null); }); return () => { off = true; }; }, []);
  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(es => setW(es[0].contentRect.width));
    ro.observe(wrap.current); return () => ro.disconnect();
  }, []);

  const H = isMobile ? 380 : 520;
  // LIVE price wins over the frozen one baked into the JSON, so the "today" line + green/red split
  // never go stale between the daily data rebuilds — post the card/chart whenever.
  const livePrice = (price && price > 0) ? price : (data ? data.price : 0);
  const isUp = c => c < livePrice;
  const livePct = useMemo(() => (data ? Math.round(100 * data.whales.filter(x => isUp(x.cost)).length / data.whales.length) : 0), [data, livePrice]);
  const whales = useMemo(() => {
    if (!data) return [];
    const b = BANDS.find(x => x.key === band);
    const f = band === "all" ? data.whales : data.whales.filter(x => x.bag >= b.lo && x.bag < (b.hi ?? Infinity));
    return f.slice().sort((a, c) => c.bag - a.bag);   // big first → small bright cores on top
  }, [data, band]);

  // draw
  useEffect(() => {
    const el = cvs.current; if (!el || !data) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    el.width = w * dpr; el.height = H * dpr;
    const g = el.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, H);
    const mL = isMobile ? 46 : 60, mR = 16, mT = 14, mB = 34;
    const pW = w - mL - mR, pH = H - mT - mB;
    const t0 = data.launch, t1 = data.now, span = Math.max(1, t1 - t0);
    const X = t => mL + ((t - t0) / span) * pW;
    const Y = p => { const lg = Math.log10(Math.max(PMIN, Math.min(PMAX, p))); return mT + pH - ((lg - LGMIN) / (LGMAX - LGMIN)) * pH; };

    // gridlines
    g.strokeStyle = "rgba(255,255,255,0.05)"; g.lineWidth = 1; g.font = `12px ${MONO}`; g.fillStyle = "#64748b";
    for (const p of [0.001, 0.01, 0.1, 1]) { const y = Y(p); g.beginPath(); g.moveTo(mL, y); g.lineTo(mL + pW, y); g.stroke(); g.textAlign = "right"; g.fillText(p < 1 ? "$" + p : "$1", mL - 6, y + 4); }
    for (let yr = 2024; yr <= new Date(t1).getUTCFullYear(); yr++) { const t = Date.parse(`${yr}-01-01`); if (t < t0 || t > t1) continue; const x = X(t); g.strokeStyle = "rgba(255,255,255,0.05)"; g.beginPath(); g.moveTo(x, mT); g.lineTo(x, mT + pH); g.stroke(); g.textAlign = "center"; g.fillStyle = "#64748b"; g.fillText(String(yr), x, mT + pH + 22); }

    // price curve
    g.beginPath(); data.curve.forEach(([t, p], i) => { const x = X(t), y = Y(p); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.strokeStyle = "rgba(219,228,255,0.5)"; g.lineWidth = 1.4; g.stroke();

    // today line (live price)
    const yNow = Y(livePrice);
    g.setLineDash([6, 5]); g.strokeStyle = "rgba(94,234,212,0.85)"; g.lineWidth = 1.4; g.beginPath(); g.moveTo(mL, yNow); g.lineTo(mL + pW, yNow); g.stroke(); g.setLineDash([]);
    g.fillStyle = "#5eead4"; g.textAlign = "left"; g.font = `600 12px ${SANS}`; g.fillText(`today ${fmtPrice(livePrice)} · below = in profit`, mL + 6, yNow - 7);

    // bubbles — additive glow via shadowBlur, big first; colour by live price
    const maxBag = Math.max(...data.whales.map(x => x.bag));
    const RMAX = isMobile ? 22 : 30, RMIN = 2.2;
    const geom = [];
    g.globalCompositeOperation = "lighter";
    for (const wl of whales) {
      const r = Math.max(RMIN, Math.sqrt(wl.bag / maxBag) * RMAX);
      const x = X(wl.t), y = Y(wl.cost), up = isUp(wl.cost);
      geom.push({ w: wl, x, y, r });
      const col = up ? "34,197,94" : "244,63,94";
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, `rgba(${up ? "180,255,205" : "255,190,200"},0.85)`);
      grd.addColorStop(0.4, `rgba(${col},0.5)`); grd.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
    g.globalCompositeOperation = "source-over";
    // bright cores
    for (const gm of geom) { g.fillStyle = isUp(gm.w.cost) ? "rgba(201,255,224,0.9)" : "rgba(255,214,222,0.9)"; g.beginPath(); g.arc(gm.x, gm.y, Math.max(1, gm.r * 0.26), 0, 7); g.fill(); }
    // hover ring
    if (hover) { g.strokeStyle = "#fff"; g.lineWidth = 2; g.beginPath(); g.arc(X(hover.w.t), Y(hover.w.cost), Math.max(RMIN, Math.sqrt(hover.w.bag / maxBag) * RMAX) + 3, 0, 7); g.stroke(); }
    geomRef.current = geom;
  }, [data, whales, w, H, isMobile, hover, livePrice]);

  const pick = (cx, cy) => {
    let best = null, bd = 1e9;
    for (const gm of geomRef.current) { const dx = cx - gm.x, dy = cy - gm.y, d = dx * dx + dy * dy; const rr = (gm.r + 4) ** 2; if (d < rr && d < bd) { bd = d; best = gm; } }
    return best;
  };
  const onMove = e => {
    const r = cvs.current.getBoundingClientRect();
    const hit = pick(e.clientX - r.left, e.clientY - r.top);
    setHover(hit ? { w: hit.w, x: hit.x, y: hit.y } : null);
  };

  if (data === undefined) return <div style={{ textAlign: "center", fontFamily: MONO, color: "#64748b", padding: 60 }}>Loading whale entries…</div>;
  if (!data) return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="When did the whales actually buy?" accent="#5eead4">Every wallet ≥100k SPX placed on the price curve where it bought.</Explain>
      <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 50 }}>Being reconstructed — appears after the next on-chain refresh.</div>
    </div>
  );

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }} ref={wrap}>
      <Explain q="When did the whales actually buy — early and cheap, or late and high?" accent="#5eead4">
        Every wallet ≥100k SPX is a glowing orb on the SPX price curve, at the point it bought. <strong style={{ color: "#22c55e" }}>Green</strong> = its bag is in profit, <strong style={{ color: "#fb7185" }}>red</strong> = underwater. Bubble size = bag. The surprise: most whales bought <strong style={{ color: "#e2e8f0" }}>late and high</strong>, not at the lows.
      </Explain>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", margin: "4px 2px 10px" }}>
        <ViewTabs tabs={BANDS.map(b => [b.key, b.label])} value={band} onChange={setBand} />
        <div style={{ fontFamily: MONO, fontSize: 12.5, color: "#8595ab" }}>
          {whales.length.toLocaleString()} whales · <span style={{ color: "#22c55e" }}>{livePct}% in profit</span> · {data.pctLate}% bought after year one
        </div>
      </div>

      <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", background: "#0a0e1c", border: "1px solid rgba(255,255,255,0.08)" }}>
        <canvas ref={cvs} onMouseMove={onMove} onMouseLeave={() => setHover(null)}
          onClick={() => hover && window.open(`https://app.zerion.io/${hover.w.a}/overview`, "_blank", "noopener")}
          style={{ width: "100%", height: H, display: "block", cursor: hover ? "pointer" : "default" }} />
        {hover && (
          <div style={{ position: "absolute", pointerEvents: "none", left: Math.min(Math.max(8, hover.x + 12), w - 190), top: Math.min(Math.max(8, hover.y - 10), H - 96),
            background: "rgba(8,11,20,0.95)", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 9, padding: "8px 11px", fontFamily: MONO, fontSize: 12, color: "#e2e8f0", width: 176 }}>
            <div style={{ fontWeight: 700, color: "#f1f5f9" }}>{short(hover.w.a)}</div>
            <div style={{ marginTop: 4, color: "#94a3b8" }}>{kM(hover.w.bag)} SPX held</div>
            <div style={{ color: "#94a3b8" }}>bought ~{fmtDate(hover.w.t)} @ {fmtPrice(hover.w.cost)}</div>
            <div style={{ marginTop: 3, fontWeight: 700, color: isUp(hover.w.cost) ? "#4ade80" : "#fb7185" }}>{isUp(hover.w.cost) ? "in profit" : "underwater"} · {(livePrice / hover.w.cost).toFixed(2)}× on bag</div>
            <div style={{ marginTop: 4, color: "#5eead4", fontSize: 11 }}>click → Zerion ↗</div>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 18, marginTop: 10, fontFamily: MONO, fontSize: 12.5, color: "#94a3b8", flexWrap: "wrap" }}>
        <span><span style={{ color: "#22c55e" }}>●</span> in profit</span>
        <span><span style={{ color: "#fb7185" }}>●</span> underwater</span>
        <span style={{ color: "#64748b" }}>bubble size = bag · x = when bought · y = price paid</span>
      </div>

      <p style={{ fontSize: 12, color: "#7c8a9e", lineHeight: 1.55, margin: "12px 2px 0" }}>
        Coin-weighted entry (when a wallet's coins arrived) × its average cost, so each bubble sits on the curve. Colour is whether that average
        cost is below today's price. Average-cost on weekly Ethereum balances; current ≥100k holders only, so early buyers who sold out aren't
        here (survivorship). A valuation read on who's up — not advice.
      </p>
    </div>
  );
}
