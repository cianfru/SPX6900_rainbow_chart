import { useRef, useEffect, useState } from "react";

// A fullscreen / landscape viewer for a chart or the city. Works everywhere:
//  • Android / desktop: requests the real Fullscreen API + locks orientation to landscape.
//  • iOS (no element fullscreen, no orientation lock): a full-viewport CSS overlay (100dvw × 100dvh)
//    that already fills the screen — plus a "rotate your phone" hint while it's held portrait.
// An ✕ top-right always exits; leaving native fullscreen via the OS also closes it.
export default function FullscreenView({ open, onClose, children }) {
  const ref = useRef(null);
  const [portrait, setPortrait] = useState(false);

  useEffect(() => {
    if (!open) return;
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

  if (!open) return null;
  return (
    <div ref={ref} className="fsview">
      <button className="fsclose" onClick={onClose} aria-label="Exit fullscreen" title="Exit fullscreen">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
      {portrait && (
        <div className="fsrotate">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="7" y="2.5" width="10" height="19" rx="2.2" /><path d="M9.5 19h5" />
            <path d="M20 8a8 8 0 0 0-6-3.5" /><path d="M20 4.5V8h-3.5" />
          </svg>
          <span>Rotate your phone for the full view</span>
        </div>
      )}
      <div className="fsbody">{children}</div>
    </div>
  );
}
