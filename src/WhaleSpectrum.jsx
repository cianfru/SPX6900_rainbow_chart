import { useEffect, useMemo, useRef, useState } from "react";
import { loadCityTimeline, loadOnchain, loadCohortRoi } from "./history-data.js";
import { whaleSpectrum, nrplPeaks, dateOfWeek, SPECTRUM_LABELS } from "./whale-spectrum.js";
import { SANS, MONO } from "./chart-ui.jsx";

// WHALE SPECTRUM — the whale mosaic split into 10 SIZE cohorts, each drawn as a vertical VFD-style
// equalizer bar of 20 segments: green lights up from the bottom (share of that cohort accumulating),
// red from the top (share distributing), the dark middle is the cohort holding flat. Scrub the week
// slider (or hit play) and the bars dance through the whole cycle like an audio spectrum analyzer —
// so you can watch, say, the mega-whales flip red into the euphoria top while the small cohorts keep
// buying. Same data + math as the mosaic and the render video (src/whale-spectrum.js), ETH timeline.
//
// HONESTY: a falling balance = the wallet REDUCED (sold, moved or split) — never asserted as a sale.

const SEG = 20;                                   // segments per bar (20 = 100%)
const GREEN = [34, 197, 94], RED = [244, 63, 94]; // buy / sell
const DARK = "#161d2e", OFF = "rgba(255,255,255,0.045)";
const fUsd = v => (v >= 1e6 ? "$" + (v / 1e6).toFixed(1) + "M" : "$" + Math.round(v / 1e3) + "k");

// how many of a bar's 20 segments light green (from the bottom) and red (from the top), given a
// cohort's buy/sell/total. Empty cohorts stay dark. Rounding favours showing at least one lit segment
// for any non-zero share so a lone mover in a thin cohort is still visible.
function litSegments(c) {
  if (!c.total) return { buy: 0, sell: 0 };
  const bump = (n) => (n > 0 ? Math.max(1, Math.round((n / c.total) * SEG)) : 0);
  let buy = bump(c.buy), sell = bump(c.sell);
  while (buy + sell > SEG) { if (buy >= sell) buy--; else sell--; }   // never overflow the bar
  return { buy, sell };
}

export default function WhaleSpectrum({ isMobile }) {
  const cvs = useRef(null);
  const [view, setView] = useState("flow");   // "flow" (equalizer) · "returns" (lifetime scoreboard)
  const [tl, setTl] = useState(null);         // null loading · false failed · object ok
  const [onchain, setOnchain] = useState(null);
  const [roi, setRoi] = useState(null);       // cohort-roi.json (null loading/failed)
  const [week, setWeek] = useState(null);     // current scrub position (null until data loads → last week)
  const [playing, setPlaying] = useState(false);
  const [flowWeeks, setFlowWeeks] = useState(4);   // net-flow lookback: 4 weeks (~30d) / 1 week
  const [hover, setHover] = useState(-1);

  useEffect(() => {
    let off = false;
    loadCityTimeline().then(d => { if (!off) { setTl(d ?? false); if (d) setWeek(d.n - 1); } });
    loadOnchain().then(d => { if (!off) setOnchain(d || null); });
    loadCohortRoi().then(d => { if (!off) setRoi(d || false); });
    return () => { off = true; };
  }, []);

  const peaks = useMemo(() => (tl && onchain ? nrplPeaks(onchain, tl) : null), [tl, onchain]);
  // price at a week (nearest onchain daily row) → context under the date.
  const priceAt = useMemo(() => {
    if (!tl || !onchain) return () => null;
    const rows = onchain.filter(r => r.d && r.spot != null);
    return (w) => {
      const target = dateOfWeek(tl, w);
      let best = null, bd = Infinity;
      for (const r of rows) { const gap = Math.abs(Date.parse(r.d) - Date.parse(target)); if (gap < bd) { bd = gap; best = r; } }
      return best?.spot ?? null;
    };
  }, [tl, onchain]);

  const cohorts = useMemo(() => (tl && week != null ? whaleSpectrum(tl, week, { flowWeeks }) : null), [tl, week, flowWeeks]);

  // play — advance a week every ~110ms, loop back to the start at the end.
  useEffect(() => {
    if (!playing || !tl) return;
    const id = setInterval(() => setWeek(w => (w >= tl.n - 1 ? 0 : w + 1)), 110);
    return () => clearInterval(id);
  }, [playing, tl]);

  // draw the equalizer
  useEffect(() => {
    const el = cvs.current; if (!el || !cohorts) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = el.clientWidth, H = el.clientHeight;
    el.width = W * dpr; el.height = H * dpr;
    const g = el.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);

    const n = cohorts.length;
    const padX = isMobile ? 10 : 18, topPad = 12, botPad = 6;
    const gap = isMobile ? 6 : 12;
    const barW = (W - padX * 2 - gap * (n - 1)) / n;
    const gridH = H - topPad - botPad;
    const segGap = 2, segH = (gridH - segGap * (SEG - 1)) / SEG;

    cohorts.forEach((c, i) => {
      const x = padX + i * (barW + gap);
      const { buy, sell } = litSegments(c);
      const hot = i === hover;
      for (let s = 0; s < SEG; s++) {
        // s = 0 at the BOTTOM. Green fills the bottom `buy` segments, red the top `sell`, dark between.
        const y = topPad + gridH - (s + 1) * segH - s * segGap;
        let fill = OFF;
        if (s < buy) { const t = 0.5 + 0.5 * (s / Math.max(1, buy)); fill = `rgba(${GREEN[0]},${GREEN[1]},${GREEN[2]},${(hot ? 1 : 0.9) * t})`; }
        else if (s >= SEG - sell) { const k = SEG - 1 - s, t = 0.5 + 0.5 * (k / Math.max(1, sell)); fill = `rgba(${RED[0]},${RED[1]},${RED[2]},${(hot ? 1 : 0.9) * t})`; }
        else if (c.total) fill = DARK;
        g.fillStyle = fill;
        g.fillRect(x, y, barW, segH);
      }
      if (hot) { g.strokeStyle = "rgba(94,234,212,0.9)"; g.lineWidth = 1.5; g.strokeRect(x - 1.5, topPad - 1.5, barW + 3, gridH + 3); }
    });
  }, [cohorts, hover, isMobile]);

  if (tl === false) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#94a3b8", padding: 60 }}>Whale timeline is being rebuilt — check back after the next on-chain refresh.</div>;
  if (!tl || !cohorts || week == null) return <div style={{ textAlign: "center", fontFamily: MONO, color: "#64748b", padding: 60 }}>Loading the whale timeline…</div>;

  const date = dateOfWeek(tl, week);
  const price = priceAt(week);
  const totalWhales = cohorts.reduce((s, c) => s + c.total, 0);
  const buyN = cohorts.reduce((s, c) => s + c.buy, 0), sellN = cohorts.reduce((s, c) => s + c.sell, 0);
  const roiReady = roi && Array.isArray(roi.cohorts) && roi.cohorts.some(c => c.n);
  const returns = view === "returns" && roiReady;
  const jump = w => { setPlaying(false); setWeek(Math.max(0, Math.min(tl.n - 1, w))); };
  const onMove = e => {
    const r = e.currentTarget.getBoundingClientRect();
    const padX = isMobile ? 10 : 18, gap = isMobile ? 6 : 12, n = cohorts.length;
    const bw = (r.width - padX * 2 - gap * (n - 1)) / n;
    const rel = e.clientX - r.left - padX;
    const i = Math.floor(rel / (bw + gap));
    setHover(rel >= 0 && i >= 0 && i < n && (rel % (bw + gap)) <= bw ? i : -1);
  };

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 14px", fontFamily: SANS }}>
      <div style={{ border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, overflow: "hidden", background: "#0a0e1c" }}>
        {/* header */}
        <div style={{ padding: isMobile ? "16px 16px 10px" : "20px 24px 12px", display: "flex", flexWrap: "wrap", gap: 12, alignItems: "baseline", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ fontSize: 18 }}>🎛️</span>
              <span style={{ fontWeight: 800, fontSize: isMobile ? 16 : 19, color: "#f1f5f9", letterSpacing: 0.2 }}>Whale Spectrum</span>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 12.5, color: "#8595ab", marginTop: 5 }}>
              {returns
                ? <>{roi.total.toLocaleString()} whales · <span style={{ color: "#22c55e" }}>{roi.pctProfit}% in profit</span> all-time</>
                : <>{totalWhales.toLocaleString()} whales · <span style={{ color: "#22c55e" }}>{buyN} buying</span> · <span style={{ color: "#fb7185" }}>{sellN} selling</span></>}
            </div>
          </div>
          {!returns && (
            <div style={{ textAlign: isMobile ? "left" : "right", fontFamily: MONO }}>
              <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 800, color: "#e2e8f0", fontVariantNumeric: "tabular-nums" }}>{date}</div>
              {price != null && <div style={{ fontSize: 13, color: "#5eead4", marginTop: 2 }}>SPX ${price >= 1 ? price.toFixed(2) : price.toFixed(4)}</div>}
            </div>
          )}
        </div>

        {/* view toggle — live flow vs lifetime returns (only once the ROI feed lands) */}
        {roiReady && (
          <div style={{ display: "flex", justifyContent: "center", padding: isMobile ? "0 14px 6px" : "0 24px 8px" }}>
            <div style={{ display: "inline-flex", borderRadius: 8, overflow: "hidden", border: "1px solid rgba(255,255,255,0.14)" }}>
              {[{ v: "flow", l: "Live flow" }, { v: "returns", l: "Lifetime returns" }].map((o, i) => (
                <button key={o.v} onClick={() => setView(o.v)} style={{
                  padding: "6px 15px", cursor: "pointer", fontFamily: SANS, fontSize: 13, fontWeight: 600, border: "none",
                  borderLeft: i ? "1px solid rgba(255,255,255,0.12)" : "none",
                  background: view === o.v ? "rgba(94,234,212,0.16)" : "transparent", color: view === o.v ? "#5eead4" : "#94a3b8",
                }}>{o.l}</button>
              ))}
            </div>
          </div>
        )}

        {returns && <Scoreboard roi={roi} isMobile={isMobile} />}

        {/* the equalizer */}
        {!returns && <>
        <div style={{ padding: isMobile ? "2px 8px 0" : "4px 14px 0" }}>
          <canvas ref={cvs} onMouseMove={onMove} onMouseLeave={() => setHover(-1)}
            style={{ width: "100%", height: isMobile ? 220 : 300, display: "block" }} />
          {/* cohort labels, aligned to the bars via the same flex geometry */}
          <div style={{ display: "flex", gap: isMobile ? 6 : 12, padding: isMobile ? "0 10px 6px" : "0 18px 8px" }}>
            {cohorts.map((c, i) => (
              <div key={c.label} style={{ flex: 1, textAlign: "center", fontFamily: MONO, fontSize: isMobile ? 8.5 : 11,
                color: i === hover ? "#5eead4" : "#64748b", fontWeight: i === hover ? 700 : 400, whiteSpace: "nowrap" }}>{c.label}</div>
            ))}
          </div>
        </div>

        {/* hover detail */}
        <div style={{ minHeight: 22, padding: isMobile ? "0 14px" : "0 24px", fontFamily: MONO, fontSize: 12.5, color: "#cbd5e1", textAlign: "center" }}>
          {hover >= 0 && cohorts[hover].total > 0 ? (
            <span>
              <b style={{ color: "#e2e8f0" }}>{cohorts[hover].label} band</b> · {cohorts[hover].total} whales · {" "}
              <span style={{ color: "#22c55e" }}>{cohorts[hover].buy} buying</span> · {" "}
              <span style={{ color: "#fb7185" }}>{cohorts[hover].sell} selling</span> · {" "}
              <span style={{ color: "#64748b" }}>{cohorts[hover].flat} flat</span>
            </span>
          ) : hover >= 0 ? <span style={{ color: "#64748b" }}>{cohorts[hover].label} band · no whales this week</span> : ""}
        </div>

        {/* transport */}
        <div style={{ padding: isMobile ? "8px 14px 14px" : "10px 24px 18px", borderTop: "1px solid rgba(255,255,255,0.07)", marginTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => setPlaying(p => !p)} style={{
              width: 38, height: 38, borderRadius: 9, cursor: "pointer", flex: "0 0 auto", fontSize: 15,
              background: playing ? "rgba(251,113,133,0.16)" : "rgba(94,234,212,0.16)",
              border: `1px solid ${playing ? "#fb7185" : "#5eead4"}`, color: playing ? "#fb7185" : "#5eead4",
            }}>{playing ? "❚❚" : "▶"}</button>
            <input type="range" min={0} max={tl.n - 1} value={week} onChange={e => { setPlaying(false); setWeek(+e.target.value); }}
              style={{ flex: 1, accentColor: "#5eead4", cursor: "pointer" }} />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", justifyContent: "center" }}>
            {peaks?.euphoria && <Chip label="⛰ Euphoria top" sub={peaks.euphoria.date} on={week === peaks.euphoria.week} onClick={() => jump(peaks.euphoria.week)} />}
            {peaks?.capitulation && <Chip label="🩸 Capitulation" sub={peaks.capitulation.date} on={week === peaks.capitulation.week} onClick={() => jump(peaks.capitulation.week)} />}
            <Chip label="● Today" sub={dateOfWeek(tl, tl.n - 1)} on={week === tl.n - 1} onClick={() => jump(tl.n - 1)} />
            <div style={{ display: "inline-flex", borderRadius: 8, overflow: "hidden", border: "1px solid rgba(255,255,255,0.14)", marginLeft: 4 }}>
              {[{ w: 4, l: "~30d flow" }, { w: 1, l: "1w flow" }].map((o, i) => (
                <button key={o.w} onClick={() => setFlowWeeks(o.w)} style={{
                  padding: "5px 11px", cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: 600, border: "none",
                  borderLeft: i ? "1px solid rgba(255,255,255,0.12)" : "none",
                  background: flowWeeks === o.w ? "rgba(94,234,212,0.16)" : "transparent", color: flowWeeks === o.w ? "#5eead4" : "#94a3b8",
                }}>{o.l}</button>
              ))}
            </div>
          </div>
        </div>
        </>}
      </div>

      {returns ? (
        <p style={{ fontSize: 12, color: "#7c8a9e", lineHeight: 1.55, margin: "12px 2px 0" }}>
          Lifetime profit/loss for every wallet ≥100k SPX, by its size band <b style={{ color: "#e2e8f0" }}>today</b>. Green share = wallets whose banked
          sells plus current bag are worth more than everything they put in; the multiple is the typical (median) wallet's value ÷ what it invested.
          <b style={{ color: "#e2e8f0" }}> Read it honestly:</b> this is a scoreboard of <b style={{ color: "#e2e8f0" }}>survivors</b> — a wallet only sits in
          the biggest bands because it bought early and cheap, and anyone who sold out dropped from their band entirely, so the top cohorts look best
          partly by construction. Average-cost accounting on weekly Ethereum balances; a valuation read on who's up, not a strategy to copy. Not advice.
        </p>
      ) : (
        <p style={{ fontSize: 12, color: "#7c8a9e", lineHeight: 1.55, margin: "12px 2px 0" }}>
          Every wallet ≥100k SPX, bucketed into ten size cohorts (100k → 16M+). Each bar is that cohort right now:
          <b style={{ color: "#22c55e" }}> green</b> lights from the bottom for the share <b style={{ color: "#e2e8f0" }}>accumulating</b>,
          <b style={{ color: "#fb7185" }}> red</b> from the top for the share <b style={{ color: "#e2e8f0" }}>distributing</b>, dark between = holding flat.
          Drag the slider or press play to watch the cohorts move through the cycle — the ⛰ and 🩸 jumps are the objective euphoria and capitulation
          weeks from on-chain realized profit/loss. Ethereum self-custody holders, reconstructed from the transfer log; a falling balance means a wallet
          reduced (sold, moved or split), not necessarily a sale. Not a signal.
        </p>
      )}
    </div>
  );
}

// LIFETIME RETURNS scoreboard — the same ten size bands, but each bar's height is the % of that band's
// wallets sitting in total profit (banked + current bag vs everything invested). Leads with % in
// profit; the typical multiple + wallet count ride as sub-labels. Static (no scrub) — a wallet's
// lifetime P&L doesn't dance, so it wants a ranked bar, not the equalizer.
function Scoreboard({ roi, isMobile }) {
  const cohorts = roi.cohorts.filter(c => c.n > 0);
  const barH = isMobile ? 180 : 240;
  const shade = pct => { const t = Math.max(0, Math.min(1, pct / 100)); return `rgb(${Math.round(20 + (34 - 20) * t)},${Math.round(83 + (197 - 83) * t)},${Math.round(45 + (94 - 45) * t)})`; };
  const best = cohorts.reduce((a, b) => (b.pctProfit > a.pctProfit ? b : a), cohorts[0]);
  return (
    <div style={{ padding: isMobile ? "2px 12px 4px" : "4px 22px 6px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: isMobile ? 5 : 10, height: barH, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        {cohorts.map(c => {
          const h = Math.max(3, (c.pctProfit / 100) * barH);
          return (
            <div key={c.label} title={`${c.label} band · ${c.n} whales · ${c.pctProfit}% in profit · ${c.medMult}× typical`}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
              <div style={{ fontFamily: MONO, fontSize: isMobile ? 11 : 13, fontWeight: 800, color: "#e2e8f0" }}>{c.pctProfit}%</div>
              <div style={{ width: "100%", maxWidth: 62, height: h, background: shade(c.pctProfit), borderRadius: "4px 4px 0 0",
                boxShadow: c === best ? "0 0 0 1.5px #5eead4" : "none", marginTop: 3 }} />
            </div>
          );
        })}
      </div>
      {/* labels: band size + typical multiple + count */}
      <div style={{ display: "flex", gap: isMobile ? 5 : 10, marginTop: 6 }}>
        {cohorts.map(c => (
          <div key={c.label} style={{ flex: 1, textAlign: "center", fontFamily: MONO, lineHeight: 1.3 }}>
            <div style={{ fontSize: isMobile ? 9.5 : 11.5, color: "#cbd5e1", fontWeight: 700 }}>{c.label}</div>
            <div style={{ fontSize: isMobile ? 8.5 : 10.5, color: c.medMult >= 1 ? "#5eead4" : "#8595ab" }}>{c.medMult}×</div>
            <div style={{ fontSize: isMobile ? 8 : 9.5, color: "#5b6675" }}>{c.n}w</div>
          </div>
        ))}
      </div>
      <div style={{ fontFamily: SANS, fontSize: isMobile ? 12.5 : 13.5, color: "#c7d2e4", marginTop: 12, textAlign: "center", lineHeight: 1.5 }}>
        The <b style={{ color: "#5eead4" }}>{best.label}</b> band leads — <b style={{ color: "#e2e8f0" }}>{best.pctProfit}%</b> in profit,
        typical wallet up <b style={{ color: "#e2e8f0" }}>{best.medMult}×</b>. Bigger bags, better returns — because becoming one took buying early.
      </div>
    </div>
  );
}

function Chip({ label, sub, on, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: 1, cursor: "pointer",
      padding: "5px 11px", borderRadius: 8, fontFamily: SANS,
      background: on ? "rgba(94,234,212,0.16)" : "rgba(255,255,255,0.04)",
      border: `1px solid ${on ? "#5eead4" : "rgba(255,255,255,0.12)"}`,
    }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: on ? "#5eead4" : "#cbd5e1" }}>{label}</span>
      <span style={{ fontFamily: MONO, fontSize: 9.5, color: "#64748b" }}>{sub}</span>
    </button>
  );
}
