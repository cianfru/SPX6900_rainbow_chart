import { useMemo, useState, useEffect, lazy, Suspense } from "react";
import { loadWhales } from "./history-data.js";
import WalletCard, { shortAddr } from "./WalletCard.jsx";
import { SANS, MONO, MAX_W, Metric, Explain } from "./chart-ui.jsx";

const Skyline3D = lazy(() => import("./Skyline3D.jsx"));

// SPX6900 WHALE WATCHER — the holder skyline applied to the coin. Every building is one of the
// biggest wallets; height = size × how long it's held, and the windows glow GREEN if the wallet
// has been adding over the window and RED if it's been shedding. That flow channel is the whole
// point: a rich list says who is big, this says who is actually buying or selling right now.
//
// Source: the local FIFO reconstruction, which already excludes exchange, LP, bridge and burn
// addresses — so these are real holders, not infrastructure that merely custodies coins.
const fmt = n => (Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(1) + "M" : Math.abs(n) >= 1e3 ? (n / 1e3).toFixed(0) + "k" : String(Math.round(n)));

export default function SpxWhaleWatcher({ isMobile, preview = false }) {
  const [data, setData] = useState(null);
  const [win, setWin] = useState(30);
  const [sel, setSel] = useState(null);
  useEffect(() => { let off = false; loadWhales().then(d => { if (!off) setData(d ?? false); }); return () => { off = true; }; }, []);

  const towers = useMemo(() => {
    const ws = data?.wallets; if (!ws?.length) return null;
    const maxDays = Math.max(...ws.map(w => w.days), 1);
    const maxBal = Math.max(...ws.map(w => w.bal), 1);
    return ws.map(w => ({
      ...w,
      // conviction: size, weighted by how long the oldest still-held lot has sat
      score: (w.bal / maxBal) * (0.45 + 0.55 * (w.days / maxDays)),
      ageT: w.days / maxDays,
      flow: w[`d${win}`] ?? 0,
    }));
  }, [data, win]);

  const stats = useMemo(() => {
    if (!towers) return null;
    const add = towers.filter(t => t.flow > 0), cut = towers.filter(t => t.flow < 0);
    const net = towers.reduce((s, t) => s + t.flow, 0);
    return { add: add.length, cut: cut.length, net, spot: data?.spot ?? 0 };
  }, [towers, data]);

  const cur = sel || towers?.slice().sort((a, b) => b.score - a.score)[0];

  if (data == null) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading whale data…</div>;
  if (data === false || !towers) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Whale data is being reconstructed — check back after the next on-chain refresh.</div>;

  const cardHtml = t => {
    const f = t.flow || 0;
    const col = f > 0 ? "#4ade80" : f < 0 ? "#fb7185" : "#94a3b8";
    const note = f > 0 ? `position added +${fmt(f)}` : f < 0 ? `position reduced −${fmt(Math.abs(f))}` : "unchanged";
    return `
      <div style="padding:11px 13px 8px">
        <div style="color:#a78bfa;font-weight:700;font-size:13.5px">${t.ens || shortAddr(t.a)}</div>
        <div style="color:#94a3b8;font-size:11.5px">${fmt(t.bal)} SPX · held ${t.days}d</div>
      </div>
      <div style="margin:0 13px 9px;padding:6px 9px;border-radius:7px;color:${col};font-size:11.5px;
                  background:${f > 0 ? "rgba(74,222,128,0.10)" : f < 0 ? "rgba(251,113,133,0.10)" : "rgba(255,255,255,0.04)"}">${note} · ${win}d</div>
      <img src="https://render.zerion.io/preview?address=${t.a}" alt="" onerror="this.style.display='none'"
           style="display:block;width:100%;border-top:1px solid rgba(255,255,255,0.08)"/>
      <div style="padding:7px 13px;color:#64748b;font-size:11px">click to pin this wallet →</div>`;
  };

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="Which big SPX6900 holders are actually buying — and which are selling?" accent="#a78bfa">
        Every building is one of the largest wallets. Height is <strong style={{ color: "#e2e8f0" }}>how much it holds × how long it&apos;s held</strong>, and the windows
        glow <strong style={{ color: "#4ade80" }}>green when the wallet has been adding</strong> and <strong style={{ color: "#fb7185" }}>red when it&apos;s been shedding</strong> over the chosen window.
        Exchange, LP and bridge addresses are excluded, so these are real holders. Click a building to pin its wallet.
      </Explain>

      <div style={{ display: "flex", gap: isMobile ? 14 : 28, justifyContent: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <Metric label="whales tracked" value={towers.length} color="#a78bfa" sub="biggest real holders" />
        <Metric label="adding" value={stats.add} color="#4ade80" sub={`over ${win} days`} />
        <Metric label="reducing" value={stats.cut} color="#fb7185" sub={`over ${win} days`} />
        <Metric label="net flow" value={(stats.net >= 0 ? "+" : "−") + fmt(Math.abs(stats.net))} color={stats.net >= 0 ? "#4ade80" : "#fb7185"} sub="SPX across whales" />
      </div>

      <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 12 }}>
        {[7, 30].map(w => (
          <button key={w} onClick={() => setWin(w)} style={{
            padding: "5px 13px", borderRadius: 8, cursor: "pointer", fontFamily: MONO, fontSize: 12,
            background: win === w ? "rgba(167,139,250,0.18)" : "transparent",
            border: `1px solid ${win === w ? "rgba(167,139,250,0.5)" : "rgba(255,255,255,0.12)"}`,
            color: win === w ? "#c4b5fd" : "#94a3b8",
          }}>{w}-day flow</button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexDirection: isMobile ? "column" : "row" }}>
        <div style={{ flex: "1 1 auto", minWidth: 0, width: "100%" }}>
          <Suspense fallback={<div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading 3D…</div>}>
            <Skyline3D towers={towers} isMobile={isMobile} onSelect={setSel} cardHtml={cardHtml}
              crownLabel="🐋 biggest whale" accent="rgba(167,139,250,0.45)" bodyFrom={0x3b3560} bodyTo={0xa78bfa} />
          </Suspense>
          <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 8 }}>
            Drag to orbit · scroll to zoom · hover a building for the wallet · click to pin it.
          </div>
        </div>
        {!preview && cur && (
          <WalletCard w={cur} flow={cur.flow} flowUnit=" SPX" accent="#c4b5fd" isMobile={isMobile}
            lines={[`${fmt(cur.bal)} SPX${stats.spot ? ` · ~$${Math.round(cur.bal * stats.spot).toLocaleString()}` : ""}`, `held ${cur.days} days`]} />
        )}
      </div>

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 18, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        <strong style={{ color: "#a78bfa" }}>Whale watcher</strong> — the biggest real holders, reconstructed per wallet from every SPX transfer on Ethereum (FIFO, exchange/LP/bridge excluded).
        Glow = net position change over the window. Wallets are addresses, not people: one person can hold several. A behaviour read, not a signal. Not financial advice.
      </div>
    </div>
  );
}
