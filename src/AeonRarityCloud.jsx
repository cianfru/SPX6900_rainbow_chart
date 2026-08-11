import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { SANS, MONO } from "./chart-ui.jsx";

// ============================================================================
// Every AEON on the rarity curve, canvas, because SVG cannot carry this.
// ============================================================================
// The first attempt drew all 3,333 tokens as recharts <Scatter> points. It worked, but
// measured 18s to first paint and ~1s of latency per hover: 3,333 DOM nodes plus recharts
// re-scanning every series on each mousemove. A rarity cloud is exactly the case canvas
// exists for, one node, all points, hit-testing we control.
//
// Hit-testing uses a per-pixel-column bucket. Rank is dense and monotonic (~3 tokens per
// pixel at normal widths), so the nearest point to the cursor is always within a couple of
// columns, no quadtree needed.
// ============================================================================

const PAD = { t: 12, r: 16, b: 40, l: 56 };

export default function AeonRarityCloud({ tokens, total, tiers, tierOf, selId, onSelect, height = 360, isMobile }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [w, setW] = useState(0);
  const [hover, setHover] = useState(null);   // { token, x, y }

  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const ro = new ResizeObserver(e => setW(e[0].contentRect.width));
    ro.observe(el); setW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  const h = height;
  const scales = useMemo(() => {
    if (!w || !tokens.length) return null;
    const scores = tokens.map(t => t.score).filter(v => v > 0);
    const lo = Math.min(...scores), hi = Math.max(...scores);
    const ly = Math.log(lo), lh = Math.log(hi) - ly || 1;
    // LOG rank: statistical rarity is heavy-tailed, so on a linear axis the Legendary/Epic
    // end, the part anyone actually cares about, collapses into the left edge.
    const lx = Math.log(1), lxs = Math.log(total) - lx || 1;
    const x = r => PAD.l + ((Math.log(Math.max(r, 1)) - lx) / lxs) * (w - PAD.l - PAD.r);
    const y = s => h - PAD.b - ((Math.log(Math.max(s, lo)) - ly) / lh) * (h - PAD.t - PAD.b);
    return { x, y, lo, hi };
  }, [w, h, tokens, total]);

  // pixel-column buckets for hit-testing
  const buckets = useMemo(() => {
    if (!scales) return null;
    const m = new Map();
    for (const t of tokens) {
      const col = Math.round(scales.x(t.rank));
      if (!m.has(col)) m.set(col, []);
      m.get(col).push(t);
    }
    return m;
  }, [scales, tokens]);

  // draw
  useEffect(() => {
    const cv = canvasRef.current; if (!cv || !scales) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = w * dpr; cv.height = h * dpr;
    cv.style.width = w + "px"; cv.style.height = h + "px";
    const g = cv.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    // grid + y ticks (log)
    g.font = `11px ${MONO.split(",")[0].replace(/["']/g, "")}, monospace`;
    g.textAlign = "right"; g.textBaseline = "middle";
    const ticks = [];
    for (let e = Math.floor(Math.log10(scales.lo)); e <= Math.ceil(Math.log10(scales.hi)); e++) {
      for (const m of [1, 2, 5]) { const v = m * 10 ** e; if (v >= scales.lo && v <= scales.hi) ticks.push(v); }
    }
    for (const v of ticks.slice(0, 8)) {
      const yy = scales.y(v);
      g.strokeStyle = "rgba(255,255,255,0.06)"; g.setLineDash([2, 8]); g.beginPath();
      g.moveTo(PAD.l, yy); g.lineTo(w - PAD.r, yy); g.stroke(); g.setLineDash([]);
      g.fillStyle = "#cbd5e1";
      g.fillText(v >= 1000 ? (v / 1000).toFixed(0) + "k" : String(Math.round(v)), PAD.l - 8, yy);
    }

    // points, tier by tier so colour changes are batched
    for (const tier of tiers) {
      g.fillStyle = tier.c; g.globalAlpha = 0.75;
      g.beginPath();
      for (const t of tokens) {
        if (tierOf(t.rank, total) !== tier) continue;
        const cx = scales.x(t.rank), cy = scales.y(t.score);
        g.moveTo(cx + 2.1, cy); g.arc(cx, cy, 2.1, 0, Math.PI * 2);
      }
      g.fill();
    }
    g.globalAlpha = 1;

    // x axis + labels
    g.strokeStyle = "rgba(255,255,255,0.15)"; g.beginPath();
    g.moveTo(PAD.l, h - PAD.b); g.lineTo(w - PAD.r, h - PAD.b); g.stroke();
    g.textAlign = "center"; g.textBaseline = "top"; g.fillStyle = "#cbd5e1";
    for (const r of [1, 10, 50, 200, 500, 1000, 2000, total]) {
      if (r > total) continue;
      g.fillText(r === 1 ? "rarest" : r >= 1000 ? (r / 1000).toFixed(1) + "k" : String(r), scales.x(r), h - PAD.b + 8);
    }
    g.fillStyle = "#64748b";
    g.font = `${isMobile ? 10.5 : 12}px ${SANS.split(",")[0].replace(/["']/g, "")}, sans-serif`;
    g.fillText(isMobile ? "← rarer          more common →" : "← rarer          rarity rank          more common →", PAD.l + (w - PAD.l - PAD.r) / 2, h - 16);

    // pinned token ring
    const sel = tokens.find(t => t.id === selId);
    if (sel) {
      const cx = scales.x(sel.rank), cy = scales.y(sel.score);
      g.strokeStyle = "#f8fafc"; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, 8, 0, Math.PI * 2); g.stroke();
      g.fillStyle = tierOf(sel.rank, total).c; g.beginPath(); g.arc(cx, cy, 3.4, 0, Math.PI * 2); g.fill();
    }
    // hovered token ring
    if (hover?.token) {
      const cx = scales.x(hover.token.rank), cy = scales.y(hover.token.score);
      g.strokeStyle = "#e2e8f0"; g.lineWidth = 1.5; g.beginPath(); g.arc(cx, cy, 6, 0, Math.PI * 2); g.stroke();
    }
  }, [w, h, scales, tokens, tiers, tierOf, total, selId, hover, isMobile]);

  const pick = useCallback(ev => {
    if (!scales || !buckets) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    const px = ev.clientX - rect.left, py = ev.clientY - rect.top;
    if (px < PAD.l - 6 || px > w - PAD.r + 6) return null;
    let best = null, bestD = Infinity;
    for (let c = Math.round(px) - 3; c <= Math.round(px) + 3; c++) {
      for (const t of buckets.get(c) || []) {
        const d = (scales.x(t.rank) - px) ** 2 + (scales.y(t.score) - py) ** 2;
        if (d < bestD) { bestD = d; best = t; }
      }
    }
    return bestD <= 26 ** 2 ? { token: best, x: px, y: py } : null;
  }, [scales, buckets, w]);

  if (!tokens.length) return null;

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%", height: h, touchAction: "pan-y" }}>
      <canvas
        ref={canvasRef}
        style={{ display: "block", cursor: hover ? "pointer" : "crosshair" }}
        onMouseMove={e => setHover(pick(e))}
        onMouseLeave={() => setHover(null)}
        onClick={e => { const p = pick(e); if (p?.token) onSelect(p.token.id); }}
        onTouchStart={e => { const t = e.touches[0]; if (t) setHover(pick({ clientX: t.clientX, clientY: t.clientY })); }}
      />
      {hover?.token && (() => {
        const t = hover.token, tier = tierOf(t.rank, total);
        const flip = hover.x > w - 230;
        return (
          <div style={{
            position: "absolute", left: flip ? hover.x - 218 : hover.x + 16, top: Math.max(4, Math.min(h - 108, hover.y - 50)),
            pointerEvents: "none", background: "#0a0e1c", border: "1px solid " + tier.c + "66", borderRadius: 10, padding: 8,
            display: "flex", gap: 9, alignItems: "center", boxShadow: "0 8px 26px rgba(0,0,0,0.6)", zIndex: 5,
          }}>
            {t.img && <img src={t.img} alt={"AEON #" + t.id} width={84} height={84}
              style={{ width: 84, height: 84, borderRadius: 8, objectFit: "cover", display: "block", background: "#05050e", border: "1px solid rgba(255,255,255,0.10)" }} />}
            <div style={{ fontFamily: SANS, fontSize: 12.5, whiteSpace: "nowrap" }}>
              <div style={{ color: "#e2e8f0", fontWeight: 800, fontSize: 14 }}>AEON #{t.id}</div>
              <div style={{ color: tier.c, fontWeight: 700 }}>{tier.name}</div>
              <div style={{ color: "#94a3b8", fontFamily: MONO }}>rank {t.rank.toLocaleString()}</div>
              <div style={{ color: "#64748b", fontSize: 11.5, marginTop: 2 }}>click to pin</div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
