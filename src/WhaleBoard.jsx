import { useState, useEffect, useMemo } from "react";
import { loadWhales, loadWhaleCampaigns } from "./history-data.js";
import { ageRamp } from "./whale-cohorts.js";
import WalletCard, { shortAddr } from "./WalletCard.jsx";
import { SANS, MONO } from "./chart-ui.jsx";

// LIVE WHALE BOARD — a persistent sellers' watch. The list is the SELL-CAMPAIGNS from
// whale-campaigns.json (a daily cron): a wallet enters when it starts moving, ACCUMULATES its whole
// run, its 7-day idle clock RESETS on every new move, and it only drops off after 7 silent days — so
// someone slowly offloading over weeks stays earmarked with the full footprint, and a repeat sell
// reads as a pattern. Biggest net sellers first. A tile PULSES when the wallet also moved in the last
// few hours (the minute-fresh /api/live-flow layer = "still going"). Click → Zerion card.
// Falls back to the on-view live feed, then a static top-holders grid, if the campaign file is empty.

const DAY = 864e5;
const kM = v => { const a = Math.abs(v); return a >= 1e6 ? (v / 1e6).toFixed(a / 1e6 < 10 ? 1 : 0) + "M" : Math.round(v / 1e3) + "k"; };
const agoMs = ms => {
  const s = Math.max(0, ms) / 1000;
  if (s < 3600) return Math.max(1, Math.round(s / 60)) + "m ago";
  if (s < 86400) return Math.round(s / 3600) + "h ago";
  return Math.round(s / 86400) + "d ago";
};
const updAgo = iso => { const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000); return s < 90 ? Math.round(s) + "s ago" : s < 5400 ? Math.round(s / 60) + " min ago" : Math.round(s / 3600) + "h ago"; };

export default function WhaleBoard({ isMobile }) {
  const [whales, setWhales] = useState(null);
  const [camps, setCamps] = useState(null);      // persistent campaigns (primary)
  const [live, setLive] = useState(null);        // on-view live feed (pulse + fallback)
  const [sel, setSel] = useState(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    let off = false;
    loadWhales().then(d => { if (!off) setWhales(d ?? false); });
    loadWhaleCampaigns().then(d => { if (!off) setCamps(d ?? { wallets: [] }); });
    return () => { off = true; };
  }, []);
  useEffect(() => {
    let off = false, timer, t2;
    const pull = () => fetch("/api/live-flow").then(r => r.json()).then(d => { if (!off) setLive(d); }).catch(() => { if (!off) setLive(l => l || { wallets: [] }); });
    pull(); timer = setInterval(pull, 120000); t2 = setInterval(() => setTick(x => x + 1), 20000);
    return () => { off = true; clearInterval(timer); clearInterval(t2); };
  }, []);

  const balOf = useMemo(() => new Map((whales?.wallets || []).map(w => [w.a.toLowerCase(), w])), [whales]);
  // wallets moving in the last few hours → the "still going" pulse
  const liveSet = useMemo(() => new Set((live?.wallets || []).filter(w => w.live).map(w => w.a.toLowerCase())), [live]);

  const model = useMemo(() => {
    const ageHue = rows => {
      const ds = rows.map(r => balOf.get((r.a || "").toLowerCase())?.days || 0);
      const mn = Math.min(...ds, 0), mx = Math.max(...ds, 1);
      return d => ageRamp(mx > mn ? ((d || 0) - mn) / (mx - mn) : 0.5).hex;
    };
    const now = Date.now();

    // PRIMARY: persistent campaigns
    const cw = camps?.wallets || [];
    if (cw.length) {
      const hue = ageHue(cw);
      const rows = cw.map(c => {
        const w = balOf.get(c.a.toLowerCase()) || {};
        const activeDays = c.days?.length || 1;
        const sellDays = (c.days || []).filter(([, n]) => n < 0).length;
        const runDays = Math.max(1, Math.round((c.lastTs - c.firstTs) / DAY) + 1);
        const liveMove = liveSet.has(c.a.toLowerCase());
        return {
          a: c.a, bal: w.bal || 0, days: w.days || 0, hue: hue(w.days), net: c.net,
          activeDays, sellDays, runDays, firstTs: c.firstTs,
          liveMove, lastLabel: liveMove ? "now" : agoMs(now - c.lastTs),
          reducing: c.net < 0 && sellDays >= 2,
        };
      });
      return { source: "campaigns", rows, sellers: rows.filter(r => r.net < 0).length, sellingNow: rows.filter(r => r.liveMove && r.net < 0).length };
    }

    // FALLBACK 1: the on-view live 7-day feed (no campaign file yet)
    const lw = (live?.wallets || []);
    if (lw.length) {
      const hue = ageHue(lw);
      const rows = lw.map(r => {
        const w = balOf.get(r.a.toLowerCase()) || {};
        return {
          a: r.a, bal: w.bal || 0, days: w.days || 0, hue: hue(w.days), net: r.net,
          activeDays: r.activeDays, sellDays: r.sellDays, runDays: live?.days || 7, firstTs: null,
          liveMove: !!r.live, lastLabel: r.agoBlocks != null ? agoMs(r.agoBlocks * 12000) : "",
          reducing: r.net < 0 && r.sellDays >= 2,
        };
      });
      return { source: "live", rows, sellers: rows.filter(r => r.net < 0).length, sellingNow: rows.filter(r => r.liveMove && r.net < 0).length };
    }

    // FALLBACK 2: static top holders (feed off)
    if (whales?.wallets) {
      const top = whales.wallets.filter(w => w?.a && w.bal >= 1e5).sort((a, b) => b.bal - a.bal).slice(0, isMobile ? 60 : 150);
      const hue = ageHue(top);
      const rows = top.map(w => ({ a: w.a, bal: w.bal, days: w.days || 0, hue: hue(w.days), net: 0, liveMove: false }));
      return { source: "static", rows, sellers: 0, sellingNow: 0 };
    }
    return { source: "loading", rows: [] };
  }, [camps, live, whales, balOf, liveSet, isMobile]);

  if (whales === false && !camps?.wallets?.length) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#94a3b8", padding: 60 }}>Whale data is being rebuilt — check back after the next on-chain refresh.</div>;
  if (model.source === "loading") return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading…</div>;

  const { rows, source, sellers, sellingNow } = model;
  const live7 = source === "campaigns" || source === "live";
  const status = source === "static" ? "live feed offline — showing holders by size"
    : source === "campaigns" ? `earmarked since first sale · resets on each move · ${camps?.updated ? "updated " + updAgo(camps.updated) : ""}`
    : `${live?.days || 7}-day window · updated ${live?.updated ? updAgo(live.updated) : "…"}`;

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 14px", fontFamily: SANS }}>
      <style>{`
        @keyframes wbSell { 0%,100%{box-shadow:0 0 0 0 rgba(251,113,133,0)} 50%{box-shadow:0 0 13px 2px rgba(251,113,133,0.6)} }
        @keyframes wbBuy { 0%,100%{box-shadow:0 0 0 0 rgba(74,222,128,0)} 50%{box-shadow:0 0 13px 2px rgba(74,222,128,0.6)} }
        .wb-cell{transition:transform .12s} .wb-cell:hover{transform:translateY(-2px)}
      `}</style>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between", margin: "4px 0 12px" }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          {live7 ? (
            <>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: MONO, fontSize: 13, color: "#fb7185" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#fb7185", boxShadow: sellingNow ? "0 0 8px #fb7185" : "none" }} />{sellingNow} selling now
              </span>
              <span style={{ fontFamily: MONO, fontSize: 13, color: "#fb7185" }}>{sellers} offloading</span>
              <span style={{ fontFamily: MONO, fontSize: 12, color: "#64748b" }}>{rows.length} whales moving</span>
            </>
          ) : (
            <span style={{ fontFamily: MONO, fontSize: 12, color: "#64748b" }}>{rows.length} whales ≥100k</span>
          )}
        </div>
        <span style={{ fontFamily: MONO, fontSize: 11.5, color: live7 ? "#5eead4" : "#64748b" }}>{status}</span>
      </div>

      {sel && (
        <div style={{ marginBottom: 14 }}>
          <WalletCard w={sel} wide isMobile={isMobile} accent="#5eead4" flow={sel.net} flowUnit=" SPX"
            lines={[
              `${kM(sel.bal)} SPX · held ${Math.round((sel.days || 0) / 30)} mo`,
              sel.net ? `${sel.net < 0 ? "sold" : "added"} ${kM(Math.abs(sel.net))}${sel.runDays ? ` over ${sel.runDays}d` : ""} · ${sel.sellDays || 0} sell day${sel.sellDays === 1 ? "" : "s"}${sel.reducing ? " · slowly reducing" : ""}` : "no move in the window",
            ]} />
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 108 : 138}px, 1fr))`, gap: isMobile ? 7 : 9 }}>
        {rows.map(c => {
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
                {c.lastLabel && <span style={{ fontFamily: MONO, fontSize: 9.5, color: c.lastLabel === "now" ? "#fb7185" : "#64748b" }}>{c.lastLabel}</span>}
              </div>
              <div style={{ fontFamily: MONO, fontSize: isMobile ? 13 : 14, fontWeight: 800, color: "#f1f5f9", marginTop: 1 }}>{kM(c.bal)}</div>
              {c.net !== 0 && (
                <div style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 700, marginTop: 2, color: sell ? "#fb7185" : "#4ade80" }}>
                  {sell ? "▼ −" : "▲ +"}{kM(Math.abs(c.net))}{c.runDays ? <span style={{ color: "#64748b", fontWeight: 500 }}> /{c.runDays}d</span> : null}
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

      <p style={{ fontSize: 12.5, color: "#7c8a9e", lineHeight: 1.6, margin: "14px 2px 0" }}>
        {source === "static"
          ? <>The live-flow feed is offline (needs <b style={{ color: "#c7d2e4" }}>ALCHEMY_KEY</b> in the Vercel env) — showing the biggest holders by size. Once it&rsquo;s wired, this becomes a persistent sellers&rsquo; watch.</>
          : <>Whales in an active <b>sell campaign</b>, biggest <b style={{ color: "#fb7185" }}>net offloaders</b> first. A wallet is earmarked from its first sale, ACCUMULATES the whole run, and its <b>7-day idle clock resets on every move</b> — so it stays until 7 silent days and a repeat sell reads as a pattern. A tile <b style={{ color: "#fb7185" }}>pulses</b> when it also moved in the last few hours; <b style={{ color: "#fbbf24" }}>◱ REDUCING</b> marks selling across several days. The coloured cap is holder age. Tap a wallet for its Zerion card. Not a signal.</>}
      </p>
    </div>
  );
}
