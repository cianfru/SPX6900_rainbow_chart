import { useState, useEffect, useMemo } from "react";
import { loadWhales, loadWhaleCampaigns, loadSolanaOnchain, loadBaseOnchain } from "./history-data.js";
import { ageRamp } from "./whale-cohorts.js";
import WalletCard, { shortAddr } from "./WalletCard.jsx";
import { SANS, MONO } from "./chart-ui.jsx";

const CHAIN_TAG = { eth: { label: "ETH", c: "#98a2b7" }, base: { label: "BASE", c: "#3b82f6" }, sol: { label: "SOL", c: "#c084fc" } };

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
  const [sol, setSol] = useState(null);
  const [base, setBase] = useState(null);
  const [chain, setChain] = useState("all");   // "all" | "eth" | "sol" | "base"
  const [sel, setSel] = useState(null);
  const [showInfo, setShowInfo] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    let off = false;
    loadWhales().then(d => { if (!off) setWhales(d ?? false); });
    loadWhaleCampaigns().then(d => { if (!off) setCamps(d ?? { wallets: [] }); });
    loadSolanaOnchain().then(d => { if (!off) setSol(d ?? { wallets: [] }); });
    loadBaseOnchain().then(d => { if (!off) setBase(d ?? { wallets: [] }); });
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

    // FALLBACK 1: the on-view live 7-day feed (no campaign file yet). ETH only — Base has its own
    // rows built from the same live feed in the render body.
    const lw = (live?.wallets || []).filter(w => (w.chain || "eth") === "eth");
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

  // Solana: daily reconstruction with a 30-day net flow per wallet, movers only (non-EVM, no live).
  const solRaw = (sol?.wallets || []).filter(w => w?.a && w.bal >= 1e5 && w.flow);
  const solHue = (() => { const ds = solRaw.map(w => w.days || 0); const mn = Math.min(...ds, 0), mx = Math.max(...ds, 1); return d => ageRamp(mx > mn ? ((d || 0) - mn) / (mx - mn) : 0.5).hex; })();
  const solRows = solRaw.map(w => ({ a: w.a, chain: "sol", bal: w.bal, days: w.days || 0, net: w.flow, hue: solHue(w.days), runDays: 30, sellDays: w.flow < 0 ? 1 : 0, activeDays: 1, reducing: false, liveMove: false, lastLabel: "30d" }));

  // Base: LIVE like Ethereum — 7-day net + pulse from the same Alchemy feed (Base is EVM), joined to
  // base-onchain.json for balance + holder age.
  const baseBalOf = new Map((base?.wallets || []).map(w => [w.a.toLowerCase(), w]));
  const baseLive = (live?.wallets || []).filter(w => w.chain === "base" && w.net);
  const baseHue = (() => { const ds = baseLive.map(w => baseBalOf.get(w.a.toLowerCase())?.days || 0); const mn = Math.min(...ds, 0), mx = Math.max(...ds, 1); return d => ageRamp(mx > mn ? ((d || 0) - mn) / (mx - mn) : 0.5).hex; })();
  const baseRows = baseLive.map(w => {
    const b = baseBalOf.get(w.a.toLowerCase()) || {};
    return { a: w.a, chain: "base", bal: b.bal || 0, days: b.days || 0, net: w.net, hue: baseHue(b.days), runDays: live?.days || 7, sellDays: w.sellDays || 0, activeDays: w.activeDays || 1, reducing: w.net < 0 && (w.sellDays || 0) >= 2, liveMove: !!w.live, lastLabel: w.live ? "now" : "7d" };
  });
  const altRows = solRows.length + baseRows.length;
  if (whales === false && !camps?.wallets?.length && !altRows) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#94a3b8", padding: 60 }}>Whale data is being rebuilt — check back after the next on-chain refresh.</div>;
  if (model.source === "loading" && !altRows) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading…</div>;

  const ethRows = model.rows.map(r => ({ ...r, chain: "eth" }));
  const chainCounts = { all: ethRows.length + baseRows.length + solRows.length, eth: ethRows.length, base: baseRows.length, sol: solRows.length };
  const allRows = [...ethRows, ...baseRows, ...solRows].sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  const rows = chain === "all" ? allRows : allRows.filter(r => r.chain === chain);
  const source = model.source;
  const live7 = source === "campaigns" || source === "live" || altRows > 0;
  const buyers = rows.filter(r => r.net > 0).length;
  const sellers = rows.filter(r => r.net < 0).length;
  const netTotal = Math.round(rows.reduce((s, r) => s + (r.net || 0), 0));
  const updated = source === "campaigns" ? camps?.updated : live?.updated;
  const chainChips = ["all", "eth", "base", "sol"].filter(k => k === "all" || chainCounts[k] > 0);

  const Stat = ({ tri, n, label, color }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, fontFamily: MONO, color, fontWeight: 800, lineHeight: 1 }}>
        {tri && <span style={{ fontSize: isMobile ? 15 : 18 }}>{tri}</span>}
        <span style={{ fontSize: isMobile ? 26 : 34, letterSpacing: -1 }}>{n}</span>
      </div>
      <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: 1.6, textTransform: "uppercase", color: "#5b6675" }}>{label}</span>
    </div>
  );
  const netColor = netTotal > 0 ? "#4ade80" : netTotal < 0 ? "#fb7185" : "#94a3b8";

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 14px", fontFamily: SANS }}>
      <style>{`
        @keyframes wbSell { 0%,100%{box-shadow:0 0 0 0 rgba(251,113,133,0)} 50%{box-shadow:0 0 13px 2px rgba(251,113,133,0.6)} }
        @keyframes wbBuy { 0%,100%{box-shadow:0 0 0 0 rgba(74,222,128,0)} 50%{box-shadow:0 0 13px 2px rgba(74,222,128,0.6)} }
        .wb-cell{transition:transform .12s} .wb-cell:hover{transform:translateY(-2px)}
      `}</style>

      <div style={{ display: "flex", flexWrap: "wrap", gap: isMobile ? 22 : 40, alignItems: "flex-start", justifyContent: "space-between", margin: "6px 0 16px" }}>
        {live7 ? (
          <>
            <div style={{ display: "flex", gap: isMobile ? 22 : 40, alignItems: "flex-start" }}>
              <Stat tri="▲" n={buyers} label="buying" color="#4ade80" />
              <Stat tri="▼" n={sellers} label="selling" color="#fb7185" />
              <Stat n={(netTotal >= 0 ? "+" : "−") + kM(Math.abs(netTotal))} label="net flow · spx" color={netColor} />
            </div>
            {/* the earmark reminder now lives behind (i), off the main readout */}
            <div style={{ position: "relative", alignSelf: "center" }}
              onMouseEnter={() => setShowInfo(true)} onMouseLeave={() => setShowInfo(false)}>
              <button onClick={() => setShowInfo(v => !v)} aria-label="how this works" style={{
                width: 24, height: 24, borderRadius: "50%", cursor: "pointer", fontFamily: MONO, fontSize: 13, fontWeight: 700,
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.18)", color: "#8b98ad",
              }}>i</button>
              {showInfo && (
                <div style={{
                  position: "absolute", right: 0, top: 30, zIndex: 10, width: 250, padding: "10px 13px", borderRadius: 8,
                  background: "#080b14", border: "1px solid rgba(255,255,255,0.14)", boxShadow: "0 10px 30px rgba(0,0,0,0.6)",
                  fontFamily: SANS, fontSize: 12.5, color: "#c7d2e4", lineHeight: 1.55,
                }}>
                  Each wallet is <b>earmarked from its first sale</b> and accumulates the whole run; its 7-day idle clock <b>resets on every move</b>, so it stays until 7 silent days.
                  {updated && <div style={{ marginTop: 6, fontFamily: MONO, fontSize: 11, color: "#5b6675" }}>updated {updAgo(updated)}</div>}
                </div>
              )}
            </div>
          </>
        ) : (
          <span style={{ fontFamily: MONO, fontSize: 13, color: "#64748b" }}>{rows.length} whales ≥100k · live feed offline</span>
        )}
      </div>

      {chainChips.length > 1 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
          {chainChips.map(k => {
            const on = chain === k;
            const t = CHAIN_TAG[k];
            return (
              <button key={k} onClick={() => setChain(k)} style={{
                padding: "5px 12px", borderRadius: 7, cursor: "pointer", fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: 0.5,
                background: on ? "rgba(94,234,212,0.14)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${on ? "#5eead4" : "rgba(255,255,255,0.12)"}`, color: on ? "#5eead4" : (t ? t.c : "#94a3b8"),
              }}>{k === "all" ? "ALL" : t.label} <span style={{ color: "#5b6675", fontWeight: 500 }}>{chainCounts[k]}</span></button>
            );
          })}
        </div>
      )}

      {sel && (
        <div style={{ marginBottom: 14 }}>
          <WalletCard w={sel} chain={sel.chain} isMobile={isMobile} accent="#5eead4" flow={sel.net} flowUnit=" SPX"
            lines={[
              `${kM(sel.bal)} SPX · held ${Math.round((sel.days || 0) / 30)} mo`,
              sel.net ? `over ${sel.runDays || 7}d · ${sel.sellDays || 0} sell day${sel.sellDays === 1 ? "" : "s"}${sel.reducing ? " · slowly reducing" : ""}` : "no recent move",
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
                <span style={{ display: "inline-flex", alignItems: "baseline", gap: 5, minWidth: 0 }}>
                  {chain === "all" && CHAIN_TAG[c.chain] && <span style={{ fontFamily: MONO, fontSize: 8, fontWeight: 800, letterSpacing: 0.5, color: CHAIN_TAG[c.chain].c }}>{CHAIN_TAG[c.chain].label}</span>}
                  <span style={{ fontFamily: MONO, fontSize: isMobile ? 10 : 11, color: "#cbd5e1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shortAddr(c.a)}</span>
                </span>
                {c.lastLabel && <span style={{ fontFamily: MONO, fontSize: 9.5, color: c.lastLabel === "now" ? "#fb7185" : "#64748b", flex: "0 0 auto" }}>{c.lastLabel}</span>}
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
          : <>Whales that moved, biggest <b style={{ color: "#fb7185" }}>net offloaders</b> first, across chains. <b style={{ color: CHAIN_TAG.eth.c }}>Ethereum</b> and <b style={{ color: CHAIN_TAG.base.c }}>Base</b> are <b>live</b> — 7-day net with a <b style={{ color: "#fb7185" }}>pulse</b> when a wallet also moved in the last few hours (ETH also earmarks from its first sale, its idle clock resetting on every move; <b style={{ color: "#fbbf24" }}>◱ REDUCING</b> = sold across several days). <b style={{ color: CHAIN_TAG.sol.c }}>Solana</b> is the 30-day net from the daily reconstruction (non-EVM — no live feed yet). The coloured cap is holder age; tap any wallet for its Zerion card (Zerion covers all three chains). Cost basis isn&rsquo;t shown on the bridged chains — only balance + flow are honest there. Not a signal.</>}
      </p>
    </div>
  );
}
