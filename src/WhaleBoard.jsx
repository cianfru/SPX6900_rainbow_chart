import { useState, useEffect, useMemo } from "react";
import { loadWhales } from "./history-data.js";
import { ageRamp } from "./whale-cohorts.js";
import WalletCard, { shortAddr } from "./WalletCard.jsx";
import { SANS, MONO } from "./chart-ui.jsx";

// LIVE WHALE BOARD — a 7-DAY sellers' watch. It lists the whales that have MOVED in the last week
// (not all ~575 static tiles), biggest net sellers first. A wallet that keeps its footprint stays
// listed for the whole window, so someone slowly offloading across several days is earmarked and a
// repeat sell reads as a PATTERN, not a blip. A tile PULSES when it also moved in the last few hours
// (still going), and carries a "reducing" flag when it sold on multiple days. Click → Zerion card.
// Live moves are near-real-time on-chain transfers (/api/live-flow); balances + age come from the
// daily reconstruction (whales.json). Falls back to a static top-holders grid when the feed is off.

const kM = v => { const a = Math.abs(v); return a >= 1e6 ? (v / 1e6).toFixed(a / 1e6 < 10 ? 1 : 0) + "M" : Math.round(v / 1e3) + "k"; };
const agoOf = blocks => {
  const s = (blocks || 0) * 12;
  if (s < 3600) return Math.max(1, Math.round(s / 60)) + "m ago";
  if (s < 86400) return Math.round(s / 3600) + "h ago";
  return Math.round(s / 86400) + "d ago";
};
const updAgo = iso => {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  return s < 90 ? Math.round(s) + "s ago" : s < 5400 ? Math.round(s / 60) + " min ago" : Math.round(s / 3600) + "h ago";
};

export default function WhaleBoard({ isMobile }) {
  const [whales, setWhales] = useState(null);
  const [live, setLive] = useState(null);
  const [sel, setSel] = useState(null);
  const [, setTick] = useState(0);

  useEffect(() => { let off = false; loadWhales().then(d => { if (!off) setWhales(d ?? false); }); return () => { off = true; }; }, []);
  useEffect(() => {
    let off = false, timer, t2;
    const pull = () => fetch("/api/live-flow").then(r => r.json()).then(d => { if (!off) setLive(d); }).catch(() => { if (!off) setLive(l => l || { wallets: [], error: "offline" }); });
    pull(); timer = setInterval(pull, 120000); t2 = setInterval(() => setTick(x => x + 1), 20000);
    return () => { off = true; clearInterval(timer); clearInterval(t2); };
  }, []);

  const balOf = useMemo(() => new Map((whales?.wallets || []).map(w => [w.a.toLowerCase(), w])), [whales]);

  // the movers (7-day earmark), joined to balance + age from the daily set
  const movers = useMemo(() => {
    const rows = live?.wallets || [];
    if (!rows.length) return [];
    const ds = rows.map(r => balOf.get(r.a.toLowerCase())?.days || 0);
    const mn = Math.min(...ds), mx = Math.max(...ds);
    const ageU = d => mx > mn ? ((d || 0) - mn) / (mx - mn) : 0.5;
    return rows.map(r => {
      const w = balOf.get(r.a.toLowerCase()) || {};
      const dir = r.net < 0 ? "sell" : "buy";
      const reducing = r.net < 0 && r.sellDays >= 2;      // sold across ≥2 days = slow offloader
      return { ...r, bal: w.bal || 0, days: w.days || 0, hue: ageRamp(ageU(w.days)).hex, dir, reducing, liveMove: !!r.live };
    });
  }, [live, balOf]);

  // fallback set: top holders by size, when the live feed is off
  const staticTop = useMemo(() => {
    if (!whales?.wallets) return [];
    const top = whales.wallets.filter(w => w?.a && w.bal >= 1e5).sort((a, b) => b.bal - a.bal).slice(0, isMobile ? 60 : 150);
    const ds = top.map(w => w.days || 0); const mn = Math.min(...ds), mx = Math.max(...ds);
    return top.map(w => ({ ...w, net: 0, hue: ageRamp(mx > mn ? ((w.days || 0) - mn) / (mx - mn) : 0.5).hex, dir: "flat", liveMove: false }));
  }, [whales, isMobile]);

  if (whales === false) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#94a3b8", padding: 60 }}>Whale data is being rebuilt — check back after the next on-chain refresh.</div>;
  if (!whales) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading…</div>;

  const feedOff = !live || live.error || !(live.wallets?.length);
  const cells = feedOff ? staticTop : movers;
  const sellingNow = movers.filter(m => m.liveMove && m.net < 0).length;
  const sellers = movers.filter(m => m.net < 0).length;

  const status = live == null ? "connecting…"
    : live.error ? "live feed offline — showing holders by size"
    : `${live.days || 7}-day window · updated ${updAgo(live.updated)}`;

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 14px", fontFamily: SANS }}>
      <style>{`
        @keyframes wbSell { 0%,100%{box-shadow:0 0 0 0 rgba(251,113,133,0)} 50%{box-shadow:0 0 13px 2px rgba(251,113,133,0.6)} }
        @keyframes wbBuy { 0%,100%{box-shadow:0 0 0 0 rgba(74,222,128,0)} 50%{box-shadow:0 0 13px 2px rgba(74,222,128,0.6)} }
        .wb-cell{transition:transform .12s} .wb-cell:hover{transform:translateY(-2px)}
      `}</style>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between", margin: "4px 0 12px" }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          {!feedOff ? (
            <>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: MONO, fontSize: 13, color: "#fb7185" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#fb7185", boxShadow: sellingNow ? "0 0 8px #fb7185" : "none" }} />{sellingNow} selling now
              </span>
              <span style={{ fontFamily: MONO, fontSize: 13, color: "#fb7185" }}>{sellers} sold this week</span>
              <span style={{ fontFamily: MONO, fontSize: 12, color: "#64748b" }}>{movers.length} whales moved</span>
            </>
          ) : (
            <span style={{ fontFamily: MONO, fontSize: 12, color: "#64748b" }}>{staticTop.length} whales ≥100k</span>
          )}
        </div>
        <span style={{ fontFamily: MONO, fontSize: 11.5, color: feedOff ? "#64748b" : "#5eead4" }}>{status}</span>
      </div>

      {sel && (
        <div style={{ marginBottom: 14 }}>
          <WalletCard w={sel} wide isMobile={isMobile} accent="#5eead4" flow={sel.net} flowUnit=" SPX"
            lines={[
              `${kM(sel.bal)} SPX · held ${Math.round((sel.days || 0) / 30)} mo`,
              sel.net ? `${sel.net < 0 ? "sold" : "added"} ${kM(Math.abs(sel.net))} over ${live?.days || 7}d · active ${sel.activeDays || 1} day${sel.activeDays > 1 ? "s" : ""}${sel.reducing ? " · slowly reducing" : ""}` : "no move in the window",
            ]} />
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 108 : 138}px, 1fr))`, gap: isMobile ? 7 : 9 }}>
        {cells.map(c => {
          const on = sel?.a === c.a;
          const sell = c.net < 0, buy = c.net > 0;
          const border = c.liveMove ? (sell ? "rgba(251,113,133,0.8)" : "rgba(74,222,128,0.8)")
            : sell ? "rgba(251,113,133,0.45)" : buy ? "rgba(74,222,128,0.4)" : "rgba(255,255,255,0.10)";
          const anim = c.liveMove ? (sell ? "wbSell 1.5s ease-in-out infinite" : "wbBuy 1.5s ease-in-out infinite") : "none";
          return (
            <button key={c.a} className="wb-cell" onClick={() => setSel(c)} title={c.a}
              style={{
                textAlign: "left", cursor: "pointer", borderRadius: 10, padding: isMobile ? "7px 8px 8px" : "9px 10px 10px",
                background: sell ? "rgba(251,113,133,0.07)" : buy ? "rgba(74,222,128,0.07)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${on ? "#5eead4" : border}`, animation: anim, position: "relative", overflow: "hidden",
              }}>
              <span style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 3, background: c.hue, opacity: 0.85 }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 2, gap: 4 }}>
                <span style={{ fontFamily: MONO, fontSize: isMobile ? 10 : 11, color: "#cbd5e1" }}>{shortAddr(c.a)}</span>
                {!feedOff && c.agoBlocks != null && <span style={{ fontFamily: MONO, fontSize: 9.5, color: "#64748b" }}>{agoOf(c.agoBlocks)}</span>}
              </div>
              <div style={{ fontFamily: MONO, fontSize: isMobile ? 13 : 14, fontWeight: 800, color: "#f1f5f9", marginTop: 1 }}>{kM(c.bal)}</div>
              {c.net !== 0 && (
                <div style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 700, marginTop: 2, color: sell ? "#fb7185" : "#4ade80" }}>
                  {sell ? "▼ −" : "▲ +"}{kM(Math.abs(c.net))}<span style={{ color: "#64748b", fontWeight: 500 }}> /{live?.days || 7}d</span>
                </div>
              )}
              {c.reducing && (
                <div style={{ marginTop: 3, fontFamily: MONO, fontSize: 9.5, fontWeight: 700, color: "#fbbf24", letterSpacing: "0.04em" }}>
                  ◱ REDUCING · {c.sellDays}d
                </div>
              )}
            </button>
          );
        })}
      </div>

      {feedOff && !movers.length && (
        <p style={{ fontSize: 12.5, color: "#7c8a9e", lineHeight: 1.6, margin: "14px 2px 0" }}>
          The live-flow feed is offline (needs <b style={{ color: "#c7d2e4" }}>ALCHEMY_KEY</b> in the Vercel env) — showing the biggest holders by size.
          Once it&rsquo;s wired, this becomes a 7-day sellers&rsquo; watch: only the wallets moving, biggest net sellers first, with slow offloaders earmarked.
        </p>
      )}
      {!feedOff && (
        <p style={{ fontSize: 12.5, color: "#7c8a9e", lineHeight: 1.6, margin: "14px 2px 0" }}>
          Whales that <b>moved in the last {live?.days || 7} days</b>, biggest <b style={{ color: "#fb7185" }}>net sellers</b> first. A tile
          <b style={{ color: "#fb7185" }}> pulses</b> when the wallet also moved in the last few hours (still going);
          <b style={{ color: "#fbbf24" }}> ◱ REDUCING</b> marks a wallet that sold on several separate days — slowly offloading, earmarked so a repeat sell
          reads as a pattern. The coloured cap is holder age. Tap a wallet for its Zerion card. Live from on-chain transfers (~minutes); balances and age daily. Not a signal.
        </p>
      )}
    </div>
  );
}
