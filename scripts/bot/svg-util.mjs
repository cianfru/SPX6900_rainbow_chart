// Shared SVG/rendering helpers for the card renderers. Dependency-free on
// purpose (no resvg/fonts) so any card module can import it without cycles —
// charts.mjs imports every card module, so card modules must never import
// charts.mjs back.

export const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Locale pinned: CI/serverless default locales vary, and an unpinned
// toLocaleString() can silently swap thousands separators between runs.
export const fNum = n => Math.round(n).toLocaleString("en-US");

// Monotone-cubic Hermite spline → SVG path `d` over SCREEN points (Fritsch-
// Carlson). Rounds corners just enough to read smooth, but NEVER overshoots a
// data point, so the line stays canonically correct (same as Recharts monotone).
export function monotonePath(P) {
  const n = P.length;
  if (n < 2) return n ? `M ${P[0][0].toFixed(1)},${P[0][1].toFixed(1)}` : "";
  if (n === 2) return `M ${P[0][0].toFixed(1)},${P[0][1].toFixed(1)} L ${P[1][0].toFixed(1)},${P[1][1].toFixed(1)}`;
  const dx = [], delta = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = P[i + 1][0] - P[i][0]; delta[i] = dx[i] !== 0 ? (P[i + 1][1] - P[i][1]) / dx[i] : 0; }
  const m = new Array(n);
  m[0] = delta[0]; m[n - 1] = delta[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = delta[i - 1] * delta[i] <= 0 ? 0 : (delta[i - 1] + delta[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (delta[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / delta[i], b = m[i + 1] / delta[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * delta[i]; m[i + 1] = t * b * delta[i]; }
  }
  let d = `M ${P[0][0].toFixed(1)},${P[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i];
    d += ` C ${(P[i][0] + h / 3).toFixed(1)},${(P[i][1] + m[i] * h / 3).toFixed(1)} ${(P[i + 1][0] - h / 3).toFixed(1)},${(P[i + 1][1] - m[i + 1] * h / 3).toFixed(1)} ${P[i + 1][0].toFixed(1)},${P[i + 1][1].toFixed(1)}`;
  }
  return d;
}
