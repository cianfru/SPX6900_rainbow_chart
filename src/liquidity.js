// Liquid vs Illiquid Supply (SPX6900) — the standard, Glassnode-aligned "how much supply is
// actually likely to move" metric. NOT "free float" (for a fair-launch token ~88% is technically
// tradable → uninteresting), NOT "locked" (self-custody isn't locked). Definitions:
//   ILLIQUID = long-term holders, self-custody, held > 155 DAYS (Glassnode's empirical LTH bar).
//   LIQUID   = short-term holders (< 155d) + always-liquid excluded supply (CEX + LP + custody).
// Denominator = ETH-native tradable universe (holders + CEX/LP), excl bridge-locked + the 69M burn.
// Reproducible from the FIFO engine's per-lot age (heldTokens/liqEx/lth fields in SPX_ONCHAIN).

export function spxLiquidity(onchain) {
  return (onchain || [])
    .filter(r => Number.isFinite(r.heldTokens) && r.heldTokens > 0 && r.d)
    .map(r => {
      const lthPct = (r.lthProfit || 0) + (r.lthLoss || 0);   // % of holder supply held > 155d
      const illiq = r.heldTokens * lthPct / 100;              // long-term holder tokens
      const liqHolders = r.heldTokens - illiq;                // short-term holder tokens
      const liqEx = r.liqEx || 0;                             // CEX + LP + custody (always liquid)
      const liq = liqHolders + liqEx;
      const denom = illiq + liq || 1;
      return { ts: Date.parse(r.d), illiq, liq, illiqPct: 100 * illiq / denom, liqPct: 100 * liq / denom };
    })
    .filter(r => Number.isFinite(r.ts))
    .sort((a, b) => a.ts - b.ts);
}

// BTC illiquid over its history from the free BigQuery UTXO HODL bundle (BTC_HODL): the share
// held > 155 days. Bands = [0-1m, 1-3m, 3-6m, 6-12m, 1y+]; 155d ≈ 5.1 months, so >155d = all of
// 1y+ and 6-12m, plus the >155d slice of the 3-6m band (155-180 of the 90-180d band ≈ 27.8%).
const F36 = (180 - 155) / (180 - 90);
export function btcIlliquid(BTC_HODL) {
  return (BTC_HODL || [])
    .filter(r => Array.isArray(r[1]) && r[1].length === 5)
    .map(r => { const a = r[1]; return { ts: Date.parse(r[0]), illiqPct: a[4] + a[3] + a[2] * F36 }; })
    .filter(r => Number.isFinite(r.ts));
}
