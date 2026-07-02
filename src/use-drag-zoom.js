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
