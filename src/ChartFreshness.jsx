import { useState, useEffect } from "react";
import { CHART_SOURCE, loadSourceDate, freshnessOf } from "./freshness.js";
import { MONO } from "./chart-ui.jsx";

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
  // Freshness is signalled by the text colour alone (no dot, no pill) so the tag reads as a
  // quiet terminal-style line in keeping with the rest of the site. Stale → amber/red; fresh → muted.
  const color = date == null ? "#8b98ad" : f.stale ? (f.manual ? "#f0a915" : "#f87171") : "#8b98ad";
  const ago = date == null ? "" : f.days === 0 ? " · today" : f.days === 1 ? " · 1 day ago" : ` · ${f.days} days ago`;
  const txt = date == null ? "data unavailable" : `data as of ${fMon(date)}${ago}`;
  return (
    <span title={`updates ${f.cad}${f.stale ? " · looks stale, may need a refresh" : ""}`}
      style={{ display: "inline-block", fontFamily: MONO, fontSize: 12, letterSpacing: "0.04em",
        color, marginBottom: 14 }}>
      {txt}{f.manual ? " · manual" : ""}
    </span>
  );
}
