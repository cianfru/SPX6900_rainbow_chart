import { useMemo, useState, useEffect } from "react";
import {
  ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from "recharts";
import { SPX_URPD } from "./spx-urpd.js";
import { loadUrpd, loadHistory } from "./history-data.js";
import { SANS, MONO, MAX_W, Metric, TipBox, Explain } from "./chart-ui.jsx";

const GRN = "#34d399", RED = "#fb7185";
const fp = p => p >= 1 ? "$" + p.toFixed(2) : "$" + p.toFixed(p >= 0.1 ? 3 : 4);

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <TipBox title={`${fp(d.lo)} – ${fp(d.hi)}`}>
      <div><span style={{ color: d.inProfit ? GRN : RED }}>{d.pct.toFixed(1)}%</span> of held supply</div>
      <div style={{ color: "#94a3b8" }}>bought here — {d.inProfit ? "in profit" : "underwater"}</div>
    </TipBox>
  );
}

// Cost Basis Distribution (URPD) — where the held supply was bought, a histogram of per-lot
// acquisition price from the local FIFO engine. Green = in profit (below spot), red =
// underwater (above spot). "Where are the bags?" A holder-cost position, not a signal.
export default function UrpdChart({ isMobile, preview = false, price = null }) {
  const [live, setLive] = useState(null);
  const [px, setPx] = useState(null); // live-ish price fallback from the daily snapshot
  useEffect(() => {
    let cancelled = false;
    loadUrpd().then(d => { if (!cancelled && d) setLive(d); });
    if (!(Number.isFinite(price) && price > 0)) {
      loadHistory().then(h => { if (!cancelled && Array.isArray(h) && h.length) setPx(h.at(-1)?.p ?? null); });
    }
    return () => { cancelled = true; };
  }, [price]);
  const u = live || SPX_URPD;
  // The cost-basis bars are historical; the spot line + profit split must track the LIVE
  // price, not the price frozen into urpd.json at extract time. Prefer the passed live price,
  // then the latest daily snapshot, then (last resort) the extract's own spot.
  const spot = (Number.isFinite(price) && price > 0) ? price
    : (Number.isFinite(px) && px > 0) ? px : (u?.spot ?? 0);

  const { data, spotIdx, inProfit, wall } = useMemo(() => {
    const b = (u?.buckets || []).map((x, i) => ({ i, lo: x.lo, hi: x.hi, pct: x.pct, inProfit: Math.sqrt(x.lo * x.hi) < spot }));
    let spotIdx = b.findIndex(x => spot >= x.lo && spot < x.hi);
    if (spotIdx < 0) spotIdx = b.findIndex(x => !x.inProfit); // first underwater bucket
    const inProfit = b.filter(x => x.inProfit).reduce((a, x) => a + x.pct, 0);
    let wall = b[0] || null;
    for (const x of b) if (wall && x.pct > wall.pct) wall = x;
    return { data: b, spotIdx, inProfit, wall };
  }, [u, spot]);

  if (data.length < 8) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Not enough on-chain data yet.</div>;

  // x tick labels at price decade stops within range
  const ticks = useMemo(() => {
    const stops = [0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1, 3];
    const out = [];
    for (const p of stops) {
      const idx = data.findIndex(x => p >= x.lo && p < x.hi);
      if (idx >= 0) out.push(idx);
    }
    return out;
  }, [data]);
  const tickFmt = i => { const b = data[i]; return b ? fp(Math.sqrt(b.lo * b.hi)) : ""; };

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="Where was every held SPX6900 coin actually bought?" accent={GRN}>
        Each bar is a slice of supply grouped by <strong style={{ color: "#e2e8f0" }}>what it cost</strong> — reconstructed on-chain from every coin&apos;s cost basis.
        Bars left of spot are <strong style={{ color: GRN }}>in profit</strong>, bars right are <strong style={{ color: RED }}>underwater</strong>. The tall bars are the walls of supply — where the bags are, and where support and resistance tend to form.
      </Explain>
      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <Metric label="in profit" value={inProfit.toFixed(0) + "%"} color={GRN} sub="bought below spot" />
        <Metric label="biggest wall" value={wall ? wall.pct.toFixed(0) + "%" : "—"} color={wall && wall.inProfit ? GRN : RED} sub={wall ? `${fp(wall.lo)}–${fp(wall.hi)}` : ""} />
        <Metric label="spot" value={fp(spot)} color="#e2e8f0" sub="today" />
      </div>

      <div style={{ position: "relative" }}>
        <ResponsiveContainer width="100%" height={isMobile ? 400 : 540}>
          <BarChart data={data} margin={{ top: 10, right: isMobile ? 8 : 20, bottom: 24, left: isMobile ? 0 : 12 }} barCategoryGap={1}>
            <defs>
              <linearGradient id="urpdG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={GRN} stopOpacity={0.95} /><stop offset="100%" stopColor={GRN} stopOpacity={0.4} /></linearGradient>
              <linearGradient id="urpdR" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={RED} stopOpacity={0.95} /><stop offset="100%" stopColor={RED} stopOpacity={0.4} /></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey="i" type="category" ticks={ticks} tickFormatter={tickFmt} interval={0}
              tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
            <YAxis type="number" tickFormatter={v => v + "%"} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 40 : 50} />
            <Tooltip content={<Tip />} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
            {spotIdx >= 0 && (
              <ReferenceLine x={spotIdx} stroke="#f8fafc" strokeWidth={2} strokeDasharray="5 4"
                label={preview ? undefined : { value: `spot ${fp(spot)}`, position: "top", fill: "#f8fafc", fontSize: 11.5, fontFamily: MONO, fontWeight: 700 }} />
            )}
            <Bar dataKey="pct" isAnimationActive={false} name="supply" radius={[2, 2, 0, 0]}>
              {data.map(d => <Cell key={d.i} fill={d.inProfit ? "url(#urpdG)" : "url(#urpdR)"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        <strong style={{ color: GRN }}>Cost basis distribution</strong> — SPX6900&apos;s held supply grouped by the price each coin was bought at, reconstructed per-lot (FIFO) from the on-chain transfer history.
        Green = bought below spot (in profit), red = above (underwater). The tall bars are the walls where the bags sit. A holder-cost position, not a signal. Not financial advice.
      </div>
    </div>
  );
}
