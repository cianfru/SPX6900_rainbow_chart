import { useState, useEffect } from "react";
import { SANS, MONO } from "./chart-ui.jsx";

// A compact one-line LIVE read of the big holders' net SPX flow over the last few hours, from
// /api/live-flow (Alchemy, ~minutes fresh). On the Exit Flow page it's the leading edge of exits:
// distribution now is what becomes tomorrow's departure bars. Honest scope is stated inline, this
// is the big-holder (≥100k) live layer; the historical bars below are the full ≥5k base, daily.
//
// Graceful: hidden entirely until the feed returns real moves (no ALCHEMY_KEY in Vercel, or the
// sandbox, → nothing renders rather than a dead "0" strip).

const kM = v => v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : v >= 1e3 ? Math.round(v / 1e3) + "k" : String(Math.round(v));
const ago = iso => {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  return s < 90 ? Math.round(s) + "s ago" : s < 5400 ? Math.round(s / 60) + " min ago" : Math.round(s / 3600) + "h ago";
};

export default function LiveFlowStrip({ isMobile }) {
  const [live, setLive] = useState(null);
  const [, setTick] = useState(0);
  useEffect(() => {
    let off = false, timer, t2;
    const pull = () => fetch("/api/live-flow").then(r => r.json()).then(d => { if (!off) setLive(d); }).catch(() => {});
    pull(); timer = setInterval(pull, 60000); t2 = setInterval(() => setTick(x => x + 1), 15000);
    return () => { off = true; clearInterval(timer); clearInterval(t2); };
  }, []);

  // the strip reads the LIVE sub-window (last few hours), not the 7-day earmark
  const moves = (live?.wallets || []).filter(w => w.live);
  if (!moves.length) return null;                       // nothing to show until the live feed is wired + moving

  let buy = 0, sell = 0, nb = 0, ns = 0;
  for (const m of moves) { if (m.live > 0) { buy += m.live; nb++; } else if (m.live < 0) { sell += -m.live; ns++; } }
  const net = buy - sell;
  const dist = net < 0;
  const accent = dist ? "#fb7185" : "#4ade80";

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center", gap: isMobile ? 8 : 14, flexWrap: "wrap",
      maxWidth: 760, margin: "0 auto 14px", padding: "9px 14px", borderRadius: 10,
      background: dist ? "rgba(251,113,133,0.08)" : "rgba(74,222,128,0.08)",
      border: `1px solid ${dist ? "rgba(251,113,133,0.3)" : "rgba(74,222,128,0.3)"}`, fontFamily: SANS,
    }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: MONO, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: accent }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: accent, boxShadow: `0 0 8px ${accent}` }} />
        Live · {live.liveHours || 6}h
      </span>
      <span style={{ fontSize: 13.5, color: "#e2e8f0" }}>
        Big holders <strong style={{ color: accent }}>{dist ? "distributing" : "accumulating"}</strong>:{" "}
        <span style={{ fontFamily: MONO, color: accent, fontWeight: 700 }}>{net >= 0 ? "+" : "−"}{kM(Math.abs(net))} SPX net</span>
      </span>
      <span style={{ fontFamily: MONO, fontSize: 12, color: "#94a3b8" }}>
        <span style={{ color: "#fb7185" }}>▼ {kM(sell)}</span> ({ns}) · <span style={{ color: "#4ade80" }}>▲ {kM(buy)}</span> ({nb})
      </span>
      <span style={{ fontFamily: MONO, fontSize: 11, color: "#64748b" }}>{isMobile ? "" : "≥100k wallets · "}updated {ago(live.updated)}</span>
    </div>
  );
}
