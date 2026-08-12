import { useState, useRef, useEffect } from "react";
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
      <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--ch-mut,#aab4c4)", letterSpacing: 1.1, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 700, color }}>{value}</div>
      {sub && <div style={{ fontFamily: SANS, fontSize: 11, color: "var(--ch-dim,#8b96a8)" }}>{sub}</div>}
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
    <div className="chart-explain" style={{ maxWidth: MAX_W, margin: "0 auto 22px", fontFamily: SANS, fontSize: 15, color: "var(--ch-body,#b4bfd0)", lineHeight: 1.7 }}>
      {q && <><span style={{ color: "#4ade80", fontFamily: MONO, marginRight: 10, fontWeight: 700 }}>&gt;</span>{q}{" "}</>}
      {children}
    </div>
  );
}

// Hover typewriter, identical to the top nav menu: the label types itself out on hover while the
// control reserves its FULL width with an invisible ghost, so nothing reflows as characters stream.
export function useHoverType(text) {
  const [shown, setShown] = useState(text);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => { setShown(text); }, [text]);
  const type = () => {
    clearTimeout(timer.current);
    let j = 0;
    const step = () => { setShown(text.slice(0, j)); if (j < text.length) { j++; timer.current = setTimeout(step, 42); } };
    setShown(""); step();
  };
  const reset = () => { clearTimeout(timer.current); setShown(text); };
  return { shown, type, reset };
}

// THE app's single button vocabulary — squared (90° corners), mono, uppercase, and it inverts +
// types its label out on hover, exactly like the top menu. Used for every chart-page control
// (share / fullscreen / chart pager / back). icon optional; iconRight puts the icon after the label;
// an empty label makes an icon-only square button. Styling lives in .menubtn (terminal.css, .tzone).
export function MenuBtn({ label = "", icon, iconRight = false, onClick, title, className = "", active = false, style }) {
  const { shown, type, reset } = useHoverType(label || "");
  return (
    <button type="button"
      className={"menubtn" + (active ? " on" : "") + (label ? "" : " ic") + (className ? " " + className : "")}
      onMouseEnter={type} onMouseLeave={reset} onClick={onClick} title={title || label} aria-label={title || label}
      style={style}>
      {icon && !iconRight && <span className="menubtn-ic">{icon}</span>}
      {label !== "" && (
        <span className="menubtn-t"><span className="menubtn-g" aria-hidden="true">{label}</span><span className="menubtn-y">{shown}</span></span>
      )}
      {icon && iconRight && <span className="menubtn-ic">{icon}</span>}
    </button>
  );
}

// Shared view-toggle row, styled like the site's terminal menu: mono font, squared cells, the
// active view highlighted, and the label types itself out on hover (the menu's typewriter).
// tabs = [[key, label], …]. Replaces every chart's bespoke rounded-pill toggle so they read as
// one system. Styling lives in .vtab CSS (terminal.css, scoped under .tzone).
export function ViewTabs({ tabs, value, onChange, style }) {
  return (
    <div className="viewtabs" style={style}>
      {tabs.map(([k, l]) => <ViewTab key={k} label={l} on={k === value} onClick={() => onChange(k)} />)}
    </div>
  );
}
function ViewTab({ label, on, onClick }) {
  const { shown, type, reset } = useHoverType(label);
  return (
    <button type="button" className={"vtab" + (on ? " on" : "")} onMouseEnter={type} onMouseLeave={reset} onClick={onClick}>
      <span className="menubtn-t"><span className="menubtn-g" aria-hidden="true">{label}</span><span className="menubtn-y">{shown}</span></span>
    </button>
  );
}

export function ZoomResetButton({ onReset, accent = "#38bdf8", fontSize = 12, padding = "5px 12px" }) {
  return (
    <button onClick={onReset} className="pill" style={{ fontFamily: MONO, fontSize, fontWeight: 600, padding, borderRadius: 0, textTransform: "uppercase", letterSpacing: ".06em", cursor: "pointer", background: "transparent", border: `1px solid ${accent}66`, color: LIGHT[accent] || accent, "--glow": accent }}>
      ⤢ Reset zoom
    </button>
  );
}

// The status row above a zoomable chart: hint text + reset button when zoomed.
export function ZoomBar({ zoomed, onReset, accent = "#38bdf8", viewing = "Viewing a selected window." }) {
  return (
    <div className="chart-zoombar" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 10 }}>
      <span style={{ fontFamily: SANS, fontSize: 12.5, color: "var(--ch-dim,#8b96a8)" }}>{zoomed ? viewing : "Drag across the chart to zoom into any period."}</span>
      {zoomed && <ZoomResetButton onReset={onReset} accent={accent} />}
    </div>
  );
}
