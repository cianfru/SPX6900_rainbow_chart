import { useMemo, useState, useEffect, useRef } from "react";
import { SPX_URPD } from "./spx-urpd.js";
import { loadUrpd, loadPriceHistory, loadHistory } from "./history-data.js";
import { SANS, MONO, MAX_W, Metric, Explain, ZoomBar } from "./chart-ui.jsx";

// COST-BASIS PROFILE — a volume-profile of SPX6900: the price line over time on the right, and where
// the held supply was BOUGHT as horizontal bars hugging the left price axis (the URPD cost-basis
// distribution, rotated so each bag lines up with its price level). Green = bought below spot (in
// profit), red = above (underwater). The spot line is LIVE (/api/spot) and the profit split recomputes
// against it; the bags are the daily FIFO reconstruction. Uses the FINER `bucketsFine` grid (more
// price pockets) when present, and drag VERTICALLY to zoom into a price band — the pockets rescale to
// fill the width, so a dense cluster near spot reads clearly.

const GRN = "#34d399", RED = "#fb7185", LINE = "#93a4c4", SPOT = "#f8fafc";
const fp = p => p == null ? "—" : p >= 1 ? "$" + p.toFixed(2) : "$" + p.toFixed(p >= 0.1 ? 3 : 4);
const fShort = ts => new Date(ts).toLocaleDateString("en-US", { month: "short", year: "2-digit" });

export default function CostBasisProfileChart({ isMobile, preview = false, price = null }) {
  const [urpd, setUrpd] = useState(null);
  const [px, setPx] = useState(null);
  const [snap, setSnap] = useState(null);
  const [liveSpot, setLiveSpot] = useState(null);
  const [hov, setHov] = useState(null);
  const [zoomP, setZoomP] = useState(null);   // [lo, hi] price band, or null for full range
  const [drag, setDrag] = useState(null);      // { y0, y1 } during a vertical drag-select
  const [tip, setTip] = useState({ x: 0, y: 0 });
  const wrap = useRef(null);

  useEffect(() => {
    let off = false;
    loadUrpd().then(d => { if (!off && d) setUrpd(d); });
    loadPriceHistory().then(h => { if (!off && Array.isArray(h)) setPx(h); });
    loadHistory().then(h => { if (!off && Array.isArray(h) && h.length) setSnap(h.at(-1)?.p ?? null); });
    return () => { off = true; };
  }, []);
  useEffect(() => {
    if (Number.isFinite(price) && price > 0) return;
    let off = false, t;
    const pull = () => fetch("/api/spot").then(r => r.json()).then(d => { if (!off && d?.price > 0) setLiveSpot(d.price); }).catch(() => {});
    pull(); t = setInterval(pull, 30000);
    return () => { off = true; clearInterval(t); };
  }, [price]);

  const u = urpd || SPX_URPD;
  const spot = (Number.isFinite(price) && price > 0) ? price
    : (Number.isFinite(liveSpot) && liveSpot > 0) ? liveSpot
    : (Number.isFinite(snap) && snap > 0) ? snap : (u?.spot ?? 0);

  const base = useMemo(() => {
    const raw = (u?.bucketsFine?.length ? u.bucketsFine : u?.buckets) || [];
    const buckets = raw.filter(b => b.hi > 0).map((b, i) => ({ i, lo: b.lo, hi: b.hi, mid: Math.sqrt(b.lo * b.hi), pct: b.pct }));
    if (!buckets.length) return null;
    const line = (px && px.length ? px : []).map(r => ({ t: Date.parse(r.date), p: +r.price })).filter(r => Number.isFinite(r.t) && r.p > 0);
    const step = Math.max(1, Math.floor(line.length / 360));
    const lineD = line.filter((_, i) => i % step === 0 || i === line.length - 1);
    const dMin = Math.min(...buckets.map(b => b.lo), ...lineD.map(r => r.p), spot);
    const dMax = Math.max(...buckets.map(b => b.hi), ...lineD.map(r => r.p), spot);
    return { buckets, lineD, dMin, dMax, nFine: !!u?.bucketsFine?.length };
  }, [u, px, spot]);

  if (!base) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading cost-basis data…</div>;
  const { buckets, lineD, dMin, dMax, nFine } = base;

  // global profit stats (whole supply, independent of the zoom view)
  const bktsAll = buckets.map(b => ({ ...b, inProfit: b.mid < spot }));
  const inProfit = bktsAll.reduce((a, b) => a + (b.inProfit ? b.pct : 0), 0);
  const wall = bktsAll.reduce((m, b) => (b.pct > (m?.pct ?? -1) ? b : m), null);

  // geometry
  const W = 1200, H = isMobile ? 480 : 580;
  const mL = 58, mR = 14, mT = 18, mB = 40;
  const plotW = W - mL - mR, plotH = H - mT - mB;
  const BW = plotW * (isMobile ? 0.36 : 0.30);
  const GAP = 16;
  const lineX0 = mL + BW + GAP, lineW = W - mR - lineX0;

  const [pLo, pHi] = zoomP ? [Math.min(...zoomP), Math.max(...zoomP)] : [dMin, dMax];
  const yLo = Math.log(pLo * (zoomP ? 0.999 : 0.95)), yHi = Math.log(pHi * (zoomP ? 1.001 : 1.06));
  const yOf = p => mT + plotH * (1 - (Math.log(p) - yLo) / (yHi - yLo));
  const pOf = vy => Math.exp(yLo + (yHi - yLo) * (1 - (vy - mT) / plotH));
  const tMin = lineD.length ? lineD[0].t : 0, tMax = lineD.length ? lineD.at(-1).t : 1;
  const xOf = t => lineX0 + lineW * (tMax > tMin ? (t - tMin) / (tMax - tMin) : 1);

  // visible buckets rescale to their own max, so a zoomed cluster fills the bar width
  const vis = bktsAll.filter(b => b.mid >= pLo * 0.98 && b.mid <= pHi * 1.02);
  const maxPct = Math.max(...vis.map(b => b.pct), 1e-4);
  const barLen = pct => Math.max(pct > 0 ? 1.5 : 0, (pct / maxPct) * (BW - 4));

  const linePath = lineD.map((r, i) => `${i ? "L" : "M"}${xOf(r.t).toFixed(1)} ${yOf(r.p).toFixed(1)}`).join(" ");
  const allTicks = [0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 3];
  const priceTicks = allTicks.filter(v => v >= pLo * 0.98 && v <= pHi * 1.03);
  const xTicks = []; if (lineD.length) for (let k = 0; k <= 5; k++) xTicks.push(tMin + ((tMax - tMin) * k) / 5);
  const spotY = yOf(spot), spotVisible = spot >= pLo * 0.98 && spot <= pHi * 1.03;
  const spotBucket = vis.find(b => spot >= b.lo && spot < b.hi);

  const toVB = e => { const el = wrap.current, r = el.getBoundingClientRect(), s = W / (el.clientWidth || W); return { rx: e.clientX - r.left, ry: e.clientY - r.top, vx: (e.clientX - r.left) * s, vy: (e.clientY - r.top) * s }; };
  const onDown = e => { const { vy } = toVB(e); setDrag({ y0: vy, y1: vy }); setHov(null); };
  const onMove = e => {
    const { rx, ry, vx, vy } = toVB(e); setTip({ x: rx, y: ry });
    if (drag) { setDrag(d => ({ ...d, y1: vy })); return; }
    if (vx < mL || vx > mL + BW) { setHov(null); return; }
    let f = null; for (const b of vis) { if (vy >= yOf(b.hi) && vy <= yOf(b.lo)) { f = b.i; break; } }
    setHov(f);
  };
  const onUp = () => {
    if (drag) {
      if (Math.abs(drag.y1 - drag.y0) > 8) { const a = pOf(drag.y0), b = pOf(drag.y1); setZoomP([Math.min(a, b), Math.max(a, b)]); }
      setDrag(null);
    }
  };
  const hovB = hov != null ? bktsAll.find(b => b.i === hov) : null;

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="Where was SPX6900 bought — and where is that versus price?" accent={GRN}>
        The price line on the right, and <strong style={{ color: "#e2e8f0" }}>where the held supply was bought</strong> as bars on the left,
        each lined up with its price. <strong style={{ color: GRN }}>Green</strong> bought below spot (in profit),
        <strong style={{ color: RED }}> red</strong> above it (underwater). The white spot line is <strong style={{ color: "#e2e8f0" }}>live</strong>. Drag up/down to zoom into a price band.
      </Explain>

      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 8, flexWrap: "wrap" }}>
        <Metric label="spot" value={fp(spot)} color="#e2e8f0" sub="live" />
        <Metric label="supply in profit" value={inProfit.toFixed(0) + "%"} color={inProfit >= 50 ? GRN : RED} sub="bought below spot" />
        {wall && <Metric label="biggest wall" value={wall.pct.toFixed(1) + "%"} color="#f6a23c" sub={`at ${fp(wall.mid)}`} />}
      </div>

      <ZoomBar zoomed={!!zoomP} onReset={() => setZoomP(null)} accent={GRN} />

      <div ref={wrap} style={{ position: "relative", width: "100%", userSelect: "none" }}
        onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={() => { setHov(null); setDrag(null); }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", cursor: drag ? "ns-resize" : "crosshair" }}>
          <defs><clipPath id="cbpClip"><rect x={mL} y={mT} width={plotW} height={plotH} /></clipPath></defs>
          {priceTicks.map(v => (
            <g key={v}>
              <line x1={mL} y1={yOf(v)} x2={W - mR} y2={yOf(v)} stroke="rgba(255,255,255,0.05)" />
              <text x={mL - 6} y={yOf(v) + 4} textAnchor="end" fontSize="15" fontFamily={MONO} fill="#8b98ad">{fp(v)}</text>
            </g>
          ))}
          <line x1={lineX0 - GAP / 2} y1={mT} x2={lineX0 - GAP / 2} y2={mT + plotH} stroke="rgba(255,255,255,0.08)" />

          <g clipPath="url(#cbpClip)">
            {vis.map(b => {
              const yTop = yOf(b.hi), yBot = yOf(b.lo);
              const h = Math.max(1, yBot - yTop - (nFine ? 0.4 : 1));
              const on = hov === b.i;
              return (
                <rect key={b.i} x={mL} y={yTop + 0.4} width={barLen(b.pct)} height={h} rx={1}
                  fill={b.inProfit ? GRN : RED} fillOpacity={on ? 1 : (b.pct > 0 ? 0.82 : 0)}
                  stroke={b === spotBucket ? SPOT : "none"} strokeOpacity={0.6} strokeWidth={b === spotBucket ? 1 : 0} />
              );
            })}
            <path d={linePath} fill="none" stroke={LINE} strokeWidth={1.8} strokeOpacity={0.9} />
            {spotVisible && <>
              <line x1={mL} y1={spotY} x2={W - mR} y2={spotY} stroke={SPOT} strokeWidth={1.2} strokeDasharray="5 5" strokeOpacity={0.85} />
              <circle cx={xOf(tMax)} cy={spotY} r={4} fill={SPOT} />
            </>}
            {drag && Math.abs(drag.y1 - drag.y0) > 3 && (
              <rect x={mL} y={Math.min(drag.y0, drag.y1)} width={plotW} height={Math.abs(drag.y1 - drag.y0)} fill="#5eead4" fillOpacity={0.12} stroke="#5eead4" strokeOpacity={0.5} />
            )}
          </g>
          {spotVisible && <text x={W - mR} y={spotY - 7} textAnchor="end" fontSize="15" fontWeight="700" fontFamily={MONO} fill={SPOT}>spot {fp(spot)}</text>}
          {xTicks.map((t, k) => <text key={k} x={xOf(t)} y={H - 12} textAnchor="middle" fontSize="14" fontFamily={MONO} fill="#8b98ad">{fShort(t)}</text>)}
          <text x={mL} y={H - 12} fontSize="13" fontFamily={SANS} fill="#64748b">← cost basis (held supply)</text>
        </svg>

        {hovB && !drag && (
          <div style={{
            position: "absolute", left: Math.min(tip.x + 14, (wrap.current?.clientWidth || 600) - 190), top: Math.max(0, tip.y - 10),
            pointerEvents: "none", background: "#0a0e1c", border: "1px solid #234", borderRadius: 9, padding: "8px 11px",
            fontFamily: SANS, fontSize: 12.5, boxShadow: "0 8px 26px rgba(0,0,0,0.55)", minWidth: 150,
          }}>
            <div style={{ color: "#e2e8f0", fontWeight: 700, fontFamily: MONO }}>{fp(hovB.lo)} – {fp(hovB.hi)}</div>
            <div style={{ color: hovB.inProfit ? GRN : RED, fontFamily: MONO }}>{hovB.pct.toFixed(hovB.pct < 1 ? 2 : 1)}% of held supply</div>
            <div style={{ color: "#94a3b8" }}>bought here — {hovB.inProfit ? "in profit" : "underwater"}</div>
          </div>
        )}
      </div>

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        A cost-basis profile — the held supply&rsquo;s acquisition price (from the local FIFO reconstruction, {buckets.length} price pockets) as bars on the left,
        aligned to the same log price axis as the line. <strong style={{ color: GRN }}>{inProfit.toFixed(0)}% sits in profit</strong>{wall ? <>, the heaviest wall around <strong style={{ color: "#f6a23c" }}>{fp(wall.mid)}</strong></> : null}.
        Spot is live (~30s); the profit split recomputes against it; the bags refresh daily. Drag up/down to zoom a price band, hover a bar for its detail. A holder-cost position, not a signal.
      </div>
    </div>
  );
}
