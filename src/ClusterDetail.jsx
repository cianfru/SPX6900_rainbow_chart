import { useEffect, useState } from "react";
import { loadEntities, loadPriceHistory } from "./history-data.js";
import PositionDetail, { shortAddr } from "./PositionDetail.jsx";
import { TERMINAL_KEY } from "./terminal-gate-key.js";

// CLUSTER PAGE (terminal-tier, ?view=cluster&id=0x…). The WHOLE owner as one position — where the
// cluster (all its member wallets combined) bought & sold, its live P&L, realized-PnL curve — rendered
// by the shared PositionDetail. Data = aggregated cluster lots from build-onchain-local (entities.json),
// where member↔member transfers are excluded so only real (boundary-crossing) buys/sells count.

const fBal = v => v >= 1e6 ? (v / 1e6).toFixed(2) + "M" : v >= 1e3 ? (v / 1e3).toFixed(0) + "k" : Math.round(v || 0);

export default function ClusterDetail({ id, price, isMobile }) {
  const [ent, setEnt] = useState(undefined);
  const [px, setPx] = useState(null);
  const unlocked = (() => { try { return localStorage.getItem(TERMINAL_KEY) === "1"; } catch { return false; } })();

  useEffect(() => { if (unlocked) loadEntities().then(d => setEnt(Array.isArray(d?.entities) ? d.entities : (Array.isArray(d) ? d : null))); }, [unlocked]);
  useEffect(() => { if (unlocked) loadPriceHistory().then(setPx); }, [unlocked]);

  const cid = String(id || "").toLowerCase();
  const c = ent && Array.isArray(ent) ? ent.find(x => String(x.id).toLowerCase() === cid) : null;

  if (!unlocked) return (
    <div style={{ maxWidth: 620, margin: "72px auto", textAlign: "center", fontFamily: "var(--sans)", color: "var(--dim)" }}>
      <div style={{ fontSize: 38, marginBottom: 10 }}>🔒</div>
      <p>Cluster pages are part of Deep Field. <a href="/deepfield" style={{ color: "var(--live)" }}>Open Deep Field →</a></p>
    </div>
  );
  if (ent === undefined || px === null) return <div style={{ textAlign: "center", fontFamily: "var(--mono)", color: "var(--faint)", padding: 60 }}>loading cluster…</div>;
  if (!c) return (
    <div style={{ maxWidth: 620, margin: "72px auto", textAlign: "center", fontFamily: "var(--sans)", color: "var(--dim)" }}>
      <p>No cluster <span style={{ fontFamily: "var(--mono)", color: "var(--tx)" }}>{shortAddr(cid)}</span>.</p>
      <p style={{ fontSize: 13, color: "var(--faint)" }}>Back to <a href="/deepfield" style={{ color: "var(--live)" }}>Deep Field →</a></p>
    </div>
  );
  if (!Array.isArray(c.buys)) return (
    <div style={{ maxWidth: 620, margin: "72px auto", textAlign: "center", fontFamily: "var(--sans)", color: "var(--dim)" }}>
      <p style={{ fontFamily: "var(--mono)" }}>Owner {shortAddr(c.id)} · {c.wallets?.length || 0} wallets · {fBal(c.bal)} SPX</p>
      <p style={{ fontSize: 13, color: "var(--faint)" }}>The aggregated buy/sell history appears after the next daily on-chain refresh. <a href="/deepfield" style={{ color: "var(--live)" }}>Back to Deep Field →</a></p>
    </div>
  );

  const wl = (c.wallets || []).slice().sort((a, b) => (c.walletBal?.[b] || 0) - (c.walletBal?.[a] || 0));
  return (
    <PositionDetail
      isMobile={isMobile} price={price} px={px}
      pos={{ bag: c.bal, avgCost: c.avgCost, realized: c.realized, buys: c.buys, sells: c.sells }}
      head={{
        seed: c.id, title: "Owner " + shortAddr(c.id), cmd: "open cluster/" + shortAddr(c.id),
        meta: <span style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--dim)" }}>{(c.wallets?.length || 0)} wallets · one owner</span>,
        links: [],
      }}
      footer={
        <div style={{ marginTop: 20, maxWidth: 820, marginInline: "auto" }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 12.5, color: "var(--dim)", margin: "0 0 8px" }}>MEMBER WALLETS · {wl.length}</div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 6 }}>
            {wl.map(a => (
              <a key={a} href={`https://app.zerion.io/${a}/overview`} target="_blank" rel="noopener noreferrer"
                style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "7px 11px", border: "1px solid var(--line2)", borderRadius: 6, textDecoration: "none", fontFamily: "var(--mono)", fontSize: 12.5 }}>
                <span style={{ color: "var(--live)" }}>{shortAddr(a)}</span>
                <span style={{ color: "var(--dim)" }}>{fBal(c.walletBal?.[a] || 0)} SPX</span>
              </a>
            ))}
          </div>
          <div style={{ fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--faint)", textAlign: "center", marginTop: 16, lineHeight: 1.6 }}>
            The whole owner as one position: transfers between the owner&apos;s own wallets are not counted as buys or sells — only SPX crossing the cluster boundary. Average-cost accounting; a positioning read, not financial advice.
          </div>
        </div>
      }
    />
  );
}
