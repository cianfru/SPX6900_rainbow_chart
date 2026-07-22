import { useMemo, useState, useEffect } from "react";
import { SPX_URPD } from "./spx-urpd.js";
import { loadUrpd, loadHistory } from "./history-data.js";
import { SANS, MONO, MAX_W, Explain } from "./chart-ui.jsx";

const AGE_L = ["1y+", "6–12m", "3–6m", "1–3m", "0–1m"]; // top → bottom (old on top)
const AGE_C = ["#22d3ee", "#a78bfa", "#fbbf24", "#fb923c", "#fb7185"];
const fp = p => p >= 1 ? "$" + p.toFixed(2) : p >= 0.01 ? "$" + p.toFixed(3) : "$" + p.toFixed(4);

// magma-ish sequential ramp for supply intensity
const STOPS = [[0, [8, 8, 28]], [0.2, [59, 15, 111]], [0.45, [140, 41, 129]], [0.7, [222, 73, 104]], [0.88, [254, 159, 109]], [1, [252, 253, 191]]];
function ramp(t) {
  t = Math.sqrt(Math.max(0, Math.min(1, t)));
  for (let i = 1; i < STOPS.length; i++) if (t <= STOPS[i][0]) {
    const [t0, a] = STOPS[i - 1], [t1, b] = STOPS[i], f = (t - t0) / (t1 - t0 || 1);
    return `rgb(${a.map((c, k) => Math.round(c + (b[k] - c) * f)).join(",")})`;
  }
  return "rgb(252,253,191)";
}

// Cost basis × holding age — the joint distribution of held supply. Reads the per-lot age split
// the FIFO engine emits per cost-basis bucket (bucket.age). Brighter = more supply at that price
// and that age. Fills in once the age split is present (next extract).
export default function UrpdAgeChart({ isMobile, preview = false, price = null }) {
  const [live, setLive] = useState(null);
  const [px, setPx] = useState(null);
  useEffect(() => {
    let c = false;
    loadUrpd().then(d => { if (!c && d) setLive(d); });
    loadHistory().then(h => { if (!c && h?.length) { const last = [...h].reverse().find(r => r.p > 0); if (last) setPx(last.p); } });
    return () => { c = true; };
  }, []);

  const u = live || SPX_URPD;
  const buckets = useMemo(() => (u?.buckets || []).filter(b => b && b.pct > 0 && Array.isArray(b.age) && b.age.length === 5), [u]);
  const spot = price ?? px ?? u?.spot ?? 0;

  if (buckets.length < 6) return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60, lineHeight: 1.6 }}>
        The cost-basis × age map fills in with the next on-chain refresh — the FIFO engine now records every coin&apos;s acquisition age alongside its cost basis.
      </div>
    </div>
  );

  const W = 1200, H = isMobile ? 460 : 540, mL = 92, mR = 40, pT = 40, pB = H - 74, pW = W - mL - mR, rows = 5;
  const pmin = buckets[0].lo, pmax = buckets.at(-1).hi;
  const lmin = Math.log(pmin), lspan = Math.log(pmax) - lmin || 1;
  const X = p => mL + ((Math.log(p) - lmin) / lspan) * pW;
  const bw = pW / buckets.length, rh = (pB - pT) / rows;
  const maxCell = Math.max(...buckets.flatMap(b => b.age), 1e-9);

  const cells = [];
  buckets.forEach((b, i) => {
    const x = mL + i * bw;
    for (let a = 0; a < rows; a++) {
      const val = b.age[4 - a]; // row 0 = oldest (1y+) at top
      cells.push(<rect key={`${i}-${a}`} x={x.toFixed(1)} y={(pT + a * rh).toFixed(1)} width={(bw + 0.5).toFixed(1)} height={(rh - 1).toFixed(1)}
        fill={ramp(val / maxCell)}><title>{`${fp(b.lo)}–${fp(b.hi)} · ${AGE_L[a]} · ${val.toFixed(2)}% of supply`}</title></rect>);
    }
  });

  const xticks = [0.003, 0.01, 0.03, 0.1, 0.3, 1, 2].filter(p => p >= pmin && p <= pmax);

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="Where were the bags bought — and how long have they been held?" accent="#a78bfa">
        Every held coin, placed by <strong style={{ color: "#e2e8f0" }}>what it cost</strong> (left→right) and <strong style={{ color: "#e2e8f0" }}>how long it&apos;s been held</strong> (bottom = fresh, top = old).
        Brighter = more supply there. The launch-era coins glow <strong style={{ color: "#22d3ee" }}>old</strong>; the wall near today&apos;s price mixes <strong style={{ color: "#fb7185" }}>fresh buyers</strong> with long-term holders — same price, very different conviction.
      </Explain>
      <div style={{ position: "relative", width: "100%" }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
          {cells}
          {AGE_L.map((l, a) => (
            <text key={l} x={mL - 12} y={pT + a * rh + rh / 2 + 5} fill={AGE_C[a]} fontSize="16" textAnchor="end" fontFamily={SANS} fontWeight="700">{l}</text>
          ))}
          {xticks.map(p => (
            <text key={p} x={X(p).toFixed(1)} y={pB + 26} fill="#aab6cc" fontSize="15" textAnchor="middle" fontFamily={MONO}>{fp(p)}</text>
          ))}
          {spot > pmin && spot < pmax && (
            <g>
              <line x1={X(spot).toFixed(1)} y1={pT} x2={X(spot).toFixed(1)} y2={pB} stroke="#f8fafc" strokeWidth="1.6" strokeDasharray="5 4" />
              <text x={(X(spot) + 6).toFixed(1)} y={pT + 16} fill="#f8fafc" fontSize="13" fontWeight="700" fontFamily={MONO}>spot {fp(spot)}</text>
            </g>
          )}
          {/* intensity legend */}
          {Array.from({ length: 24 }, (_, i) => (
            <rect key={i} x={W - mR - 240 + i * 10} y={H - 30} width="10" height="12" fill={ramp(i / 23)} />
          ))}
          <text x={W - mR - 246} y={H - 20} fill="#64748b" fontSize="13" textAnchor="end" fontFamily={SANS}>less</text>
          <text x={W - mR} y={H - 20} fill="#64748b" fontSize="13" textAnchor="end" fontFamily={SANS}>more supply</text>
        </svg>
      </div>
      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        Cost basis (x) × holding age (y), reconstructed on-chain from every coin&apos;s FIFO per-lot acquisition price and time. Colour = share of held supply. Hover a cell for the exact number. A holder-composition position, not a signal.
      </div>
    </div>
  );
}
