import { useState, useEffect, useMemo } from "react";
import { loadWhales } from "./history-data.js";
import { ageRamp } from "./whale-cohorts.js";
import WalletCard, { shortAddr } from "./WalletCard.jsx";
import { SANS, MONO } from "./chart-ui.jsx";

// LIVE WHALE BOARD — a 2D grid of the biggest holders, each cell pulsing green (buying) or red
// (selling) when it MOVES in the live window, dim when flat. Click a wallet → its Zerion card,
// same as the city. The pulse comes from /api/live-flow (Alchemy, ~minutes fresh); the wallet set,
// balances and holder age come from the daily reconstruction (whales.json). Fast layer over the
// deep layer — see api/live-flow.js.

const kM = v => v >= 1e6 ? (v / 1e6).toFixed(v / 1e6 < 10 ? 1 : 0) + "M" : Math.round(v / 1e3) + "k";
const ago = iso => {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 90) return Math.round(s) + "s ago";
  if (s < 5400) return Math.round(s / 60) + " min ago";
  return Math.round(s / 3600) + "h ago";
};
const POLL_MS = 60000;

export default function WhaleBoard({ isMobile }) {
  const [whales, setWhales] = useState(null);   // null=loading, false=failed
  const [live, setLive] = useState(null);       // {moves,updated,error} | null
  const [sel, setSel] = useState(null);
  const [tick, setTick] = useState(0);          // re-render the "N ago" label

  useEffect(() => { let off = false; loadWhales().then(d => { if (!off) setWhales(d ?? false); }); return () => { off = true; }; }, []);

  useEffect(() => {
    let off = false, timer;
    const pull = () => fetch("/api/live-flow").then(r => r.json()).then(d => { if (!off) setLive(d); }).catch(() => { if (!off) setLive(l => l || { moves: [], error: "offline" }); });
    pull(); timer = setInterval(pull, POLL_MS);
    const t2 = setInterval(() => setTick(x => x + 1), 15000);
    return () => { off = true; clearInterval(timer); clearInterval(t2); };
  }, []);

  const { cells, buying, selling } = useMemo(() => {
    if (!whales?.wallets) return { cells: [], buying: 0, selling: 0 };
    const top = whales.wallets.filter(w => w?.a && w.bal >= 1e5).sort((a, b) => b.bal - a.bal).slice(0, isMobile ? 60 : 150);
    const moveMap = new Map((live?.moves || []).map(m => [m.a.toLowerCase(), m.net]));
    const days = top.map(w => w.days || 0); const mn = Math.min(...days), mx = Math.max(...days);
    const ageU = d => mx > mn ? ((d || 0) - mn) / (mx - mn) : 0.5;
    let buying = 0, selling = 0;
    const cells = top.map(w => {
      const net = moveMap.get(w.a.toLowerCase());
      const isLive = net != null;
      const dir = isLive ? (net > 0 ? "buy" : net < 0 ? "sell" : "flat") : "flat";
      if (dir === "buy") buying++; else if (dir === "sell") selling++;
      return { ...w, net: net || 0, isLive, dir, hue: ageRamp(ageU(w.days)).hex };
    });
    // movers first (biggest live move on top), then the rest by size
    cells.sort((a, b) => (Math.abs(b.net) - Math.abs(a.net)) || (b.bal - a.bal));
    return { cells, buying, selling };
  }, [whales, live, isMobile]);

  if (whales === false) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#94a3b8", padding: 60 }}>Whale data is being rebuilt — check back after the next on-chain refresh.</div>;
  if (!whales) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading…</div>;

  const liveOk = live && !live.error && (live.moves?.length || live.block);
  const status = live == null ? "connecting…"
    : live.error ? "live feed unavailable — showing watched wallets"
    : `live · ${live.hours || 6}h window · updated ${ago(live.updated)}`;

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 14px", fontFamily: SANS }}>
      <style>{`
        @keyframes wbBuy { 0%,100%{box-shadow:0 0 0 0 rgba(74,222,128,0)} 50%{box-shadow:0 0 13px 2px rgba(74,222,128,0.6)} }
        @keyframes wbSell { 0%,100%{box-shadow:0 0 0 0 rgba(251,113,133,0)} 50%{box-shadow:0 0 13px 2px rgba(251,113,133,0.6)} }
        .wb-cell{transition:transform .12s} .wb-cell:hover{transform:translateY(-2px)}
      `}</style>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between", margin: "4px 0 12px" }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: MONO, fontSize: 13, color: "#4ade80" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#4ade80", boxShadow: liveOk ? "0 0 8px #4ade80" : "none" }} />{buying} buying
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: MONO, fontSize: 13, color: "#fb7185" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#fb7185" }} />{selling} selling
          </span>
          <span style={{ fontFamily: MONO, fontSize: 12, color: "#64748b" }}>{cells.length} whales ≥100k</span>
        </div>
        <span style={{ fontFamily: MONO, fontSize: 11.5, color: liveOk ? "#5eead4" : "#64748b" }}>{status}</span>
      </div>

      {sel && (
        <div style={{ marginBottom: 14 }}>
          <WalletCard w={sel} wide isMobile={isMobile} accent="#5eead4" flow={sel.net} flowUnit=" SPX"
            lines={[`${kM(sel.bal)} SPX · held ${Math.round((sel.days || 0) / 30)} mo`, sel.isLive ? "moved in the live window" : "no live move — daily baseline"]} />
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 96 : 118}px, 1fr))`, gap: isMobile ? 7 : 9 }}>
        {cells.map(c => {
          const on = sel?.a === c.a;
          const border = c.dir === "buy" ? "rgba(74,222,128,0.75)" : c.dir === "sell" ? "rgba(251,113,133,0.75)" : "rgba(255,255,255,0.10)";
          const anim = c.dir === "buy" ? "wbBuy 1.5s ease-in-out infinite" : c.dir === "sell" ? "wbSell 1.5s ease-in-out infinite" : "none";
          return (
            <button key={c.a} className="wb-cell" onClick={() => setSel(c)} title={c.a}
              style={{
                textAlign: "left", cursor: "pointer", borderRadius: 10, padding: isMobile ? "7px 8px" : "9px 10px",
                background: c.dir === "buy" ? "rgba(74,222,128,0.07)" : c.dir === "sell" ? "rgba(251,113,133,0.07)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${on ? "#5eead4" : border}`, animation: anim, position: "relative", overflow: "hidden",
              }}>
              {/* age tick */}
              <span style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 3, background: c.hue, opacity: 0.85 }} />
              <div style={{ fontFamily: MONO, fontSize: isMobile ? 10.5 : 11.5, color: "#cbd5e1", marginTop: 2 }}>{shortAddr(c.a)}</div>
              <div style={{ fontFamily: MONO, fontSize: isMobile ? 13 : 14, fontWeight: 800, color: "#f1f5f9", marginTop: 1 }}>{kM(c.bal)}</div>
              {c.isLive && c.dir !== "flat" && (
                <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, marginTop: 2, color: c.dir === "buy" ? "#4ade80" : "#fb7185" }}>
                  {c.net > 0 ? "▲ +" : "▼ −"}{kM(Math.abs(c.net))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      <p style={{ fontSize: 12.5, color: "#7c8a9e", lineHeight: 1.6, margin: "14px 2px 0" }}>
        Every tile is a wallet holding ≥100,000 SPX, biggest movers first. A tile <b style={{ color: "#4ade80" }}>pulses green</b> when
        it added and <b style={{ color: "#fb7185" }}>red</b> when it sold within the live window; the coloured cap is holder age
        (warm = new, cyan = long-held). Tap a wallet for its Zerion card. Live moves are near-real-time on-chain transfers
        (~minutes); balances and age come from the daily reconstruction. A distribution snapshot, not a signal.
      </p>
    </div>
  );
}
