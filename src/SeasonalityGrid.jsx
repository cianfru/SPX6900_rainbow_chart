import { useMemo } from "react";

// Monthly-returns heatmap: rows = years, columns = Jan…Dec, green for a positive
// month, red for negative, intensity scaled by size. A right-hand column gives
// each year's compounded return, and an "Avg" footer row shows the typical
// return per calendar month (seasonality). Returns are month-over-month on each
// month's last close — same definition the bot's monthly-returns card uses.
const SANS = "'Space Grotesk', system-ui, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";
const MAX_W = 1400;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// One shared label format: big gains read as a multiple (12x), the rest as %.
const fmt = r => {
  if (r == null || !isFinite(r)) return "";
  if (r >= 1) { const m = 1 + r; return (m >= 10 ? m.toFixed(0) : m.toFixed(1)) + "x"; }
  return (r >= 0 ? "+" : "") + Math.round(r * 100) + "%";
};

// Cell background: green up / red down, opacity grows with magnitude (log-ish so a
// +400% month still separates from a +30% one without washing everything out).
const cellBg = r => {
  if (r == null || !isFinite(r)) return "transparent";
  const mag = Math.min(1, Math.log1p(Math.abs(r)) / Math.log(3.2)); // ~|220%| = full
  const a = 0.1 + mag * 0.62;
  return r >= 0 ? `rgba(34,197,94,${a.toFixed(3)})` : `rgba(239,68,68,${a.toFixed(3)})`;
};

function Readout({ label, value, color, isMobile }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontFamily: MONO, fontSize: isMobile ? 11 : 12, color: "#94a3b8", letterSpacing: 1.2 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: isMobile ? 26 : 38, fontWeight: 700, color, textShadow: `0 0 22px ${color}55` }}>{value}</div>
    </div>
  );
}

export default function SeasonalityGrid({ series, isMobile }) {
  const { years, retOf, yearTotal, monthAvg, stats } = useMemo(() => {
    // last close of each calendar month
    const byMonth = new Map();
    for (const { date, price } of series) {
      const d = new Date(date);
      byMonth.set(d.getUTCFullYear() * 12 + d.getUTCMonth(), price);
    }
    const keys = [...byMonth.keys()].sort((a, b) => a - b);
    const retOf = new Map();
    for (let i = 1; i < keys.length; i++) retOf.set(keys[i], byMonth.get(keys[i]) / byMonth.get(keys[i - 1]) - 1);

    const y0 = Math.floor(keys[0] / 12), y1 = Math.floor(keys[keys.length - 1] / 12);
    const years = [];
    for (let y = y0; y <= y1; y++) years.push(y);

    const yearTotal = new Map();
    for (const y of years) {
      let mult = 1, any = false;
      for (let m = 0; m < 12; m++) { const r = retOf.get(y * 12 + m); if (r != null) { mult *= 1 + r; any = true; } }
      if (any) yearTotal.set(y, mult - 1);
    }
    const monthAvg = MONTHS.map((_, m) => {
      const vals = years.map(y => retOf.get(y * 12 + m)).filter(r => r != null);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    });

    const all = [...retOf.values()];
    const green = all.filter(r => r >= 0).length;
    const stats = {
      greenPct: all.length ? Math.round((green / all.length) * 100) : 0,
      best: all.length ? Math.max(...all) : null,
      worst: all.length ? Math.min(...all) : null,
    };
    return { years, retOf, yearTotal, monthAvg, stats };
  }, [series]);

  const cols = `${isMobile ? 40 : 52}px repeat(12, 1fr) ${isMobile ? 52 : 64}px`;
  const cellH = isMobile ? 34 : 44;
  const fs = isMobile ? 10 : 13;
  const hdr = (t, key) => (
    <div key={key} style={{ fontFamily: MONO, fontSize: isMobile ? 10 : 12, color: "#94a3b8", textAlign: "center", padding: "4px 0" }}>{t}</div>
  );
  const cell = (r, key, big) => (
    <div key={key} style={{
      height: cellH, background: cellBg(r), borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: MONO, fontSize: fs, fontWeight: big ? 700 : 500, color: r == null ? "#334155" : "#f1f5f9",
      border: "1px solid rgba(255,255,255,0.04)",
    }}>{fmt(r)}</div>
  );

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: isMobile ? 24 : 56, justifyContent: "center", marginBottom: 18, flexWrap: "wrap" }}>
        <Readout label="GREEN MONTHS" value={stats.greenPct + "%"} color="#4ade80" isMobile={isMobile} />
        <Readout label="BEST MONTH" value={fmt(stats.best)} color="#22c55e" isMobile={isMobile} />
        <Readout label="WORST MONTH" value={fmt(stats.worst)} color="#f87171" isMobile={isMobile} />
      </div>

      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: isMobile ? 560 : 720 }}>
          {/* header */}
          <div style={{ display: "grid", gridTemplateColumns: cols, gap: 4 }}>
            {hdr("", "h-")}
            {MONTHS.map(m => hdr(m, "h" + m))}
            {hdr("Year", "h-yr")}
          </div>
          {/* year rows */}
          {years.map(y => (
            <div key={y} style={{ display: "grid", gridTemplateColumns: cols, gap: 4, marginTop: 4 }}>
              <div style={{ fontFamily: MONO, fontSize: isMobile ? 11 : 13, color: "#cbd5e1", display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 6 }}>{y}</div>
              {MONTHS.map((_, m) => cell(retOf.get(y * 12 + m), y + "-" + m))}
              {cell(yearTotal.get(y), y + "-yr", true)}
            </div>
          ))}
          {/* seasonality average */}
          <div style={{ display: "grid", gridTemplateColumns: cols, gap: 4, marginTop: 10 }}>
            <div style={{ fontFamily: MONO, fontSize: isMobile ? 10 : 12, color: "#94a3b8", display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 6 }}>Avg</div>
            {monthAvg.map((r, m) => cell(r, "avg-" + m))}
            <div />
          </div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 14, flexWrap: "wrap", marginTop: 16, fontFamily: SANS, fontSize: 12.5, color: "#94a3b8" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 14, height: 14, borderRadius: 4, background: "rgba(239,68,68,0.6)" }} /> down month</span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 14, height: 14, borderRadius: 4, background: "rgba(34,197,94,0.6)" }} /> up month</span>
        <span>· deeper color = bigger move</span>
      </div>

      <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.6 }}>
        Each cell is that month's return (last close vs. the prior month's). The <strong style={{ color: "#cbd5e1" }}>Year</strong> column
        compounds the months into an annual figure; <strong style={{ color: "#cbd5e1" }}>Avg</strong> is the typical return for that calendar
        month across all years — the seasonality. Big gains show as a multiple (e.g. 12x). Not financial advice.
      </div>
    </div>
  );
}
