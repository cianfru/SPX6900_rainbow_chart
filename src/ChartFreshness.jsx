import { useState, useEffect } from "react";
import { CHART_SOURCE, loadSourceDate, freshnessOf } from "./freshness.js";
import { SANS } from "./chart-ui.jsx";

const fMon = d => { try { return new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }); } catch { return d; } };

// Small "data as of <date>" tag shown on chart pages whose data comes from a runtime
// JSON file (so a stale manual on-chain refresh, or a missed daily cron, is visible at a
// glance). Green = current, amber = a manual source getting old, red = a daily source
// that missed. Charts driven by the live price feed aren't tracked → renders nothing.
export default function ChartFreshness({ chartId }) {
  const key = CHART_SOURCE[chartId];
  const [date, setDate] = useState(undefined);
  useEffect(() => {
    if (!key) { setDate(undefined); return; }
    let off = false;
    setDate(undefined);
    loadSourceDate(key).then(d => { if (!off) setDate(d ?? null); });
    return () => { off = true; };
  }, [key]);

  if (!key || date === undefined) return null; // untracked chart / still loading
  const f = freshnessOf(date, key);
  const color = date == null ? "#64748b" : f.stale ? (f.manual ? "#f59e0b" : "#f87171") : "#4ade80";
  const ago = date == null ? "" : f.days === 0 ? " · today" : f.days === 1 ? " · 1 day ago" : ` · ${f.days} days ago`;
  const txt = date == null ? "data unavailable" : `data as of ${fMon(date)}${ago}`;
  return (
    <span title={`updates ${f.cad}${f.stale ? " · looks stale — may need a refresh" : ""}`}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: SANS, fontSize: 12,
        color: f.stale ? "#fca5a5" : "#94a3b8", background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)", borderRadius: 999, padding: "3px 10px", marginBottom: 14 }}>
      <span style={{ width: 7, height: 7, borderRadius: 999, background: color, flex: "none" }} />
      {txt}{f.manual ? " · manual" : ""}
    </span>
  );
}
