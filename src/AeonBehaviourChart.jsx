import { useMemo, useState, useEffect } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from "recharts";
import { AEON_ONCHAIN } from "./aeon-onchain.js";
import { loadAeon } from "./history-data.js";
import { SANS, MONO, MAX_W, Metric, TipBox, Explain } from "./chart-ui.jsx";

const fShort = t => new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit" });

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <TipBox title={new Date(d.ts).toLocaleDateString("en-US", { month: "long", year: "numeric" })}>
      <div><span style={{ color: "#34d399" }}>entered</span>: <span style={{ fontFamily: MONO }}>{d.entered}</span></div>
      <div><span style={{ color: "#fb7185" }}>exited</span>: <span style={{ fontFamily: MONO }}>{-d.exitedNeg}</span></div>
      <div><span style={{ color: "#e2e8f0" }}>net</span>: <span style={{ fontFamily: MONO }}>{d.entered + d.exitedNeg >= 0 ? "+" : ""}{d.entered + d.exitedNeg}</span></div>
    </TipBox>
  );
}

// Project Aeon — holder flow: monthly wallets entering (buying) vs exiting (selling to
// zero). The mint month is dropped (one-off spike). Positive = accumulation, negative = distribution.
export default function AeonBehaviourChart({ isMobile }) {
  const [data, setData] = useState(AEON_ONCHAIN);
  useEffect(() => { let c = false; loadAeon().then(d => { if (!c && d) setData(d); }); return () => { c = true; }; }, []);
  const { months, net } = useMemo(() => {
    const mon = new Map();
    for (const r of (data.series || [])) {
      if (!(r.owners > 0)) continue;
      const k = r.d.slice(0, 7);
      const m = mon.get(k) || { entered: 0, exited: 0 };
      m.entered += r.entered || 0; m.exited += r.exited || 0; mon.set(k, m);
    }
    let arr = [...mon.entries()].map(([k, v]) => ({ ts: Date.parse(k + "-01"), entered: v.entered, exitedNeg: -v.exited }))
      .sort((a, b) => a.ts - b.ts);
    const mintMax = Math.max(0, ...arr.map(m => m.entered));
    arr = arr.filter(m => m.entered < mintMax); // drop the mint-frenzy month
    const net = arr.reduce((s, m) => s + m.entered + m.exitedNeg, 0);
    return { months: arr, net };
  }, [data]);
  if (months.length < 6) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Not enough data yet.</div>;
  const cur = months.at(-1);
  const step = Math.max(1, Math.round(months.length / 6));
  const xTicks = months.filter((_, i) => i % step === 0 || i === months.length - 1).map(r => r.ts);

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="Who's buying in vs selling out?" accent="#34d399">
        Each month, wallets <strong style={{ color: "#34d399" }}>entering</strong> the holder base (a balance crossing 0→held) vs <strong style={{ color: "#fb7185" }}>exiting</strong> (selling to zero).
        Above the line = accumulation, below = distribution. Net since mint: <strong style={{ color: net >= 0 ? "#34d399" : "#fb7185" }}>{net >= 0 ? "+" : ""}{net} wallets</strong>.
      </Explain>
      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <Metric label="entered last month" value={cur.entered} color="#34d399" />
        <Metric label="exited last month" value={-cur.exitedNeg} color="#fb7185" />
        <Metric label="net since mint" value={(net >= 0 ? "+" : "") + net} color={net >= 0 ? "#34d399" : "#fb7185"} />
      </div>
      <ResponsiveContainer width="100%" height={isMobile ? 400 : 540}>
        <BarChart data={months} stackOffset="sign" margin={{ top: 10, right: isMobile ? 8 : 20, bottom: 24, left: isMobile ? 0 : 12 }}>
          <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="ts" type="number" domain={["dataMin", "dataMax"]} ticks={xTicks} scale="time"
            tickFormatter={fShort} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
          <YAxis type="number" tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 40 : 50} />
          <Tooltip content={<Tip />} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.3)" />
          <Bar dataKey="entered" stackId="f" fill="#34d399" fillOpacity={0.9} isAnimationActive={false} />
          <Bar dataKey="exitedNeg" stackId="f" fill="#fb7185" fillOpacity={0.9} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        <strong style={{ color: "#34d399" }}>Holder flow</strong> — wallets joining vs leaving the base each month (mint excluded). A wallet &ldquo;enters&rdquo; when its balance crosses 0→held, &ldquo;exits&rdquo; when it sells to zero.
      </div>
    </div>
  );
}
