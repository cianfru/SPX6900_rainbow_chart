// "$100 at SPX6900's launch, invested four ways" — the growth of an identical $100
// buy on SPX's first day (Aug '23) in SPX6900 vs Bitcoin vs the S&P 500 vs cash. Pure
// data (no renderer deps) so the card AND the tweet copy read the SAME numbers.
// SPX uses the live price; BTC/S&P use their bundled daily histories (they move slowly
// enough that a ~day-stale "now" is immaterial next to the multiples involved).
import { DEFAULT_RAW } from "../../src/data.js";
import { BTC_HISTORY, BTC_FIRST_DATE } from "../../src/btc-history.js";
import { SP500_HISTORY } from "../../src/sp500-history.js";

const DAY = 86400000;
const CASH_APY = 0.045; // a representative high-yield savings rate over the window

// BTC history is [ageDays since BTC_FIRST_DATE, price]; find the price nearest a date.
function btcAt(date) {
  const age = (Date.parse(date) - Date.parse(BTC_FIRST_DATE)) / DAY;
  let best = BTC_HISTORY[0], bd = Infinity;
  for (const [a, p] of BTC_HISTORY) { const d = Math.abs(a - age); if (d < bd) { bd = d; best = [a, p]; } }
  return best[1];
}
// S&P history is [date, close]; nearest close to a date.
function spAt(date) {
  let best = SP500_HISTORY[0], bd = Infinity;
  for (const [d, c] of SP500_HISTORY) { const dd = Math.abs(Date.parse(d) - Date.parse(date)); if (dd < bd) { bd = dd; best = [d, c]; } }
  return best[1];
}

// Returns [{ name, key, v, color }] — v = what $100 became. Ordered biggest first.
export function hundredVsData(stats) {
  const START = 100;
  const firstDate = stats.firstDate || DEFAULT_RAW[0].date;
  const firstPrice = stats.firstPrice || DEFAULT_RAW[0].price;
  const nowDate = stats.date || DEFAULT_RAW.at(-1).date;
  const years = Math.max(0.01, (Date.parse(nowDate) - Date.parse(firstDate)) / (365.25 * DAY));
  const items = [
    { name: "SPX6900", key: "spx", color: "#4ade80", v: START * stats.price / firstPrice },
    { name: "Bitcoin", key: "btc", color: "#f7931a", v: START * BTC_HISTORY.at(-1)[1] / btcAt(firstDate) },
    { name: "S&P 500", key: "sp", color: "#60a5fa", v: START * SP500_HISTORY.at(-1)[1] / spAt(firstDate) },
    { name: "Cash 4.5% APY", key: "cash", color: "#94a3b8", v: START * Math.pow(1 + CASH_APY, years) },
  ];
  return { items: items.sort((a, b) => b.v - a.v), start: START, firstDate, years };
}
