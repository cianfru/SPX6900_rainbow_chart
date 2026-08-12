import { useMemo, useState, useEffect } from "react";
import { ResponsiveContainer, ComposedChart, Scatter, Line, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts";
import { loadAeonMarket } from "./history-data.js";
import { SANS, MONO, MAX_W, Explain } from "./chart-ui.jsx";

const fEth = v => (v < 0.1 ? v.toFixed(3) : v.toFixed(2)) + "Ξ";
const CONTRACT = "0xc374a204334d4edd4c6a62f0867c752d65e9579c";

// Project Aeon, rarity vs REALIZED sale price. Every recent sale plotted by rarity vs
// what it fetched, the fair-value fit, the steals (sold below it), and the record sales.
export default function AeonSalesRarityChart({ isMobile }) {
  const [data, setData] = useState(null);
  useEffect(() => { let c = false; loadAeonMarket().then(d => { if (!c) setData(d || { empty: true }); }); return () => { c = true; }; }, []);

  const model = useMemo(() => {
    if (!data || data.empty || !data.salesScatter?.length) return null;
    const pts = data.salesScatter;
    const ranks = pts.map(p => p.rank), rmin = 1, rmax = data.supply || Math.max(...ranks);
    const pmin = Math.min(...pts.map(p => p.price)), pmax = Math.max(...pts.map(p => p.price));
    const fm = data.fairModel;
    const line = fm ? Array.from({ length: 40 }, (_, i) => { const r = Math.exp(Math.log(rmin) + (Math.log(rmax) - Math.log(rmin)) * i / 39); return { rank: r, fair: Math.exp(fm.a + fm.b * Math.log(r)) }; }) : [];
    return { pts, rmin, rmax, pmin, pmax, line, imgs: data.scatterImgs || {} };
  }, [data]);

  if (!data) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading sales…</div>;
  if (data.empty || !model) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Sales data is being reconstructed.</div>;

  let { pts, rmin, rmax, pmin, pmax, line, imgs } = model;
  if (!(pmin > 0)) pmin = 0.001;                     // log scale cannot start at 0
  if (!(pmax > pmin)) pmax = pmin * 2;               // single sale → give the axis room
  const Tip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    // A ComposedChart tooltip can resolve to the fair-value LINE, which has no token id -
    // take the first payload entry that is an actual sale.
    const d = (payload.find(p => p?.payload?.id != null) || payload[0]).payload;
    if (d.id == null) return null;
    const art = imgs[d.id];
    return (<div style={{ background: "#0a0e1c", border: "1px solid #234", borderRadius: 10, padding: 8, fontFamily: SANS, fontSize: 12.5, display: "flex", gap: 9, alignItems: "center", boxShadow: "0 8px 26px rgba(0,0,0,0.55)" }}>
      {art && <img src={art} alt={"AEON #" + d.id} width={76} height={76}
        style={{ width: 76, height: 76, borderRadius: 7, objectFit: "cover", display: "block", background: "#05050e", flexShrink: 0, border: "1px solid rgba(255,255,255,0.10)" }} />}
      <div style={{ minWidth: 0 }}>
        <div style={{ color: "#e2e8f0", fontWeight: 700 }}>AEON #{d.id}</div>
        <div style={{ color: "#94a3b8", fontFamily: MONO }}>rank {d.rank}</div>
        <div style={{ color: "#f59e0b", fontFamily: MONO, fontWeight: 700 }}>sold {fEth(d.price)}</div>
        {d.disc > 0.2 && <div style={{ color: "#34d399", fontWeight: 700 }}>{(d.disc * 100).toFixed(0)}% below fair</div>}
      </div>
    </div>);
  };
  const gallery = (items, accent, tag) => (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 120 : 140}px, 1fr))`, gap: 11 }}>
      {items.map(x => (
        <a key={x.id + "-" + x.d} href={`https://opensea.io/assets/ethereum/${CONTRACT}/${x.id}`} target="_blank" rel="noopener noreferrer"
          style={{ textDecoration: "none", background: "rgba(13,15,28,0.6)", border: `1px solid ${accent}44`, borderRadius: 12, overflow: "hidden" }}>
          {x.img && <img src={x.img} alt={"#" + x.id} loading="lazy" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block", background: "#05050e" }} />}
          <div style={{ padding: "7px 10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: SANS, fontSize: 13 }}><span style={{ color: "#e2e8f0", fontWeight: 700 }}>#{x.id}</span><span style={{ color: accent, fontWeight: 700 }}>{tag(x)}</span></div>
            <div style={{ fontFamily: MONO, fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{fEth(x.price)}{x.rank ? " · rank " + x.rank : ""}</div>
          </div>
        </a>
      ))}
    </div>
  );

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="Do rare AEON sell for more, and who got a steal?" accent="#f59e0b">
        Every recent sale by <strong style={{ color: "#f59e0b" }}>rarity</strong> (rarer → left) vs the <strong style={{ color: "#e2e8f0" }}>price it fetched</strong>. The dashed line is fair value for that rarity; sales <strong style={{ color: "#34d399" }}>below it were steals</strong>.
        These are <em>realized</em> sales (no live-listings key needed), the record sales and recent bargains, with their art.
      </Explain>

      <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
        <ComposedChart margin={{ top: 10, right: 20, bottom: 26, left: 6 }}>
          <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="rank" type="number" scale="log" domain={[rmin, rmax]} allowDataOverflow ticks={isMobile ? [1, 100, rmax] : [1, 10, 100, 1000, rmax]}
            tickFormatter={v => v === 1 ? "rarest" : v >= 1000 ? (v / 1000).toFixed(v === rmax ? 1 : 0) + "k" : v} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 11, fontFamily: MONO }} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false}
            label={{ value: isMobile ? "← rarer          more common →" : "← rarer      rarity rank      more common →", position: "insideBottom", offset: -14, fill: "#64748b", fontSize: isMobile ? 10.5 : 12, fontFamily: SANS }} />
          <YAxis dataKey="price" type="number" scale="log" domain={[pmin * 0.8, pmax * 1.15]} allowDataOverflow tickFormatter={fEth} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 11, fontFamily: MONO }} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 44 : 54} />
          <Tooltip content={<Tip />} cursor={{ stroke: "rgba(255,255,255,0.15)" }} />
          <Line data={line} dataKey="fair" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="6 5" dot={false} isAnimationActive={false} type="monotone" />
          <Scatter data={pts} isAnimationActive={false}>
            {pts.map((p, i) => <Cell key={i} fill={p.disc > 0.2 ? "#34d399" : "#64748b"} fillOpacity={p.disc > 0.2 ? 0.95 : 0.5} />)}
          </Scatter>
        </ComposedChart>
      </ResponsiveContainer>

      {data.deals?.length > 0 && (<div style={{ marginTop: 18 }}>
        <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 700, color: "#34d399", textAlign: "center", marginBottom: 10 }}>Recent steals, sold below fair value for their rarity</div>
        {gallery(data.deals.slice(0, 8), "#34d399", x => `${(x.disc * 100).toFixed(0)}% off`)}
      </div>)}
      {data.biggest?.length > 0 && (<div style={{ marginTop: 22 }}>
        <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 700, color: "#fbbf24", textAlign: "center", marginBottom: 10 }}>Record sales</div>
        {gallery(data.biggest.slice(0, 8), "#fbbf24", () => "top sale")}
      </div>)}

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 18, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        Fair value is a log-log fit of sale price vs rarity rank over the last 180 days. &ldquo;Steals&rdquo; sold &gt;20% below it. Sales + prices from on-chain marketplace trades; rarity from on-chain metadata. Tap any piece for OpenSea.
      </div>
    </div>
  );
}
