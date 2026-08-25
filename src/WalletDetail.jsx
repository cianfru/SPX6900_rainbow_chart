import { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, ComposedChart, Line, Scatter, Area, XAxis, YAxis, ZAxis, Tooltip, CartesianGrid, ReferenceLine } from "recharts";
import { loadSmartMoney, loadPriceHistory } from "./history-data.js";
import { walletGradient } from "./WalletCard.jsx";
import { MONO, MAX_W, TipBox } from "./chart-ui.jsx";
import { TERMINAL_KEY } from "./terminal-gate-key.js";

// PER-WALLET PAGE (terminal-tier, ?view=wallet&addr=0x…). Shows where a smart-money wallet BOUGHT
// (green orbs on the price curve, sized by size), where it SOLD (red), its live position vs price,
// and a realized-PnL curve. Data is the per-wallet lots emitted by build-smart-money.mjs into
// smart-money.json (terminal-only granularity; the public site stays anonymized). Gated behind the
// terminal passphrase — you arrive here by clicking a wallet on /terminal.

const GRN = "#4ade80", RED = "#f43f5e", GOLD = "#f6a23c", PALE = "#aab6cc";
const short = a => a ? a.slice(0, 6) + "…" + a.slice(-4) : "";
const fUsd = v => { const s = v < 0 ? "−" : ""; const a = Math.abs(v); return s + "$" + (a >= 1e6 ? (a / 1e6).toFixed(2) + "M" : a >= 1e3 ? (a / 1e3).toFixed(1) + "k" : Math.round(a)); };
const fM = v => Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(2) + "M" : Math.abs(v) >= 1e3 ? (v / 1e3).toFixed(0) + "k" : Math.round(v);
const fP = v => v == null ? "" : v < 0.01 ? "$" + v.toFixed(4) : "$" + v.toFixed(3);
const fDay = t => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });

function Tile({ label, value, color, sub }) {
  return (
    <div style={{ minWidth: 118 }}>
      <div style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--dim)" }}>{label}</div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 23, fontWeight: 700, color: color || "var(--tx)", lineHeight: 1.15 }}>{value}</div>
      {sub && <div style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--dim)" }}>{sub}</div>}
    </div>
  );
}

export default function WalletDetail({ wallet, price, isMobile }) {
  const [sm, setSm] = useState(undefined);
  const [px, setPx] = useState(null);
  const unlocked = (() => { try { return localStorage.getItem(TERMINAL_KEY) === "1"; } catch { return false; } })();

  useEffect(() => { if (unlocked) loadSmartMoney().then(d => setSm(d || null)); }, [unlocked]);
  useEffect(() => { if (unlocked) loadPriceHistory().then(setPx); }, [unlocked]);

  const addr = String(wallet || "").toLowerCase();
  const w = sm && Array.isArray(sm.wallets) ? sm.wallets.find(x => x.a === addr) : null;

  const model = useMemo(() => {
    if (!w || !px) return null;
    const buys = (w.buys || []).map(([t, p, q]) => ({ t, price: p, qty: q }));
    const sells = (w.sells || []).map(([t, p, q, r]) => ({ t, price: p, qty: q, realized: r }));
    const events = [...buys.map(b => b.t), ...sells.map(s => s.t)];
    const t0 = events.length ? Math.min(...events) : (px[0] ? Date.parse(px[0].date) : Date.now());
    const priceSeries = px.map(r => ({ t: Date.parse(r.date), price: r.price })).filter(r => r.t >= t0 - 5 * 864e5 && r.price > 0);
    const pxs = [...priceSeries.map(r => r.price), ...buys.map(b => b.price), ...sells.map(s => s.price)].filter(p => p > 0);
    const pMin = Math.max(0.0005, Math.min(...pxs) * 0.8), pMax = Math.max(...pxs) * 1.2;
    // realized-PnL curve: cumulative over the sells, in time
    let cum = 0; const pnl = [{ t: t0, cum: 0 }];
    [...sells].sort((a, b) => a.t - b.t).forEach(s => { cum += s.realized; pnl.push({ t: s.t, cum }); });
    return { buys, sells, priceSeries, pMin, pMax, pnl, realized: cum };
  }, [w, px]);

  if (!unlocked) return (
    <div style={{ maxWidth: 620, margin: "72px auto", textAlign: "center", fontFamily: "var(--sans)", color: "var(--dim)" }}>
      <div style={{ fontSize: 38, marginBottom: 10 }}>🔒</div>
      <p>Wallet pages are part of Deep Field. <a href="/deepfield" style={{ color: "var(--live)" }}>Open Deep Field →</a></p>
    </div>
  );
  if (sm === undefined || px === null) return <div style={{ textAlign: "center", fontFamily: "var(--mono)", color: "var(--faint)", padding: 60 }}>loading wallet…</div>;
  if (!w) return (
    <div style={{ maxWidth: 620, margin: "72px auto", textAlign: "center", fontFamily: "var(--sans)", color: "var(--dim)" }}>
      <p>No smart-money detail for <span style={{ fontFamily: "var(--mono)", color: "var(--tx)" }}>{short(addr)}</span> yet.</p>
      <p style={{ fontSize: 13, color: "var(--faint)" }}>The per-wallet lots appear after the next daily on-chain refresh. <a href="/deepfield" style={{ color: "var(--live)" }}>Back to Deep Field →</a></p>
    </div>
  );

  const live = price ?? (model?.priceSeries?.at(-1)?.price) ?? w.avgCost;
  const bag = w.bal, avg = w.avgCost || 0;
  const unreal = bag * (live - avg);
  const realized = w.realized ?? model?.realized ?? 0;
  const total = realized + unreal;

  return (
    <div className="tchart" style={{ maxWidth: MAX_W, margin: "0 auto", fontFamily: "var(--sans)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <a href="/deepfield" style={{ fontFamily: "var(--mono)", fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--dim)", textDecoration: "none" }}>← Deep Field</a>
        <span style={{ marginLeft: "auto", display: "flex", gap: 12, fontFamily: "var(--mono)", fontSize: 12.5 }}>
          <a href={`https://app.zerion.io/${addr}/overview`} target="_blank" rel="noopener" style={{ color: "var(--live)", textDecoration: "none" }}>Zerion ↗</a>
          <a href={`https://etherscan.io/address/${addr}`} target="_blank" rel="noopener" style={{ color: "var(--dim)", textDecoration: "none" }}>Etherscan ↗</a>
        </span>
      </div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 12, letterSpacing: ".04em", color: "var(--live)", marginBottom: 10 }}>
        <span style={{ color: "var(--faint)" }}>spx6900 ~ %</span> open wallet/{short(addr)}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 2, flexWrap: "wrap" }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: walletGradient(addr), flex: "none" }} />
        <h2 style={{ fontFamily: "var(--sans)", fontSize: isMobile ? 26 : 40, fontWeight: 800, color: "var(--tx)", margin: 0, letterSpacing: "-0.02em" }}>{short(addr)}</h2>
        <span style={{ fontFamily: "var(--mono)", fontSize: 12, padding: "3px 9px", borderRadius: 999, background: inProfit ? "rgba(74,222,128,0.14)" : "rgba(244,63,94,0.14)", color: inProfit ? GRN : RED }}>{inProfit ? "in profit" : "underwater"}</span>
      </div>
      <div style={{ height: 3, borderRadius: 2, background: "var(--rainbow)", maxWidth: 620, margin: "13px 0 18px" }} />

      <div style={{ display: "flex", gap: isMobile ? 16 : 28, flexWrap: "wrap", margin: "0 0 18px" }}>
        <Tile label="holds now" value={fM(bag) + " SPX"} sub={fUsd(bag * live)} />
        <Tile label="avg cost" value={fP(avg)} sub={"live " + fP(live)} />
        <Tile label="realized" value={fUsd(realized)} color={realized >= 0 ? GRN : RED} sub={w.roi ? w.roi + "× ROI" : ""} />
        <Tile label="unrealized" value={fUsd(unreal)} color={unreal >= 0 ? GRN : RED} sub="on the current bag" />
        <Tile label="total P&L" value={fUsd(total)} color={total >= 0 ? GRN : RED} sub="realized + unrealized" />
      </div>

      <div style={{ fontFamily: "var(--mono)", fontSize: 12.5, color: "var(--dim)", margin: "0 0 6px" }}>WHERE IT BOUGHT &amp; SOLD · <span style={{ color: GRN }}>● buys</span> · <span style={{ color: RED }}>▲ sells</span> · size = amount</div>
      <ResponsiveContainer width="100%" height={isMobile ? 340 : 480}>
        <ComposedChart data={model.priceSeries} margin={{ top: 10, right: 20, left: 6, bottom: 6 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={t => new Date(t).getFullYear()} tick={{ fill: "#94a3b8", fontFamily: MONO, fontSize: 12 }} tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.12)" }} />
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
          <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={t => new Date(t).getFullYear()} tick={{ fill: "#94a3b8", fontFamily: MONO, fontSize: 12 }} tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.12)" }} />
          <YAxis tickFormatter={fUsd} tick={{ fill: "#8592a6", fontFamily: MONO, fontSize: 11 }} tickLine={false} axisLine={false} width={58} />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.25)" />
          <Tooltip content={({ active, payload }) => {
            if (!active || !payload?.length) return null; const p = payload[0].payload;
            return <TipBox><div style={{ fontFamily: MONO, fontSize: 12 }}><div style={{ color: "#e2e8f0" }}>{fDay(p.t)}</div><div style={{ color: p.cum >= 0 ? GRN : RED }}>realized {fUsd(p.cum)}</div></div></TipBox>;
          }} />
          <Area dataKey="cum" type="stepAfter" stroke={GRN} strokeWidth={1.6} fill="url(#wpnl)" isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>

      <div style={{ fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--faint)", textAlign: "center", marginTop: 16, lineHeight: 1.6, maxWidth: 820, marginInline: "auto" }}>
        Buys are priced at the day they landed; realized P&amp;L is average-cost (booked when coins are sold), unrealized is the current bag marked to the live price.
        On-chain has no identity — a proven operator moving to a fresh wallet resets. Terminal-only view; a positioning read, not financial advice.
      </div>
    </div>
  );
}
