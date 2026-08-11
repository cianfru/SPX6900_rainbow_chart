import { useState, useEffect } from "react";
import { SANS } from "./chart-ui.jsx";


// A one-time animated demo that sits in front of a zoomable chart, looping a
// drag-to-select gesture so users learn the chart is interactive. It's
// pointer-transparent (never blocks the real chart) and vanishes the moment the
// user clicks/taps anywhere, then stays gone (localStorage). Auto-dismisses too.
export default function ChartZoomHint({ storageKey = "spx-zoom-hint-v2" }) {
  // Read "already seen" once at mount (client-only SPA, no SSR) so we never
  // setState synchronously inside an effect.
  const [show, setShow] = useState(() => {
    try { return !localStorage.getItem(storageKey); } catch { return true; }
  });

  useEffect(() => {
    if (!show) return;
    const dismiss = () => { setShow(false); try { localStorage.setItem(storageKey, "1"); } catch { /* ignore */ } };
    window.addEventListener("pointerdown", dismiss, { once: true });
    const t = setTimeout(dismiss, 9000);
    return () => { window.removeEventListener("pointerdown", dismiss); clearTimeout(t); };
  }, [show, storageKey]);

  if (!show) return null;
  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 6, pointerEvents: "none", borderRadius: 12,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      background: "rgba(3,5,14,0.5)", backdropFilter: "blur(1px)", WebkitBackdropFilter: "blur(1px)",
    }}>
      <div style={{ position: "relative", width: "55%", maxWidth: 520, height: 96, marginBottom: 16 }}>
        <div className="zoomhint-box" />
        <div className="zoomhint-cursor">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="#f8fafc" stroke="#0b1020" strokeWidth="1.2" strokeLinejoin="round">
            <path d="M5 3l14.5 8.7-6.1 1.4L10.9 20.8 5 3z" />
          </svg>
        </div>
      </div>
      <div style={{ fontFamily: SANS, fontSize: 17, fontWeight: 700, color: "#f8fafc", textShadow: "0 2px 10px rgba(0,0,0,0.6)" }}>
        Drag across the chart to zoom into a period
      </div>
      <div style={{ fontFamily: SANS, fontSize: 13, color: "#9fb0c3", marginTop: 5 }}>tap anywhere to dismiss</div>
    </div>
  );
}
