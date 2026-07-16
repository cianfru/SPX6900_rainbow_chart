import { useMemo, useState, useEffect } from "react";
import { buildModel, bandIndex, BAND_LABELS, dayN } from "./models.js";
import { DEFAULT_RAW } from "./data.js";
import { SPX_ONCHAIN } from "./spx-onchain.js";
import { loadHistory, loadOnchain } from "./history-data.js";
import { lenses } from "../scripts/bot/valuation-lenses.mjs";
import { SANS, MONO, MAX_W } from "./chart-ui.jsx";

const COL = { cheap: "#4ade80", neutral: "#fbbf24", rich: "#f87171" };
// One-line "what this measures" per lens — the site can be more detailed than the card.
const DESC = {
  "Rainbow band": "Where price sits in the power-law rainbow.",
  "MVRV · cost basis": "Price vs the crowd's on-chain cost basis.",
  "Supply in profit": "Share of supply held above its cost basis.",
  "Pi Cycle · trend": "Trend-extension gauge (Bitcoin's, applied to SPX).",
  "vs alt market": "SPX vs the whole alt sector, detrended.",
  "Fear & Greed": "Crypto-wide market sentiment.",
};

// "Am I Cheap?" — the convergence dashboard, live. N independent valuation lenses, each
// scored 1–10 for cheapness (more squares = cheaper). The corroboration is the point.
// A valuation POSITION, never a buy signal. Reads the SAME lenses() as the tweet card.
export default function AmICheapDashboard({ series, isMobile, preview = false }) {
  const [history, setHistory] = useState(null);
  const [onchain, setOnchain] = useState(null);
  useEffect(() => {
    let off = false;
    loadHistory().then(d => { if (!off) setHistory(d); });
    loadOnchain().then(d => { if (!off && d) setOnchain(d); });
    return () => { off = true; };
  }, []);

  const g = useMemo(() => {
    if (!history?.length || !series?.length) return null;
    const m = buildModel(DEFAULT_RAW);
    const last = series.at(-1), price = last.price;
    const snap = history.at(-1);
    const s = {
      band: BAND_LABELS[bandIndex(m, price, dayN(last.date))],
      bandIndex: bandIndex(m, price, dayN(last.date)),
      price,
      supply: { breakEven: snap.be },
      onchain: onchain || SPX_ONCHAIN,
      drawn: series,
      fng: snap.fng,
    };
    return lenses(s);
  }, [history, onchain, series]);

  if (!g || g.length < 4) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading valuation lenses…</div>;

  const cheap = g.filter(x => x.state === "cheap").length;
  const rich = g.filter(x => x.state === "rich").length;
  const verdict = cheap > rich && cheap >= g.length / 2 ? "cheap" : rich > cheap ? "rich" : "neutral";
  const vWord = verdict === "cheap" ? "CHEAP" : verdict === "rich" ? "RICH" : "MIXED";
  const vCol = COL[verdict];
  const avg = (g.reduce((s, x) => s + x.score, 0) / g.length).toFixed(1);
  const sq = isMobile ? 15 : 21;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 18 }}>
        <div style={{ fontFamily: SANS, fontSize: isMobile ? 28 : 38, fontWeight: 800, color: vCol }}>{cheap} of {g.length} lenses say {vWord}</div>
        <div style={{ fontFamily: MONO, fontSize: 13.5, color: "#94a3b8", marginTop: 4 }}>avg cheapness {avg}/10 · more squares = cheaper</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {g.map(x => {
          const c = COL[x.state];
          return (
            <div key={x.name} style={{ display: "flex", alignItems: "center", gap: 12, background: c + "14", borderLeft: `4px solid ${c}`, borderRadius: 12, padding: isMobile ? "10px 12px" : "12px 18px" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: SANS, fontSize: isMobile ? 16 : 20, fontWeight: 700, color: "#e2e8f0" }}>{x.name}</div>
                <div style={{ fontFamily: SANS, fontSize: isMobile ? 12.5 : 14, fontWeight: 600, color: c }}>{x.phrase}</div>
                {!isMobile && <div style={{ fontFamily: SANS, fontSize: 12, color: "#64748b", marginTop: 2 }}>{DESC[x.name] || ""}</div>}
              </div>
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }} title={`${x.score}/10 cheap`}>
                {Array.from({ length: 10 }).map((_, j) => (
                  <div key={j} style={{ width: sq, height: sq, borderRadius: 4, background: j < x.score ? c : "rgba(255,255,255,0.06)", border: j < x.score ? "none" : `1px solid ${c}40`, boxSizing: "border-box" }} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 16, lineHeight: 1.65 }}>
        Each lens is an <strong style={{ color: "#cbd5e1" }}>independent</strong> read on valuation, scored 1–10 for cheapness. The <strong style={{ color: vCol }}>convergence</strong> is the signal — one metric can mislead, several aligning is stronger. A valuation position, not a timing call or a bottom. Not financial advice.
      </div>
    </div>
  );
}
