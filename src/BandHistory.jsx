// "What this band has meant", the replacement for the scale-in / scale-out plan.
//
// The old section told the visitor to "Sell ~35% of your stack" in the SELL! band,
// directly above a line saying this is not advice. Every card the project publishes
// is careful to state a valuation POSITION and never an action; the site was the one
// place that broke that, and it broke it with the most consequential sentence on the
// page.
//
// This says what actually happened instead. For every band: how much of SPX's life
// has been spent there, and what the following 90 days did, median, best and worst.
// Same nine rows, same at-a-glance shape, but every number is measured rather than
// prescribed, so a reader draws their own conclusion from the record.
import { useMemo } from "react";
import { BAND_LABELS, bandIndex, dayN } from "./models.js";
import { SANS, MONO, MAX_W } from "./chart-ui.jsx";

const DAY = 86400000;
const HORIZON = 90;

const pct = v => (v == null ? "-" : `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`);
const med = a => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
};

export function bandHistory(m, series) {
  if (!m || !series || series.length < 30) return null;
  const n = BAND_LABELS.length;
  const days = new Array(n).fill(0);
  const fwd = Array.from({ length: n }, () => []);
  const band = new Array(series.length);
  const ts = series.map(r => new Date(r.date).getTime());

  for (let i = 0; i < series.length; i++) band[i] = bandIndex(m, series[i].price, dayN(series[i].date));

  for (let i = 0; i < series.length; i++) {
    const b = band[i];
    const t1 = i + 1 < series.length ? ts[i + 1] : ts[i] + DAY;
    days[b] += Math.max(0, (t1 - ts[i]) / DAY);
    // forward return over the next HORIZON days, if the series reaches that far
    const target = ts[i] + HORIZON * DAY;
    if (target > ts[series.length - 1]) continue;
    let j = i;
    while (j < series.length - 1 && ts[j] < target) j++;
    if (series[i].price > 0) fwd[b].push(series[j].price / series[i].price - 1);
  }

  const total = days.reduce((a, b) => a + b, 0) || 1;
  return {
    cur: band[band.length - 1],
    rows: BAND_LABELS.map((bl, i) => ({
      i, label: bl.l, color: bl.c,
      share: days[i] / total,
      n: fwd[i].length,
      median: med(fwd[i]),
      best: fwd[i].length ? Math.max(...fwd[i]) : null,
      worst: fwd[i].length ? Math.min(...fwd[i]) : null,
    })),
  };
}

export default function BandHistory({ m, series, isMobile }) {
  const h = useMemo(() => bandHistory(m, series), [m, series]);
  if (!h) return null;

  const Cell = ({ children, color = "#cbd5e1", w }) => (
    <span style={{
      fontFamily: MONO, fontSize: isMobile ? 12 : 13, color, textAlign: "right",
      width: w, flexShrink: 0, whiteSpace: "nowrap",
    }}>{children}</span>
  );
  const ret = v => (v == null ? "#64748b" : v >= 0 ? "#4ade80" : "#f87171");
  const wShare = isMobile ? 44 : 58, wRet = isMobile ? 52 : 66;

  return (
    <div style={{ maxWidth: MAX_W, margin: "32px auto 0" }}>
      <div style={{
        fontFamily: SANS, fontSize: 14, fontWeight: 700, color: "#cbd5e1", marginBottom: 4,
        letterSpacing: 1.2, textTransform: "uppercase",
      }}>
        What each band has meant
      </div>
      <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#7c8a9e", marginBottom: 12, lineHeight: 1.55 }}>
        Every day since launch sorted by the band it was in, and what the next {HORIZON} days did from there.
        A record of what happened, not a recommendation. Read it thin: the windows overlap heavily, so a row
        showing fifty days is a handful of separate episodes, and all of it is one cycle.
      </div>

      <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: isMobile ? "6px 8px" : "8px 12px" }}>
        {/* header row */}
        <div style={{
          display: "flex", alignItems: "center", gap: isMobile ? 8 : 14,
          padding: isMobile ? "6px 8px" : "6px 12px",
          fontFamily: SANS, fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "#64748b",
        }}>
          <span style={{ minWidth: isMobile ? 92 : 150, flexShrink: 0 }}>Band</span>
          <span style={{ flex: 1, minWidth: 0 }} />
          <span style={{ width: wShare, textAlign: "right", flexShrink: 0 }}>Time</span>
          <span style={{ width: wRet, textAlign: "right", flexShrink: 0 }}>Median</span>
          {!isMobile && <span style={{ width: wRet, textAlign: "right", flexShrink: 0 }}>Worst</span>}
          {!isMobile && <span style={{ width: wRet, textAlign: "right", flexShrink: 0 }}>Best</span>}
        </div>

        {h.rows.slice().reverse().map((r, pos, arr) => {
          const isNow = r.i === h.cur;
          return (
            <div key={r.i} style={{
              display: "flex", alignItems: "center", gap: isMobile ? 8 : 14,
              padding: isMobile ? "10px 8px" : "11px 12px",
              borderRadius: 9,
              background: isNow ? `${r.color}24` : "transparent",
              border: `1px solid ${isNow ? r.color + "80" : "transparent"}`,
              borderBottom: isNow ? `1px solid ${r.color}80` : (pos < arr.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "1px solid transparent"),
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: isMobile ? 92 : 150, flexShrink: 0 }}>
                <span style={{
                  width: 11, height: 11, borderRadius: 3, background: r.color, flexShrink: 0,
                  boxShadow: isNow ? `0 0 8px ${r.color}` : "none",
                }} />
                <span style={{ fontFamily: SANS, fontSize: isMobile ? 13 : 14, fontWeight: isNow ? 700 : 600, color: isNow ? "#f1f5f9" : "#cbd5e1" }}>
                  {r.label}
                </span>
              </div>
              <div style={{ flex: 1, minWidth: 0, fontFamily: SANS, fontSize: 12, color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {isNow ? "you are here" : r.n ? `${r.n} day${r.n === 1 ? "" : "s"} measured` : "never been here"}
              </div>
              <Cell w={wShare} color="#94a3b8">{r.share > 0 ? `${(r.share * 100).toFixed(0)}%` : "0%"}</Cell>
              <Cell w={wRet} color={ret(r.median)}>{pct(r.median)}</Cell>
              {!isMobile && <Cell w={wRet} color={ret(r.worst)}>{pct(r.worst)}</Cell>}
              {!isMobile && <Cell w={wRet} color={ret(r.best)}>{pct(r.best)}</Cell>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
