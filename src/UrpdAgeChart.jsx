import { useMemo, useState, useEffect, lazy, Suspense } from "react";
import { SPX_URPD } from "./spx-urpd.js";
import { loadUrpd, loadHistory } from "./history-data.js";
import { SANS, MONO, MAX_W, Explain } from "./chart-ui.jsx";

const Urpd3D = lazy(() => import("./Urpd3D.jsx"));

// age[0..4] = fresh → old
const AGE_C = ["#fb7185", "#fb923c", "#fbbf24", "#a78bfa", "#22d3ee"];
const AGE_L = ["0–1m", "1–3m", "3–6m", "6–12m", "1y+"];
const fp = p => p >= 1 ? "$" + p.toFixed(2) : p >= 0.01 ? "$" + p.toFixed(3) : "$" + p.toFixed(4);

// magma-ish ramp (heatmap view)
const STOPS = [[0, [8, 8, 28]], [0.2, [59, 15, 111]], [0.45, [140, 41, 129]], [0.7, [222, 73, 104]], [0.88, [254, 159, 109]], [1, [252, 253, 191]]];
function ramp(t) {
  t = Math.sqrt(Math.max(0, Math.min(1, t)));
  for (let i = 1; i < STOPS.length; i++) if (t <= STOPS[i][0]) {
    const [t0, a] = STOPS[i - 1], [t1, b] = STOPS[i], f = (t - t0) / (t1 - t0 || 1);
    return `rgb(${a.map((c, k) => Math.round(c + (b[k] - c) * f)).join(",")})`;
  }
  return "rgb(252,253,191)";
}

// Cost basis × holding age — the joint distribution of held supply, three ways:
// Ridgeline (default, one age band per row), Heatmap, and an interactive 3D field.
export default function UrpdAgeChart({ isMobile, preview = false, price = null }) {
  const [live, setLive] = useState(null);
  const [px, setPx] = useState(null);
  const [view, setView] = useState("bars");
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

  const W = 1200, H = isMobile ? 440 : 600, mL = 92, mR = 40, pT = 40, pB = H - 74, pW = W - mL - mR;
  const pmin = buckets[0].lo, pmax = buckets.at(-1).hi;
  const lmin = Math.log(pmin), lspan = Math.log(pmax) - lmin || 1;
  const X = p => mL + ((Math.log(p) - lmin) / lspan) * pW;
  const Xi = i => mL + ((Math.log((buckets[i].lo * buckets[i].hi) ** 0.5) - lmin) / lspan) * pW;
  const xticks = [0.003, 0.01, 0.03, 0.1, 0.3, 1, 2].filter(p => p >= pmin && p <= pmax);
  const maxV = Math.max(...buckets.flatMap(b => b.age), 1e-9);

  // ── BARS — the card reproduced: each price bucket a stacked bar coloured by age ──
  const bars = () => {
    const bw = (pW / buckets.length) * 0.84;
    const ymax = Math.max(...buckets.map(b => b.pct)) * 1.08 || 1;
    const Y = v => pB - (v / ymax) * (pB - pT);
    const out = [];
    // y-axis ticks (% of supply per price bucket)
    for (let g = 0; g <= 4; g++) {
      const v = (ymax * g) / 4;
      out.push(<line key={"g" + g} x1={mL} y1={Y(v).toFixed(1)} x2={mL + pW} y2={Y(v).toFixed(1)} stroke="rgba(255,255,255,0.06)" />);
      out.push(<text key={"gt" + g} x={mL - 10} y={(Y(v) + 5).toFixed(1)} fill="#8b95a7" fontSize="14" textAnchor="end" fontFamily={MONO}>{v.toFixed(1)}%</text>);
    }
    buckets.forEach((b, i) => {
      const cx = Xi(i); let base = 0;
      for (let a = 0; a < 5; a++) {
        const seg = b.age[a]; if (seg <= 0) continue;
        const y0 = Y(base), y1 = Y(base + seg);
        out.push(<rect key={`${i}-${a}`} x={(cx - bw / 2).toFixed(1)} y={y1.toFixed(1)} width={bw.toFixed(1)} height={Math.max(0.5, y0 - y1).toFixed(1)} fill={AGE_C[a]} fillOpacity="0.94">
          <title>{`${fp(b.lo)}–${fp(b.hi)} · ${AGE_L[a]}: ${seg.toFixed(2)}% of supply`}</title></rect>);
        base += seg;
      }
    });
    return out;
  };

  // ── HEATMAP — the original grid ──
  const heat = () => {
    const rh = (pB - pT) / 5, bw = pW / buckets.length, cells = [];
    buckets.forEach((b, i) => {
      const x = mL + i * bw;
      for (let a = 0; a < 5; a++) {
        const val = b.age[4 - a];
        cells.push(<rect key={`${i}-${a}`} x={x.toFixed(1)} y={(pT + a * rh).toFixed(1)} width={(bw + 0.5).toFixed(1)} height={(rh - 1).toFixed(1)}
          fill={ramp(val / maxV)}><title>{`${fp(b.lo)}–${fp(b.hi)} · ${AGE_L[4 - a]} · ${val.toFixed(2)}%`}</title></rect>);
      }
    });
    return (<>
      {cells}
      {[...AGE_L].reverse().map((l, a) => (
        <text key={l} x={mL - 12} y={pT + a * rh + rh / 2 + 5} fill={AGE_C[4 - a]} fontSize="16" textAnchor="end" fontFamily={SANS} fontWeight="700">{l}</text>
      ))}
    </>);
  };

  const legend = () => AGE_L.map((l, a) => {
    const lx = mL + a * (pW / 5.2);
    return (<g key={"lg" + a}><rect x={lx} y="10" width="18" height="12" rx="3" fill={AGE_C[a]} /><text x={lx + 24} y="20" fill="#cbd5e1" fontSize="15" fontWeight="700" fontFamily={SANS}>{l}</text></g>);
  });
  const TABS = [["bars", "Bars"], ["heat", "Heatmap"], ["3d", "3D"]];
  const tbtn = active => ({
    padding: "5px 14px", borderRadius: 8, fontFamily: SANS, fontSize: 13, cursor: "pointer",
    border: "1px solid " + (active ? "rgba(167,139,250,0.55)" : "rgba(255,255,255,0.12)"),
    background: active ? "rgba(167,139,250,0.16)" : "transparent", color: active ? "#c4b5fd" : "#94a3b8",
  });

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="Where were the bags bought — and how long have they been held?" accent="#a78bfa">
        Every held coin, placed by <strong style={{ color: "#e2e8f0" }}>what it cost</strong> and <strong style={{ color: "#e2e8f0" }}>how long it&apos;s been held</strong>.
        The launch-era coins are <strong style={{ color: "#22d3ee" }}>old (1y+)</strong> and cheap; the wall near today&apos;s price mixes <strong style={{ color: "#fb7185" }}>fresh buyers</strong> with mid-age holders — same price, very different conviction.
      </Explain>

      {!preview && (
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 14 }}>
          {TABS.map(([k, l]) => <button key={k} style={tbtn(view === k)} onClick={() => setView(k)}>{l}</button>)}
        </div>
      )}

      {view === "3d" && !preview ? (
        <div>
          <Suspense fallback={<div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading 3D…</div>}>
            <Urpd3D buckets={buckets} spot={spot} isMobile={isMobile} />
          </Suspense>
          <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap", marginTop: 12 }}>
            {AGE_L.map((l, a) => <span key={l} style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: SANS, fontSize: 13, color: "#cbd5e1" }}><span style={{ width: 12, height: 12, borderRadius: 3, background: AGE_C[a] }} />{l}</span>)}
          </div>
          <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 8 }}>
            Drag to orbit · scroll to zoom. Left→right = cheap→expensive cost basis; height = % of supply.
          </div>
        </div>
      ) : (
        <div style={{ position: "relative", width: "100%" }}>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
            {view === "bars" && legend()}
            {view === "heat" ? heat() : bars()}
            {xticks.map(p => (
              <text key={p} x={X(p).toFixed(1)} y={pB + 26} fill="#aab6cc" fontSize="15" textAnchor="middle" fontFamily={MONO}>{fp(p)}</text>
            ))}
            {spot > pmin && spot < pmax && (
              <g>
                <line x1={X(spot).toFixed(1)} y1={pT} x2={X(spot).toFixed(1)} y2={pB} stroke="#f8fafc" strokeWidth="1.6" strokeDasharray="5 4" />
                <text x={(X(spot) + 6).toFixed(1)} y={pT + 16} fill="#f8fafc" fontSize="13" fontWeight="700" fontFamily={MONO}>spot {fp(spot)}</text>
              </g>
            )}
            <text x={mL} y={pB + 50} fill="#64748b" fontSize="13" fontFamily={SANS}>← cheaper cost basis</text>
            <text x={mL + pW} y={pB + 50} fill="#64748b" fontSize="13" textAnchor="end" fontFamily={SANS}>more expensive →</text>
          </svg>
        </div>
      )}

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        Cost basis × holding age, reconstructed on-chain from every coin&apos;s FIFO per-lot acquisition price and time.
        {view === "bars" && " Each price bucket stacked by holder age — fresh (red) at the base to diamond 1y+ (cyan) on top. Hover a segment for the exact share."}
        {view === "heat" && " Brighter = more supply at that price and age. Hover a cell for the exact number."}
        {view === "3d" && " Each bar = supply held at a given price and age. Orbit to explore."}
        {" "}A holder-composition position, not a signal.
      </div>
    </div>
  );
}
