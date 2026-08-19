import { useEffect, useMemo, useRef, useState } from "react";
import { loadCityTimeline, loadOnchain } from "./history-data.js";
import { whaleSpectrum, nrplPeaks, dateOfWeek, SPECTRUM_LABELS } from "./whale-spectrum.js";
import { SANS, MONO, ViewTabs } from "./chart-ui.jsx";

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
  const [tl, setTl] = useState(null);         // null loading · false failed · object ok
  const [onchain, setOnchain] = useState(null);
  const [week, setWeek] = useState(null);     // current scrub position (null until data loads → last week)
  const [playing, setPlaying] = useState(false);
  const [flowWeeks, setFlowWeeks] = useState(4);   // net-flow lookback: 4 weeks (~30d) / 1 week
  const [hover, setHover] = useState(-1);

  useEffect(() => {
    let off = false;
    loadCityTimeline().then(d => { if (!off) { setTl(d ?? false); if (d) setWeek(d.n - 1); } });
    loadOnchain().then(d => { if (!off) setOnchain(d || null); });
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
              {totalWhales.toLocaleString()} whales · <span style={{ color: "#22c55e" }}>{buyN} buying</span> · <span style={{ color: "#fb7185" }}>{sellN} selling</span>
            </div>
          </div>
          <div style={{ textAlign: isMobile ? "left" : "right", fontFamily: MONO }}>
            <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 800, color: "#e2e8f0", fontVariantNumeric: "tabular-nums" }}>{date}</div>
            {price != null && <div style={{ fontSize: 13, color: "#5eead4", marginTop: 2 }}>SPX ${price >= 1 ? price.toFixed(2) : price.toFixed(4)}</div>}
          </div>
        </div>

        {/* the equalizer */}
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
              width: 38, height: 38, borderRadius: 0, cursor: "pointer", flex: "0 0 auto", fontSize: 15,
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
            <span style={{ marginLeft: 4 }}><ViewTabs tabs={[[4, "~30d flow"], [1, "1w flow"]]} value={flowWeeks} onChange={setFlowWeeks} /></span>
          </div>
        </div>
      </div>

      <p style={{ fontSize: 12, color: "#7c8a9e", lineHeight: 1.55, margin: "12px 2px 0" }}>
        Every wallet ≥100k SPX, bucketed into ten size cohorts (100k → 16M+). Each bar is that cohort right now:
        <b style={{ color: "#22c55e" }}> green</b> lights from the bottom for the share <b style={{ color: "#e2e8f0" }}>accumulating</b>,
        <b style={{ color: "#fb7185" }}> red</b> from the top for the share <b style={{ color: "#e2e8f0" }}>distributing</b>, dark between = holding flat.
        Drag the slider or press play to watch the cohorts move through the cycle — the ⛰ and 🩸 jumps are the objective euphoria and capitulation
        weeks from on-chain realized profit/loss. Ethereum self-custody holders, reconstructed from the transfer log; a falling balance means a wallet
        reduced (sold, moved or split), not necessarily a sale. Not a signal.
      </p>
    </div>
  );
}

function Chip({ label, sub, on, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: 1, cursor: "pointer",
      padding: "5px 11px", borderRadius: 0, fontFamily: SANS,
      background: on ? "rgba(94,234,212,0.16)" : "rgba(255,255,255,0.04)",
      border: `1px solid ${on ? "#5eead4" : "rgba(255,255,255,0.12)"}`,
    }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: on ? "#5eead4" : "#cbd5e1" }}>{label}</span>
      <span style={{ fontFamily: MONO, fontSize: 9.5, color: "#64748b" }}>{sub}</span>
    </button>
  );
}
