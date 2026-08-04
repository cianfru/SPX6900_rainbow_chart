// Reduce-based min/max over arbitrarily large arrays.
//
// ⚠ WHY THIS EXISTS: `Math.min(...arr)` / `Math.max(...arr)` spread the WHOLE array as function
// arguments, and the JS engine caps that at ~100-125k args — past which it throws
// "RangeError: Maximum call stack size exceeded". That exact bug took down the ETH FIFO engine
// (2.6M transfers) and the daily Solana refresh (124k rows). Any array that can GROW — an archive,
// the wallet timeline, the resident set — must use these, never the spread form.
//
// The spread form is fine (and more readable) ONLY for small FIXED-size arrays: chart points, card
// rows, a single wallet's history. Don't churn those.
//
// `sel` maps an element to its number (default identity); `seed` is the starting bound, so
// `Math.max(1, ...rows.map(r => r.bal))` becomes `maxOf(rows, r => r.bal, 1)`.

export function maxOf(arr, sel = x => x, seed = -Infinity) {
  let m = seed;
  for (let i = 0; i < arr.length; i++) { const v = sel(arr[i], i); if (v > m) m = v; }
  return m;
}

export function minOf(arr, sel = x => x, seed = Infinity) {
  let m = seed;
  for (let i = 0; i < arr.length; i++) { const v = sel(arr[i], i); if (v < m) m = v; }
  return m;
}
