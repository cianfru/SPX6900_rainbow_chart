import { useState, useEffect, useRef, Suspense } from "react";
import { CHART_GROUPS } from "./charts-catalog.js";
import ErrorBoundary from "./ErrorBoundary.jsx";

// The browse-all "Charts" gallery — an ITC-style grid of preview tiles. Every
// tile opens a FULLY INTERACTIVE chart page (onOpen). The preview is a LIVE,
// scaled-down render of the real chart component (not the tweet card) — the
// actual look of the chart on the site — lazy-mounted as it scrolls into view.

const SANS = "'Space Grotesk', system-ui, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace";
const MAX_W = 1400;
const BASE_W = 1180;   // width the real chart renders at before being scaled to fit
const CONTENT_H = 700; // clip region (chart's header + body, caption cropped off)

// A live mini-preview: mounts the real chart at BASE_W, scales it to the tile
// width and clips it. Non-interactive (pointer-events off → the tile click wins).
function LivePreview({ render }) {
  const ref = useRef(null);
  const [scale, setScale] = useState(0.3);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { if (el.clientWidth) setScale(el.clientWidth / BASE_W); });
    ro.observe(el);
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { setShow(true); io.disconnect(); } }, { rootMargin: "500px" });
    io.observe(el);
    return () => { ro.disconnect(); io.disconnect(); };
  }, []);
  return (
    <div ref={ref} style={{ position: "relative", width: "100%", height: CONTENT_H * scale, overflow: "hidden", background: "#05050e", pointerEvents: "none" }}>
      {!show && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontSize: 12, color: "#475569" }}>loading…</div>}
      {show && (
        <div style={{ position: "absolute", top: 0, left: 0, width: BASE_W, transformOrigin: "top left", transform: `scale(${scale})` }}>
          <ErrorBoundary>
            <Suspense fallback={<div style={{ height: CONTENT_H, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontSize: 26, color: "#475569" }}>loading…</div>}>
              {render()}
            </Suspense>
          </ErrorBoundary>
        </div>
      )}
    </div>
  );
}

function Tile({ item, color, onOpen, renderPreview }) {
  return (
    <button
      className="pill" onClick={() => onOpen(item.id)} title={`Open the interactive ${item.title} chart`}
      style={{
        display: "flex", flexDirection: "column", textAlign: "left", padding: 0, cursor: "pointer",
        borderRadius: 14, overflow: "hidden", background: "rgba(13,15,28,0.55)",
        border: "1px solid rgba(255,255,255,0.10)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 8px 30px rgba(0,0,0,0.35)",
        "--glow": color,
      }}
    >
      <LivePreview render={() => renderPreview(item.id)} />
      <div style={{ padding: "13px 15px 15px", borderTop: `1px solid ${color}26` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0, boxShadow: `0 0 8px ${color}` }} />
          <span style={{ fontFamily: SANS, fontSize: 16, fontWeight: 700, color: "#f1f5f9", lineHeight: 1.15 }}>{item.title}</span>
          <span style={{ marginLeft: "auto", fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color, border: `1px solid ${color}66`, borderRadius: 5, padding: "2px 6px", whiteSpace: "nowrap" }}>Interactive</span>
        </div>
        <div style={{ fontFamily: SANS, fontSize: 13, color: "#94a3b8", lineHeight: 1.45 }}>{item.desc}</div>
      </div>
    </button>
  );
}

export default function ChartsGallery({ isMobile, onOpen, onHome, renderPreview }) {
  const total = CHART_GROUPS.reduce((n, g) => n + g.charts.length, 0) + 1; // +1 = Rainbow hero

  return (
    <div style={{ padding: isMobile ? "8px 4px 48px" : "16px 8px 60px" }}>
      <div style={{ maxWidth: MAX_W, margin: "0 auto 26px", textAlign: "center" }}>
        <h2 style={{
          fontFamily: SANS, fontSize: isMobile ? 26 : 36, fontWeight: 800, margin: "0 0 8px", letterSpacing: "-0.02em",
          background: "linear-gradient(90deg,#a78bfa,#22d3ee,#4ade80,#fbbf24,#f7931a)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>Charts</h2>
        <div style={{ fontFamily: SANS, fontSize: isMobile ? 14 : 16, color: "#94a3b8" }}>
          {total} interactive ways to look at SPX6900 — tap any chart to open it.
        </div>
      </div>

      {/* Featured: the Rainbow hero (lives on the home page) */}
      <div style={{ maxWidth: MAX_W, margin: "0 auto 38px" }}>
        <button
          className="pill" onClick={onHome} title="Open the Rainbow chart"
          style={{
            display: "flex", width: "100%", textAlign: "left", cursor: "pointer", borderRadius: 16, overflow: "hidden",
            padding: isMobile ? "20px 22px" : "30px 36px", gap: 18, alignItems: "center", justifyContent: "space-between",
            background: "linear-gradient(110deg, rgba(167,139,250,0.16), rgba(34,211,238,0.10) 45%, rgba(34,197,94,0.10) 75%, rgba(247,147,26,0.12))",
            border: "1px solid rgba(167,139,250,0.45)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 10px 40px rgba(0,0,0,0.4)", "--glow": "#a78bfa",
          }}
        >
          <div>
            <span style={{ fontFamily: SANS, fontSize: 11, fontWeight: 800, letterSpacing: 1.4, textTransform: "uppercase", color: "#c4b5fd" }}>Featured · Home</span>
            <div style={{ fontFamily: SANS, fontSize: isMobile ? 24 : 32, fontWeight: 800, color: "#f8fafc", lineHeight: 1.1, margin: "6px 0" }}>Rainbow Chart</div>
            <div style={{ fontFamily: SANS, fontSize: isMobile ? 14 : 15.5, color: "#cbd5e1", lineHeight: 1.5, maxWidth: 640 }}>
              The flagship: SPX6900's price across nine power-law valuation bands, from Fire Sale to Sell.
            </div>
          </div>
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M3 16a9 9 0 0 1 18 0" /><path d="M6 16a6 6 0 0 1 12 0" /><path d="M9 16a3 3 0 0 1 6 0" />
          </svg>
        </button>
      </div>

      {CHART_GROUPS.map(group => (
        <div key={group.title} style={{ maxWidth: MAX_W, margin: "0 auto 38px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: group.color, boxShadow: `0 0 10px ${group.color}` }} />
            <h3 style={{ fontFamily: SANS, fontSize: isMobile ? 18 : 22, fontWeight: 800, color: "#f1f5f9", margin: 0, letterSpacing: "-0.01em" }}>{group.title}</h3>
            <span style={{ fontFamily: SANS, fontSize: isMobile ? 12.5 : 14, color: "#7c8a9e" }}>{group.desc}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${isMobile ? 300 : 380}px), 1fr))`, gap: isMobile ? 12 : 16 }}>
            {group.charts.map(item => (
              <Tile key={item.id} item={item} color={group.color} onOpen={onOpen} renderPreview={renderPreview} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
