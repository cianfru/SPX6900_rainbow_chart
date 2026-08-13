import { useRef, useEffect, useState } from "react";

// A fullscreen / landscape viewer for a chart or the city. Works everywhere:
//  • Android / desktop: requests the real Fullscreen API + locks orientation to landscape.
//  • iOS (no element fullscreen, no orientation lock): a full-viewport overlay that fills
//    every available pixel (100dvh × 100dvw, into the safe-area) — plus a "rotate your phone"
//    hint while it's held portrait. (iOS browsers do not let a web page hide the tab/URL bar;
//    the only truly chromeless path is Add-to-Home-Screen, enabled via the app-mode meta tags.)
//
// Touch gestures (the chart is SVG, so magnifying stays crisp — vector, no blur):
//  • two fingers  → pinch to zoom in/out, and drag to pan, centred on your fingers.
//  • one finger   → passes straight through to the chart, so you can point at any spot
//                   and read its value (the tooltip / crosshair follows your finger).
//  • double-tap   → reset the zoom. A ⤢ reset button also appears once zoomed.
export default function FullscreenView({ open, onClose, children }) {
  const ref = useRef(null);
  const bodyRef = useRef(null);
  const [portrait, setPortrait] = useState(false);
  const [t, setT] = useState({ s: 1, x: 0, y: 0 }); // pinch transform: scale + translate
  const tRef = useRef({ s: 1, x: 0, y: 0 });
  const gest = useRef(null); // active two-finger gesture snapshot
  const lastTap = useRef(0);

  const apply = nt => { tRef.current = nt; setT(nt); };

  // native Fullscreen API + orientation lock where available
  useEffect(() => {
    if (!open) return;
    apply({ s: 1, x: 0, y: 0 });
    const el = ref.current;
    (async () => {
      try { if (el?.requestFullscreen) await el.requestFullscreen(); } catch { /* iOS / denied */ }
      try { await window.screen?.orientation?.lock?.("landscape"); } catch { /* unsupported */ }
    })();
    const checkOrient = () => setPortrait(window.matchMedia("(orientation: portrait)").matches);
    checkOrient();
    const onFsChange = () => { if (!document.fullscreenElement) onClose(); };
    window.addEventListener("resize", checkOrient);
    window.addEventListener("orientationchange", checkOrient);
    document.addEventListener("fullscreenchange", onFsChange);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("resize", checkOrient);
      window.removeEventListener("orientationchange", checkOrient);
      document.removeEventListener("fullscreenchange", onFsChange);
      document.body.style.overflow = "";
      try { window.screen?.orientation?.unlock?.(); } catch { /* */ }
      try { if (document.fullscreenElement) document.exitFullscreen(); } catch { /* */ }
    };
  }, [open, onClose]);

  // pinch-zoom / pan on two fingers; one finger falls through to the chart (tooltip)
  useEffect(() => {
    if (!open) return;
    const el = bodyRef.current;
    if (!el) return;
    const rect = () => el.getBoundingClientRect();
    const dist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const mid = (a, b) => ({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 });

    const onStart = e => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const r = rect(), m = mid(e.touches[0], e.touches[1]), c = tRef.current;
        gest.current = { d0: dist(e.touches[0], e.touches[1]), cx0: m.x - r.left, cy0: m.y - r.top, s0: c.s, x0: c.x, y0: c.y };
      } else if (e.touches.length === 1) {
        const now = e.timeStamp || Date.now();
        if (now - lastTap.current < 300 && tRef.current.s > 1.02) apply({ s: 1, x: 0, y: 0 }); // double-tap resets
        lastTap.current = now;
        // single finger: do NOT preventDefault — let the chart show its tooltip at that point
      }
    };
    const onMove = e => {
      if (e.touches.length === 2 && gest.current) {
        e.preventDefault();
        const r = rect(), m = mid(e.touches[0], e.touches[1]), g = gest.current;
        const s = Math.min(6, Math.max(1, g.s0 * dist(e.touches[0], e.touches[1]) / g.d0));
        // keep the world point that was under the initial centroid under the moving centroid
        const wx = (g.cx0 - g.x0) / g.s0, wy = (g.cy0 - g.y0) / g.s0;
        apply({ s, x: (m.x - r.left) - wx * s, y: (m.y - r.top) - wy * s });
      }
    };
    const onEnd = e => {
      if (e.touches.length < 2) gest.current = null;
      if (tRef.current.s <= 1.02) apply({ s: 1, x: 0, y: 0 });
    };
    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [open]);

  if (!open) return null;
  const zoomed = t.s > 1.02;
  return (
    <div ref={ref} className={"fsview" + (portrait ? " fsportrait" : "")}>
      <button className="fsclose" onClick={onClose} aria-label="Exit fullscreen" title="Exit fullscreen">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
      {zoomed && (
        <button className="fsreset" onClick={() => apply({ s: 1, x: 0, y: 0 })} title="Reset zoom">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9V4h5M21 15v5h-5M4 4l7 7M20 20l-7-7" /></svg>
          <span>reset</span>
        </button>
      )}
      {portrait ? (
        <div className="fsrotate">
          <svg className="fsrotate-ph" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="7" y="2.5" width="10" height="19" rx="2.4" /><line x1="10" y1="19" x2="14" y2="19" />
          </svg>
          <span>Rotate your device</span>
          <small>for the wide, interactive chart</small>
        </div>
      ) : (
        <div ref={bodyRef} className="fsbody">
          <div className="fsscale" style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})` }}>{children}</div>
          {!zoomed && <div className="fshint">Pinch to zoom · one finger to read a point</div>}
        </div>
      )}
    </div>
  );
}
