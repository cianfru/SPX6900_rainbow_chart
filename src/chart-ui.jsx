// Shared UI vocabulary for the interactive chart pages. Every chart previously
// re-declared these fonts, the Metric readout, the tooltip container and the
// drag-to-zoom state machine, this is the single source. Add new charts on top
// of these pieces instead of copy-pasting a sibling.
// Fonts follow the landing north star + terminal shell: Geist (sans) / Geist Mono (data,
// labels, axes). Both are loaded in index.html; kept as literals (not CSS vars) so they
// also resolve inside recharts' SVG <text>. Changing these two propagates to every chart.
export const SANS = "'Geist', 'Space Grotesk', system-ui, sans-serif";
export const MONO = "'Geist Mono', ui-monospace, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";
export const MAX_W = 1400;

// Big-number readout shown in the metrics row above a chart.
export function Metric({ label, value, color = "#f8fafc", sub }) {
  return (
    <div style={{ textAlign: "center", minWidth: 96 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, color: "#aab4c4", letterSpacing: 1.1, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 700, color }}>{value}</div>
      {sub && <div style={{ fontFamily: SANS, fontSize: 11, color: "#8b96a8" }}>{sub}</div>}
    </div>
  );
}

// Tooltip container, charts supply their own rows (and an optional bold title
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
  // Just a clean explanation — no box, no bold callout heading. A green ">" prompt leads, then
  // the question and answer flow as one plain paragraph in the site's sans.
  return (
    <div className="chart-explain" style={{ maxWidth: MAX_W, margin: "0 auto 22px", fontFamily: SANS, fontSize: 15, color: "#b4bfd0", lineHeight: 1.7 }}>
      {q && <><span style={{ color: "#4ade80", fontFamily: MONO, marginRight: 10, fontWeight: 700 }}>&gt;</span>{q}{" "}</>}
      {children}
    </div>
  );
}

// Shared view-toggle row, styled like the site's terminal menu: mono font, squared cells, the
// active view highlighted, and a blinking lowered "_" that appears on hover (the menu's cursor).
// tabs = [[key, label], …]. Replaces every chart's bespoke rounded-pill toggle so they read as
// one system. The blink + hover live in .vtab CSS (terminal.css, scoped under .tzone).
export function ViewTabs({ tabs, value, onChange, style }) {
  return (
    <div className="viewtabs" style={style}>
      {tabs.map(([k, l]) => (
        <button key={k} type="button" className={"vtab" + (k === value ? " on" : "")} onClick={() => onChange(k)}>
          <span className="vtl">{l}</span><span className="vtc" aria-hidden="true">_</span>
        </button>
      ))}
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
    <div className="chart-zoombar" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 10 }}>
      <span style={{ fontFamily: SANS, fontSize: 12.5, color: "#8b96a8" }}>{zoomed ? viewing : "Drag across the chart to zoom into any period."}</span>
      {zoomed && <ZoomResetButton onReset={onReset} accent={accent} />}
    </div>
  );
}
