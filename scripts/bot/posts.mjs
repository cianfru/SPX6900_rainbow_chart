// Rotating "daily pill" posts. Each entry turns the live stats into an
// informative blurb + a card. The bot rotates through them by day so followers
// get a different angle on the same data set each day.

const fPrice = p => (p >= 1 ? "$" + p.toFixed(2) : "$" + p.toFixed(4));
const fPct = x => (x >= 0 ? "+" : "") + Math.round(x * 100).toLocaleString() + "%";
const fMult = x => (x >= 100 ? Math.round(x).toLocaleString() : x.toFixed(1)) + "×";
const fMon = d => { const t = new Date(d); return t.toLocaleString("en-US", { month: "short" }) + " '" + String(t.getFullYear()).slice(2); };
const fMoney = n => (n >= 1e9 ? "$" + (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? "$" + (n / 1e6).toFixed(0) + "M" : "$" + (n / 1e3).toFixed(0) + "K");
const fNum = n => Math.round(n).toLocaleString();
const BAND_EMOJI = ["🟣", "🔵", "🟦", "🟢", "🟩", "🟡", "🟠", "🔴", "🟥"];

// Each builder returns { id, text, card }. card is { type:"rainbow" } or
// { type:"stat", spec } (see stat-card.mjs).
const POSTS = [
  // 1 — valuation / rainbow
  s => ({
    id: "valuation",
    text:
`📊 Where is SPX6900 vs its long-run trend?
${BAND_EMOJI[s.bandIndex]} ${s.band.l} band — ${fPct(s.vsCenter)} vs the model's center line (${fPrice(s.center)}).
The rainbow bands show how stretched price is from its log-regression trend.
🌈 spx6900rainbow.xyz · NFA`,
    card: { type: "rainbow" },
  }),

  // 2 — risk gauge
  s => ({
    id: "risk",
    text:
`🌡️ SPX6900 valuation risk: ${s.risk.toFixed(2)} / 1.00
0 = cheapest vs trend ever seen, 1 = the most expensive. Today reads ${s.risk < 0.34 ? "historically cheap" : s.risk < 0.66 ? "fair" : "rich"}.
It's how far price has stretched from its log trend, normalized over all history.
spx6900rainbow.xyz · NFA`,
    card: { type: "stat", spec: {
      title: "Valuation risk gauge", big: s.risk.toFixed(2) + " / 1", accent: "#22d3ee",
      sub: "0 = cheapest vs trend ever · 1 = most expensive ever",
      rows: [
        { label: "BAND", value: s.band.l, color: s.band.c },
        { label: "VS TREND", value: fPct(s.vsCenter) },
        { label: "CHEAPER DAYS", value: Math.round((1 - s.cheaperFrac) * 100) + "%" },
      ],
    } },
  }),

  // 3 — drawdown from ATH
  s => ({
    id: "drawdown",
    text:
`📉 SPX6900 is ${fPct(s.drawdown)} from its all-time high (${fPrice(s.ath)}, ${fMon(s.athDate)}).
Drawdowns map the pain from each peak — the worst on record was ${fPct(s.maxDrawdown)}.
Zoom out before you panic (or FOMO).
spx6900rainbow.xyz · NFA`,
    card: { type: "stat", spec: {
      title: "Drawdown from all-time high", big: fPct(s.drawdown), accent: "#f87171",
      sub: `ATH ${fPrice(s.ath)} set ${fMon(s.athDate)}`,
      rows: [
        { label: "ALL-TIME HIGH", value: fPrice(s.ath) },
        { label: "WORST EVER", value: fPct(s.maxDrawdown), color: "#f87171" },
        { label: "PRICE NOW", value: fPrice(s.price) },
      ],
    } },
  }),

  // 4 — rally since last fire sale
  s => s.lastFireSale && ({
    id: "rally",
    text:
`🚀 Since the last "Fire Sale" capitulation low (${fMon(s.lastFireSale.date)}, ${fPrice(s.lastFireSale.low)}), SPX6900 is ${fPct(s.lastFireSale.sinceGain)} — and peaked ${fPct(s.lastFireSale.peakGain)} along the way.
The rally chart tracks every recovery from the cheapest band.
spx6900rainbow.xyz · NFA`,
    card: { type: "stat", spec: {
      title: "Since the last Fire Sale low", big: fPct(s.lastFireSale.sinceGain), accent: "#4ade80",
      sub: `Capitulation low ${fPrice(s.lastFireSale.low)} on ${fMon(s.lastFireSale.date)}`,
      rows: [
        { label: "PEAK RUN", value: fPct(s.lastFireSale.peakGain), color: "#4ade80" },
        { label: "PRICE NOW", value: fPrice(s.price) },
        { label: "BAND", value: s.band.l, color: s.band.c },
      ],
    } },
  }),

  // 5 — strategy edge
  s => s.edge && ({
    id: "strategy",
    text:
`🧪 Hindsight check: buying every cycle dip and selling its peak would've beaten HODL ~${fMult(s.edge)} in this model.
Perfect timing isn't real — but it shows how much SPX6900's cycles matter.
spx6900rainbow.xyz · NFA`,
    card: { type: "stat", spec: {
      title: "Timing the dips vs HODL (hindsight)", big: fMult(s.edge), accent: "#a78bfa",
      sub: "Buy each cycle low, sell its peak, compounded — vs buy & hold",
      rows: [
        { label: "BAND NOW", value: s.band.l, color: s.band.c },
        { label: "RISK", value: s.risk.toFixed(2) + "/1" },
        { label: "VS TREND", value: fPct(s.vsCenter) },
      ],
    } },
  }),

  // 6 — targets
  s => {
    const next = s.targets.find(t => t.mult > 1) || s.targets[0];
    const others = s.targets.filter(t => t !== next).slice(0, 3);
    return {
      id: "targets",
      text:
`🎯 SPX6900 from ${fPrice(s.price)} to the targets:
${s.targets.slice(0, 3).map(t => `${t.label} → ${fMult(t.mult)}`).join("\n")}
A log-trend extrapolation, not a promise.
spx6900rainbow.xyz · NFA`,
      card: { type: "stat", spec: {
        title: `Distance to ${next.label}`, big: fMult(next.mult), accent: "#f59e0b",
        sub: `to reach ${next.label} from ${fPrice(s.price)} today`,
        rows: others.map(t => ({ label: t.label, value: fMult(t.mult), color: t.c })),
      } },
    };
  },

  // 7 — time spent this cheap
  s => ({
    id: "timeinband",
    text:
`⏳ SPX6900 has closed in the ${s.band.l} band or cheaper on ~${Math.round(s.cheaperFrac * 100)}% of all days in its history.
Extremes are rare; most of life is spent mid-bands. Today: ${BAND_EMOJI[s.bandIndex]} ${s.band.l}.
spx6900rainbow.xyz · NFA`,
    card: { type: "stat", spec: {
      title: "Time spent this cheap (or cheaper)", big: Math.round(s.cheaperFrac * 100) + "%", accent: s.band.c,
      sub: `Share of all days closing in the ${s.band.l} band or below`,
      rows: [
        { label: "BAND NOW", value: s.band.l, color: s.band.c },
        { label: "VS TREND", value: fPct(s.vsCenter) },
        { label: "RISK", value: s.risk.toFixed(2) + "/1" },
      ],
    } },
  }),

  // 8 — diamond-adjusted "real" market cap
  s => s.supply && ({
    id: "marketcap",
    text:
`💰 SPX6900's "real" market cap
Headline MC ${fMoney(s.supply.nominalMc)} (price × 939M supply). But diamond hands hold ~${Math.round(s.supply.diamondShare * 100)}% of supply and rarely sell — so the effective free-float MC is just ${fMoney(s.supply.floatMc)}.
spx6900rainbow.xyz · NFA`,
    card: { type: "stat", spec: {
      title: "Free-float market cap (ex-diamond)", big: fMoney(s.supply.floatMc), accent: "#22d3ee",
      sub: `Diamond hands lock ~${Math.round(s.supply.diamondShare * 100)}% of supply and rarely sell`,
      rows: [
        { label: "HEADLINE MC", value: fMoney(s.supply.nominalMc) },
        { label: "DIAMOND LOCKED", value: Math.round(s.supply.diamondShare * 100) + "%", color: "#22d3ee" },
        { label: "HOLDERS", value: fNum(s.supply.holders) },
      ],
    } },
  }),

  // 9 — valuation vs BTC
  s => s.btc && ({
    id: "btc",
    text:
`₿ SPX6900 priced in Bitcoin: 1 SPX = ${fNum(s.btc.sats)} sats.
vs BTC: ${fPct(s.btc.rel90)} (90d), ${fPct(s.btc.rel365)} (1yr).
Memecoins live or die against BTC — this is the real benchmark.
spx6900rainbow.xyz · NFA`,
    card: { type: "stat", spec: {
      title: "SPX6900 priced in Bitcoin", big: fNum(s.btc.sats) + " sats", accent: "#f7931a",
      sub: `1 SPX = ${fNum(s.btc.sats)} sats · BTC ${fMoney(s.btc.btcNow)}`,
      rows: [
        { label: "VS BTC 90D", value: fPct(s.btc.rel90), color: s.btc.rel90 >= 0 ? "#4ade80" : "#f87171" },
        { label: "VS BTC 1YR", value: fPct(s.btc.rel365), color: s.btc.rel365 >= 0 ? "#4ade80" : "#f87171" },
        { label: "BTC PRICE", value: fMoney(s.btc.btcNow) },
      ],
    } },
  }),

  // 10 — all-time return
  s => ({
    id: "alltime",
    text:
`📈 From its first print (${fPrice(s.firstPrice)}, ${fMon(s.firstDate)}) SPX6900 is up ${fMult(1 + s.allTimeReturn)}.
Zoom out: the log-regression trend still points up at a power-law pace.
spx6900rainbow.xyz · NFA`,
    card: { type: "stat", spec: {
      title: "Since launch", big: fMult(1 + s.allTimeReturn), accent: "#34d399",
      sub: `First print ${fPrice(s.firstPrice)} on ${fMon(s.firstDate)}`,
      rows: [
        { label: "ALL-TIME HIGH", value: fPrice(s.ath) },
        { label: "PRICE NOW", value: fPrice(s.price) },
        { label: "VS TREND", value: fPct(s.vsCenter) },
      ],
    } },
  }),
];

export function allIds(stats) { return POSTS.map(p => p(stats)?.id).filter(Boolean); }

// Pick the post. Override with id (env BOT_POST / --post=id) for testing,
// otherwise rotate by day so the topic changes daily.
export function buildPost(stats, now = new Date(), overrideId = null) {
  const built = POSTS.map(p => p(stats)).filter(Boolean);
  if (overrideId) {
    const hit = built.find(p => p.id === overrideId);
    if (hit) return hit;
  }
  const epochDay = Math.floor(now.getTime() / 86400000);
  return built[epochDay % built.length];
}
