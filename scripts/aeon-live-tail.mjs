// ============================================================================
// PROJECT AEON — splice banked live sales onto the Dune baseline
// ============================================================================
// Dune (weekly) owns the deep full history; the Alchemy bank (daily, free) carries the
// recent edge. This returns ONLY the rows newer than the Dune CSV's last sale, in the
// same shape each builder already works with, so neither builder needs to know where a
// row came from and the two can never double-count.
//
// USD is derived from the most recent ETH/USD implied by the Dune rows themselves
// (price_usd ÷ price). That rate is at most a few days old, which is fine for a volume
// series — and it keeps this dependency-free rather than adding a price API just to
// convert a handful of tail rows.
// ============================================================================
import { readFileSync } from "node:fs";

const BANK = "public/aeon-live-sales.json";

const readJson = (p, d) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return d; } };

/**
 * Banked sales strictly newer than `afterTs`.
 * @param afterTs epoch ms of the last Dune sale — the seam.
 * @returns [{ t, id, price, mkt, buyer, seller, tx }] oldest → newest.
 */
export function liveTail(afterTs, { bankPath = BANK, bank } = {}) {
  const b = bank ?? readJson(bankPath, { sales: [] });
  const rows = [];
  for (const s of b.sales || []) {
    const t = s.ts ?? Date.parse(s.d);
    if (!(t > afterTs) || !(s.price > 0) || s.id == null) continue;
    rows.push({ t, id: Number(s.id), price: s.price, mkt: s.mkt || "other", buyer: s.buyer || "", seller: s.seller || "", tx: s.tx || null });
  }
  return rows.sort((a, b2) => a.t - b2.t);
}

/** ETH→USD implied by the Dune rows, so tail rows can carry a USD figure too. */
export function impliedEthUsd(duneRows) {
  for (let i = (duneRows?.length || 0) - 1; i >= 0; i--) {
    const r = duneRows[i];
    if (r?.eth > 0 && r?.usd > 0) return r.usd / r.eth;
  }
  return null;
}

/** Log a one-line summary of what the splice added (or why it added nothing). */
export function describeTail(tail, label) {
  if (!tail.length) return `  ${label}: no live tail (Dune baseline is current)`;
  const first = new Date(tail[0].t).toISOString().slice(0, 10);
  const last = new Date(tail[tail.length - 1].t).toISOString().slice(0, 10);
  return `  ${label}: +${tail.length} live sale(s) spliced forward (${first} → ${last}, Alchemy)`;
}
