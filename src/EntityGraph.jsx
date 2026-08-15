import { useMemo, useState } from "react";
import { SANS, MONO } from "./chart-ui.jsx";

// Bubblemaps/Arkham-style view of the entity clusters. Each ENTITY is a bubble sized by its combined
// holdings; inside it, the wallets one owner controls sit as nodes (sized by their own balance when the
// engine has emitted per-wallet balances) wired together by the real drain/fund edges. Deterministic
// layout, no randomness (reproducible, and the sandbox blocks Math.random anyway). Clusters are packed
// so the biggest owners read at a glance; hover a wallet for its address + balance, click a cluster to
// pin its detail. This is the readable companion to the by-wallet list.

const short = a => a.slice(0, 6) + "…" + a.slice(-4);
const fSpx = v => { const a = Math.abs(v); return a >= 1e6 ? (v / 1e6).toFixed(2) + "M" : a >= 1e3 ? (v / 1e3).toFixed(1) + "k" : Math.round(v).toString(); };
// a cool violet→cyan palette so clusters are distinguishable without shouting
const PAL = ["#a78bfa", "#818cf8", "#60a5fa", "#38bdf8", "#22d3ee", "#2dd4bf", "#c084fc", "#7dd3fc"];
const kindColor = k => k === "drain" ? "#f472b6" : "#38bdf8";
// buy/sell colour from a 30-day net flow (null → no flow data yet, fall back to identity palette)
const BUY = "#4ade80", SELL = "#fb7185", FLAT = "#8b93a7";
const flowCol = (f, bal) => typeof f !== "number" ? null : (Math.abs(f) < Math.max(2000, (bal || 0) * 0.01) ? FLAT : (f > 0 ? BUY : SELL));

// Deterministic circle-pack: place biggest first at the origin, then spiral each next one out to the
// first spot that clears every placed circle. O(n²) but n is the ~60 shown clusters, so it's instant.
function pack(items, gap) {
  const placed = [];
  for (const it of items) {
    if (!placed.length) { it.x = 0; it.y = 0; placed.push(it); continue; }
    let found = null, ang = 0, rad = it.r + gap;
    for (let guard = 0; guard < 20000 && !found; guard++) {
      const x = Math.cos(ang) * rad, y = Math.sin(ang) * rad;
      if (placed.every(p => Math.hypot(p.x - x, p.y - y) >= p.r + it.r + gap)) found = { x, y };
      ang += 0.6; if (ang > Math.PI * 2) { ang -= Math.PI * 2; rad += Math.max(3, it.r * 0.35); }
    }
    it.x = found ? found.x : 0; it.y = found ? found.y : 0; placed.push(it);
  }
  return placed;
}

export default function EntityGraph({ entities, heldSupply, spot, isMobile, onSelect, selectedId }) {
  const [hover, setHover] = useState(null);   // {a, bal, flow, x, y}
  const hasFlow = entities.some(e => typeof e.d30 === "number");

  const laid = useMemo(() => {
    const shown = entities.slice(0, isMobile ? 28 : 60);
    if (!shown.length) return null;
    const maxBal = Math.max(...shown.map(e => e.bal || e.size || 1));
    // entity radius ∝ sqrt(holdings) so AREA tracks holdings; a floor so tiny clusters are still clickable
    const R = e => 16 + 52 * Math.sqrt((e.bal || e.size || 1) / maxBal);
    const items = shown.map(e => ({ e, r: R(e) }));
    const packed = pack(items, isMobile ? 7 : 10);
    // bounding box → viewBox
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of packed) { x0 = Math.min(x0, p.x - p.r); y0 = Math.min(y0, p.y - p.r); x1 = Math.max(x1, p.x + p.r); y1 = Math.max(y1, p.y + p.r); }
    const pad = 14;
    // per-entity internal layout: wallets as nodes (largest centred, rest on a ring) + edges
    const clusters = packed.map(({ e, r, x, y }) => {
      const wb = e.walletBal || {};
      const ws = [...e.wallets].sort((a, b) => (wb[b] || 0) - (wb[a] || 0));
      const maxW = Math.max(1, ...ws.map(a => wb[a] || 0));
      const inner = r - 4;
      const pos = {};
      ws.forEach((a, i) => {
        if (i === 0 && ws.length > 1) { pos[a] = { x, y }; return; }      // biggest wallet at the centre
        const n = ws.length > 1 ? ws.length - 1 : 1, k = ws.length > 1 ? i - 1 : 0;
        const ang = (k / n) * Math.PI * 2 - Math.PI / 2;
        const rr = ws.length === 1 ? 0 : inner * 0.58;
        pos[a] = { x: x + Math.cos(ang) * rr, y: y + Math.sin(ang) * rr };
      });
      const nodeR = a => Math.max(2.2, Math.min(inner * 0.42, 3 + 9 * Math.sqrt((wb[a] || 0) / maxW)));
      const edges = (e.edges || []).filter(g => pos[g.from] && pos[g.to]);
      return { e, r, x, y, ws, pos, nodeR, edges, color: PAL[(e.id.charCodeAt(3) + e.wallets.length) % PAL.length] };
    });
    return { clusters, viewBox: `${x0 - pad} ${y0 - pad} ${(x1 - x0) + pad * 2} ${(y1 - y0) + pad * 2}`, w: (x1 - x0) + pad * 2, h: (y1 - y0) + pad * 2 };
  }, [entities, isMobile]);

  if (!laid) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 40 }}>No clusters to plot.</div>;

  return (
    <div style={{ position: "relative", width: "100%", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, background: "radial-gradient(120% 120% at 50% 0%, #0d1018, #070810)", overflow: "hidden" }}>
      <svg viewBox={laid.viewBox} width="100%" style={{ display: "block", height: isMobile ? 460 : 620 }} preserveAspectRatio="xMidYMid meet"
        onMouseLeave={() => setHover(null)}>
        {laid.clusters.map(c => {
          const sel = selectedId === c.e.id;
          const fcol = flowCol(c.e.d30, c.e.bal);   // buy/sell ring; null before the flow data lands
          const halo = fcol || c.color;
          const wf = c.e.walletFlow || {};
          return (
            <g key={c.e.id} style={{ cursor: "pointer" }} onClick={() => onSelect && onSelect(c.e.id)}>
              {/* cluster halo — coloured by the cluster's 30d net flow (green accumulating · red distributing) */}
              <circle cx={c.x} cy={c.y} r={c.r} fill={halo} fillOpacity={sel ? 0.16 : fcol ? 0.09 : 0.06}
                stroke={halo} strokeOpacity={sel ? 0.95 : c.e.flagged ? 0.5 : fcol ? 0.7 : 0.35} strokeWidth={sel ? 2 : fcol ? 1.4 : 1}
                strokeDasharray={c.e.flagged ? "3 3" : "none"} />
              {/* internal edges */}
              {c.edges.map((g, i) => (
                <line key={i} x1={c.pos[g.from].x} y1={c.pos[g.from].y} x2={c.pos[g.to].x} y2={c.pos[g.to].y}
                  stroke={kindColor(g.kind)} strokeOpacity={0.32} strokeWidth={0.9} />
              ))}
              {/* wallet nodes */}
              {c.ws.map(a => {
                const p = c.pos[a], nr = c.nodeR(a);
                const nfc = flowCol(wf[a], (c.e.walletBal || {})[a]) || c.color;   // each wallet tinted by its own 30d flow
                return <circle key={a} cx={p.x} cy={p.y} r={nr} fill={nfc} fillOpacity={0.92} stroke="#0a0c12" strokeWidth={0.5}
                  onMouseEnter={() => setHover({ a, bal: (c.e.walletBal || {})[a] ?? null, flow: wf[a], x: p.x, y: p.y })} />;
              })}
              {/* size label on the bigger clusters */}
              {c.r > 34 && typeof c.e.bal === "number" && (
                <text x={c.x} y={c.y + c.r + 11} textAnchor="middle" fontSize={10.5} fontFamily={MONO} fill="#94a3b8">{fSpx(c.e.bal)}</text>
              )}
            </g>
          );
        })}
      </svg>

      {hover && (
        <div style={{ position: "absolute", left: 12, bottom: 12, background: "rgba(6,8,14,0.94)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 8, padding: "8px 12px", fontFamily: MONO, fontSize: 12.5, color: "#e2e8f0", pointerEvents: "none" }}>
          <div>{short(hover.a)}</div>
          {hover.bal != null && hover.bal > 0 && <div style={{ color: "#cbd5e1", marginTop: 2 }}>{fSpx(hover.bal)} SPX{spot > 0 ? ` · $${Math.round(hover.bal * spot).toLocaleString()}` : ""}</div>}
          {typeof hover.flow === "number" && Math.abs(hover.flow) >= 2000 && <div style={{ color: hover.flow > 0 ? BUY : SELL, marginTop: 2 }}>{hover.flow > 0 ? "▲ added" : "▼ shed"} {fSpx(Math.abs(hover.flow))} · 30d</div>}
        </div>
      )}

      <div style={{ position: "absolute", top: 10, right: 12, fontFamily: SANS, fontSize: 11.5, color: "#64748b", textAlign: "right", lineHeight: 1.6, pointerEvents: "none" }}>
        {hasFlow
          ? <div><span style={{ color: BUY }}>●</span> accumulating <span style={{ color: SELL }}>●</span> distributing <span style={{ color: FLAT }}>●</span> flat · 30d</div>
          : <div><span style={{ color: "#a78bfa" }}>●</span> bubble = one owner · size = holdings</div>}
        <div><span style={{ color: kindColor("drain") }}>-</span> drain <span style={{ color: kindColor("fund") }}>-</span> fund · dashed = flagged</div>
      </div>
    </div>
  );
}
