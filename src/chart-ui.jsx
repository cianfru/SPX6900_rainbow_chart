// Shared UI vocabulary for the interactive chart pages. Every chart previously
// re-declared these fonts, the Metric readout, the tooltip container and the
// drag-to-zoom state machine — this is the single source. Add new charts on top
// of these pieces instead of copy-pasting a sibling.
export const SANS = "'Space Grotesk', system-ui, sans-serif";
export const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";
export const MAX_W = 1400;

// Big-number readout shown in the metrics row above a chart.
export function Metric({ label, value, color = "#f8fafc", sub }) {
  return (
    <div style={{ textAlign: "center", minWidth: 96 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, color: "#94a3b8", letterSpacing: 1.1, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 700, color }}>{value}</div>
      {sub && <div style={{ fontFamily: SANS, fontSize: 11, color: "#64748b" }}>{sub}</div>}
    </div>
  );
}

// Tooltip container — charts supply their own rows (and an optional bold title
// line). `style` merges over the defaults for per-chart accents (border, padding).
export function TipBox({ title, style, children }) {
  return (
    <div style={{ background: "rgba(4,4,12,0.97)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 10, padding: "12px 16px", fontFamily: SANS, fontSize: 13, color: "#cbd5e1", ...style }}>
      {title != null && <div style={{ fontWeight: 700, color: "#f8fafc", marginBottom: 4 }}>{title}</div>}
      {children}
    </div>
  );
}

const LIGHT = { "#38bdf8": "#7dd3fc", "#a78bfa": "#c4b5fd" };

// Plain-language explainer box for the more technical charts (NUPL, MVRV, SOPR…). Leads
// with the question the metric answers in human terms, so a general user gets it before
// reading an axis. `q` = the plain question; children = the plain answer.
export function Explain({ q, accent = "#38bdf8", children }) {
  return (
    <div style={{ maxWidth: 820, margin: "0 auto 18px", background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderLeft: `3px solid ${accent}`, borderRadius: 10, padding: "13px 18px", fontFamily: SANS, fontSize: 14, color: "#cbd5e1", lineHeight: 1.6 }}>
      {q && <div style={{ fontWeight: 700, color: "#f8fafc", marginBottom: 3 }}>{q}</div>}
      {children}
    </div>
  );
}

export function ZoomResetButton({ onReset, accent = "#38bdf8", fontSize = 12, padding = "5px 12px" }) {
  return (
    <button onClick={onReset} className="pill" style={{ fontFamily: SANS, fontSize, fontWeight: 600, padding, borderRadius: 7, cursor: "pointer", background: "transparent", border: `1px solid ${accent}66`, color: LIGHT[accent] || accent, "--glow": accent }}>
      ⤢ Reset zoom
    </button>
  );
}

// The status row above a zoomable chart: hint text + reset button when zoomed.
export function ZoomBar({ zoomed, onReset, accent = "#38bdf8", viewing = "Viewing a selected window." }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 10 }}>
      <span style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b" }}>{zoomed ? viewing : "Drag across the chart to zoom into any period."}</span>
      {zoomed && <ZoomResetButton onReset={onReset} accent={accent} />}
    </div>
  );
}
