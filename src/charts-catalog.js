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
      { id: "roadmap", title: "Price Roadmap", post: "roadmap", desc: "The trend extrapolated — when it crosses $6.90/$69/$690." },
      { id: "quantilefan", title: "Quantile Fan", desc: "Probabilistic price cone — 1st to 99th percentile, projected." },
      { id: "risk", title: "Risk Bands", post: "risk", desc: "Valuation risk on a 0–1 scale over time." },
      { id: "riskcolor", title: "Valuation Z-Score", post: "riskcolor", desc: "Price recoloured by how many σ from fair value." },
      { id: "riskheat", title: "20-Week Heat", post: "riskheat", desc: "How stretched price is from its 20-week average." },
      { id: "picycle", title: "Pi Cycle Ratio", post: "picycle", desc: "Bitcoin's Pi Cycle top/bottom gauge, applied to SPX for context." },
      { id: "rsidots", title: "RSI Dots", post: "rsidots", desc: "Price as dots coloured by RSI, PlanB-style." },
      { id: "valuation", title: "Valuation Composite", post: "valband", desc: "A weighted basket of six indicators — over/undervalued vs its own history, over time." },
      { id: "model", title: "The Model", post: "model", desc: "How the rainbow bands are fit from the data." },
    ],
  },
  {
    title: "Performance",
    color: "#4ade80",
    desc: "What it's done — rallies, drawdowns, ROI and seasonality.",
    charts: [
      { id: "rally", title: "Rallies", post: "rally", desc: "Every major rally up off the lows." },
      { id: "drawdown", title: "Drawdowns", post: "drawdown", desc: "The depth and recovery of each dip." },
      { id: "runningroi", title: "Performance", post: "runningroi", desc: "Growth from any window's start — drag to zoom in." },
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
      { id: "holdersprice", title: "Holders vs Price", post: "marketcap", desc: "Does accumulation hold through the price swings?" },
      { id: "supplyprofit", title: "Supply in Profit", post: "supplyprofit", desc: "Share of supply held above its on-chain cost basis." },
      { id: "hodlwaves", title: "HODL Waves", post: "hodlwaves", desc: "Supply by holding age — fresh coins to diamond hands." },
      { id: "freefloat", title: "Liquid vs Illiquid Supply", post: "freefloat", desc: "How much supply is sticky (long-term held) vs likely to move — SPX vs Bitcoin." },
      { id: "concentration", title: "Holder Concentration", post: "concentration", desc: "The largest wallets' share of supply over time." },
      { id: "whales", title: "Whale Supply", post: "whales", desc: "What the biggest wallets hold, and whether there are more of them." },
      { id: "walletwaves", title: "Wallet-Size Waves", post: "walletwaves", desc: "Supply by how big the wallet is — HODL waves cut by size, not age." },
      { id: "wealthwaves", title: "The Wealth Ladder", post: "wealthwaves", desc: "How many holders sit in each dollar bracket, week by week." },
      { id: "urpd", title: "Cost Basis Distribution", post: "urpd", desc: "Where every held coin was bought — the walls of supply." },
      { id: "urpdage", title: "Cost Basis × Age", post: "urpdage", desc: "The walls of supply mapped by holder age — same price, different conviction." },
      { id: "lthsth", title: "Long vs Short-Term Holders", post: "lthsth", desc: "Supply by holder age and profit/loss — who's holding, and are they up?" },
      { id: "sopr", title: "SOPR", post: "sopr", desc: "When coins move, are they sold at a profit or a loss?" },
      { id: "nrpl", title: "Net Realized Profit/Loss", post: "nrpl", desc: "The dollar size of gains vs losses locked in when coins move." },
      { id: "liveliness", title: "Liveliness", post: "liveliness", desc: "Are long-held coins waking up, or is the base sitting tight?" },
      { id: "citylab", title: "City Lab (3D)", dev: true, desc: "The same block drawn two ways \u2014 comparing the current look against a more realistic one." },
      { id: "spxcity", title: "SPX City (3D)", post: "whalewatch", dev: true, desc: "Every holder is a building — switch between SPX holders, AEON collectors, and the wallets that qualify on both." },
      { id: "cexsupply", title: "Supply on Exchanges", post: "cexsupply", desc: "Where the tradable float sits — exchanges, LP and custody, from DEX-native to CEX-listed." },
      { id: "cexflow", title: "Exchange Flow", post: "cexflow", desc: "Daily net flow on/off exchanges vs price — deposits, withdrawals, listings stripped." },
      { id: "cexvenues", title: "Exchange Supply by Venue", post: "cexvenues", desc: "SPX on each exchange over time — how the venue mix shifted as listings landed." },
      { id: "cexvenflow", title: "Exchange Flow by Venue", post: "cexvenflow", desc: "Which exchanges gained vs bled SPX — per-venue net flow, pick the window." },
      { id: "walletgrowth", title: "Wallet Growth", post: "walletgrowth", desc: "Wallets across Ethereum, Base and Solana, from launch." },
      { id: "mvrv", title: "MVRV & Realized Price", post: "breakeven", desc: "Price vs the crowd's cost basis — MVRV and its Z-score." },
      { id: "nupl", title: "NUPL", post: "nupl", desc: "Are holders in profit or loss? Sentiment from euphoria to capitulation." },
      { id: "mvrvbtc", title: "MVRV vs Bitcoin", desc: "SPX6900's MVRV on Bitcoin's decade of MVRV — are we down similarly?" },
      { id: "longshort", title: "On-Chain Positioning", desc: "Hyperliquid perp funding — are traders leaning long or short?" },
    ],
  },
  {
    title: "Bitcoin & Markets",
    color: "#f7931a",
    desc: "SPX6900 against Bitcoin and the majors.",
    charts: [
      { id: "spxbtc", title: "SPX vs BTC", post: "btc", desc: "The SPX6900 / Bitcoin ratio over time." },
      { id: "btccycle", title: "Bitcoin Cycle", post: "cycle", desc: "SPX6900 tracing Bitcoin's last cycle." },
      { id: "relative", title: "Rich / Cheap vs Majors", post: "majors", desc: "Valuation ratio vs BTC, ETH and SOL." },
      { id: "altmarket", title: "SPX vs the Alt Market", post: "altmarket", desc: "Rich or cheap vs the whole alt sector (ex-BTC/ETH/stables)." },
    ],
  },
  {
    title: "Races",
    color: "#22d3ee",
    desc: "Same-start performance races — pick the window.",
    charts: [
      { id: "vsmajors", title: "SPX vs Majors", post: "majors", desc: "Rebased race vs BTC, ETH and SOL — YTD, 12mo or since launch." },
      { id: "vsmemekings", title: "SPX vs Memekings", post: "memecoins", desc: "Rebased race vs DOGE, SHIB and PEPE — YTD, 12mo or since launch." },
    ],
  },
];

// Project Aeon lives under its OWN tab (route === "aeon"), NOT in the SPX charts
// gallery — kept as a separate group set so the two never mix.
export const AEON_GROUPS = [
  {
    title: "Project Aeon",
    color: "#2dd4bf",
    desc: "On-chain analytics for the Project AEON NFT collection (3,333 · Ethereum).",
    charts: [
      { id: "aeonfloor", title: "Floor & Sales", desc: "Floor price (ETH & USD) and trading volume since mint." },
      { id: "aeonrarity", title: "Rarity — Where Does It Sit?", desc: "Look up any AEON — its rarity rank, tier and traits, on the collection's rarity curve." },
      { id: "aeonvalue", title: "Live Listings vs What They Sell For", desc: "Every active ask measured against what comparable pieces actually fetch — what is cheap, and what is over market." },
      { id: "aeonvsspx", title: "AEON Floor vs SPX", desc: "The NFT floor priced in SPX6900 — cheap or expensive versus its baseline." },
      { id: "aeontraders", title: "Trader Leaderboard", desc: "Who made money trading AEON — realized P&L, hold time and win rate per wallet." },
      { id: "aeonvaluation", title: "MVRV & Supply in Profit", desc: "NFT MVRV and the cost-basis distribution — are holders in profit vs the floor?" },
      { id: "aeonsalesrarity", title: "What Actually Sold — Rarity vs Price", desc: "Completed sales history: what each piece really fetched vs its rarity — the steals and the record sales." },
      { id: "aeontraits", title: "Trait Values", desc: "Which traits command a premium — median sale price per trait." },
      { id: "aeonhodl", title: "Holder Age", desc: "Each AEON by how long since it last changed hands — the maturation story." },
      { id: "aeonowners", title: "Owners Over Time", desc: "The holder base since mint, split by how many tokens each wallet holds." },
      { id: "aeonconcentration", title: "Concentration", desc: "The largest wallets' share of the collection over time." },
      { id: "aeonbehaviour", title: "Holder Flow", desc: "Wallets entering (buying) vs exiting (selling) the collection each month." },
    ],
  },
];

// id -> { id, title, post, desc, color, group } for O(1) lookup on chart pages —
// spans BOTH the SPX gallery and the Aeon tab so every chart page resolves.
export const CHART_META = Object.fromEntries(
  [...CHART_GROUPS, ...AEON_GROUPS].flatMap(g => g.charts.map(c => [c.id, { ...c, color: g.color, group: g.title }]))
);

export const CHART_IDS = new Set(Object.keys(CHART_META));

// ── Method families ─────────────────────────────────────────────────────────
// Every chart is computed one of seven ways. The GROUPS above answer "what is this
// about"; these answer "how is this worked out". Nothing renders these as a page —
// they exist so the library search can match on method, which is how typing
// "cost basis" surfaces all fifteen charts built on the FIFO reconstruction even
// though only two of them say those words.
export const METHOD_FAMILIES = [
  {
    id: "01", name: "Power-law fit",
    charts: ["channel", "roadmap", "quantilefan", "risk", "riskcolor", "model", "valuation"],
  },
  {
    id: "02", name: "Borrowed frameworks",
    charts: ["picycle", "rsidots", "riskheat", "btccycle"],
  },
  {
    id: "03", name: "Return arithmetic",
    charts: ["rally", "drawdown", "runningroi", "monthly"],
  },
  {
    id: "04", name: "Cost basis & holder behaviour",
    charts: ["supply", "holders", "holdersprice", "supplyprofit", "hodlwaves", "freefloat", "concentration",
             "whales", "walletwaves", "wealthwaves",
             "urpd", "urpdage", "lthsth", "sopr", "nrpl", "liveliness", "spxcity", "citylab", "walletgrowth", "mvrv", "nupl", "mvrvbtc"],
  },
  {
    id: "05", name: "Exchange & venue balances",
    charts: ["cexsupply", "cexflow", "cexvenues", "cexvenflow", "longshort"],
  },
  {
    id: "06", name: "Relative value & races",
    charts: ["spxbtc", "relative", "altmarket", "vsmajors", "vsmemekings"],
  },
  {
    id: "07", name: "NFT collection analytics",
    charts: AEON_GROUPS[0].charts.map(c => c.id),
  },
];

// id -> family, so a chart page can name how it was worked out.
export const METHOD_OF = Object.fromEntries(
  METHOD_FAMILIES.flatMap(f => f.charts.map(id => [id, f.id]))
);
