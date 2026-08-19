import { useEffect, useState } from "react";
import { TERMINAL_KEY, TERMINAL_HASH } from "./terminal-gate-key.js";
import { MenuBtn } from "./chart-ui.jsx";

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
    default: return String(v);
  }
}
function Delta({ d, fmt, goodUp }) {
  if (d == null || !isFinite(d)) return <span className="tmdz">—</span>;
  const eps = (fmt === "x" || fmt === "num3" || fmt === "pct") ? 0.005 : 1e-9;
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
    default: mag = String(a);
  }
  return <span className={good ? "tmup" : "tmdn"}>{sign}{mag}</span>;
}

function Gate({ onPass, isMobile }) {
  const [pw, setPw] = useState(""); const [bad, setBad] = useState(false);
  const submit = e => {
    e.preventDefault();
    if (fnv(pw.trim().toLowerCase()) === TERMINAL_HASH) { try { localStorage.setItem(TERMINAL_KEY, "1"); } catch { /* private */ } onPass(); }
    else setBad(true);
  };
  return (
    <div className="twrap" style={{ maxWidth: 560, margin: "72px auto", textAlign: "center" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
      <h2 style={{ fontFamily: "var(--mono)", fontSize: isMobile ? 22 : 27, fontWeight: 700, color: "var(--tx)", letterSpacing: "-0.01em", margin: "0 0 8px" }}>The Terminal</h2>
      <p style={{ color: "var(--faint)", fontSize: 14, lineHeight: 1.65, margin: "0 0 24px" }}>
        The daily on-chain intel desk. Password protected while it's in development.
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

export default function TerminalPage({ isMobile }) {
  const [ok, setOk] = useState(() => { try { return localStorage.getItem(TERMINAL_KEY) === "1"; } catch { return false; } });
  const [data, setData] = useState(undefined);   // undefined loading · null failed · object ok

  useEffect(() => {
    if (!ok) return;
    let off = false;
    fetch(`/api/control?f=public/daily-snapshot.json&t=${Date.now()}`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : null).then(d => { if (!off) setData(d && d.sections ? d : null); }).catch(() => { if (!off) setData(null); });
    return () => { off = true; };
  }, [ok]);

  if (!ok) return <Gate onPass={() => setOk(true)} isMobile={isMobile} />;

  const S = data;
  const today = new Date().toISOString().slice(0, 10);
  const ageDays = dt => dt ? Math.round((Date.parse(today) - Date.parse(dt)) / 864e5) : null;

  return (
    <div className="twrap tmwrap">
      <div className="tmhead">
        <div className="tmcmd"><span className="tmprompt">spx6900 ~ %</span> cat ./terminal/today</div>
        <h1 className="tmtitle">THE TERMINAL</h1>
        <div className="tmrainbow" />
        <div className="tmsub">
          {S === undefined ? "loading the desk…" : S ? <>The daily on-chain intel desk — where SPX sits today and what changed. · {S.date || ""} · SPX ${(S.spot || 0).toFixed(4)}</> : "snapshot unavailable — try again in a minute"}
        </div>
      </div>

      {S && Array.isArray(S.alerts) && S.alerts.length > 0 && (
        <div className="tmalerts">{S.alerts.map((a, i) => <div key={i} className="tmalert">{a}</div>)}</div>
      )}

      {S && S.conditions && S.conditions.rows?.length > 0 && (() => {
        const C = S.conditions;
        const scoreState = C.score == null ? null : C.score <= 15 ? "deep value" : C.score <= 35 ? "cheap" : C.score <= 65 ? "fair" : C.score <= 85 ? "rich" : "stretched";
        return (
          <section className="tmsec tmsec-lead">
            <div className="tmsectitle">Market conditions — where SPX sits vs. its own history
              {C.score != null && <span> · overall {C.score}/100 · {scoreState}</span>}</div>
            <div className="tmconds">
              {C.rows.map((r, i) => (
                <div className="tmcond" key={i}>
                  <div className="tmcondhd">
                    <span className="tmcondname">{r.label}</span>
                    <span className={"tmcondstate tmtone-" + r.tone}>{r.reading} · {r.state}</span>
                  </div>
                  <div className={"tmgauge tmtone-" + r.tone}><span className="tmgaugefill" style={{ width: r.pct + "%" }} /><span className="tmgaugetick" style={{ left: r.pct + "%" }} /></div>
                  <div className="tmcondplain">{r.plain}</div>
                </div>
              ))}
            </div>
            <div className="tmnote tmnote-lg">
              Each gauge is scored <b>0–100 against its own full SPX history</b>: <b>0</b> = the cheapest / most oversold it has ever been, <b>100</b> = the most expensive / stretched. Nothing here is measured against Bitcoin or any outside benchmark — SPX is judged only against itself. A positioning read, not financial advice.
            </div>
          </section>
        );
      })()}

      {S && Array.isArray(S.anomalies) && S.anomalies.length > 0 && (
        <section className="tmsec">
          <div className="tmsectitle">⚠ Anomaly radar <span>{S.scanned ? `all ${S.scanned} daily series scanned` : "all daily series scanned"}</span></div>
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
          <div className="tmnote tmnote-lg">This scans <b>every</b> on-chain number we track each day — not a hand-picked few — and flags any that jumped far from its own recent normal (σ = how many standard deviations out). These are things to go look at, not conclusions: when you watch this many numbers, one or two will always move by chance.</div>
        </section>
      )}

      {S && Array.isArray(S.whaleFlow) && S.whaleFlow.length > 0 && (
        <section className="tmsec">
          <div className="tmsectitle">Whale cohorts · net buy / sell <span>≥100k SPX</span></div>
          <div className="tmtblwrap">
            <table className="tmtbl">
              <thead><tr><th>window</th><th>buyers</th><th>sellers</th><th>net SPX</th></tr></thead>
              <tbody>{S.whaleFlow.map(w => (
                <tr key={w.win}>
                  <td className="tmk">{w.win}</td>
                  <td className="tmup">{w.buyers}</td>
                  <td className="tmdn">{w.sellers}</td>
                  <td className={w.net >= 0 ? "tmup" : "tmdn"}>{w.net >= 0 ? "+" : "−"}{(Math.abs(w.net) / 1e6).toFixed(2)}M</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      )}

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

      {S && S.sections.map((sec, si) => (
        <section className="tmsec" key={si}>
          <div className="tmsectitle">{sec.title}</div>
          {sec.note && <div className="tmnote tmnote-lg" style={{ marginBottom: 8 }}>{sec.note}</div>}
          <div className="tmtblwrap">
            <table className="tmtbl">
              <thead><tr><th>metric</th><th>now</th><th>1d</th><th>7d</th><th>30d</th></tr></thead>
              <tbody>{sec.rows.map((r, ri) => (
                <tr key={ri}>
                  <td className="tmk">{r.label}{r.note ? <span className="tmnote">{r.note}</span> : null}</td>
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
