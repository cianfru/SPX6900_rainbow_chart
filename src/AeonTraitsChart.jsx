import { useState, useEffect } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { loadAeonMarket } from "./history-data.js";
import { SANS, MONO, MAX_W, Explain } from "./chart-ui.jsx";

const fEth = v => (v < 0.1 ? v.toFixed(3) : v.toFixed(2)) + "Ξ";

// Project Aeon, which traits command a price. Median recent sale price per trait value.
export default function AeonTraitsChart({ isMobile }) {
  const [data, setData] = useState(null);
  useEffect(() => { let c = false; loadAeonMarket().then(d => { if (!c) setData(d || { empty: true }); }); return () => { c = true; }; }, []);

  if (!data) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading trait values…</div>;
  if (data.empty || !data.traitPremiums?.length) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Trait values are being reconstructed.</div>;

  const rows = data.traitPremiums.slice(0, isMobile ? 14 : 22).map(t => ({ ...t, label: t.trait }));

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="Which traits are worth paying up for?" accent="#a78bfa">
        The <strong style={{ color: "#e2e8f0" }}>median sale price</strong> over the last 6 months for pieces carrying each trait, the collection&apos;s <strong style={{ color: "#a78bfa" }}>trait premiums</strong>.
        A high bar means buyers consistently pay more for that trait. (A trait&apos;s price also reflects the whole piece, not the trait alone.)
      </Explain>

      <ResponsiveContainer width="100%" height={isMobile ? 460 : 620}>
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 30, bottom: 4, left: isMobile ? 4 : 8 }}>
          <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" horizontal={false} />
          <XAxis type="number" tickFormatter={fEth} tick={{ fill: "#cbd5e1", fontSize: 11, fontFamily: MONO }} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
          <YAxis type="category" dataKey="label" width={isMobile ? 150 : 220} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: SANS }} axisLine={false} tickLine={false} interval={0} />
          <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} contentStyle={{ background: "#0a0e1c", border: "1px solid #234", borderRadius: 8, fontFamily: MONO, fontSize: 12 }}
            formatter={(v, n, p) => [`${fEth(v)} median · floor ${fEth(p.payload.floor)} · ${p.payload.sales} sales`, ""]} labelFormatter={l => l} />
          <Bar dataKey="median" fill="#a78bfa" fillOpacity={0.85} radius={[0, 3, 3, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 14, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        Median sale price of pieces carrying each trait over the last 180 days (traits with ≥4 sales). It&apos;s a &ldquo;trait floor / premium&rdquo; read like OpenSea&apos;s, computed from real on-chain sales, a trait&apos;s number also carries the rest of the piece, so read it as a lean, not a price tag.
      </div>
    </div>
  );
}
