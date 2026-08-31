import { useEffect, useState } from "react";
import { loadSmartMoney, loadWhaleLots, loadPriceHistory } from "./history-data.js";
import PositionDetail, { shortAddr } from "./PositionDetail.jsx";
import { TERMINAL_KEY } from "./terminal-gate-key.js";

// PER-WALLET PAGE (terminal-tier, ?view=wallet&addr=0x…). A wallet's position: where it bought (green
// orbs) / sold (red), live P&L, realized-PnL curve — rendered by the shared PositionDetail. Data = the
// per-wallet lots from build-smart-money.mjs (the proven cohort) OR build-whale-entry.mjs (EVERY ≥100k
// whale), so any orb on "When Whales Bought" opens here, not just the smart-money 26. Terminal-gated.

export default function WalletDetail({ wallet, price, isMobile }) {
  const [sm, setSm] = useState(undefined);
  const [wl, setWl] = useState(undefined);
  const [px, setPx] = useState(null);
  const unlocked = (() => { try { return localStorage.getItem(TERMINAL_KEY) === "1"; } catch { return false; } })();

  useEffect(() => { if (unlocked) loadSmartMoney().then(d => setSm(d || null)); }, [unlocked]);
  useEffect(() => { if (unlocked) loadWhaleLots().then(d => setWl(d || null)); }, [unlocked]);
  useEffect(() => { if (unlocked) loadPriceHistory().then(setPx); }, [unlocked]);

  const addr = String(wallet || "").toLowerCase();
  const find = src => (src && Array.isArray(src.wallets) ? src.wallets.find(x => x.a === addr) : null);
  // Smart-money detail wins (it's the proven-timer cohort with the richer lot history); fall back to the
  // whale-lots reconstruction so every ≥100k wallet resolves.
  const w = find(sm) || find(wl);
  const loading = sm === undefined || wl === undefined || px === null;

  if (!unlocked) return (
    <div style={{ maxWidth: 620, margin: "72px auto", textAlign: "center", fontFamily: "var(--sans)", color: "var(--dim)" }}>
      <div style={{ fontSize: 38, marginBottom: 10 }}>🔒</div>
      <p>Wallet pages are part of Deep Field. <a href="/deepfield" style={{ color: "var(--live)" }}>Open Deep Field →</a></p>
    </div>
  );
  if (loading) return <div style={{ textAlign: "center", fontFamily: "var(--mono)", color: "var(--faint)", padding: 60 }}>loading wallet…</div>;
  if (!w) return (
    <div style={{ maxWidth: 620, margin: "72px auto", textAlign: "center", fontFamily: "var(--sans)", color: "var(--dim)" }}>
      <p>No per-wallet detail for <span style={{ fontFamily: "var(--mono)", color: "var(--tx)" }}>{shortAddr(addr)}</span> yet.</p>
      <p style={{ fontSize: 13, color: "var(--faint)" }}>Only current wallets ≥100k SPX have a reconstructed position, and the lots refresh on the next daily on-chain run. <a href="/deepfield" style={{ color: "var(--live)" }}>Back to Deep Field →</a></p>
    </div>
  );

  return (
    <PositionDetail
      isMobile={isMobile} price={price} px={px}
      pos={{ bag: w.bal, avgCost: w.avgCost, realized: w.realized, roi: w.roi, buys: w.buys, sells: w.sells }}
      head={{
        seed: addr, title: shortAddr(addr), cmd: "open wallet/" + shortAddr(addr),
        links: [
          { label: "Zerion ↗", href: `https://app.zerion.io/${addr}/overview` },
          { label: "Etherscan ↗", href: `https://etherscan.io/address/${addr}`, dim: true },
        ],
      }}
      footer={
        <div style={{ fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--faint)", textAlign: "center", marginTop: 16, lineHeight: 1.6, maxWidth: 820, marginInline: "auto" }}>
          Buys are priced at the day they landed; realized P&amp;L is average-cost (booked when coins are sold), unrealized is the current bag marked to the live price.
          On-chain has no identity — a proven operator moving to a fresh wallet resets. Terminal-only view; a positioning read, not financial advice.
        </div>
      }
    />
  );
}
