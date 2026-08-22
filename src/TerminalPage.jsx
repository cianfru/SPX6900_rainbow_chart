import { useEffect, useState, useRef } from "react";
import { TERMINAL_KEY, isValidAccess } from "./terminal-gate-key.js";
import { CITY_KEY } from "./city-gate-key.js";
import { MenuBtn, useHoverType } from "./chart-ui.jsx";

// THE TERMINAL (/terminal) — the owner's daily intel one-pager, kept SEPARATE from the post-control
// panel so the "what's happening on-chain today" read isn't tangled up with the "which card to fire"
// flow. Renders public/daily-snapshot.json (built in the snapshot cron) as delta tables: valuation &
// buy-zone, holders & conviction, exchange flow, whale-cohort net buy/sell (1d/7d/30d), smart money,
// technicals. Password-gated (own passphrase, see terminal-gate-key.js) and styled with the site's
// .tzone design tokens so it's theme-aware (light/dark) and squared like the rest of the app.
//
// The data is deploy-ignored (read via the /api/control raw proxy, same as the control panel), so it's
// always current from the daily cron with no redeploy. Honest scope: the gate is a curtain (see key).

const fnv = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

function fmtVal(v, fmt) {
  if (v == null || !isFinite(v)) return "—";
  switch (fmt) {
    case "int": return Math.round(v).toLocaleString();
    case "m": return (v / 1e6).toFixed(1) + "M";
    case "usdm": { const a = Math.abs(v); return (v < 0 ? "−" : "") + "$" + (a >= 1e6 ? (a / 1e6).toFixed(1) + "M" : a >= 1e3 ? (a / 1e3).toFixed(0) + "k" : Math.round(a)); }
    case "pct": return v.toFixed(1) + "%";
    case "x": return v.toFixed(2) + "×";
    case "pctile": return Math.round(v * 100) + "/100";
    case "num3": return v.toFixed(3);
    case "eth": return v.toFixed(3) + "Ξ";
    case "spx": return Math.round(v).toLocaleString() + " SPX";
    default: return String(v);
  }
}
// 7d/30d change for a market-conditions gauge. Every gauge is oriented low = cheap, so a DECREASE
// (moved cheaper) reads green and an increase (dearer) reads red — uniform across all of them.
function condDelta(v, fmt) {
  const eps = fmt === "x" ? 0.005 : fmt === "score" ? 0.5 : 0.05;
  if (v == null || !isFinite(v) || Math.abs(v) < eps) return { s: "·", cls: "tmdz" };
  const sign = v > 0 ? "+" : "−", a = Math.abs(v);
  let mag;
  switch (fmt) {
    case "score": mag = Math.round(a).toString(); break;
    case "x": mag = a.toFixed(2); break;
    case "pct": case "pctPlain": mag = a.toFixed(1) + "pp"; break;
    case "usdm": mag = "$" + (a >= 1e6 ? (a / 1e6).toFixed(1) + "M" : a >= 1e3 ? (a / 1e3).toFixed(0) + "k" : Math.round(a)); break;
    default: mag = a.toFixed(2);
  }
  return { s: sign + mag, cls: v < 0 ? "tmup" : "tmdn" };   // cheaper (down) = green · dearer (up) = red
}

function Delta({ d, fmt, goodUp }) {
  if (d == null || !isFinite(d)) return <span className="tmdz">—</span>;
  const eps = (fmt === "x" || fmt === "num3" || fmt === "pct") ? 0.005 : (fmt === "eth") ? 0.0005 : 1e-9;
  if (Math.abs(d) < eps) return <span className="tmdz">·</span>;
  const good = (d > 0) === !!goodUp, sign = d > 0 ? "+" : "−", a = Math.abs(d);
  let mag;
  switch (fmt) {
    case "int": mag = Math.round(a).toLocaleString(); break;
    case "m": mag = (a / 1e6).toFixed(a / 1e6 < 1 ? 2 : 1) + "M"; break;
    case "usdm": mag = "$" + (a >= 1e6 ? (a / 1e6).toFixed(1) + "M" : a >= 1e3 ? (a / 1e3).toFixed(0) + "k" : Math.round(a)); break;
    case "pct": mag = a.toFixed(2) + "pp"; break;
    case "x": mag = a.toFixed(2); break;
    case "pctile": mag = Math.round(a * 100).toString(); break;
    case "num3": mag = a.toFixed(3); break;
    case "eth": mag = a.toFixed(3) + "Ξ"; break;
    case "spx": mag = Math.round(a).toLocaleString(); break;
    default: mag = String(a);
  }
  return <span className={good ? "tmup" : "tmdn"}>{sign}{mag}</span>;
}

// An (i) info chip: the explanation lives in a tooltip instead of always-visible body text, so the
// desk stays scannable. Hover on desktop, tap on mobile (toggles). The popover is position:FIXED,
// measured from the icon — so it can't be clipped by an ancestor's overflow (the tables scroll-x).
function Info({ text }) {
  const [pos, setPos] = useState(null);   // null = closed · {x,y} = open at these viewport coords
  const ref = useRef(null);
  if (!text) return null;
  const open = () => { const r = ref.current?.getBoundingClientRect(); if (r) setPos({ x: r.left, y: r.bottom + 6 }); };
  const close = () => setPos(null);
  return (
    <span className="tminfo" ref={ref} tabIndex={0}
      onMouseEnter={open} onMouseLeave={close} onFocus={open} onBlur={close}
      onClick={e => { e.stopPropagation(); pos ? close() : open(); }}>
      <span className="tminfo-i" aria-label="More info">i</span>
      {pos && <span className="tminfo-pop" role="tooltip"
        style={{ left: Math.max(8, Math.min(pos.x, (typeof window !== "undefined" ? window.innerWidth : 400) - 316)), top: pos.y }}>{text}</span>}
    </span>
  );
}

function Gate({ onPass, isMobile }) {
  const [pw, setPw] = useState(""); const [bad, setBad] = useState(false);
  const submit = e => {
    e.preventDefault();
    // One member key unlocks BOTH Deep Field and the premium locked charts (sets both flags).
    if (isValidAccess(fnv(pw.trim().toLowerCase()))) { try { localStorage.setItem(TERMINAL_KEY, "1"); localStorage.setItem(CITY_KEY, "1"); } catch { /* private */ } onPass(); }
    else setBad(true);
  };
  return (
    <div className="twrap" style={{ maxWidth: 560, margin: "72px auto", textAlign: "center" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
      <h2 style={{ fontFamily: "var(--mono)", fontSize: isMobile ? 22 : 27, fontWeight: 700, color: "var(--tx)", letterSpacing: "-0.01em", margin: "0 0 8px" }}>Deep Field</h2>
      <p style={{ color: "var(--faint)", fontSize: 14, lineHeight: 1.65, margin: "0 0 24px" }}>
        The granular on-chain intel hub — clusters, whale flows, per-wallet P&L. Members-only closed beta; enter your invite code.
      </p>
      <form onSubmit={submit} style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        <input type="password" value={pw} autoFocus onChange={e => { setPw(e.target.value); setBad(false); }} placeholder="passphrase"
          style={{ width: 220, padding: "10px 13px", borderRadius: 0, fontFamily: "var(--mono)", fontSize: 13, background: "var(--panel)", border: `1px solid ${bad ? "#fb7185" : "var(--line2)"}`, color: "var(--tx)", outline: "none" }} />
        <MenuBtn label="Enter" type="submit" />
      </form>
      {bad && <div style={{ color: "#fb7185", fontSize: 13, marginTop: 12, fontFamily: "var(--mono)" }}>Not that one.</div>}
    </div>
  );
}

// The members-only "Deep Field" charts — the granular, wallet-level views not on the public site.
// The gate sets the city flag too, so these open unlocked once a member is in.
const DF_CHARTS = [
  { name: "When Whales Bought", href: "/?chart=whaleentry", desc: "Every 100k+ wallet as an orb at the price it bought — in profit / underwater." },
  { name: "Wallet Clusters", href: "/?chart=entities", desc: "The addresses one owner controls, linked from on-chain SPX flows." },
  { name: "Cluster City", href: "/?chart=clustercity", desc: "A 3D city of owners — beams show who's buying (green) / selling (red)." },
  { name: "Whales Watching", href: "/?chart=whaleswatching", desc: "Every 100k+ wallet in 3D, pulsing green/red as they accumulate or distribute." },
  { name: "Cost Basis Terrain", href: "/?chart=urpdterrain", desc: "Where everyone bought, as a landscape deforming week by week." },
  { name: "Smart Money", href: "/?chart=smartmoney", desc: "Proven top-timers — aggregate here; per-wallet P&L pages inside." },
  { name: "SPX City", href: "/city", desc: "Every holder a building — the whole base in 3D, with holding age & flow." },
];

// A Deep Field chart link, styled like the site's nav menu: mono, uppercase, and the name types itself
// out left-to-right on hover (the shared menu typewriter). No generic icons.
function DFLink({ name, desc, href }) {
  const { shown, type, reset } = useHoverType(name);
  return (
    <a href={href} className="dfrow" onMouseEnter={type} onMouseLeave={reset} onFocus={type} onBlur={reset}>
      <span className="dfname">
        <span className="menubtn-t"><span className="menubtn-g" aria-hidden="true">{name}<i className="tcur">_</i></span><span className="menubtn-y">{shown}<i className="tcur">_</i></span></span>
        <span className="dfarrow">↗</span>
      </span>
      <span className="dfdesc">{desc}</span>
    </a>
  );
}

// SPX (Ethereum) — for the "open the cluster map" link (Bubblemaps renders the wallet bubbles).
const SPX_ETH = "0xE0f63A424a4439cBE457d80e4f4b51ad25b2c56C";
const shortAddr = a => a.slice(0, 6) + "…" + a.slice(-4);
// One net-flow cell (SPX change): green when the cluster/wallet added, red when it reduced.
const netSpxCell = v => {
  if (v == null || Math.abs(v) < 1) return <td className="tmdz">·</td>;
  const a = Math.abs(v), s = a >= 1e6 ? (a / 1e6).toFixed(2) + "M" : a >= 1e3 ? (a / 1e3).toFixed(0) + "k" : Math.round(a);
  return <td className={v > 0 ? "tmup" : "tmdn"}>{(v > 0 ? "+" : "−") + s}</td>;
};

// Hover/tap the "N wallets" cell → a popover listing every member wallet as its own Zerion link
// (the "multiple Zerion tooltips" for a cluster). Same viewport-positioned pattern as <Info>.
function ClusterWallets({ c }) {
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  const wl = c.wallets || [];
  const open = () => { const r = ref.current?.getBoundingClientRect(); if (r) setPos({ x: r.left, y: r.bottom + 6 }); };
  const close = () => setPos(null);
  const fmt = v => v >= 1e6 ? (v / 1e6).toFixed(2) + "M" : v >= 1e3 ? (v / 1e3).toFixed(0) + "k" : Math.round(v || 0);
  return (
    <span className="tminfo" ref={ref} tabIndex={0} style={{ cursor: "pointer", color: "var(--live)" }}
      onMouseEnter={open} onMouseLeave={close} onFocus={open} onBlur={close}
      onClick={e => { e.stopPropagation(); pos ? close() : open(); }}>
      {wl.length} wallets
      {pos && <span className="tminfo-pop" role="tooltip" style={{ left: Math.max(8, Math.min(pos.x, (typeof window !== "undefined" ? window.innerWidth : 400) - 300)), top: pos.y, minWidth: 220, textAlign: "left" }}>
        {wl.map(a => (
          <a key={a} href={`https://app.zerion.io/${a}/overview`} target="_blank" rel="noopener" title={a}
            style={{ display: "flex", justifyContent: "space-between", gap: 14, color: "var(--live)", textDecoration: "none", padding: "3px 0", fontFamily: "var(--mono)", fontSize: 12 }}>
            <span>{shortAddr(a)}</span><span style={{ color: "var(--dim)" }}>{fmt(c.walletBal?.[a] || 0)}</span>
          </a>
        ))}
        <div style={{ marginTop: 6, color: "var(--faint)", fontSize: 11, fontFamily: "var(--mono)" }}>each opens in Zerion ↗</div>
      </span>}
    </span>
  );
}

export default function TerminalPage({ isMobile }) {
  const [ok, setOk] = useState(() => { try { return localStorage.getItem(TERMINAL_KEY) === "1"; } catch { return false; } });
  const [data, setData] = useState(undefined);   // undefined loading · null failed · object ok
  const [sm, setSm] = useState(undefined);       // smart-money.json (per-wallet detail — terminal only)
  const [ent, setEnt] = useState(undefined);     // entities.json (wallet clusters — terminal reveals members)
  const [hl, setHl] = useState(null);            // LIVE Hyperliquid funding/OI (real-time, not yesterday's mean)

  useEffect(() => {
    if (!ok) return;
    let off = false;
    const grab = (f, ok) => fetch(`/api/control?f=public/${f}&t=${Date.now()}`, { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(d => { if (!off) ok(d); }).catch(() => { if (!off) ok(null); });
    grab("daily-snapshot.json", d => setData(d && d.sections ? d : null));
    grab("smart-money.json", d => setSm(d || null));
    grab("entities.json", d => setEnt(Array.isArray(d?.entities) ? d.entities : Array.isArray(d?.clusters) ? d.clusters : Array.isArray(d) ? d : null));
    // Live positioning — refreshed on load + every 90s so a funding spike surfaces without a cron.
    const pullHl = () => fetch("/api/spot?hl=1", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(d => { if (!off && d?.ok) setHl(d); }).catch(() => {});
    pullHl(); const iv = setInterval(pullHl, 90000);
    return () => { off = true; clearInterval(iv); };
  }, [ok]);

  if (!ok) return <Gate onPass={() => setOk(true)} isMobile={isMobile} />;

  const S = data;
  const today = new Date().toISOString().slice(0, 10);
  const ageDays = dt => dt ? Math.round((Date.parse(today) - Date.parse(dt)) / 864e5) : null;

  return (
    <div className="twrap tmwrap">
      <div className="tmhead">
        <div className="tmcmd"><span className="tmprompt">spx6900 ~ %</span> cat ./deepfield/today</div>
        <h1 className="tmtitle">DEEP FIELD<Info text="The granular on-chain intel hub — where SPX sits today, what changed, and the wallet-level detail (clusters, whale flows, per-wallet P&L). Every number is a plain day-over-day read off the on-chain feeds we already bank; nothing is a buy or sell call." /></h1>
        <div className="tmrainbow" />
        <div className="tmsub">
          {S === undefined ? "loading the desk…" : S ? <>{S.date || ""} · SPX ${(S.spot || 0).toFixed(4)}</> : "snapshot unavailable — try again in a minute"}
        </div>
      </div>

      {(() => {
        const rows = (S && S.conditions && S.conditions.rows) || [];
        const hot = rows.filter(r => r.pct >= 85);      // stretched / overheated
        const cold = rows.filter(r => r.pct <= 12);     // deep value
        const liveAPR = hl && hl.ok !== false && hl.fundingAPR != null ? hl.fundingAPR : null;
        const items = [];
        hot.forEach(r => { if (r.key === "funding" && liveAPR != null) return; items.push({ txt: `${r.label} ${r.reading} · ${r.state}`, hot: true }); });
        if (liveAPR != null && liveAPR >= 40) items.push({ txt: `Traders paying ~${Math.round(liveAPR)}% APR to be long`, hot: true, live: true });
        cold.forEach(r => items.push({ txt: `${r.label} ${r.reading} · ${r.state}`, hot: false }));
        if (!items.length) return null;
        const danger = items.some(i => i.hot);
        const note = danger
          ? "Price has run ahead of trend and the crowd is paying up to be long — momentum can persist, but this is where pullbacks tend to start. A caution on timing, not a sell call."
          : "Several gauges sit near their cheapest ever — historically an accumulation zone, not a buy call.";
        return (
          <div className={"tmbanner " + (danger ? "tmbanner-hot" : "tmbanner-cold")}>
            <div className="tmbanner-h">{danger ? "Heads-up · short-term overheated" : "Deep-value signals"}</div>
            <div className="tmbanner-items">{items.map((it, i) => <span key={i} className={"tmbanner-pill " + (it.hot ? "hot" : "cold")}>{it.txt}</span>)}</div>
            <div className="tmbanner-note">{note}</div>
          </div>
        );
      })()}

      <section className="tmsec">
        <div className="tmsectitle">Deep Field · charts
          <Info text="The members-only charts — the wallet-level granularity that isn't on the public site. Your invite unlocks all of them; open in a new tab." />
          <span> · members only</span></div>
        <div className="dfgrid">
          {DF_CHARTS.map(c => <DFLink key={c.href} {...c} />)}
        </div>
      </section>

      {S && Array.isArray(S.alerts) && S.alerts.length > 0 && (
        <div className="tmalerts">{S.alerts.map((a, i) => <div key={i} className="tmalert">{a}</div>)}</div>
      )}

      {S && S.conditions && S.conditions.rows?.length > 0 && (() => {
        const C = S.conditions;
        const scoreState = C.score == null ? null : C.score <= 15 ? "deep value" : C.score <= 35 ? "cheap" : C.score <= 65 ? "fair" : C.score <= 85 ? "rich" : "stretched";
        return (
          <section className="tmsec tmsec-lead">
            <div className="tmsectitle">Market conditions — where SPX sits vs. its own history
              <Info text="Each gauge is scored 0–100 against its own full SPX history: 0 = the cheapest / most oversold it has ever been, 100 = the most expensive / stretched. Nothing here is measured against Bitcoin or any outside benchmark — SPX is judged only against itself. A positioning read, not financial advice." />
              {C.score != null && <span> · overall {C.score}/100 · {scoreState}</span>}</div>
            <div className="tmtblwrap">
              <table className="tmtbl">
                <thead><tr><th>metric</th><th>now</th><th>vs history</th><th>1d</th><th>7d</th><th>30d</th></tr></thead>
                <tbody>{C.rows.map((r, i) => {
                  const d1 = condDelta(r.d1, r.fmt), d7 = condDelta(r.d7, r.fmt), d30 = condDelta(r.d30, r.fmt);
                  return (
                    <tr key={i}>
                      <td className="tmk">{r.label}{r.plain ? <Info text={r.plain} /> : null}</td>
                      <td className="tmval">{r.reading}</td>
                      <td className="tmcondtag"><span className={"tmtone-" + r.tone}>{r.state}</span></td>
                      <td><span className={d1.cls}>{d1.s}</span></td>
                      <td><span className={d7.cls}>{d7.s}</span></td>
                      <td><span className={d30.cls}>{d30.s}</span></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          </section>
        );
      })()}

      {S && Array.isArray(S.anomalies) && S.anomalies.length > 0 && (
        <section className="tmsec">
          <div className="tmsectitle">⚠ Anomaly radar
            <Info text="This scans every on-chain number we track each day — not a hand-picked few — and flags any that jumped far from its own recent normal (σ = how many standard deviations out). These are things to go look at, not conclusions: when you watch this many numbers, one or two will always move by chance." />
            <span>{S.scanned ? `all ${S.scanned} daily series scanned` : "all daily series scanned"}</span></div>
          <div className="tmtblwrap">
            <table className="tmtbl">
              <thead><tr><th>metric</th><th>move</th><th>σ</th><th></th></tr></thead>
              <tbody>{S.anomalies.map((a, i) => (
                <tr key={i}>
                  <td className="tmk">{a.label}</td>
                  <td className={a.dir === "up" ? "tmup" : "tmdn"}>{a.dir === "up" ? "▲" : "▼"} {a.rel > 0 ? "+" : ""}{Math.abs(a.rel) >= 1000 ? (a.rel / 1000).toFixed(1) + "k" : a.rel}%</td>
                  <td className="tmval">{Math.abs(a.z)}σ</td>
                  <td>{a.chart ? <a href={`/?chart=${a.chart}`} target="_blank" rel="noopener" style={{ color: "var(--live)", textDecoration: "none" }}>view ↗</a> : ""}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      )}

      {S && Array.isArray(S.whaleCohorts) && S.whaleCohorts.length > 0 && (() => {
        const netCell = v => <td className={Math.abs(v) < 1 ? "tmdz" : v >= 0 ? "tmup" : "tmdn"}>{Math.abs(v) < 1 ? "·" : (v >= 0 ? "+" : "−") + (Math.abs(v) / 1e6).toFixed(2) + "M"}</td>;
        return (
        <section className="tmsec">
          <div className="tmsectitle">Whale cohorts · net buy / sell by size
            <Info text="Wallets holding ≥100k SPX, sliced into four size bands so you can see WHICH band is accumulating or distributing — not whales as one blob. Net SPX is the cohort's total balance change over each window (buys minus sells). Buyers/sellers count wallets whose 30-day move clears a small dust threshold." /></div>
          <div className="tmtblwrap">
            <table className="tmtbl">
              <thead><tr><th>cohort</th><th>wallets</th><th>buy/sell</th><th>net 1d</th><th>net 7d</th><th>net 30d</th></tr></thead>
              <tbody>{S.whaleCohorts.map(c => (
                <tr key={c.band}>
                  <td className="tmk">{c.band}</td>
                  <td>{c.wallets}</td>
                  <td><span className="tmup">{c.buyers}</span> / <span className="tmdn">{c.sellers}</span></td>
                  {netCell(c.d1)}{netCell(c.d7)}{netCell(c.d30)}
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
        );
      })()}

      {S && S.exits && (
        <section className="tmsec">
          <div className="tmsectitle">How holders left <span>departures below the 5k bar</span></div>
          <div className="tmtblwrap">
            <table className="tmtbl">
              <thead><tr><th>window</th><th>wallets</th><th>SPX left</th><th>% in profit</th></tr></thead>
              <tbody>{[["1d", S.exits.d1], ["7d", S.exits.d7], ["30d", S.exits.d30]].map(([w, e]) => e && (
                <tr key={w}>
                  <td className="tmk">{w}</td>
                  <td>{e.wallets}</td>
                  <td>{(e.supply / 1e6).toFixed(2)}M</td>
                  <td className={e.profitPct == null ? "tmdz" : e.profitPct >= 55 ? "tmup" : e.profitPct <= 45 ? "tmdn" : ""}>{e.profitPct == null ? "—" : e.profitPct + "%"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      )}

      {sm && Array.isArray(sm.wallets) && sm.wallets.length > 0 && (() => {
        const short = a => a.slice(0, 6) + "…" + a.slice(-4);
        const smNet = v => { if (v == null || Math.abs(v) < 1) return <td className="tmdz">·</td>; const a = Math.abs(v); const s = a >= 1e6 ? (a / 1e6).toFixed(2) + "M" : a >= 1e3 ? (a / 1e3).toFixed(0) + "k" : Math.round(a); return <td className={v > 0 ? "tmup" : "tmdn"}>{(v > 0 ? "+" : "−") + s}</td>; };
        return (
          <section className="tmsec">
            <div className="tmsectitle">Smart money · the wallets
              <Info text="The independent proven top-timers behind the aggregate: ≥$25k deployed, realized ≥5×, still holding ≥50k SPX — and NOT part of any multi-wallet cluster (so these are genuine solo traders). Real addresses, terminal-only; the public site shows them anonymized. Columns are the change in each wallet's held balance over 24h / 7d / 30d. Not a follow signal." />
              <span> · {sm.wallets.length} independent traders</span></div>
            <details className="tmdrop" open>
              <summary style={{ cursor: "pointer", fontFamily: "var(--mono)", fontSize: 12.5, color: "var(--dim)", padding: "2px 0 10px", userSelect: "none" }}>reveal / hide wallets</summary>
              <div className="tmtblwrap">
                <table className="tmtbl">
                  <thead><tr><th>wallet</th><th>held</th><th>24h</th><th>7d</th><th>30d</th></tr></thead>
                  <tbody>{sm.wallets.map((w, i) => (
                    <tr key={w.a}>
                      <td className="tmk">
                        <span style={{ color: "var(--faint)", marginRight: 8 }}>{i + 1}</span>
                        <a href={`/?view=wallet&addr=${w.a}`} title={w.a} style={{ color: "var(--live)", textDecoration: "none", fontFamily: "var(--mono)" }}>{short(w.a)}</a>
                        <Info text={`${w.a}${w.roi ? ` · ${w.roi}× realized` : ""} — opens the wallet page (buy orbs + P&L). Zerion: app.zerion.io/${w.a} · Etherscan: etherscan.io/address/${w.a}`} />
                      </td>
                      <td className="tmval">{fmtVal(w.bal, "spx")}</td>
                      {smNet(w.d1)}{smNet(w.d7)}{smNet(w.d30)}
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </details>
          </section>
        );
      })()}

      {ent && Array.isArray(ent) && ent.length > 0 && (() => {
        const clusters = ent.filter(c => !c.flagged && (c.bal || 0) > 0).sort((a, b) => (b.bal || 0) - (a.bal || 0)).slice(0, 12);
        if (!clusters.length) return null;
        return (
          <section className="tmsec">
            <div className="tmsectitle">Whale clusters · the owners
              <Info text="Wallets the entity engine links into ONE owner from on-chain SPX fund/drain flows — the concentration a plain rich-list misses. Hover 'N wallets' to see the members (each opens in Zerion); 'open ↗' loads the cluster map. Net columns = the whole cluster's balance change over 24h/7d/30d. Flagged / over-merged clusters are excluded." />
              <span> · top {clusters.length} by size</span></div>
            <details className="tmdrop" open>
              <summary style={{ cursor: "pointer", fontFamily: "var(--mono)", fontSize: 12.5, color: "var(--dim)", padding: "2px 0 10px", userSelect: "none" }}>reveal / hide clusters</summary>
              <div className="tmtblwrap">
                <table className="tmtbl">
                  <thead><tr><th>owner</th><th>wallets</th><th>combined</th><th>24h</th><th>7d</th><th>30d</th><th></th></tr></thead>
                  <tbody>{clusters.map((c, i) => (
                    <tr key={c.id}>
                      <td className="tmk"><span style={{ color: "var(--faint)", marginRight: 8 }}>{i + 1}</span>{shortAddr(c.id)}</td>
                      <td><ClusterWallets c={c} /></td>
                      <td className="tmval">{fmtVal(c.bal, "spx")}</td>
                      {netSpxCell(c.d1)}{netSpxCell(c.d7)}{netSpxCell(c.d30)}
                      <td><a href={`https://bubblemaps.io/eth/token/${SPX_ETH}`} target="_blank" rel="noopener" style={{ color: "var(--live)", textDecoration: "none" }}>open ↗</a></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </details>
          </section>
        );
      })()}

      {S && S.sections.map((sec, si) => (
        <section className="tmsec" key={si}>
          <div className="tmsectitle">{sec.title}{sec.note && <Info text={sec.note} />}</div>
          <div className="tmtblwrap">
            <table className="tmtbl">
              <thead><tr><th>metric</th><th>now</th><th>1d</th><th>7d</th><th>30d</th></tr></thead>
              <tbody>{sec.rows.map((r, ri) => (
                <tr key={ri}>
                  <td className="tmk">{r.label}{r.note ? <Info text={r.note} /> : null}</td>
                  <td className="tmval">{fmtVal(r.value, r.fmt)}</td>
                  {(r.d || [null, null, null]).map((d, di) => <td key={di}><Delta d={d} fmt={r.fmt} goodUp={r.goodUp} /></td>)}
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      ))}

      {S && S.freshness && (
        <div className="tmfresh">sources · {Object.entries(S.freshness).filter(([, dt]) => dt).map(([k, dt], i) => {
          const a = ageDays(dt), stale = a != null && a >= 2;
          return <span key={k} className={stale ? "tmdn" : "tmfok"}>{i ? " · " : ""}{k} {a === 0 ? "today" : a + "d"}</span>;
        })}</div>
      )}

      <p className="tmfoot">
        Every number is a day-over-day read off the on-chain feeds we already bank — reproducible, no black box.
        Conviction reads marked "supply" are supply shares, not wallet counts. A valuation / positioning read, not financial advice.
      </p>
    </div>
  );
}
