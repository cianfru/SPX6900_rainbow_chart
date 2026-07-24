import { useMemo, useState, useEffect } from "react";
import { ResponsiveContainer, ComposedChart, Scatter, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { loadAeonListings } from "./history-data.js";
import { SANS, MONO, MAX_W, Explain } from "./chart-ui.jsx";

const fEth = v => (v < 0.1 ? v.toFixed(3) : v.toFixed(2)) + "Ξ";

// least-squares fit of log(price) = a + b·log(rank) → fair value as a function of rarity
function fitFair(rows) {
  const pts = rows.filter(r => r.price > 0 && r.rank > 0);
  const n = pts.length; if (n < 4) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const r of pts) { const x = Math.log(r.rank), y = Math.log(r.price); sx += x; sy += y; sxx += x * x; sxy += x * y; }
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1), a = (sy - b * sx) / n;
  return { a, b, expected: rank => Math.exp(a + b * Math.log(rank)) };
}

// Project Aeon — rarity vs price. Plots every active listing by rarity rank vs its ask,
// fits a fair-value curve, and flags rare pieces listed BELOW it (underpriced deals),
// rendering the NFT art at the best ones.
export default function AeonValueChart({ isMobile }) {
  const [data, setData] = useState(null);
  useEffect(() => { let c = false; loadAeonListings().then(d => { if (!c) setData(d || { empty: true }); }); return () => { c = true; }; }, []);

  const model = useMemo(() => {
    if (!data || data.empty) return null;
    const rows = data.listings.filter(l => l.rank > 0 && l.price > 0);
    const fair = fitFair(rows);
    const scored = rows.map(l => {
      const exp = fair ? fair.expected(l.rank) : l.price;
      const disc = (exp - l.price) / exp;          // >0 = below fair value = deal
      return { ...l, exp, disc };
    });
    const deals = [...scored].filter(l => l.disc > 0.1).sort((a, b) => b.disc - a.disc).slice(0, 12);
    const dealIds = new Set(deals.map(d => d.id));
    const line = fair ? [...rows].sort((a, b) => a.rank - b.rank).filter((_, i, arr) => i % Math.max(1, Math.round(arr.length / 60)) === 0 || i === arr.length - 1)
      .map(r => ({ rank: r.rank, fair: +fair.expected(r.rank).toFixed(4) })) : [];
    return { scored, deals, dealIds, line, total: data.total, count: data.count, updated: data.updated };
  }, [data]);

  if (!data) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading listings…</div>;
  if (data.empty) return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <div style={{ textAlign: "center", fontFamily: SANS, color: "#94a3b8", padding: "80px 20px" }}>
        <div style={{ fontSize: 40, marginBottom: 14 }}>🚧</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#cbd5e1" }}>Under construction</div>
      </div>
    </div>
  );

  const { scored, deals, dealIds, line, total, count, updated } = model;
  const nonDeals = scored.filter(l => !dealIds.has(l.id));
  const dealPts = scored.filter(l => dealIds.has(l.id));
  const priceMin = Math.min(...scored.map(l => l.price)), priceMax = Math.max(...scored.map(l => l.price));

  // custom points: NFT thumbnail for deals, small dot for the rest
  const Dot = ({ cx, cy, payload }) => cx == null ? null : <circle cx={cx} cy={cy} r={4} fill="#64748b" fillOpacity={0.55} stroke="#0a0e1c" />;
  const DealDot = ({ cx, cy, payload }) => {
    if (cx == null) return null;
    const s = 30;
    return (
      <g>
        {payload.img && <image href={payload.img} x={cx - s / 2} y={cy - s / 2} width={s} height={s} preserveAspectRatio="xMidYMid slice" clipPath="inset(0 round 5px)" />}
        <rect x={cx - s / 2} y={cy - s / 2} width={s} height={s} rx={5} fill="none" stroke="#34d399" strokeWidth={2} />
      </g>
    );
  };
  const Tip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div style={{ background: "#0a0e1c", border: "1px solid #234", borderRadius: 8, padding: "8px 11px", fontFamily: SANS, fontSize: 12.5 }}>
        <div style={{ color: "#e2e8f0", fontWeight: 700 }}>AEON #{d.id}</div>
        <div style={{ color: "#94a3b8" }}>rarity rank {d.rank} of {total}</div>
        <div style={{ fontFamily: MONO }}><span style={{ color: "#f59e0b" }}>{fEth(d.price)}</span> · fair {fEth(d.exp)}</div>
        {d.disc > 0.1 && <div style={{ color: "#34d399", fontWeight: 700 }}>{(d.disc * 100).toFixed(0)}% below fair value</div>}
      </div>
    );
  };

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="Which rare AEON are listed too cheap?" accent="#34d399">
        Every <strong style={{ color: "#e2e8f0" }}>active listing</strong> plotted by <strong style={{ color: "#f59e0b" }}>rarity</strong> (rarer → left) vs its <strong style={{ color: "#e2e8f0" }}>ask price</strong>.
        The dashed line is <strong style={{ color: "#94a3b8" }}>fair value</strong> for that rarity; listings sitting <strong style={{ color: "#34d399" }}>below it are underpriced</strong> — the deals, shown with their art.
        {updated === "MOCK" && <em style={{ color: "#f472b6" }}> (Preview data — connect the live OpenSea feed.)</em>}
      </Explain>

      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 12, flexWrap: "wrap", fontFamily: SANS }}>
        <div style={{ textAlign: "center" }}><div style={{ fontSize: 22, fontWeight: 800, color: "#e2e8f0", fontFamily: MONO }}>{count}</div><div style={{ fontSize: 12, color: "#7c8a9e" }}>active listings</div></div>
        <div style={{ textAlign: "center" }}><div style={{ fontSize: 22, fontWeight: 800, color: "#34d399", fontFamily: MONO }}>{deals.length}</div><div style={{ fontSize: 12, color: "#7c8a9e" }}>under fair value</div></div>
        <div style={{ textAlign: "center" }}><div style={{ fontSize: 22, fontWeight: 800, color: "#f59e0b", fontFamily: MONO }}>{fEth(priceMin)}</div><div style={{ fontSize: 12, color: "#7c8a9e" }}>floor listing</div></div>
      </div>

      <ResponsiveContainer width="100%" height={isMobile ? 380 : 500}>
        <ComposedChart margin={{ top: 10, right: 20, bottom: 26, left: 6 }}>
          <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="rank" type="number" scale="log" domain={[1, total]} allowDataOverflow
            ticks={[1, 10, 100, 1000, total]} tickFormatter={v => v === 1 ? "rarest" : v >= 1000 ? (v / 1000).toFixed(v === total ? 1 : 0) + "k" : v}
            tick={{ fill: "#cbd5e1", fontSize: 11, fontFamily: MONO }} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false}
            label={{ value: "← rarer      rarity rank      more common →", position: "insideBottom", offset: -14, fill: "#64748b", fontSize: 12, fontFamily: SANS }} />
          <YAxis dataKey="price" type="number" scale="log" domain={[priceMin * 0.8, priceMax * 1.15]} allowDataOverflow
            tickFormatter={fEth} tick={{ fill: "#cbd5e1", fontSize: 11, fontFamily: MONO }} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={54} />
          <Tooltip content={<Tip />} cursor={{ stroke: "rgba(255,255,255,0.15)" }} />
          <Line data={line} dataKey="fair" stroke="#94a3b8" strokeWidth={2} strokeDasharray="6 5" dot={false} isAnimationActive={false} type="monotone" />
          <Scatter data={nonDeals} shape={<Dot />} isAnimationActive={false} />
          <Scatter data={dealPts} shape={<DealDot />} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>

      {deals.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 700, color: "#34d399", textAlign: "center", marginBottom: 10 }}>Best deals — rare, listed below fair value</div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 130 : 150}px, 1fr))`, gap: 12 }}>
            {deals.slice(0, 8).map(d => (
              <a key={d.id} href={`https://opensea.io/assets/ethereum/${data.contract}/${d.id}`} target="_blank" rel="noopener noreferrer"
                style={{ textDecoration: "none", background: "rgba(13,15,28,0.6)", border: "1px solid rgba(52,211,153,0.4)", borderRadius: 12, overflow: "hidden" }}>
                {d.img && <img src={d.img} alt={"AEON #" + d.id} loading="lazy" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block", background: "#05050e" }} />}
                <div style={{ padding: "8px 10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontFamily: SANS, fontSize: 13 }}><span style={{ color: "#e2e8f0", fontWeight: 700 }}>#{d.id}</span><span style={{ color: "#34d399", fontWeight: 700 }}>{(d.disc * 100).toFixed(0)}% off</span></div>
                  <div style={{ fontFamily: MONO, fontSize: 12.5, color: "#94a3b8", marginTop: 2 }}>{fEth(d.price)} · rank {d.rank}</div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 18, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        Fair value is a log-log fit of ask price vs rarity rank across all live listings — a rough guide, not a promise. &ldquo;Deals&rdquo; are listings sitting below it; tap one to view it on OpenSea. Listings + prices from OpenSea, rarity reconstructed from on-chain metadata.
      </div>
    </div>
  );
}
