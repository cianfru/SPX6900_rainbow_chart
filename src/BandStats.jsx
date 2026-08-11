import { useMemo } from "react";
import { bandIndex, BAND_LABELS, dayN } from "./models.js";
import { SANS, MONO, MAX_W } from "./chart-ui.jsx";

const DAY = 86400000;

const fDays = n => {
  if (n == null) return "-";
  if (n < 1) return "today";
  if (n < 30) return `${Math.round(n)}d`;
  if (n < 365) return `${(n / 30.44).toFixed(1)}mo`;
  return `${(n / 365.25).toFixed(1)}y`;
};

function Readout({ label, value, color, sub, isMobile }) {
  return (
    <div style={{ textAlign: "center", minWidth: 120 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, color: "#94a3b8", letterSpacing: 1.1 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: isMobile ? 24 : 30, fontWeight: 700, color, textShadow: `0 0 18px ${color}44` }}>{value}</div>
      {sub && <div style={{ fontFamily: SANS, fontSize: 11.5, color: "#7c8a9e", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default function BandStats({ m, series, isMobile }) {
  const stats = useMemo(() => {
    if (!m || !series || series.length < 2) return null;
    const dur = new Array(BAND_LABELS.length).fill(0); // calendar days spent in each band
    let lastFireSale = null; // last date in band 0
    let lastBubble = null;   // last date in SELL!/Max Bubble (idx >= 7)
    let curBand = 0;
    for (let i = 0; i < series.length; i++) {
      const bi = bandIndex(m, series[i].price, dayN(series[i].date));
      if (bi === 0) lastFireSale = series[i].date;
      if (bi >= 7) lastBubble = series[i].date;
      curBand = bi;
      // attribute the gap to the next point (or one day for the final point) to this band
      const t0 = new Date(series[i].date).getTime();
      const t1 = i + 1 < series.length ? new Date(series[i + 1].date).getTime() : t0 + DAY;
      dur[bi] += Math.max(0, (t1 - t0) / DAY);
    }
    const totalDays = dur.reduce((a, b) => a + b, 0) || 1;

    // current streak: walk back while still in the current band
    let streakStartIdx = series.length - 1;
    for (let i = series.length - 1; i >= 0; i--) {
      if (bandIndex(m, series[i].price, dayN(series[i].date)) === curBand) streakStartIdx = i;
      else break;
    }
    // Reference "now" = latest data point (the live price upserts a today point),
    // keeping this pure (no Date.now()) so all spans measure against current data.
    const now = new Date(series[series.length - 1].date).getTime();
    const streakDays = (now - new Date(series[streakStartIdx].date).getTime()) / DAY;
    const since = d => (d == null ? null : (now - new Date(d).getTime()) / DAY);

    return {
      dur, totalDays, curBand,
      streakDays,
      daysSinceFire: curBand === 0 ? 0 : since(lastFireSale),
      daysSinceBubble: curBand >= 7 ? 0 : since(lastBubble),
    };
  }, [m, series]);

  if (!stats) return null;
  const { dur, totalDays, curBand, streakDays, daysSinceFire, daysSinceBubble } = stats;
  const cb = BAND_LABELS[curBand];
  const maxDur = Math.max(...dur);

  return (
    <div style={{
      maxWidth: MAX_W, margin: "0 auto 20px", padding: isMobile ? "16px 16px" : "18px 26px",
      background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 14, backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
    }}>
      <div style={{
        fontFamily: SANS, fontSize: 12.5, fontWeight: 700, color: "#94a3b8",
        letterSpacing: 1, textTransform: "uppercase", textAlign: "center", marginBottom: 16,
      }}>
        Valuation band history
      </div>

      <div style={{ display: "flex", gap: isMobile ? 18 : 44, justifyContent: "center", flexWrap: "wrap", marginBottom: 18 }}>
        <Readout label="CURRENT BAND" value={cb.l} color={cb.c} sub={`for ${fDays(streakDays)}`} isMobile={isMobile} />
        <Readout label="SINCE FIRE SALE" value={daysSinceFire === 0 ? "now" : fDays(daysSinceFire)}
          color="#6366f1" sub={daysSinceFire === 0 ? "in it today" : "last capitulation"} isMobile={isMobile} />
        <Readout label="SINCE SELL ZONE" value={daysSinceBubble === 0 ? "now" : fDays(daysSinceBubble)}
          color="#dc2626" sub={daysSinceBubble == null ? "never reached" : "last bubble"} isMobile={isMobile} />
      </div>

      {/* time-in-band distribution, cheapest → priciest */}
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        {BAND_LABELS.map((b, i) => {
          const pct = (dur[i] / totalDays) * 100;
          const w = maxDur > 0 ? (dur[i] / maxDur) * 100 : 0;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <div style={{
                width: isMobile ? 78 : 96, flexShrink: 0, textAlign: "right",
                fontFamily: SANS, fontSize: isMobile ? 11 : 12.5,
                color: i === curBand ? b.c : "#94a3b8", fontWeight: i === curBand ? 700 : 500,
              }}>{b.l}</div>
              <div style={{ flex: 1, height: 14, background: "rgba(255,255,255,0.05)", borderRadius: 5, overflow: "hidden" }}>
                <div style={{
                  height: "100%", width: `${w}%`, background: b.c, borderRadius: 5,
                  boxShadow: dur[i] > 0 ? `0 0 10px ${b.c}55` : "none", transition: "width 0.4s ease",
                }} />
              </div>
              <div style={{
                width: 48, flexShrink: 0, fontFamily: MONO, fontSize: isMobile ? 10.5 : 12,
                color: "#cbd5e1", textAlign: "right",
              }}>{pct >= 0.5 ? pct.toFixed(0) + "%" : "<1%"}</div>
            </div>
          );
        })}
      </div>

      <div style={{ fontFamily: SANS, fontSize: 11.5, color: "#7c8a9e", textAlign: "center", marginTop: 14, lineHeight: 1.6 }}>
        Share of SPX6900&apos;s lifetime that price spent in each valuation band (by model classification). Not financial advice.
      </div>
    </div>
  );
}
