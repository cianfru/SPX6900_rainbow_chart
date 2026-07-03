import { useState } from "react";

// Drag-to-zoom state machine for Recharts: press-drag-release selects an x-window.
// `canZoom(a, b)` is the chart-specific guard (typically "≥2 data points inside")
// so a too-narrow selection can't produce an empty view. Spread the handlers onto
// the chart (`onMouseDown={onDown}` etc.) and render the selection rectangle
// inline — ReferenceArea must stay a direct Recharts child:
//   {selL != null && selR != null && selL !== selR &&
//     <ReferenceArea x1={selL} x2={selR} ... />}
export function useDragZoom(canZoom) {
  const [zoom, setZoom] = useState(null);
  const [selL, setSelL] = useState(null);
  const [selR, setSelR] = useState(null);
  const onDown = e => { if (e && e.activeLabel != null) { setSelL(e.activeLabel); setSelR(e.activeLabel); } };
  const onMove = e => { if (selL != null && e && e.activeLabel != null) setSelR(e.activeLabel); };
  const onUp = () => {
    if (selL != null && selR != null && selL !== selR) {
      const [a, b] = selL < selR ? [selL, selR] : [selR, selL];
      if (!canZoom || canZoom(a, b)) setZoom([a, b]);
    }
    setSelL(null); setSelR(null);
  };
  return { zoom, setZoom, selL, selR, onDown, onMove, onUp, zoomed: !!zoom };
}

// Slice time-series `rows` to the current zoom window (or full range if none) and
// build the x-axis domain, ticks and label formatter. Ticks are adaptive: year
// marks when the window is wide (>~2.5yr), else month marks. `tsOf` reads the
// timestamp from a row (default r.ts). Full data is always the default (zoom=null).
export function timeWindow(rows, zoom, tsOf = r => r.ts) {
  const full = [tsOf(rows[0]), tsOf(rows[rows.length - 1])];
  const [x0, x1] = zoom ?? full;
  const vis = rows.filter(r => { const t = tsOf(r); return t >= x0 && t <= x1; });
  const spanDays = (x1 - x0) / 86400000;
  const ticks = [];
  let fmtX;
  if (spanDays > 900) {
    for (let yr = new Date(x0).getUTCFullYear(); yr <= new Date(x1).getUTCFullYear(); yr++) { const t = Date.UTC(yr, 0, 1); if (t >= x0 && t <= x1) ticks.push(t); }
    fmtX = t => String(new Date(t).getUTCFullYear());
  } else {
    const step = spanDays > 400 ? 3 : spanDays > 150 ? 2 : 1;
    const d0 = new Date(x0);
    for (let m = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + 1, 1)); m.getTime() <= x1; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + step, 1))) ticks.push(m.getTime());
    fmtX = t => new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  }
  return { vis, xDomain: [x0, x1], xTicks: ticks, fmtX };
}
