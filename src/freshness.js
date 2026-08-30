// Shared freshness metadata for the site's "data as of" chart tags. Maps each chart to
// the runtime JSON file that backs it, its expected update cadence, and how stale is
// "too stale". Mirrors the control panel's Data-freshness strip. Charts derived purely
// from the live price feed aren't listed here — they're always current, so they get no tag.
const DAY = 86400000;

export const SOURCES = {
  snapshot:     { file: "/history.json",       pick: d => Array.isArray(d) ? d.at(-1)?.d : null, cad: "daily",   max: 2 },
  onchain:      { file: "/onchain.json",       pick: d => Array.isArray(d) ? d.at(-1)?.d : null, cad: "manual",  max: 35 },
  urpd:         { file: "/urpd.json",          pick: d => d?.updated,                            cad: "manual",  max: 35 },
  urpdhist:     { file: "/urpd-history.json",   pick: d => d?.updated,                            cad: "daily",   max: 3 },
  chainwallets: { file: "/chain-wallets.json", pick: d => Array.isArray(d) ? d.at(-1)?.d : null, cad: "daily",   max: 2 },
  btcmvrv:      { file: "/btc-mvrv.json",       pick: d => d?.updated,                            cad: "monthly", max: 40 },
};

// chart id (charts-catalog / App switch) -> which source's date to show.
export const CHART_SOURCE = {
  supplyprofit: "onchain", hodlwaves: "onchain", concentration: "onchain", freefloat: "onchain",
  hodlcompare: "onchain", lthsth: "onchain", sopr: "onchain", nupl: "onchain", holdersprice: "onchain",
  urpd: "urpd", walletgrowth: "chainwallets", mvrvbtc: "btcmvrv", mvrv: "snapshot", costbasisladder: "urpdhist",
};

const cache = {};
export function loadSourceDate(key) {
  const s = SOURCES[key];
  if (!s) return Promise.resolve(null);
  if (!cache[key]) {
    cache[key] = fetch(s.file, { cache: "no-store" })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { try { return s.pick(d) || null; } catch { return null; } })
      .catch(() => null);
  }
  return cache[key];
}

export function freshnessOf(date, key) {
  const s = SOURCES[key] || {};
  const days = date ? Math.max(0, Math.floor((Date.now() - Date.parse(date + "T00:00:00Z")) / DAY)) : null;
  const stale = days == null || days > (s.max ?? 1e9);
  return { date, days, stale, cad: s.cad, manual: s.cad === "manual" };
}
