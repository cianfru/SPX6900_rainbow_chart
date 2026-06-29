// Single source of truth for the interactive charts library — drives the gallery
// grid, the dedicated chart pages and URL deep-linking. Each entry's `id` matches
// the render switch in App.jsx (and the lazy component it mounts). `post` is the
// rotation card used only for the gallery's at-a-glance preview thumbnail
// (/api/og?post=<post>&thumb=1). Infographic cards (targets, memecoins, dials…)
// deliberately do NOT live here — they're tweet-only by design.

export const CHART_GROUPS = [
  {
    title: "Valuation",
    color: "#a78bfa",
    desc: "Where the price sits versus its long-term trend.",
    charts: [
      { id: "channel", title: "Power-Law Channel", post: "channel", desc: "Price inside its log-regression trend channel." },
      { id: "risk", title: "Risk Bands", post: "risk", desc: "Valuation risk on a 0–1 scale over time." },
      { id: "model", title: "The Model", post: "model", desc: "How the rainbow bands are fit from the data." },
    ],
  },
  {
    title: "Performance",
    color: "#4ade80",
    desc: "What it's done — rallies, drawdowns and seasonality.",
    charts: [
      { id: "rally", title: "Rallies", post: "rally", desc: "Every major rally up off the lows." },
      { id: "drawdown", title: "Drawdowns", post: "drawdown", desc: "The depth and recovery of each dip." },
      { id: "monthly", title: "Seasonality", post: "monthlyreturns", desc: "Monthly returns across every year." },
    ],
  },
  {
    title: "On-Chain",
    color: "#60a5fa",
    desc: "Holders and cost basis on-chain.",
    charts: [
      { id: "supply", title: "Holder Conviction", post: "distribution", desc: "Supply split across holder-conviction tiers." },
      { id: "holders", title: "Holders", post: "marketcap", desc: "The holder base and its average cost basis." },
    ],
  },
  {
    title: "Bitcoin & Markets",
    color: "#f7931a",
    desc: "SPX6900 against Bitcoin and the majors.",
    charts: [
      { id: "spxbtc", title: "SPX vs BTC", post: "btc", desc: "The SPX6900 / Bitcoin ratio over time." },
      { id: "btccycle", title: "Bitcoin Cycle", post: "cycle", desc: "SPX6900 tracing Bitcoin's last cycle." },
      { id: "relative", title: "vs Majors", post: "majors", desc: "SPX6900 measured against BTC, ETH and SOL." },
    ],
  },
];

// id -> { id, title, post, desc, color, group } for O(1) lookup on chart pages.
export const CHART_META = Object.fromEntries(
  CHART_GROUPS.flatMap(g => g.charts.map(c => [c.id, { ...c, color: g.color, group: g.title }]))
);

export const CHART_IDS = new Set(Object.keys(CHART_META));
