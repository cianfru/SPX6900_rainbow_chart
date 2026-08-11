import { useMemo, useState, useEffect } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell, ReferenceLine } from "recharts";
import { loadAeonMarket } from "./history-data.js";
import { SANS, MONO, MAX_W, Metric, Explain } from "./chart-ui.jsx";

const fEth = v => (v < 0.1 ? v.toFixed(3) : v.toFixed(2)) + "Ξ";

// Project Aeon, NFT valuation: the SPX MVRV playbook on the collection. Each held token's
// cost basis = what its owner paid; MVRV = floor ÷ realized; supply-in-profit + a cost-basis
// histogram (URPD) show where the bags are and who's up.
export default function AeonValuationChart({ isMobile }) {
  const [data, setData] = useState(null);
  useEffect(() => { let c = false; loadAeonMarket().then(d => { if (!c) setData(d || { empty: true }); }); return () => { c = true; }; }, []);

  const buckets = useMemo(() => {
    if (!data || data.empty) return [];
    const f = data.valuation.floor;
    return (data.urpd || []).filter(b => b.n > 0).map(b => ({ mid: Math.sqrt(b.lo * b.hi), lo: b.lo, hi: b.hi, n: b.n, inProfit: Math.sqrt(b.lo * b.hi) <= f }));
  }, [data]);

  if (!data) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading valuation…</div>;
  if (data.empty) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Valuation is being reconstructed.</div>;

  const v = data.valuation;
  const mvrvState = v.mvrv < 0.9 ? { t: "below cost basis", c: "#34d399" } : v.mvrv > 1.3 ? { t: "well above cost", c: "#fb7185" } : { t: "near cost basis", c: "#fbbf24" };
  const maxN = Math.max(...buckets.map(b => b.n), 1);

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="Are AEON holders in profit, and what's it worth vs cost?" accent={mvrvState.c}>
        The SPX valuation playbook, on the NFT. Each held token&apos;s <strong style={{ color: "#e2e8f0" }}>cost basis</strong> is what its owner paid; <strong style={{ color: mvrvState.c }}>MVRV</strong> is the floor over that cost.
        <strong style={{ color: "#34d399" }}> Supply in profit</strong> = the share of held pieces now worth more (floor) than they cost. The bars show where everyone bought.
      </Explain>

      <div style={{ display: "flex", gap: isMobile ? 14 : 30, justifyContent: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <Metric label="floor" value={fEth(v.floor)} color="#2dd4bf" />
        <Metric label="realized price" value={fEth(v.realizedPrice)} color="#a78bfa" sub="crowd cost basis" />
        <Metric label="MVRV" value={v.mvrv?.toFixed(2) + "×"} color={mvrvState.c} sub={mvrvState.t} />
        <Metric label="in profit" value={v.supplyInProfitPct + "%"} color="#34d399" sub={`of ${v.heldPriced.toLocaleString()} priced-held`} />
      </div>

      <div style={{ fontFamily: SANS, fontSize: 13, color: "#94a3b8", textAlign: "center", marginBottom: 4 }}>Cost-basis distribution, where held pieces were bought (green = in profit vs floor)</div>
      <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
        <BarChart data={buckets} margin={{ top: 8, right: 16, bottom: 24, left: 6 }}>
          <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="mid" type="number" scale="log" domain={["dataMin", "dataMax"]} tickFormatter={fEth}
            tick={{ fill: "#cbd5e1", fontSize: 11, fontFamily: MONO }} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false}
            label={{ value: "cost basis (ETH)", position: "insideBottom", offset: -14, fill: "#64748b", fontSize: 12, fontFamily: SANS }} />
          <YAxis tick={{ fill: "#cbd5e1", fontSize: 11, fontFamily: MONO }} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={40}
            label={{ value: "tokens", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 12, fontFamily: SANS, style: { textAnchor: "middle" } }} />
          <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} contentStyle={{ background: "#0a0e1c", border: "1px solid #234", borderRadius: 8, fontFamily: MONO, fontSize: 12 }}
            formatter={(val, n, p) => [`${val} tokens · ${p.payload.inProfit ? "in profit" : "underwater"}`, ""]} labelFormatter={l => "bought ~" + fEth(l)} />
          <Bar dataKey="n" isAnimationActive={false}>{buckets.map((b, i) => <Cell key={i} fill={b.inProfit ? "#34d399" : "#fb7185"} fillOpacity={0.82} />)}</Bar>
          <ReferenceLine x={v.floor} stroke="#f8fafc" strokeDasharray="5 4" strokeWidth={1.6} label={{ value: "floor " + fEth(v.floor), position: "top", fill: "#f8fafc", fontSize: 11, fontFamily: MONO }} />
        </BarChart>
      </ResponsiveContainer>

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 14, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        <strong style={{ color: mvrvState.c }}>MVRV {v.mvrv?.toFixed(2)}×</strong>, floor ({fEth(v.floor)}) vs the crowd&apos;s realized cost basis ({fEth(v.realizedPrice)}). Bars are the cost-basis histogram of every priced, still-held token; green sits below the floor (in profit). Cost basis = each token&apos;s current owner&apos;s last purchase price, from the sale log. A position read, not a signal.
      </div>
    </div>
  );
}
