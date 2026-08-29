import { useMemo, useState, useEffect } from "react";
import { ResponsiveContainer, ComposedChart, Area, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Cell } from "recharts";
import { loadSmartMoney, loadEntities } from "./history-data.js";
import { SANS, MONO, MAX_W, Metric, TipBox, Explain, ViewTabs } from "./chart-ui.jsx";
import { useDailyTier } from "./DailyTier.jsx";
import { TERMINAL_KEY } from "./terminal-gate-key.js";

// Coarsen the daily series to one point per calendar month for the free tier: held + price are the
// month's LAST value (a level), net flow is the month's SUM (a flow). Daily is the members view.
const toMonthly = rows => {
  const by = new Map();
  for (const r of rows) {
    const k = r.d.slice(0, 7);
    const g = by.get(k) || { d: r.d, t: r.t, held: r.held, heldM: r.heldM, flow: 0, flowK: 0, price: r.price };
    g.d = r.d; g.t = r.t; g.held = r.held; g.heldM = r.heldM; g.price = r.price;   // last of month
    g.flow += r.flow; g.flowK = g.flow / 1e3;                                       // sum of month
    by.set(k, g);
  }
  return [...by.values()];
};
const newQMonthly = nq => {
  const by = new Map();
  for (const r of nq) {
    const k = r.d.slice(0, 7);
    const g = by.get(k) || { d: r.d, t: r.t, n: 0, price: r.price };
    g.d = r.d; g.t = r.t; g.price = r.price; g.n += r.n;
    by.set(k, g);
  }
  return [...by.values()];
};
const yearTicksOf = rows => { const seen = new Set(), out = []; for (const r of rows) { const y = r.d.slice(0, 4); if (!seen.has(y)) { seen.add(y); out.push(r.d); } } return out; };

// SMART MONEY, the live cohort of proven top-timers (ROI ≥5×, real capital in, still holding),
// recomputed every refresh so it's never a frozen list. Two reads:
//   "Holdings", aggregate SPX they hold over time vs price (they accumulated cheap, sold the run-up).
//   "Net flow", weekly accumulate (green) / distribute (red); this is the forward signal, it flips
//                green the week the proven timers start buying again. Right now it hasn't.
// Aggregate only, no wallet is ever named, so there is nothing to blindly follow.

const GOLD = "#f6a23c", GRN = "#4ade80", RED = "#f43f5e";
const fmtM = v => Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + "M" : (v / 1e3).toFixed(0) + "k";
const fmtP = v => v == null ? "" : v < 0.01 ? "$" + v.toFixed(4) : "$" + v.toFixed(2);
const usd = v => v >= 1e6 ? "$" + (v / 1e6).toFixed(1) + "M" : "$" + Math.round(v / 1e3) + "k";

const shortA = a => a.slice(0, 6) + "…" + a.slice(-4);
// coloured signed balance-change cell: +/− with green/red, "0" when genuinely flat over the window,
// "—" only when the value isn't computed yet (so a real zero reads clearly, not as an empty dot).
const deltaCell = v => {
  if (v == null) return <span style={{ color: "#475569" }}>—</span>;
  if (Math.abs(v) < 1) return <span style={{ color: "#64748b" }}>0</span>;
  const s = (v > 0 ? "+" : "−") + fmtM(Math.abs(v));
  return <span style={{ color: v > 0 ? GRN : RED, fontWeight: 600 }}>{s}</span>;
};

// PUBLIC layer — anonymized, no addresses, no follow-list.
function SmartWalletAnon({ wallets, isMobile }) {
  return (
    <div style={{ maxWidth: 560, margin: "2px auto 18px", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, background: "rgba(255,255,255,0.02)", padding: "12px 15px" }}>
      <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: "#94a3b8", marginBottom: 8 }}>The wallets · held + 30-day move</div>
      {wallets.slice(0, 12).map((w, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "6px 0", borderTop: i ? "1px solid rgba(255,255,255,0.05)" : "none", fontFamily: MONO, fontSize: 13 }}>
          <span style={{ color: "#e2e8f0", fontWeight: 600, flex: "1 1 auto" }}>Wallet {i + 1}</span>
          <span style={{ color: "#f6a23c", minWidth: 92, textAlign: "right" }}>{fmtM(w.bal)} SPX</span>
          <span style={{ color: (w.d30 || 0) > 0 ? GRN : (w.d30 || 0) < 0 ? RED : "#64748b", minWidth: 96, textAlign: "right" }}>{(w.d30 || 0) === 0 ? "flat 30d" : (w.d30 > 0 ? "+" : "−") + fmtM(Math.abs(w.d30)) + " 30d"}</span>
        </div>
      ))}
      <div style={{ fontFamily: SANS, fontSize: 11.5, color: "#64748b", marginTop: 10, lineHeight: 1.5 }}>
        Anonymized on purpose — independent traders (not whale clusters). The chain is public; we just don't hand out a follow-list.
        {" "}<a href="/?view=next&deepfield=1" style={{ color: "#5eead4", textDecoration: "none" }}>Deep Field members</a> see the real addresses + each wallet's buy/sell P&L page.
      </div>
    </div>
  );
}

// MEMBER layer (Deep Field unlocked) — real addresses, held bag, 24h/7d/30d, ROI; each row opens the
// wallet's own page (buy orbs + realized/unrealized P&L). Horizontal-scroll wrapper so it holds up on
// a phone instead of squashing the columns.
function SmartWalletTable({ wallets, isMobile }) {
  const th = { fontFamily: MONO, fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: "#94a3b8", fontWeight: 600, textAlign: "right", padding: "0 0 8px", whiteSpace: "nowrap" };
  const td = { fontFamily: MONO, fontSize: 13, textAlign: "right", padding: "7px 0", whiteSpace: "nowrap", borderTop: "1px solid rgba(255,255,255,0.06)" };
  return (
    <div style={{ maxWidth: 720, margin: "2px auto 18px", border: "1px solid rgba(94,234,212,0.22)", borderRadius: 12, background: "rgba(94,234,212,0.03)", padding: "12px 15px" }}>
      <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: "#5eead4", marginBottom: 8 }}>The wallets · terminal view · real addresses · tap → P&L page</div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 460 }}>
          <thead><tr>
            <th style={{ ...th, textAlign: "left" }}>wallet</th>
            <th style={th}>held</th><th style={th}>24h</th><th style={th}>7d</th><th style={th}>30d</th><th style={th}>ROI</th>
          </tr></thead>
          <tbody>
            {wallets.slice(0, 20).map((w, i) => (
              <tr key={w.a}>
                <td style={{ ...td, textAlign: "left" }}>
                  <span style={{ color: "#64748b", marginRight: 8 }}>{i + 1}</span>
                  <a href={`/?view=wallet&addr=${w.a}`} title={`${w.a} — open P&L page`} style={{ color: "#5eead4", textDecoration: "none", fontWeight: 600 }}>{shortA(w.a)}</a>
                  {!isMobile && <a href={`https://app.zerion.io/${w.a}/overview`} target="_blank" rel="noopener noreferrer" title="open in Zerion" style={{ color: "#8592a6", textDecoration: "none", marginLeft: 8, fontSize: 11 }}>Zerion ↗</a>}
                </td>
                <td style={{ ...td, color: "#f6a23c", fontWeight: 700 }}>{fmtM(w.bal)}</td>
                <td style={td}>{deltaCell(w.d1)}</td>
                <td style={td}>{deltaCell(w.d7)}</td>
                <td style={td}>{deltaCell(w.d30)}</td>
                <td style={{ ...td, color: "#4ade80" }}>{w.roi ? w.roi + "×" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontFamily: SANS, fontSize: 11.5, color: "#64748b", marginTop: 10, lineHeight: 1.5 }}>
        Held = current bag; 24h / 7d / 30d = the change in that bag over each window (<span style={{ color: GRN }}>green</span> adding, <span style={{ color: RED }}>red</span> shedding). Tap an address for its buy/sell orbs + realized &amp; live P&L. Independent traders (cluster wallets excluded). Not a follow signal.
      </div>
    </div>
  );
}

// Shared collapsible section, terminal-styled, tap-to-open on mobile.
function Drop({ title, sub, accent = "#5eead4", children, defaultOpen = false }) {
  return (
    <details open={defaultOpen} style={{ maxWidth: 720, margin: "12px auto 0", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, background: "rgba(255,255,255,0.02)", padding: "0 15px" }}>
      <summary style={{ cursor: "pointer", listStyle: "none", padding: "13px 2px", fontFamily: MONO, fontSize: 13, color: "#e2e8f0", display: "flex", alignItems: "center", gap: 8, userSelect: "none" }}>
        <span style={{ color: accent }}>▸</span><span style={{ fontWeight: 700 }}>{title}</span>{sub && <span style={{ color: "#64748b", fontWeight: 400 }}>· {sub}</span>}
      </summary>
      <div style={{ paddingBottom: 14 }}>{children}</div>
    </details>
  );
}

const netCell = v => {
  if (v == null) return <span style={{ color: "#475569" }}>—</span>;
  if (Math.abs(v) < 1) return <span style={{ color: "#64748b" }}>0</span>;
  return <span style={{ color: v > 0 ? GRN : RED, fontWeight: 600 }}>{(v > 0 ? "+" : "−") + fmtM(Math.abs(v))}</span>;
};

// Whale-cluster owners (entities.json) — the flip side of the independent smart-money traders. LOCKED:
// generic (owner #, wallet count, combined bag, cohort net) — no addresses. UNLOCKED: each owner opens
// to its member wallets, every one a Zerion link with its own balance + 30d flow.
function ClustersInner({ ent, unlocked, isMobile }) {
  if (!ent) return <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", padding: "4px 2px" }}>Loading clusters…</div>;
  const held = ent.heldSupply || 0;
  const list = (ent.entities || []).filter(e => !e.flagged && (e.bal || 0) > 0).sort((a, b) => (b.bal || 0) - (a.bal || 0)).slice(0, unlocked ? 15 : 8);
  if (!list.length) return <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", padding: "4px 2px" }}>Being reconstructed — appears after the next on-chain refresh.</div>;
  const th = { fontFamily: MONO, fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: "#94a3b8", fontWeight: 600, textAlign: "right", padding: "0 0 8px", whiteSpace: "nowrap" };
  const td = { fontFamily: MONO, fontSize: 13, textAlign: "right", padding: "7px 0", whiteSpace: "nowrap", borderTop: "1px solid rgba(255,255,255,0.06)" };
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: unlocked ? 460 : 320 }}>
        <thead><tr>
          <th style={{ ...th, textAlign: "left" }}>owner</th>
          <th style={th}>wallets</th><th style={th}>combined</th><th style={th}>24h</th><th style={th}>7d</th><th style={th}>30d</th>
        </tr></thead>
        <tbody>
          {list.map((e, i) => {
            const pct = held ? (e.bal / held * 100) : null;
            return (
              <tr key={e.id}>
                <td style={{ ...td, textAlign: "left" }}>
                  <span style={{ color: "#64748b", marginRight: 8 }}>{i + 1}</span>
                  {unlocked
                    ? <a href={`https://app.zerion.io/${e.id}/overview`} target="_blank" rel="noopener noreferrer" title={e.id} style={{ color: "#5eead4", textDecoration: "none", fontWeight: 600 }}>{shortA(e.id)}</a>
                    : <span style={{ color: "#e2e8f0", fontWeight: 600 }}>Owner {i + 1}</span>}
                </td>
                <td style={{ ...td, color: "#94a3b8" }}>{e.size}</td>
                <td style={{ ...td, color: "#a78bfa", fontWeight: 700 }}>{fmtM(e.bal)}{pct != null && !isMobile ? <span style={{ color: "#64748b", fontWeight: 400 }}> · {pct.toFixed(pct < 1 ? 2 : 1)}%</span> : null}</td>
                <td style={td}>{netCell(e.d1)}</td><td style={td}>{netCell(e.d7)}</td><td style={td}>{netCell(e.d30)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {unlocked && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: "pointer", fontFamily: MONO, fontSize: 12, color: "#8592a6" }}>member wallets by owner ↓</summary>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 10 }}>
            {list.map((e, i) => (
              <div key={e.id} style={{ fontFamily: MONO, fontSize: 12.5 }}>
                <div style={{ color: "#94a3b8", marginBottom: 4 }}>Owner {i + 1} · {shortA(e.id)} · {e.size} wallets</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {(e.wallets || []).map(a => (
                    <a key={a} href={`https://app.zerion.io/${a}/overview`} target="_blank" rel="noopener noreferrer" title={a}
                      style={{ color: "#5eead4", textDecoration: "none", border: "1px solid rgba(94,234,212,0.25)", borderRadius: 6, padding: "3px 8px" }}>
                      {shortA(a)}{(e.walletBal || {})[a] > 0 ? <span style={{ color: "#64748b" }}> · {fmtM(e.walletBal[a])}</span> : null} ↗
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
      <div style={{ fontFamily: SANS, fontSize: 11.5, color: "#64748b", marginTop: 10, lineHeight: 1.5 }}>
        Wallets one owner controls, linked from on-chain SPX fund/drain flows. 24h/7d/30d = the whole owner's balance change. {unlocked
          ? "Each address opens in Zerion."
          : <>Addresses are shown to <a href="/?view=next&deepfield=1" style={{ color: "#5eead4", textDecoration: "none" }}>Deep Field members</a>.</>}
      </div>
    </div>
  );
}

export default function SmartMoneyChart({ isMobile, initialView }) {
  const [data, setData] = useState(null);
  const [view, setView] = useState(() => ["holdings", "flow", "newq"].includes(initialView) ? initialView : "holdings");   // "holdings" | "flow"
  // Two-layer reveal: the public sees "Wallet 1/2/3" anonymized; a Deep Field member (TERMINAL_KEY set)
  // sees the real addresses, daily/7d/30d balance, ROI and a link into each wallet's P&L page.
  const [unlocked] = useState(() => { try { return localStorage.getItem(TERMINAL_KEY) === "1"; } catch { return false; } });
  const [ent, setEnt] = useState(null);   // entities.json — for the "clusters" dropdown
  useEffect(() => { let off = false; loadSmartMoney().then(d => { if (!off) setData(d || { empty: true }); }); return () => { off = true; }; }, []);
  useEffect(() => { let off = false; loadEntities().then(d => { if (!off) setEnt(d || { entities: [] }); }); return () => { off = true; }; }, []);

  const model = useMemo(() => {
    if (!data || data.empty) return null;
    const rows = data.weeks.map(([d, held, flow, price]) => ({ d, t: Date.parse(d), held, heldM: held / 1e6, flow, flowK: flow / 1e3, price })).filter(r => Number.isFinite(r.t));
    const pxs = rows.map(r => r.price).filter(p => p > 0);
    const pMin = Math.max(0.0015, Math.min(...pxs) * 0.85), pMax = Math.max(...pxs) * 1.15;
    const yearTicks = (() => { const seen = new Set(), out = []; for (const r of rows) { const y = r.d.slice(0, 4); if (!seen.has(y)) { seen.add(y); out.push(r.d); } } return out; })();
    // new-qualifiers series joined to the price at each qualification date (bars where a wallet minted itself)
    const priceAt = (t) => { let b = pxs[0]; for (const r of rows) { if (r.t <= t) b = r.price; else break; } return b; };
    const newQ = (data.newQualifiers || []).map(([d, c]) => ({ d, t: Date.parse(d), n: c, price: priceAt(Date.parse(d)) })).filter(r => Number.isFinite(r.t));
    return { rows, pMin, pMax, yearTicks, newQ };
  }, [data]);

  // Members tier: the free view is coarsened to MONTHLY, the daily series is behind the passphrase.
  const { daily, controls } = useDailyTier("#f6a23c");

  if (!data) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading…</div>;
  if (!model) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Being reconstructed, check back after the next on-chain refresh.</div>;
  const { pMin, pMax, newQ: newQAll } = model;
  const S = data;
  const rows = daily ? model.rows : toMonthly(model.rows);
  const newQ = daily ? newQAll : newQMonthly(newQAll);
  const yearTicks = yearTicksOf(rows);
  const newQYearTicks = yearTicksOf(newQ);
  const fDate = ts => new Date(ts).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  const fDay = ts => new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const flowVerb = S.flow.w12 > 2 ? { t: "buying again", c: GRN } : S.flow.w12 < -1 ? { t: "trimming, not buying", c: "#f59e0b" } : { t: "holding, not buying", c: "#94a3b8" };

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="What is SPX6900's smart money doing?" accent="#f6a23c">
        The <strong style={{ color: "#f6a23c" }}>proven top-timers</strong>, wallets that put in real capital (≥$25k), booked a <strong style={{ color: "#e2e8f0" }}>≥5× return by actually selling</strong>, and still hold a bag.
        They <strong style={{ color: "#e2e8f0" }}>accumulated cheap and distributed into the run-up</strong>. Recomputed every refresh, so it's a living desk. {unlocked
          ? <>You&apos;re in the <strong style={{ color: "#5eead4" }}>Deep Field view</strong> — real addresses, daily balances, and a P&amp;L page per wallet below.</>
          : <>Wallets are shown <strong style={{ color: "#e2e8f0" }}>anonymized (Wallet 1, 2, 3…)</strong> — independent traders, no follow-list.</>}
        Right now they're <strong style={{ color: flowVerb.c }}>{flowVerb.t}</strong>; the net-flow flips green the week they start buying again.
      </Explain>

      {controls}

      <ViewTabs tabs={[["holdings", "Holdings vs price"], ["flow", "Net flow"], ...(newQ.length ? [["newq", "New timers"]] : [])]} value={view} onChange={setView} />

      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", margin: "10px 0 14px", flexWrap: "wrap" }}>
        <Metric label="live wallets" value={S.cohortSize} color="#f6a23c" sub="proven timers" />
        <Metric label="still hold" value={usd(S.heldUsd)} color="#e2e8f0" sub={fmtM(S.heldNow) + " SPX"} />
        <Metric label="median return" value={S.medianRoi + "×"} color="#4ade80" sub="realized" />
        <Metric label="new (90d)" value={S.newQual90 ?? 0} color={S.newQual90 > 3 ? "#f43f5e" : "#94a3b8"} sub="minted top-sellers" />
      </div>

      {/* Two drill-down dropdowns. Collapsed by default — the aggregate (money in/out) above is what
          everyone sees; open a dropdown for the granular layer. PUBLIC = generic (anon wallets, "Owner N"
          clusters); MEMBER (Deep Field unlocked) = real addresses, 24h/7d/30d, and P&L pages. */}
      {Array.isArray(S.wallets) && S.wallets.length > 0 && (
        <Drop title="Smart money · the wallets" accent="#f6a23c"
          sub={unlocked ? `${S.wallets.length} independent traders` : `${S.wallets.length} traders · members see addresses`}>
          {unlocked ? <SmartWalletTable wallets={S.wallets} isMobile={isMobile} /> : <SmartWalletAnon wallets={S.wallets} isMobile={isMobile} />}
        </Drop>
      )}
      {ent && (ent.entities || []).some(e => !e.flagged && (e.bal || 0) > 0) && (
        <Drop title="Whale clusters · the owners" accent="#a78bfa"
          sub={unlocked ? "linked owners · daily/weekly/30d" : "members see the wallets"}>
          <ClustersInner ent={ent} unlocked={unlocked} isMobile={isMobile} />
        </Drop>
      )}
      <div style={{ height: 8 }} />

      {view === "holdings" ? (
        <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
          <ComposedChart data={rows} margin={{ top: 12, right: 56, left: 6, bottom: 6 }}>
            <defs><linearGradient id="smhold" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={GOLD} stopOpacity={0.5} /><stop offset="100%" stopColor={GOLD} stopOpacity={0.04} /></linearGradient></defs>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="d" ticks={yearTicks} tickFormatter={d => d.slice(0, 4)} tick={{ fill: "#94a3b8", fontFamily: MONO, fontSize: 12 }} tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.12)" }} />
            <YAxis yAxisId="h" tickFormatter={v => v + "M"} tick={{ fill: "#e0a94b", fontFamily: MONO, fontSize: 12 }} tickLine={false} axisLine={false} width={48} />
            <YAxis yAxisId="p" orientation="right" scale="log" domain={[pMin, pMax]} allowDataOverflow ticks={[0.001, 0.01, 0.1, 1].filter(v => v >= pMin && v <= pMax)} tickFormatter={fmtP} tick={{ fill: "#8592a6", fontFamily: MONO, fontSize: 11 }} tickLine={false} axisLine={false} width={50} />
            <Tooltip content={({ active, payload }) => {
              if (!active || !payload?.length) return null; const r = payload[0].payload;
              return <TipBox><div style={{ fontFamily: MONO, fontSize: 12 }}>
                <div style={{ color: "#e2e8f0", marginBottom: 3 }}>{fDate(r.t)}</div>
                <div style={{ color: GOLD }}>{fmtM(r.held)} SPX held</div>
                <div style={{ color: "#94a3b8" }}>price {fmtP(r.price)}</div>
              </div></TipBox>;
            }} />
            <Area yAxisId="h" dataKey="heldM" type="monotone" stroke={GOLD} strokeWidth={1.5} fill="url(#smhold)" isAnimationActive={false} />
            <Line yAxisId="p" dataKey="price" type="monotone" dot={false} stroke="#aab6cc" strokeWidth={1.6} strokeOpacity={0.85} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      ) : view === "flow" ? (
        <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
          <ComposedChart data={rows} margin={{ top: 12, right: 56, left: 6, bottom: 6 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="d" ticks={yearTicks} tickFormatter={d => d.slice(0, 4)} tick={{ fill: "#94a3b8", fontFamily: MONO, fontSize: 12 }} tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.12)" }} />
            <YAxis yAxisId="f" tickFormatter={v => (v > 0 ? "+" : "") + v / 1000 + "M"} tick={{ fill: "#94a3b8", fontFamily: MONO, fontSize: 12 }} tickLine={false} axisLine={false} width={52} />
            <YAxis yAxisId="p" orientation="right" scale="log" domain={[pMin, pMax]} allowDataOverflow ticks={[0.001, 0.01, 0.1, 1].filter(v => v >= pMin && v <= pMax)} tickFormatter={fmtP} tick={{ fill: "#8592a6", fontFamily: MONO, fontSize: 11 }} tickLine={false} axisLine={false} width={50} />
            <ReferenceLine yAxisId="f" y={0} stroke="rgba(255,255,255,0.25)" />
            <Tooltip cursor={{ fill: "rgba(255,255,255,0.06)" }} content={({ active, payload }) => {
              if (!active || !payload?.length) return null; const r = payload.find(p => p.payload?.flow != null)?.payload; if (!r) return null;
              return <TipBox><div style={{ fontFamily: MONO, fontSize: 12 }}>
                <div style={{ color: "#e2e8f0", marginBottom: 3 }}>{fDay(r.t)}</div>
                <div style={{ color: r.flow >= 0 ? GRN : RED }}>{r.flow >= 0 ? "+" : ""}{fmtM(r.flow)} SPX {r.flow >= 0 ? "accumulated" : "distributed"}</div>
                <div style={{ color: "#94a3b8" }}>price {fmtP(r.price)}</div>
              </div></TipBox>;
            }} />
            <Bar yAxisId="f" dataKey="flowK" isAnimationActive={false}>
              {rows.map((r, i) => <Cell key={i} fill={r.flow >= 0 ? GRN : RED} fillOpacity={0.85} />)}
            </Bar>
            <Line yAxisId="p" dataKey="price" type="monotone" dot={false} stroke="#aab6cc" strokeWidth={1.4} strokeOpacity={0.8} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
          <ComposedChart data={newQ} margin={{ top: 12, right: 56, left: 6, bottom: 6 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="d" ticks={newQYearTicks} tickFormatter={d => d.slice(0, 4)} tick={{ fill: "#94a3b8", fontFamily: MONO, fontSize: 12 }} tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.12)" }} />
            <YAxis yAxisId="n" allowDecimals={false} tick={{ fill: "#94a3b8", fontFamily: MONO, fontSize: 12 }} tickLine={false} axisLine={false} width={40} />
            <YAxis yAxisId="p" orientation="right" scale="log" domain={[pMin, pMax]} allowDataOverflow ticks={[0.001, 0.01, 0.1, 1].filter(v => v >= pMin && v <= pMax)} tickFormatter={fmtP} tick={{ fill: "#8592a6", fontFamily: MONO, fontSize: 11 }} tickLine={false} axisLine={false} width={50} />
            <Tooltip cursor={{ fill: "rgba(255,255,255,0.06)" }} content={({ active, payload }) => {
              if (!active || !payload?.length) return null; const r = payload.find(p => p.payload?.n != null)?.payload; if (!r) return null;
              return <TipBox><div style={{ fontFamily: MONO, fontSize: 12 }}>
                <div style={{ color: "#e2e8f0", marginBottom: 3 }}>{fDay(r.t)}</div>
                <div style={{ color: "#f6a23c" }}>{r.n} wallet{r.n > 1 ? "s" : ""} first hit 5×</div>
                <div style={{ color: "#94a3b8" }}>price {fmtP(r.price)}</div>
              </div></TipBox>;
            }} />
            <Bar yAxisId="n" dataKey="n" fill="#f6a23c" fillOpacity={0.85} isAnimationActive={false} />
            <Line yAxisId="p" dataKey="price" type="monotone" dot={false} stroke="#aab6cc" strokeWidth={1.4} strokeOpacity={0.8} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      )}

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 16, lineHeight: 1.65, maxWidth: 840, marginInline: "auto" }}>
        {view === "holdings"
          ? <>SPX held over time by the {S.cohortSize} live smart-money wallets (gold) vs price (pale). They peaked at <strong style={{ color: "#f6a23c" }}>{fmtM(S.peak)}</strong> when SPX was ~{fmtP(S.peakPrice)} and distributed into the run-up, now <strong style={{ color: "#e2e8f0" }}>{fmtM(S.heldNow)}</strong>.</>
          : view === "flow"
          ? <>Net position change of the cohort, <strong style={{ color: "#4ade80" }}>green = accumulating</strong>, <strong style={{ color: "#f43f5e" }}>red = distributing</strong>. This is the forward signal: it turns green the week the proven timers start buying again. Last quarter: <strong style={{ color: flowVerb.c }}>{S.flow.w12 > 0 ? "+" : ""}{S.flow.w12}%</strong>.</>
          : <>Wallets <strong style={{ color: "#f6a23c" }}>first crossing the bar</strong> (≥$25k in, realized ≥5×) each period, the moment a wallet mints itself as a proven top-seller. Spikes cluster at price tops: a <strong style={{ color: "#e2e8f0" }}>burst of new qualifiers = distribution starting</strong>. Last 90 days: <strong style={{ color: S.newQual90 > 3 ? "#f43f5e" : "#e2e8f0" }}>{S.newQual90 ?? 0}</strong>. Counts every wallet that crossed, even if it later left.</>}
        <br />Qualifies on realized (sold) profit only, so a wallet quietly accumulating the bottom is invisible until it sells; average-cost proxy; on-chain has no identity (a fresh wallet resets). Not a signal.
      </div>
    </div>
  );
}
