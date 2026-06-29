import { useState } from "react";
import { CHART_GROUPS } from "./charts-catalog.js";

// The browse-all "Charts" gallery — an ITC-style grid of preview tiles. Every
// tile opens a FULLY INTERACTIVE chart page (onOpen) — the gallery is a launcher,
// not a wall of static images. Preview thumbnails are an at-a-glance render of the
// chart (the OG card image, hard-cached via ?thumb=1), lazy-loaded.

const SANS = "'Space Grotesk', system-ui, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace";
const MAX_W = 1400;

const thumbUrl = post => `/api/og?post=${post}&thumb=1`;

function Thumb({ post }) {
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState(false);
  return (
    <div style={{ position: "relative", width: "100%", aspectRatio: "1200 / 630", background: "rgba(255,255,255,0.03)", overflow: "hidden" }}>
      {!loaded && !err && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontSize: 12, color: "#475569" }}>loading…</div>
      )}
      {err ? (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontSize: 12, color: "#475569" }}>preview unavailable</div>
      ) : (
        <img
          src={thumbUrl(post)} alt="" loading="lazy" decoding="async"
          onLoad={() => setLoaded(true)} onError={() => setErr(true)}
          style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", opacity: loaded ? 1 : 0, transition: "opacity .35s ease" }}
        />
      )}
    </div>
  );
}

function Tile({ item, color, onOpen }) {
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
      <Thumb post={item.post} />
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

export default function ChartsGallery({ isMobile, onOpen, onHome }) {
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

      {/* Featured: the Rainbow hero */}
      <div style={{ maxWidth: MAX_W, margin: "0 auto 38px" }}>
        <button
          className="pill" onClick={onHome} title="Open the Rainbow chart"
          style={{
            display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1.4fr) minmax(0,1fr)", gap: 0,
            width: "100%", textAlign: "left", padding: 0, cursor: "pointer", borderRadius: 16, overflow: "hidden",
            background: "rgba(13,15,28,0.6)", border: "1px solid rgba(167,139,250,0.45)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 10px 40px rgba(0,0,0,0.4)", "--glow": "#a78bfa",
          }}
        >
          <Thumb post="valuation" />
          <div style={{ padding: isMobile ? "16px 18px" : "26px 30px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <span style={{ fontFamily: SANS, fontSize: 11, fontWeight: 800, letterSpacing: 1.4, textTransform: "uppercase", color: "#c4b5fd", marginBottom: 8 }}>Featured</span>
            <span style={{ fontFamily: SANS, fontSize: isMobile ? 24 : 30, fontWeight: 800, color: "#f8fafc", lineHeight: 1.1, marginBottom: 8 }}>Rainbow Chart</span>
            <span style={{ fontFamily: SANS, fontSize: isMobile ? 14 : 15.5, color: "#94a3b8", lineHeight: 1.5 }}>
              The flagship: SPX6900's price across nine power-law valuation bands, from Fire Sale to Sell. The home page.
            </span>
          </div>
        </button>
      </div>

      {CHART_GROUPS.map(group => (
        <div key={group.title} style={{ maxWidth: MAX_W, margin: "0 auto 38px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: group.color, boxShadow: `0 0 10px ${group.color}` }} />
            <h3 style={{ fontFamily: SANS, fontSize: isMobile ? 18 : 22, fontWeight: 800, color: "#f1f5f9", margin: 0, letterSpacing: "-0.01em" }}>{group.title}</h3>
            <span style={{ fontFamily: SANS, fontSize: isMobile ? 12.5 : 14, color: "#7c8a9e" }}>{group.desc}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${isMobile ? 260 : 320}px), 1fr))`, gap: isMobile ? 12 : 16 }}>
            {group.charts.map(item => (
              <Tile key={item.id} item={item} color={group.color} onOpen={onOpen} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
