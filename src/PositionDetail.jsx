import { useMemo } from "react";
import { ResponsiveContainer, ComposedChart, Line, Scatter, Area, XAxis, YAxis, ZAxis, Tooltip, CartesianGrid, ReferenceLine } from "recharts";
import { walletGradient } from "./WalletCard.jsx";
import { MONO, MAX_W, TipBox } from "./chart-ui.jsx";

// Shared "where it bought & sold + P&L" view, used by BOTH the smart-money wallet page (WalletDetail)
// and the cluster page (ClusterDetail). A cluster is just one position (the whole owner) — same tiles,
// same buy/sell orb chart, same realized-PnL curve — so the render lives here once.

const GRN = "#4ade80", RED = "#f43f5e", GOLD = "#f6a23c", PALE = "#aab6cc";
export const shortAddr = a => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "");
const fUsd = v => { const s = v < 0 ? "−" : ""; const a = Math.abs(v); return s + "$" + (a >= 1e6 ? (a / 1e6).toFixed(2) + "M" : a >= 1e3 ? (a / 1e3).toFixed(1) + "k" : Math.round(a)); };
const fM = v => Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(2) + "M" : Math.abs(v) >= 1e3 ? (v / 1e3).toFixed(0) + "k" : Math.round(v);
const fP = v => v == null ? "" : v < 0.01 ? "$" + v.toFixed(4) : "$" + v.toFixed(3);
// Full 4-digit year: "Aug 9, 25" read like "Aug 25" — an ambiguous day/year. "Aug 9, 2025" is clear.
const fDay = t => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function Tile({ label, value, color, sub }) {
  return (
    <div style={{ minWidth: 118 }}>
      <div style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--dim)" }}>{label}</div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 23, fontWeight: 700, color: color || "var(--tx)", lineHeight: 1.15 }}>{value}</div>
      {sub && <div style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--dim)" }}>{sub}</div>}
    </div>
  );
}

// pos = { bag, avgCost, realized, roi, buys:[[t,price,qty]], sells:[[t,price,qty,realized]] }
// head = { seed (for gradient), title, cmd, links:[{label,href}], meta (jsx under the title) }
// px   = the price-history array [{date, price}]
export default function PositionDetail({ pos, head, px, price, isMobile, footer }) {
  const model = useMemo(() => {
    if (!pos || !px) return null;
    const buys = (pos.buys || []).map(([t, p, q]) => ({ t, price: p, qty: q }));
    const sells = (pos.sells || []).map(([t, p, q, r]) => ({ t, price: p, qty: q, realized: r }));
    const events = [...buys.map(b => b.t), ...sells.map(s => s.t)];
    const t0 = events.length ? Math.min(...events) : (px[0] ? Date.parse(px[0].date) : Date.now());
    const priceSeries = px.map(r => ({ t: Date.parse(r.date), price: r.price })).filter(r => r.t >= t0 - 5 * 864e5 && r.price > 0);
    const pxs = [...priceSeries.map(r => r.price), ...buys.map(b => b.price), ...sells.map(s => s.price)].filter(p => p > 0);
    const pMin = Math.max(0.0005, Math.min(...pxs) * 0.8), pMax = Math.max(...pxs) * 1.2;
    let cum = 0; const pnl = [{ t: t0, cum: 0 }];
    [...sells].sort((a, b) => a.t - b.t).forEach(s => { cum += s.realized; pnl.push({ t: s.t, cum }); });
    // Month/quarter x-ticks across the shown range, so the timeline is unmistakable — bare YEAR labels
    // made a year-long span (a buy in Aug '25, the pump in Aug '26) look like recent/today's price.
    const tStart = priceSeries[0]?.t, tEnd = priceSeries.at(-1)?.t;
    const xTicks = [];
    if (tStart && tEnd) {
      const months = (tEnd - tStart) / (30 * 864e5);
      const step = months > 20 ? 3 : months > 9 ? 2 : 1;   // months between ticks
      const m = new Date(Date.UTC(new Date(tStart).getUTCFullYear(), new Date(tStart).getUTCMonth(), 1));
      for (; m.getTime() <= tEnd; m.setUTCMonth(m.getUTCMonth() + step)) if (m.getTime() >= tStart) xTicks.push(m.getTime());
    }
    // Pin the x-axis to the FULL price range (first activity → today) so the chart always shows the
    // whole window — recharts otherwise let the scatter (buys/sells) range shrink the axis, which cut
    // the view off at the last trade (e.g. this owner stopped in Sep '25, so the line vanished there).
    const xDomain = (tStart && tEnd) ? [tStart, tEnd] : ["dataMin", "dataMax"];
    return { buys, sells, priceSeries, pMin, pMax, pnl, realized: cum, xTicks, xDomain };
  }, [pos, px]);
  // "Aug '25" — month + apostrophe-year is unambiguous on an axis and shows the true span.
  const fTick = t => { const d = new Date(t); return d.toLocaleDateString("en-US", { month: "short" }) + " '" + String(d.getUTCFullYear()).slice(2); };

  if (!model) return <div style={{ textAlign: "center", fontFamily: "var(--mono)", color: "var(--faint)", padding: 60 }}>loading…</div>;

  const live = price ?? model.priceSeries.at(-1)?.price ?? pos.avgCost;
  const bag = pos.bag, avg = pos.avgCost || 0;
  const unreal = bag * (live - avg);
  const realized = pos.realized ?? model.realized ?? 0;
  const total = realized + unreal;

  return (
    <div className="tchart" style={{ maxWidth: MAX_W, margin: "0 auto", fontFamily: "var(--sans)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <a href="/deepfield" style={{ fontFamily: "var(--mono)", fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--dim)", textDecoration: "none" }}>← Deep Field</a>
        {head.links?.length > 0 && (
          <span style={{ marginLeft: "auto", display: "flex", gap: 12, fontFamily: "var(--mono)", fontSize: 12.5 }}>
            {head.links.map(l => <a key={l.label} href={l.href} target="_blank" rel="noopener" style={{ color: l.dim ? "var(--dim)" : "var(--live)", textDecoration: "none" }}>{l.label}</a>)}
          </span>
        )}
      </div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 12, letterSpacing: ".04em", color: "var(--live)", marginBottom: 10 }}>
        <span style={{ color: "var(--faint)" }}>spx6900 ~ %</span> {head.cmd}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 2, flexWrap: "wrap" }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: walletGradient(head.seed), flex: "none" }} />
        <h2 style={{ fontFamily: "var(--sans)", fontSize: isMobile ? 26 : 40, fontWeight: 800, color: "var(--tx)", margin: 0, letterSpacing: "-0.02em" }}>{head.title}</h2>
        {head.meta}
      </div>
      <div style={{ height: 3, borderRadius: 2, background: "var(--rainbow)", maxWidth: 620, margin: "13px 0 18px" }} />

      <div style={{ display: "flex", gap: isMobile ? 16 : 28, flexWrap: "wrap", margin: "0 0 18px" }}>
        <Tile label="holds now" value={fM(bag) + " SPX"} sub={fUsd(bag * live)} />
        <Tile label="avg cost" value={fP(avg)} sub={"live " + fP(live)} />
        <Tile label="realized" value={fUsd(realized)} color={realized >= 0 ? GRN : RED} sub={pos.roi ? pos.roi + "× ROI" : ""} />
        <Tile label="unrealized" value={fUsd(unreal)} color={unreal >= 0 ? GRN : RED} sub="on the current bag" />
        <Tile label="total P&L" value={fUsd(total)} color={total >= 0 ? GRN : RED} sub="realized + unrealized" />
      </div>

      <div style={{ fontFamily: "var(--mono)", fontSize: 12.5, color: "var(--dim)", margin: "0 0 6px" }}>WHERE IT BOUGHT &amp; SOLD · <span style={{ color: GRN }}>● buys</span> · <span style={{ color: RED }}>▲ sells</span> · size = amount</div>
      {pos.lotsSuspect && (
        <div style={{ fontFamily: "var(--sans)", fontSize: 12.5, lineHeight: 1.5, color: "#fbbf24", background: "color-mix(in srgb, #fbbf24 12%, transparent)", border: "1px solid color-mix(in srgb, #fbbf24 45%, transparent)", borderRadius: 8, padding: "8px 12px", margin: "0 0 10px" }}>
          ⚠ The sell markers below look inconsistent with this owner&rsquo;s on-chain flow (it&rsquo;s a net accumulator, yet the lot history shows heavy selling). Treat the red triangles as <b>unverified</b> for this cluster — under review.
        </div>
      )}
      <ResponsiveContainer width="100%" height={isMobile ? 340 : 480}>
        <ComposedChart data={model.priceSeries} margin={{ top: 10, right: 20, left: 6, bottom: 6 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis dataKey="t" type="number" scale="time" domain={model.xDomain} allowDataOverflow ticks={model.xTicks} tickFormatter={fTick} minTickGap={24} tick={{ fill: "#94a3b8", fontFamily: MONO, fontSize: 12 }} tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.12)" }} />
          <YAxis scale="log" domain={[model.pMin, model.pMax]} allowDataOverflow ticks={[0.001, 0.01, 0.1, 1].filter(v => v >= model.pMin && v <= model.pMax)} tickFormatter={fP} tick={{ fill: "#8592a6", fontFamily: MONO, fontSize: 11 }} tickLine={false} axisLine={false} width={54} />
          <ZAxis dataKey="qty" range={[40, 520]} />
          <Tooltip content={({ active, payload }) => {
            if (!active || !payload?.length) return null; const p = payload[0].payload;
            const isBuy = p.qty != null && p.realized == null, isSell = p.realized != null;
            return <TipBox><div style={{ fontFamily: MONO, fontSize: 12 }}>
              <div style={{ color: "#e2e8f0", marginBottom: 3 }}>{fDay(p.t)}</div>
              {isBuy && <div style={{ color: GRN }}>bought {fM(p.qty)} SPX @ {fP(p.price)}</div>}
              {isSell && <><div style={{ color: RED }}>sold {fM(p.qty)} @ {fP(p.price)}</div><div style={{ color: p.realized >= 0 ? GRN : RED }}>realized {fUsd(p.realized)}</div></>}
              {!isBuy && !isSell && <div style={{ color: PALE }}>price {fP(p.price)}</div>}
            </div></TipBox>;
          }} />
          <Line dataKey="price" type="monotone" dot={false} stroke={PALE} strokeWidth={1.4} strokeOpacity={0.8} isAnimationActive={false} />
          <ReferenceLine y={avg} stroke={GOLD} strokeDasharray="5 5" strokeOpacity={0.8} label={{ value: "avg cost", fill: GOLD, fontSize: 11, fontFamily: MONO, position: "insideTopLeft" }} />
          <ReferenceLine y={live} stroke="#5eead4" strokeDasharray="2 4" strokeOpacity={0.7} label={{ value: "now", fill: "#5eead4", fontSize: 11, fontFamily: MONO, position: "insideBottomLeft" }} />
          <Scatter data={model.buys} dataKey="price" fill={GRN} fillOpacity={0.55} stroke={GRN} isAnimationActive={false} />
          <Scatter data={model.sells} dataKey="price" fill={RED} fillOpacity={0.6} stroke={RED} shape="triangle" isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>

      <div style={{ fontFamily: "var(--mono)", fontSize: 12.5, color: "var(--dim)", margin: "22px 0 6px" }}>REALIZED P&amp;L OVER TIME <span style={{ color: "var(--faint)" }}>· booked on each sale (cumulative) · unrealized shown live above</span></div>
      <ResponsiveContainer width="100%" height={isMobile ? 240 : 320}>
        <ComposedChart data={model.pnl} margin={{ top: 10, right: 20, left: 6, bottom: 6 }}>
          <defs><linearGradient id="wpnl" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={GRN} stopOpacity={0.5} /><stop offset="100%" stopColor={GRN} stopOpacity={0.05} /></linearGradient></defs>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis dataKey="t" type="number" scale="time" domain={model.xDomain} allowDataOverflow ticks={model.xTicks} tickFormatter={fTick} minTickGap={24} tick={{ fill: "#94a3b8", fontFamily: MONO, fontSize: 12 }} tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.12)" }} />
          <YAxis tickFormatter={fUsd} tick={{ fill: "#8592a6", fontFamily: MONO, fontSize: 11 }} tickLine={false} axisLine={false} width={58} />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.25)" />
          <Tooltip content={({ active, payload }) => {
            if (!active || !payload?.length) return null; const p = payload[0].payload;
            return <TipBox><div style={{ fontFamily: MONO, fontSize: 12 }}><div style={{ color: "#e2e8f0" }}>{fDay(p.t)}</div><div style={{ color: p.cum >= 0 ? GRN : RED }}>realized {fUsd(p.cum)}</div></div></TipBox>;
          }} />
          <Area dataKey="cum" type="stepAfter" stroke={GRN} strokeWidth={1.6} fill="url(#wpnl)" isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>

      {footer}
    </div>
  );
}
