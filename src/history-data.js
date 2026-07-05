// Shared, cached loader for /history.json — the daily on-chain snapshot bank
// (price, holders, cost basis, supply tiers, F&G). Several charts need it;
// this fetches it once per session and hands everyone the same promise.
// Resolves to [] on any failure so callers can treat "no data" uniformly.
let promise = null;

export function loadHistory() {
  if (!promise) {
    promise = fetch("/history.json", { cache: "no-store" })
      .then(r => (r.ok ? r.json() : []))
      .then(d => (Array.isArray(d) ? d : []))
      .catch(() => []);
  }
  return promise;
}

// Shared, cached loader for /price-history.json — the DENSE daily price series
// (built in CI from all price sources, weekly-refreshed) the charts draw from,
// so the early history isn't the ~weekly cadence of the model-fit bundle. Same
// []-on-failure contract; the drawn line falls back to the bundle if it's absent.
let pricePromise = null;
export function loadPriceHistory() {
  if (!pricePromise) {
    pricePromise = fetch("/price-history.json", { cache: "no-store" })
      .then(r => (r.ok ? r.json() : []))
      .then(d => (Array.isArray(d) ? d : []))
      .catch(() => []);
  }
  return pricePromise;
}

// Friendly copy for live-API failures. The raw error (JSON parse noise, proxy
// statuses) is meaningless to visitors — never show it in the UI.
export const LIVE_DATA_DOWN = "Live data is temporarily unavailable — try again in a minute.";
