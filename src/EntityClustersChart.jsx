import { useMemo, useState, useEffect } from "react";
import { loadEntities } from "./history-data.js";
import { SANS, MONO, MAX_W, Metric, Explain } from "./chart-ui.jsx";
import EntityGraph from "./EntityGraph.jsx";

// SPX City "who owns what", the ENTITY view. The by-wallet charts (Holder Concentration, Whales)
// count every address separately; this second lens links the addresses one owner controls into a
// single entity, reconstructed from on-chain SPX flows (a wallet emptied into, or a fresh wallet
// funded by, another plain wallet). It never merges through a CEX/LP/contract, flags anything that
// looks like a service or an over-merge, and, stated plainly, only sees SPX movements, so a common
// ETH/gas funder that never touched SPX is invisible to it. The raw by-wallet view stays the default;
// this is the disclosed, reproducible companion.

const fSpx = v => {
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return (v / 1e3).toFixed(1) + "k";
  return Math.round(v).toString();
};
const fUsd = v => v >= 1e6 ? "$" + (v / 1e6).toFixed(2) + "M" : v >= 1e3 ? "$" + (v / 1e3).toFixed(0) + "k" : "$" + Math.round(v);
const short = a => a.slice(0, 6) + "…" + a.slice(-4);
const ES = a => `https://etherscan.io/address/${a}`;
const SPX_CONTRACT = "0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c";

export default function EntityClustersChart({ isMobile, preview = false }) {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);       // expanded entity id
  const [hideFlagged, setHideFlagged] = useState(true);
  const [q, setQ] = useState("");
  const [view, setView] = useState("graph");    // "graph" (bubblemap) | "list"
  useEffect(() => {
    let cancelled = false;
    loadEntities().then(d => { if (!cancelled) setData(d); });
    return () => { cancelled = true; };
  }, []);

  const rows = useMemo(() => {
    if (!data?.entities) return [];
    const hasBal = data.entities.some(e => typeof e.bal === "number");
    let list = data.entities.map(e => ({ ...e, _bal: e.bal ?? null }));
    // rank by combined holdings when we have them, else by cluster size
    list.sort((a, b) => (hasBal ? (b._bal - a._bal) : 0) || b.size - a.size);
    if (hideFlagged) list = list.filter(e => !e.flagged);
    const ql = q.trim().toLowerCase();
    if (ql) list = list.filter(e => e.wallets.some(w => w.includes(ql)) || e.id.includes(ql));
    return list;
  }, [data, hideFlagged, q]);

  if (!data) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading wallet clusters…</div>;
  if (!data.entities.length) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>The entity graph is being built.</div>;

  const s = data.stats || {};
  const held = data.heldSupply || 0;
  const spot = data.spot || 0;
  const top = data.entities.find(e => typeof e.bal === "number" && !e.flagged);
  const topPct = top && held ? (top.bal / held * 100) : null;
  const accent = "#a78bfa", green = "#4ade80", amber = "#fbbf24";
  const shown = preview ? rows.slice(0, 6) : rows.slice(0, 120);

  const kindColor = k => k === "drain" ? "#f472b6" : "#38bdf8";

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="How many wallets does one owner actually control?" accent={accent}>
        The concentration and whale charts count every <strong style={{ color: "#e2e8f0" }}>address</strong> on its own. This links the addresses
        {" "}<strong style={{ color: accent }}>one owner</strong> moves SPX between, a wallet <strong style={{ color: "#f472b6" }}>emptied into</strong>, or a
        {" "}<strong style={{ color: "#38bdf8" }}>fresh wallet funded by</strong>, another plain wallet, into a single <strong style={{ color: accent }}>entity</strong>.
        {" "}It never merges through an exchange, pool or contract, and flags anything that looks like a service or an over-merge. It reads
        {" "}<strong style={{ color: "#e2e8f0" }}>SPX flows only</strong>, a shared ETH/gas funder that never touched SPX is invisible to it, so this is a
        {" "}<em>floor</em> on how clustered the base really is, not the last word.
      </Explain>

      <div style={{ display: "flex", gap: isMobile ? 14 : 28, justifyContent: "center", marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <Metric label="linked entities" value={s.entities?.toLocaleString() ?? rows.length} color={accent} sub={`${(s.clustered ?? 0).toLocaleString()} wallets`} />
        {topPct != null && <Metric label="largest owner" value={fSpx(top.bal)} color={green} sub={`${topPct.toFixed(1)}% of holder supply · ${top.size} wallets`} />}
        <Metric label="flagged / uncertain" value={(s.flagged ?? 0).toString()} color={amber} sub="withheld from trust" />
      </div>

      <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="search wallet address…"
          style={{ padding: "7px 12px", borderRadius: 8, fontFamily: MONO, fontSize: 13, minWidth: isMobile ? 180 : 300,
            border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.04)", color: "#e2e8f0" }} />
        <label style={{ fontFamily: SANS, fontSize: 13, color: "#94a3b8", display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
          <input type="checkbox" checked={hideFlagged} onChange={e => setHideFlagged(e.target.checked)} /> hide flagged
        </label>
        <div style={{ display: "flex", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 8, overflow: "hidden" }}>
          {["graph", "list"].map(v => (
            <button key={v} onClick={() => setView(v)} style={{ padding: "6px 14px", fontFamily: SANS, fontSize: 13, cursor: "pointer", border: "none",
              background: view === v ? "rgba(167,139,250,0.18)" : "transparent", color: view === v ? "#c4b5fd" : "#94a3b8", textTransform: "capitalize" }}>{v === "graph" ? "Bubble map" : "List"}</button>
          ))}
        </div>
      </div>

      {view === "graph" && (
        <div style={{ marginBottom: 16 }}>
          <EntityGraph entities={rows} heldSupply={held} spot={spot} isMobile={isMobile} onSelect={id => setOpen(open === id ? null : id)} selectedId={open} />
          {open && (() => {
            const e = rows.find(x => x.id === open); if (!e) return null;
            const pct = typeof e.bal === "number" && held ? (e.bal / held * 100) : null;
            return (
              <div style={{ marginTop: 12, border: "1px solid rgba(167,139,250,0.25)", borderRadius: 10, padding: isMobile ? "12px 14px" : "14px 18px" }}>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "baseline", marginBottom: 12 }}>
                  <span style={{ fontFamily: MONO, fontSize: 14, color: "#cbd5e1" }}>{short(e.id)}</span>
                  {typeof e.bal === "number" && <span style={{ fontFamily: MONO, fontSize: 16, color: "#f8fafc", fontWeight: 600 }}>{fSpx(e.bal)} SPX</span>}
                  {pct != null && <span style={{ fontFamily: MONO, fontSize: 13, color: "#94a3b8" }}>{pct.toFixed(pct < 1 ? 2 : 1)}%</span>}
                  {typeof e.bal === "number" && spot > 0 && <span style={{ fontFamily: MONO, fontSize: 13, color: green }}>{fUsd(e.bal * spot)}</span>}
                  <span style={{ fontFamily: SANS, fontSize: 13, color: "#94a3b8" }}>{e.size} wallets{typeof e.holders === "number" ? ` · ${e.holders} holding` : ""}</span>
                  {e.flagged && <span style={{ fontFamily: SANS, fontSize: 11, color: amber, border: `1px solid ${amber}55`, borderRadius: 5, padding: "1px 7px" }}>flagged · uncertain</span>}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                  {e.wallets.map(w => <a key={w} href={ES(w)} target="_blank" rel="noopener noreferrer" style={{ fontFamily: MONO, fontSize: 12.5, color: "#a5b4fc", textDecoration: "none", border: "1px solid rgba(167,139,250,0.25)", borderRadius: 6, padding: "3px 8px" }}>{short(w)}{typeof (e.walletBal || {})[w] === "number" && e.walletBal[w] > 0 ? ` · ${fSpx(e.walletBal[w])}` : ""} ↗</a>)}
                </div>
                <a href={`https://app.bubblemaps.io/eth/token/${SPX_CONTRACT}`} target="_blank" rel="noopener noreferrer" style={{ fontFamily: SANS, fontSize: 12.5, color: accent, textDecoration: "none" }}>Cross-check on Bubblemaps ↗</a>
              </div>
            );
          })()}
          <div style={{ textAlign: "center", fontFamily: SANS, fontSize: 12.5, color: "#64748b", marginTop: 10 }}>Showing the {Math.min(rows.length, isMobile ? 28 : 60)} biggest owners{hideFlagged ? "" : " (incl. flagged)"}. Click a bubble for its wallets · switch to List for the full table.</div>
        </div>
      )}
      {view === "list" && (<>
      <div style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, overflow: "hidden" }}>
        {shown.map((e, i) => {
          const isOpen = open === e.id;
          const pct = typeof e.bal === "number" && held ? (e.bal / held * 100) : null;
          return (
            <div key={e.id} style={{ borderTop: i ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
              <div onClick={() => setOpen(isOpen ? null : e.id)} style={{ display: "flex", alignItems: "center", gap: isMobile ? 10 : 18, padding: isMobile ? "11px 12px" : "13px 18px", cursor: "pointer", background: isOpen ? "rgba(167,139,250,0.06)" : "transparent" }}>
                <span style={{ fontFamily: MONO, fontSize: 12, color: "#64748b", width: 26, textAlign: "right" }}>{i + 1}</span>
                <span style={{ fontFamily: MONO, fontSize: 13, color: "#cbd5e1", flex: isMobile ? "1 1 auto" : "0 0 150px" }}>{short(e.id)}</span>
                <span style={{ flex: 1, display: "flex", gap: isMobile ? 10 : 20, flexWrap: "wrap", alignItems: "baseline" }}>
                  {typeof e.bal === "number" && <span style={{ fontFamily: MONO, fontSize: 15, color: "#f8fafc", fontWeight: 600 }}>{fSpx(e.bal)} <span style={{ color: "#64748b", fontSize: 12 }}>SPX</span></span>}
                  {pct != null && <span style={{ fontFamily: MONO, fontSize: 12, color: "#94a3b8" }}>{pct.toFixed(pct < 1 ? 2 : 1)}%</span>}
                  {typeof e.bal === "number" && spot > 0 && <span style={{ fontFamily: MONO, fontSize: 12, color: "#4ade80" }}>{fUsd(e.bal * spot)}</span>}
                  <span style={{ fontFamily: SANS, fontSize: 12.5, color: "#94a3b8" }}>{e.size} wallets{typeof e.holders === "number" ? ` · ${e.holders} holding` : ""}</span>
                  {e.flagged && <span style={{ fontFamily: SANS, fontSize: 11, color: amber, border: `1px solid ${amber}55`, borderRadius: 5, padding: "1px 7px" }}>flagged · uncertain</span>}
                </span>
                <span style={{ color: "#64748b", fontSize: 12 }}>{isOpen ? "▲" : "▼"}</span>
              </div>

              {isOpen && (
                <div style={{ padding: isMobile ? "4px 12px 16px" : "6px 18px 18px 70px", display: "flex", flexDirection: "column", gap: 14 }}>
                  {e.flagged && <div style={{ fontFamily: SANS, fontSize: 12.5, color: amber, background: `${amber}12`, border: `1px solid ${amber}33`, borderRadius: 8, padding: "8px 12px" }}>
                    This cluster is <strong>larger than a normal personal split</strong>, kept here for review but <strong>not trusted</strong> in any metric. It may chain through a not-yet-classified service.
                  </div>}
                  <div>
                    <div style={{ fontFamily: SANS, fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Wallets ({e.wallets.length})</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {e.wallets.map(w => <a key={w} href={ES(w)} target="_blank" rel="noopener noreferrer" style={{ fontFamily: MONO, fontSize: 12.5, color: "#a5b4fc", textDecoration: "none", border: "1px solid rgba(167,139,250,0.25)", borderRadius: 6, padding: "3px 8px" }}>{short(w)} ↗</a>)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontFamily: SANS, fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Links ({e.edges.length})</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      {e.edges.map((g, j) => (
                        <div key={j} style={{ fontFamily: MONO, fontSize: 12.5, color: "#cbd5e1", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                          <span style={{ color: "#64748b", minWidth: 82 }}>{g.date}</span>
                          <span style={{ color: kindColor(g.kind), minWidth: 42, textTransform: "uppercase", fontSize: 11 }}>{g.kind}</span>
                          <span>{short(g.from)} → {short(g.to)}</span>
                          <span style={{ color: "#94a3b8" }}>{fSpx(g.amt)} SPX</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <a href={`https://app.bubblemaps.io/eth/token/${SPX_CONTRACT}`} target="_blank" rel="noopener noreferrer" style={{ fontFamily: SANS, fontSize: 12.5, color: accent, textDecoration: "none" }}>Cross-check on Bubblemaps ↗</a>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {rows.length > shown.length && <div style={{ textAlign: "center", fontFamily: SANS, fontSize: 12.5, color: "#64748b", marginTop: 10 }}>Showing the top {shown.length} of {rows.length.toLocaleString()} clusters{hideFlagged ? "" : " (incl. flagged)"}.</div>}
      </>)}

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 16, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        <strong style={{ color: accent }}>Wallet clusters</strong>, addresses one owner moves SPX between, linked into a single entity ({data.updated}). Reconstructed from on-chain <strong style={{ color: "#94a3b8" }}>SPX drain/fund flows</strong>; exchanges, pools and contracts are exits, never links. A shared <strong style={{ color: "#94a3b8" }}>ETH funder</strong> that never touched SPX is not seen, so this under-counts, never over-counts. The by-wallet charts stay the default view. Not financial advice.
      </div>
    </div>
  );
}
