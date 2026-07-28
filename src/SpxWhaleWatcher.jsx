import { useMemo, useState, useEffect, lazy, Suspense } from "react";
import { loadWhales, loadOnchain } from "./history-data.js";
import { shortAddr } from "./WalletCard.jsx";
import CityControls from "./CityControls.jsx";
import CityWallet from "./CityWallet.jsx";
import CityGate from "./CityGate.jsx";
import { loadNotes } from "./city-messages.js";
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
  const [layout, setLayout] = useState("city");
  const [focus, setFocus] = useState(null);
  const [focusN, setFocusN] = useState(0);   // bumped so re-picking the same building still moves
  const goTo = a => { setFocus(a); setFocusN(n => n + 1); };
  const [shown, setShown] = useState(600);   // how many buildings to RENDER (all are searchable)
  const [msgs, setMsgs] = useState(null);
  const [time, setTime] = useState("dusk");
  const [infra, setInfra] = useState(null);   // the harbour: exchanges, bridge, LP, burn
  useEffect(() => { let off = false; loadWhales().then(d => { if (!off) setData(d ?? false); }); return () => { off = true; }; }, []);
  useEffect(() => { let off = false; loadNotes("whale").then(m => { if (!off) setMsgs(m); }); return () => { off = true; }; }, []);
  useEffect(() => { let off = false; loadOnchain().then(r => { if (!off && r?.length) setInfra(r[r.length - 1]); }); return () => { off = true; }; }, []);

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

  // The city renders the biggest `shown` wallets — a building is ~3 draw calls, so the whole
  // set can outrun a modest GPU. Every tracked wallet stays searchable either way.
  const visible = useMemo(() => (towers ? towers.slice().sort((a, b) => b.score - a.score).slice(0, shown) : null), [towers, shown]);
  const cur = sel;   // nothing pinned until you hover or click — no card on arrival

  if (data == null) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading whale data…</div>;
  if (data === false || !towers) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Whale data is being reconstructed — check back after the next on-chain refresh.</div>;

  const pinCard = t => `
      <div style="padding:9px 12px 7px">
        ${t.hood ? `<div style="color:#c4b5fd;font:700 10.5px 'Space Grotesk',system-ui;letter-spacing:.18em;text-transform:uppercase">${t.hood.name}</div>` : ""}
        <div style="color:#e2e8f0;font-weight:700;font-size:13px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.ens || shortAddr(t.a)}</div>
        <div style="color:#94a3b8;font-size:11.5px">${fmt(t.bal)} SPX · held ${t.days}d</div>
      </div>
      ${t.flow ? `<div style="margin:0 12px 8px;padding:5px 8px;border-radius:7px;font-size:11px;color:${t.flow > 0 ? "#4ade80" : "#fb7185"};background:${t.flow > 0 ? "rgba(74,222,128,0.12)" : "rgba(251,113,133,0.12)"}">${t.flow > 0 ? "+" : "−"}${Math.abs(t.flow).toLocaleString(undefined, { maximumFractionDigits: 0 })} SPX · ${win}d</div>` : ""}
      <a href="https://app.zerion.io/${t.a}/overview" target="_blank" rel="noopener noreferrer" style="display:block;text-decoration:none">
        <img src="https://render.zerion.io/preview?address=${t.a}" alt="" onerror="this.style.display='none'"
             style="display:block;width:100%;border-top:1px solid rgba(255,255,255,0.08)"/>
        <div style="padding:7px 12px;color:#c4b5fd;font-size:11px">open in Zerion →</div>
      </a>`;

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
    <CityGate title="Whale City" unit="whale" accent="#c4b5fd">
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
        <span style={{ width: 10 }} />
        {[300, 600, 1500].map(n => (
          <button key={n} onClick={() => setShown(n)} title="How many buildings to render" style={{
            padding: "5px 11px", borderRadius: 8, cursor: "pointer", fontFamily: MONO, fontSize: 12,
            background: shown === n ? "rgba(167,139,250,0.18)" : "transparent",
            border: `1px solid ${shown === n ? "rgba(167,139,250,0.5)" : "rgba(255,255,255,0.12)"}`,
            color: shown === n ? "#c4b5fd" : "#94a3b8",
          }}>{n >= (towers?.length ?? 0) ? "all" : n} buildings</button>
        ))}
      </div>

      <CityControls layout={layout} onLayout={setLayout} time={time} onTime={setTime} accent="#c4b5fd" isMobile={isMobile} unit="whale"
        has={a => visible.some(t => (t.a || "").toLowerCase() === a)}
        onFocus={a => { goTo(a); const m = visible.find(t => (t.a || "").toLowerCase() === a); if (m) setSel(m); }} />

      <CityWallet city="whale" accent="#c4b5fd" isMobile={isMobile} notes={msgs} onNotes={setMsgs}
        owns={a => visible.some(t => (t.a || "").toLowerCase() === a)}
        onFocus={a => { goTo(a); const m = visible.find(t => (t.a || "").toLowerCase() === a); if (m) setSel(m); }} />

      <div style={{ position: "relative" }}>
        <div style={{ width: "100%" }}>
          <Suspense fallback={<div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading 3D…</div>}>
            <Skyline3D towers={visible} isMobile={isMobile} cardHtml={cardHtml}
              onSelect={t => { setSel(t); if (t) goTo(t.a); }}
              crownLabel="🐋 biggest whale" accent="rgba(167,139,250,0.45)" bodyFrom={0xf2cf8a} bodyTo={0x22d3ee}
              layout={layout} focus={focus} focusNonce={focusN} pinned={preview ? null : cur} pinnedHtml={pinCard} messages={msgs} time={time} infra={infra} />
          </Suspense>
          <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 8 }}>
            Drag to orbit · scroll to zoom · hover a building for the wallet · click to pin it.{layout === "city" && " Every wallet has a home address in Whale City."}
          </div>
        </div>

      </div>

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 18, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        <strong style={{ color: "#a78bfa" }}>Whale watcher</strong> — the biggest real holders, reconstructed per wallet from every SPX transfer on Ethereum (FIFO, exchange/LP/bridge excluded).
        Glow = net position change over the window; building height is a √ scale of size × holding time (holdings are power-law, so a linear axis would be one spike over a car park) — hover for the exact figure. Wallets are addresses, not people: one person can hold several. A behaviour read, not a signal. Not financial advice.
      </div>
    </div>
    </CityGate>
  );
}
