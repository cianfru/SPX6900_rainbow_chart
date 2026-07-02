import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceArea,
} from "recharts";
import { buildRiskSeries, BAND_LABELS } from "./models.js";
import { FNG_HISTORY } from "./fng-history.js";
import { loadHistory } from "./history-data.js";
import { SANS, MONO, MAX_W, TipBox } from "./chart-ui.jsx";

const FNG_COLOR = "#f59e0b";
const fD = ts => new Date(ts).toLocaleDateString("en-US", { month: "short", year: "2-digit" });

function RiskTip({ active, payload }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <TipBox>
      <div style={{ fontWeight: 700, color: "#f8fafc", marginBottom: 4 }}>
        {new Date(d.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
      </div>
      <div>Risk: <span style={{ fontFamily: MONO, fontWeight: 700, color: "#f8fafc" }}>{d.risk.toFixed(3)}</span></div>
      {d.fng != null && <div>Fear &amp; Greed: <span style={{ fontFamily: MONO, fontWeight: 700, color: FNG_COLOR }}>{Math.round(d.fng * 100)}</span></div>}
      <div>Price: <span style={{ fontFamily: MONO }}>${d.price < 1 ? d.price.toFixed(4) : d.price.toFixed(2)}</span></div>
    </TipBox>
  );
}

export default function RiskChart({ series, m, isMobile }) {
  const [showFng, setShowFng] = useState(false);
  const [liveFng, setLiveFng] = useState(null);
  const risk = useMemo(() => buildRiskSeries(m, series), [m, series]);

  // The bundled FNG_HISTORY ends at build time; the daily snapshot keeps writing
  // fresh values into /history.json. The first time the overlay is opened, pull
  // those and append anything newer than the bundle so the line never flattens.
  useEffect(() => {
    if (!showFng || liveFng) return;
    let live = true;
    loadHistory().then(arr => {
      if (!live) return;
      const pts = arr.filter(x => x && typeof x.fng === "number" && x.d).map(x => [new Date(x.d).getTime(), x.fng]);
      setLiveFng(pts); // [] is fine — marks "loaded", falls back to bundled
    });
    return () => { live = false; };
  }, [showFng, liveFng]);

  const fngHist = useMemo(() => {
    if (!liveFng || !liveFng.length) return FNG_HISTORY;
    const lastB = FNG_HISTORY.length ? FNG_HISTORY[FNG_HISTORY.length - 1][0] : -Infinity;
    const extra = liveFng.filter(([ts]) => ts > lastB).sort((a, b) => a[0] - b[0]);
    return extra.length ? [...FNG_HISTORY, ...extra] : FNG_HISTORY;
  }, [liveFng]);

  // Overlay the crypto Fear & Greed index (0–100 → 0–1 so it shares the risk
  // axis), carried forward to each risk point's date. Both walk forward in time,
  // so a single advancing pointer aligns them; points before F&G history starts
  // stay null (no line drawn there).
  const data = useMemo(() => {
    let j = 0;
    return risk.map(d => {
      while (j + 1 < fngHist.length && fngHist[j + 1][0] <= d.ts) j++;
      const have = fngHist.length && fngHist[j][0] <= d.ts;
      return { ...d, fng: have ? fngHist[j][1] / 100 : null };
    });
  }, [risk, fngHist]);
  const cur = data[data.length - 1];
  const zoneIdx = Math.min(8, Math.max(0, Math.floor(cur.risk * 9)));
  const zoneColor = BAND_LABELS[zoneIdx].c;
  const riskLabel = cur.risk < 0.33 ? "LOW RISK" : cur.risk < 0.66 ? "MEDIUM RISK" : "HIGH RISK";

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, justifyContent: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <span style={{
          fontFamily: MONO, fontSize: isMobile ? 42 : 58, fontWeight: 700, lineHeight: 1,
          color: zoneColor, textShadow: `0 0 24px ${zoneColor}66`,
        }}>
          {cur.risk.toFixed(2)}
        </span>
        <div style={{ textAlign: "left" }}>
          <div style={{ fontFamily: MONO, fontSize: 12, color: "#94a3b8", letterSpacing: 1.2 }}>CURRENT RISK</div>
          <div style={{ fontFamily: SANS, fontSize: isMobile ? 16 : 20, fontWeight: 800, color: zoneColor }}>{riskLabel}</div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
        <button
          type="button"
          onClick={() => setShowFng(v => !v)}
          aria-pressed={showFng}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer",
            fontFamily: SANS, fontSize: 13, fontWeight: 700,
            color: showFng ? "#0a0a14" : "#cbd5e1",
            background: showFng ? FNG_COLOR : "rgba(255,255,255,0.06)",
            border: `1px solid ${showFng ? FNG_COLOR : "rgba(255,255,255,0.18)"}`,
            borderRadius: 999, padding: "7px 14px", transition: "all 0.15s ease",
          }}
        >
          <span style={{
            width: 10, height: 10, borderRadius: "50%",
            background: FNG_COLOR, border: showFng ? "1px solid #0a0a14" : "none",
          }} />
          {showFng ? "Hide Fear & Greed" : "Compare Fear & Greed"}
        </button>
      </div>

      <ResponsiveContainer width="100%" height={isMobile ? 380 : 560}>
        <ComposedChart data={data} margin={{ top: 10, right: isMobile ? 12 : 30, bottom: 24, left: isMobile ? 0 : 12 }}>
          <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.07)" vertical={false} />
          <XAxis
            dataKey="ts" type="number" scale="time" domain={["dataMin", "dataMax"]}
            tickFormatter={fD} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false}
            minTickGap={isMobile ? 40 : 30}
          />
          <YAxis
            domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]}
            tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 32 : 44}
          />
          {BAND_LABELS.map((b, i) => (
            <ReferenceArea key={i} y1={i / 9} y2={(i + 1) / 9} fill={b.c} fillOpacity={0.16} stroke="none" />
          ))}
          <Tooltip content={<RiskTip />} />
          {showFng && (
            <Line type="monotone" dataKey="fng" stroke={FNG_COLOR} strokeWidth={1.7} dot={false} connectNulls
              strokeDasharray="5 4" isAnimationActive={false} />
          )}
          <Line type="monotone" dataKey="risk" stroke="#ffffff" strokeWidth={2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>

      <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 10, lineHeight: 1.6 }}>
        Risk = how stretched price is above (red) or below (blue) the model, normalized 0–1 over SPX6900&apos;s history.
        Lower is historically cheaper. Not financial advice.
        {showFng && <><br /><span style={{ color: FNG_COLOR, fontWeight: 700 }}>Dashed line</span> = crypto Fear &amp; Greed index (0–100, rescaled to 0–1) — the market&apos;s mood vs SPX6900&apos;s own valuation.</>}
      </div>
    </div>
  );
}
