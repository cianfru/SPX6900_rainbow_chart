import { useState, useEffect, useMemo } from "react";
import { loadWhales, loadBaseOnchain, loadSolanaOnchain } from "./history-data.js";
import WalletCard, { shortAddr } from "./WalletCard.jsx";
import { SANS, MONO, ViewTabs } from "./chart-ui.jsx";

// Flow-window options (longest first). Only the windows whales.json actually banks (`lookback`) are
// offered, so "1 day" appears once the daily on-chain refresh has a d1 delta — no dead button.
const WINDOWS = [{ d: 30, label: "30 days" }, { d: 7, label: "1 week" }, { d: 1, label: "24 hours" }];

// WHALE MOSAIC — every wallet holding ≥100k SPX as one square, coloured by whether it's accumulating
// (green) or distributing (red) right now, flat wallets a dark neutral. Sorted biggest-buyer → flat →
// biggest-seller, so the field reads as a gradient from green to red. Everything stripped away except
// the one thing that matters: who is moving, which way. Live across all three chains.

const kM = v => { const a = Math.abs(v); return a >= 1e6 ? (v / 1e6).toFixed(a / 1e6 < 10 ? 1 : 0) + "M" : Math.round(v / 1e3) + "k"; };
const CHAIN = { eth: "Ethereum", base: "Base", sol: "Solana" };

// diverging colour: dark→bright green for buys, dark→bright red for sells, dark slate for flat.
// intensity = how much of the bag moved (12%+ = full colour), so conviction reads as brightness.
const lerp = (a, b, t) => Math.round(a + (b - a) * t);
function flowColor(net, bal) {
  const dust = Math.max(1000, bal * 0.005);
  if (!net || Math.abs(net) < dust) return "#161d2e";                       // flat
  const t = Math.max(0.18, Math.min(1, Math.abs(net) / (bal * 0.12 || 1))); // ≥18% floor so movers are visible
  return net > 0
    ? `rgb(${lerp(20, 34, t)},${lerp(83, 197, t)},${lerp(45, 94, t)})`      // #14532d → #22c55e
    : `rgb(${lerp(69, 239, t)},${lerp(10, 68, t)},${lerp(10, 68, t)})`;     // #450a0a → #ef4444
}

export default function WhaleMosaic({ isMobile }) {
  const [whales, setWhales] = useState(null);
  const [base, setBase] = useState(null);
  const [sol, setSol] = useState(null);
  const [live, setLive] = useState(null);
  const [sel, setSel] = useState(null);
  const [hov, setHov] = useState(null);
  const [flowWin, setFlowWin] = useState(30);   // net-flow lookback the squares read: 30 / 7 / 1 days

  useEffect(() => {
    let off = false;
    loadWhales().then(d => { if (!off) setWhales(d ?? false); });
    loadBaseOnchain().then(d => { if (!off) setBase(d ?? { wallets: [] }); });
    loadSolanaOnchain().then(d => { if (!off) setSol(d ?? { wallets: [] }); });
    return () => { off = true; };
  }, []);

  // windows this data can actually offer, and reset if the current pick isn't one of them
  const windows = WINDOWS.filter(w => (whales?.lookback || [7, 30]).includes(w.d));
  useEffect(() => {
    if (whales && windows.length && !windows.some(w => w.d === flowWin)) setFlowWin(windows[0].d);
  }, [whales]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let off = false, t;
    const pull = () => fetch("/api/live-flow").then(r => r.json()).then(d => { if (!off) setLive(d); }).catch(() => {});
    pull(); t = setInterval(pull, 120000);
    return () => { off = true; clearInterval(t); };
  }, []);

  const model = useMemo(() => {
    if (!whales) return null;
    const key = "d" + flowWin;
    // live feed keyed per chain (real-time); used to keep the 24h view fresh between daily banks.
    const liveMap = new Map();
    for (const w of live?.wallets || []) liveMap.set(w.chain === "sol" ? w.a : w.a.toLowerCase(), w.net);
    // ETH banks all three windows (d1/d7/d30); on the 24h view prefer the live net where it serves it.
    const ethNet = w => {
      if (flowWin === 1) { const lk = liveMap.get(w.a.toLowerCase()); if (Number.isFinite(lk)) return lk; }
      const v = w[key]; return Number.isFinite(v) ? v : (w.d30 || 0);
    };
    // Base & Solana carry only a ~30-day flow, so the sub-30d windows use the live feed where it
    // serves them and otherwise show the wallet flat — we never draw a number we don't have.
    const altNet = (w, k) => (flowWin === 30 ? (w.flow || 0) : (Number.isFinite(liveMap.get(k)) ? liveMap.get(k) : 0));

    const rows = [];
    for (const w of whales.wallets || []) if (w.bal >= 1e5) rows.push({ a: w.a, chain: "eth", bal: w.bal, net: ethNet(w) });
    for (const w of base?.wallets || []) if (w.bal >= 1e5) rows.push({ a: w.a, chain: "base", bal: w.bal, net: altNet(w, w.a.toLowerCase()) });
    for (const w of sol?.wallets || []) if (w.bal >= 1e5) rows.push({ a: w.a, chain: "sol", bal: w.bal, net: altNet(w, w.a) });

    const dust = r => Math.max(1000, r.bal * 0.005);
    let buying = 0, selling = 0, flat = 0;
    for (const r of rows) { const d = dust(r); if (r.net > d) buying++; else if (r.net < -d) selling++; else flat++; }
    // THE CENSUS: every ≥100k wallet as one square, sorted biggest buyer → dark (holding steady) →
    // biggest seller. This is the mosaic's whole point — the entire whale base in one image, which
    // nothing else shows. (The Live board is the movers-only detail view; no need to duplicate it.)
    rows.sort((a, b) => b.net - a.net);
    return { rows, buying, selling, flat, total: rows.length, updated: (live?.updated || whales.updated) };
  }, [whales, base, sol, live, flowWin]);

  if (whales === false) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#94a3b8", padding: 60 }}>Whale data is being rebuilt — check back after the next on-chain refresh.</div>;
  if (!model) return <div style={{ textAlign: "center", fontFamily: MONO, color: "#64748b", padding: 60 }}>Loading…</div>;

  const { rows, buying, selling, flat, total } = model;
  const winName = (windows.find(w => w.d === flowWin) || WINDOWS[0]).label;
  const sq = isMobile ? 13 : 16;   // one square per ≥100k wallet — small enough to fit the whole cohort

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 14px", fontFamily: SANS }}>
      <div style={{ border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, overflow: "hidden", background: "#0a0e1c" }}>
        {/* header — the summary line */}
        <div style={{ padding: isMobile ? "16px 16px 12px" : "22px 24px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
            <span style={{ fontSize: 19 }}>🐋</span>
            <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: isMobile ? 17 : 20, color: "#f1f5f9", letterSpacing: 0.2 }}>
              {total.toLocaleString()} whales holding &gt;100k SPX
            </span>
          </div>
          <div style={{ display: "flex", gap: isMobile ? 16 : 28, flexWrap: "wrap", fontFamily: MONO }}>
            <Stat n={buying} label="accumulating" color="#22c55e" tri="▲" big={!isMobile} />
            <Stat n={selling} label="selling" color="#ef4444" tri="▼" big={!isMobile} />
            <Stat n={flat} label="flat" color="#64748b" tri="•" big={!isMobile} />
          </div>
          {windows.length > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 15, flexWrap: "wrap" }}>
              <span style={{ fontFamily: MONO, fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>flow over</span>
              <ViewTabs tabs={windows.map(w => [w.d, w.label])} value={flowWin} onChange={setFlowWin} />
            </div>
          )}
        </div>

        {/* the mosaic */}
        <div
          onMouseLeave={() => setHov(null)}
          onMouseMove={e => { const i = e.target?.dataset?.i; setHov(i != null ? rows[+i] : null); }}
          onClick={e => { const i = e.target?.dataset?.i; if (i != null) setSel(rows[+i]); }}
          style={{ display: "flex", flexWrap: "wrap", gap: 2, padding: isMobile ? "4px 14px 14px" : "8px 22px 20px", position: "relative" }}>
          {rows.map((r, i) => (
            <div key={r.chain + r.a} data-i={i}
              title=""
              style={{ width: sq, height: sq, borderRadius: 4, background: flowColor(r.net, r.bal), cursor: "pointer", outline: sel?.a === r.a && sel?.chain === r.chain ? "1.5px solid #5eead4" : "none" }} />
          ))}
          {hov && (
            <div style={{ position: "absolute", top: 6, right: 10, pointerEvents: "none", fontFamily: MONO, fontSize: 11.5, color: "#cbd5e1", background: "rgba(8,11,20,0.94)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 7, padding: "6px 9px" }}>
              {shortAddr(hov.a)} · {CHAIN[hov.chain]}<br />
              <b style={{ color: hov.net > 0 ? "#4ade80" : hov.net < 0 ? "#fb7185" : "#94a3b8" }}>
                {hov.net > 0 ? "▲ +" : hov.net < 0 ? "▼ −" : "• "}{hov.net ? kM(Math.abs(hov.net)) + " SPX" : "flat"}
              </b> · {kM(hov.bal)} held
            </div>
          )}
        </div>

        {/* footer — the tagline */}
        <div style={{ padding: isMobile ? "12px 16px 16px" : "14px 24px 20px", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ fontFamily: SANS, fontSize: isMobile ? 13 : 14.5, color: "#c7d2e4", lineHeight: 1.5 }}>
            We track wallet movements <b style={{ color: "#f1f5f9" }}>in real time across 3 chains</b> — we see everything that&rsquo;s happening.
          </div>
          <div style={{ fontFamily: MONO, fontSize: isMobile ? 12.5 : 14, fontWeight: 700, color: "#5eead4", marginTop: 5, letterSpacing: 0.3 }}>
            Real intel. Real numbers.
          </div>
        </div>
      </div>

      {sel && (
        <div style={{ margin: "14px 0 2px" }}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
            <button onClick={() => setSel(null)} style={{ fontFamily: MONO, fontSize: 11.5, cursor: "pointer", padding: "3px 9px", borderRadius: 6, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.14)", color: "#94a3b8" }}>× close</button>
          </div>
          <WalletCard w={sel} chain={sel.chain} isMobile={isMobile} accent="#5eead4" flow={sel.net || 0} flowUnit=" SPX"
            lines={[`${kM(sel.bal)} SPX · ${CHAIN[sel.chain]}`, sel.net ? "net flow, recent" : "no recent move"]} />
        </div>
      )}

      <p style={{ fontSize: 12, color: "#7c8a9e", lineHeight: 1.55, margin: "12px 2px 0" }}>
        Every wallet holding ≥100,000 SPX — one square each, sorted biggest buyer to biggest seller — coloured by net flow over the
        <b style={{ color: "#e2e8f0" }}> {winName}</b>: <b style={{ color: "#22c55e" }}>green</b> accumulating,
        <b style={{ color: "#ef4444" }}> red</b> distributing, dark = holding steady ({flat.toLocaleString()} of {total.toLocaleString()}); brighter = a bigger share of the bag moved. Ethereum banks all three windows;
        Base &amp; Solana carry a 30-day flow only, so on the shorter windows they read flat unless the live feed has them. Infra (exchanges, LP, bridge) excluded — real self-custody holders. Not a signal.
      </p>
    </div>
  );
}

function Stat({ n, label, color, tri, big }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, color, fontWeight: 800, lineHeight: 1 }}>
        <span style={{ fontSize: big ? 16 : 13 }}>{tri}</span>
        <span style={{ fontSize: big ? 30 : 23, letterSpacing: -0.5 }}>{n.toLocaleString()}</span>
      </div>
      <span style={{ fontSize: 10.5, letterSpacing: 1.4, textTransform: "uppercase", color: "#5b6675" }}>{label}</span>
    </div>
  );
}
