import { useMemo, useState, useEffect } from "react";
import { fetchBtcHistory } from "./data.js";

// Monthly-returns heatmap: rows = years, columns = Jan…Dec, green for a positive
// month, red for negative, intensity scaled by size. A right-hand column gives
// each year's compounded return, and an "Avg" footer row shows the typical
// return per calendar month (seasonality). A USD / BTC toggle switches the whole
// table between dollar returns and returns measured in Bitcoin (SPX priced in
// BTC). Returns are month-over-month on each month's last close — same
// definition the bot's monthly-returns cards use.
const SANS = "'Space Grotesk', system-ui, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";
const MAX_W = 1400;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// One shared label format: always a % return, with a compact "k%" for the rare
// tail months/years that run into the thousands of percent (keeps cells tight).
const fmt = r => {
  if (r == null || !isFinite(r)) return "";
  const p = r * 100;
  if (Math.abs(p) >= 1000) { const k = p / 1000; return (p >= 0 ? "+" : "") + (Math.abs(k) >= 10 ? k.toFixed(0) : k.toFixed(1)) + "k%"; }
  return (p >= 0 ? "+" : "") + Math.round(p) + "%";
};

// Cell background: green up / red down, opacity grows with magnitude (log-ish so a
// +400% month still separates from a +30% one without washing everything out).
const cellBg = r => {
  if (r == null || !isFinite(r)) return "transparent";
  const mag = Math.min(1, Math.log1p(Math.abs(r)) / Math.log(3.2)); // ~|220%| = full
  const a = 0.1 + mag * 0.62;
  return r >= 0 ? `rgba(34,197,94,${a.toFixed(3)})` : `rgba(239,68,68,${a.toFixed(3)})`;
};

// Align BTC daily prices to the SPX series (largest BTC date ≤ each SPX date) and
// express SPX in BTC (sats). Returns of sats == returns of the raw ratio, so the
// monthly grid works unchanged.
function spxInBtc(spx, btc) {
  const sorted = [...btc].sort((a, b) => a.date.localeCompare(b.date));
  const dates = sorted.map(b => b.date);
  const at = d => {
    let lo = 0, hi = dates.length - 1, ans = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (dates[m] <= d) { ans = m; lo = m + 1; } else hi = m - 1; }
    return ans >= 0 ? sorted[ans].price : null;
  };
  const out = [];
  for (const s of spx) { const b = at(s.date); if (b) out.push({ date: s.date, price: (s.price / b) * 1e8 }); }
  return out;
}

// Pure month-over-month computation, shared by both denominations.
function computeMonthly(series) {
  const byMonth = new Map();
  for (const { date, price } of series) {
    if (!(price > 0)) continue;
    const d = new Date(date);
    byMonth.set(d.getUTCFullYear() * 12 + d.getUTCMonth(), price);
  }
  const keys = [...byMonth.keys()].sort((a, b) => a - b);
  const retOf = new Map();
  for (let i = 1; i < keys.length; i++) retOf.set(keys[i], byMonth.get(keys[i]) / byMonth.get(keys[i - 1]) - 1);
  if (!keys.length) return null;

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
}

function Readout({ label, value, color, isMobile }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontFamily: MONO, fontSize: isMobile ? 11 : 12, color: "#94a3b8", letterSpacing: 1.2 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: isMobile ? 26 : 38, fontWeight: 700, color, textShadow: `0 0 22px ${color}55` }}>{value}</div>
    </div>
  );
}

export default function SeasonalityGrid({ series, isMobile }) {
  const [denom, setDenom] = useState("usd");
  const [btc, setBtc] = useState(null);
  const [btcError, setBtcError] = useState(null);

  // Fetch BTC history lazily, only when the BTC view is first opened.
  useEffect(() => {
    if (denom !== "btc" || btc || btcError) return;
    let cancelled = false;
    fetchBtcHistory()
      .then(({ prices }) => { if (!cancelled) setBtc(prices); })
      .catch(e => { if (!cancelled) setBtcError(e.message || "failed"); });
    return () => { cancelled = true; };
  }, [denom, btc, btcError]);

  const activeSeries = useMemo(
    () => (denom === "btc" ? (btc ? spxInBtc(series, btc) : null) : series),
    [denom, btc, series],
  );
  const monthly = useMemo(() => (activeSeries ? computeMonthly(activeSeries) : null), [activeSeries]);

  const isBtc = denom === "btc";
  const Toggle = (
    <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 18 }}>
      {[["usd", "USD", "#4ade80"], ["btc", "BTC", "#f59e0b"]].map(([id, label, c]) => (
        <button key={id} onClick={() => setDenom(id)} aria-pressed={denom === id} style={{
          padding: "7px 20px", borderRadius: 999, cursor: "pointer",
          fontFamily: SANS, fontSize: 14, fontWeight: 700,
          color: denom === id ? "#05050e" : "#cbd5e1",
          background: denom === id ? c : "rgba(255,255,255,0.06)",
          border: `1px solid ${denom === id ? c : "rgba(255,255,255,0.16)"}`, transition: "all .15s ease",
        }}>{label}</button>
      ))}
    </div>
  );

  // BTC view still loading / failed → show the toggle plus a status line.
  if (isBtc && !monthly) {
    return (
      <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
        {Toggle}
        <div style={{ textAlign: "center", fontFamily: SANS, color: btcError ? "#f87171" : "#64748b", padding: 40 }}>
          {btcError ? `Couldn't load BTC data: ${btcError}` : "Loading BTC data…"}
        </div>
      </div>
    );
  }
  if (!monthly) return <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>{Toggle}</div>;

  const { years, retOf, yearTotal, monthAvg, stats } = monthly;

  // a thin spacer column sits between Dec and the Year (totals) column so the
  // summary doesn't blur into the months.
  const SP = isMobile ? 8 : 12;
  const cols = `${isMobile ? 40 : 52}px repeat(12, 1fr) ${SP}px ${isMobile ? 52 : 64}px`;
  const cellH = isMobile ? 34 : 44;
  const fs = isMobile ? 10 : 13;
  const hdr = (t, key) => (
    <div key={key} style={{ fontFamily: MONO, fontSize: isMobile ? 10 : 12, color: "#94a3b8", textAlign: "center", padding: "4px 0" }}>{t}</div>
  );
  // summary = the Year column / Avg row totals: brighter frame so they read as
  // summaries, not as another month.
  const cell = (r, key, big, summary) => (
    <div key={key} style={{
      height: cellH, background: cellBg(r), borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: MONO, fontSize: fs, fontWeight: (big || summary) ? 700 : 500, color: r == null ? "#334155" : "#f8fafc",
      border: summary ? "1px solid rgba(255,255,255,0.30)" : "1px solid rgba(255,255,255,0.04)",
      boxShadow: summary ? "inset 0 0 0 1px rgba(255,255,255,0.06)" : "none",
    }}>{fmt(r)}</div>
  );

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      {Toggle}
      <div style={{ display: "flex", gap: isMobile ? 24 : 56, justifyContent: "center", marginBottom: 18, flexWrap: "wrap" }}>
        <Readout label={isBtc ? "MONTHS BEAT BTC" : "GREEN MONTHS"} value={stats.greenPct + "%"} color="#4ade80" isMobile={isMobile} />
        <Readout label={isBtc ? "BEST VS BTC" : "BEST MONTH"} value={fmt(stats.best)} color="#22c55e" isMobile={isMobile} />
        <Readout label={isBtc ? "WORST VS BTC" : "WORST MONTH"} value={fmt(stats.worst)} color="#f87171" isMobile={isMobile} />
      </div>

      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: isMobile ? 620 : 760 }}>
          {/* header */}
          <div style={{ display: "grid", gridTemplateColumns: cols, gap: 4 }}>
            {hdr("", "h-")}
            {MONTHS.map(m => hdr(m, "h" + m))}
            <div key="h-sp" />
            <div key="h-yr" style={{ fontFamily: MONO, fontSize: isMobile ? 10 : 12, color: "#e2e8f0", fontWeight: 700, textAlign: "center", padding: "4px 0" }}>Year</div>
          </div>
          {/* year rows */}
          {years.map(y => (
            <div key={y} style={{ display: "grid", gridTemplateColumns: cols, gap: 4, marginTop: 4 }}>
              <div style={{ fontFamily: MONO, fontSize: isMobile ? 11 : 13, color: "#cbd5e1", display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 6 }}>{y}</div>
              {MONTHS.map((_, m) => cell(retOf.get(y * 12 + m), y + "-" + m))}
              <div key={y + "-sp"} />
              {cell(yearTotal.get(y), y + "-yr", true, true)}
            </div>
          ))}
          {/* seasonality average — separated by a rule + brighter framed cells */}
          <div style={{ display: "grid", gridTemplateColumns: cols, gap: 4, marginTop: 12, borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 10 }}>
            <div style={{ fontFamily: MONO, fontSize: isMobile ? 10 : 12, color: "#cbd5e1", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 6 }}>Avg</div>
            {monthAvg.map((r, m) => cell(r, "avg-" + m, false, true))}
            <div key="avg-sp" />
            <div />
          </div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 14, flexWrap: "wrap", marginTop: 16, fontFamily: SANS, fontSize: 12.5, color: "#94a3b8" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 14, height: 14, borderRadius: 4, background: "rgba(239,68,68,0.6)" }} /> {isBtc ? "lost to BTC" : "down month"}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 14, height: 14, borderRadius: 4, background: "rgba(34,197,94,0.6)" }} /> {isBtc ? "beat BTC" : "up month"}</span>
        <span>· deeper color = bigger move</span>
      </div>

      <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.6 }}>
        {isBtc
          ? <>Each cell is that month&apos;s return with SPX6900 <strong style={{ color: "#cbd5e1" }}>priced in Bitcoin</strong> — green means SPX beat BTC that month, red means Bitcoin won. The <strong style={{ color: "#cbd5e1" }}>Year</strong> column compounds the months; <strong style={{ color: "#cbd5e1" }}>Avg</strong> is the typical month across years. Not financial advice.</>
          : <>Each cell is that month&apos;s return (last close vs. the prior month&apos;s). The <strong style={{ color: "#cbd5e1" }}>Year</strong> column compounds the months into an annual figure; <strong style={{ color: "#cbd5e1" }}>Avg</strong> is the typical return for that calendar month across all years — the seasonality. Tail months can run into the thousands of percent (shown compactly, e.g. +8.9k%). Not financial advice.</>}
      </div>
    </div>
  );
}
