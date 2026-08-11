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
    title: "Holders",
    color: "#60a5fa",
    desc: "Who holds SPX — the holder base, its conviction, and how it grew across chains.",
    charts: [
      { id: "supply", title: "Holder Conviction", post: "distribution", desc: "Supply split across holder-conviction tiers." },
      { id: "holders", title: "Holders", post: "marketcap", desc: "The holder base and its average cost basis." },
      { id: "holdersprice", title: "Holders vs Price", post: "marketcap", desc: "Does accumulation hold through the price swings?" },
      { id: "hodlwaves", title: "HODL Waves", post: "hodlwaves", desc: "Supply by holding age — fresh coins to diamond hands." },
      { id: "freefloat", title: "Liquid vs Illiquid Supply", post: "freefloat", desc: "How much supply is sticky (long-term held) vs likely to move — SPX vs Bitcoin." },
      { id: "walletgrowth", title: "Wallet Growth", post: "walletgrowth", desc: "Wallets across Ethereum, Base and Solana, from launch." },
    ],
  },
  {
    title: "Cost Basis & Profit",
    color: "#38bdf8",
    desc: "Where the bags were bought, and whether holders are in profit — cost basis, MVRV and realized flows.",
    charts: [
      { id: "bagsprofile", title: "Cost Basis vs Price", desc: "A volume-profile: the price line, and where the bags were bought as bars on the price axis — live." },
      { id: "urpdage", title: "Cost Basis × Age", post: "urpdage", desc: "The walls of supply mapped by holder age — same price, different conviction." },
      { id: "urpdterrain", title: "Cost Basis Terrain (3D)", desc: "The cost-basis distribution as a landscape deforming week by week, with price sweeping through it." },
      { id: "supplyprofit", title: "Supply in Profit", post: "supplyprofit", desc: "Share of supply held above its on-chain cost basis." },
      { id: "mvrv", title: "MVRV & Realized Price", post: "breakeven", desc: "Price vs the crowd's cost basis — MVRV and its Z-score." },
      { id: "mvrvbtc", title: "MVRV vs Bitcoin", desc: "SPX6900's MVRV on Bitcoin's decade of MVRV — are we down similarly?" },
      { id: "nupl", title: "NUPL", post: "nupl", desc: "Are holders in profit or loss? Sentiment from euphoria to capitulation." },
      { id: "lthsth", title: "Long vs Short-Term Holders", post: "lthsth", desc: "Supply by holder age and profit/loss — who's holding, and are they up?" },
      { id: "sopr", title: "SOPR", post: "sopr", desc: "When coins move, are they sold at a profit or a loss?" },
      { id: "nrpl", title: "Net Realized Profit/Loss", post: "nrpl", desc: "The dollar size of gains vs losses locked in when coins move." },
      { id: "liveliness", title: "Liveliness", post: "liveliness", desc: "Are long-held coins waking up, or is the base sitting tight?" },
    ],
  },
  {
    title: "Whales & Survivors",
    color: "#818cf8",
    desc: "Who owns what — the biggest wallets, the clusters behind them, and who's still here.",
    charts: [
      { id: "concentration", title: "Holder Concentration", post: "concentration", desc: "The largest wallets' share of supply over time." },
      { id: "entities", title: "Wallet Clusters", desc: "Who owns what — the addresses one owner controls, linked into a single entity from on-chain SPX flows." },
      { id: "whales", title: "Whale Supply", post: "whales", desc: "What the biggest wallets hold, and whether there are more of them." },
      { id: "whalecohorts", title: "Whale Counts Over Time", post: "whalecensus", desc: "How many wallets sit in each size cohort, week by week — the base broadened, the mega-whales thinned." },
      { id: "walletwaves", title: "Wallet-Size Waves", post: "walletwaves", desc: "Supply by how big the wallet is — HODL waves cut by size, not age." },
      { id: "wealthwaves", title: "The Wealth Ladder", post: "wealthwaves", desc: "How many holders sit in each dollar bracket, week by week." },
      { id: "survivorship", title: "Who's Still Here", post: "survivorship", desc: "Of everyone who ever held SPX, who remains — by the era they first bought." },
      { id: "exitflow", title: "How Holders Left", post: "exitmap", desc: "Of everyone who left, when they sold and whether they left in profit or at a loss — over the price." },
      { id: "smartmoney", title: "Smart Money", post: "smartmoney", desc: "The live cohort of proven top-timers (ROI ≥5×, still holding) — aggregate holdings and net-flow." },
      { id: "whaleswatching", title: "Whales Watching", post: "whalebehaviour", locked: true, desc: "Every wallet over 100k SPX — a 3D city of towers or a live board pulsing green/red as they buy and sell." },
    ],
  },
  {
    title: "Exchanges",
    color: "#2dd4bf",
    desc: "Where the tradable float sits and how it flows on and off exchanges.",
    charts: [
      { id: "cexsupply", title: "Supply on Exchanges", post: "cexsupply", desc: "Where the tradable float sits — exchanges, LP and custody, from DEX-native to CEX-listed." },
      { id: "cexflow", title: "Exchange Flow", post: "cexflow", desc: "Daily net flow on/off exchanges vs price — deposits, withdrawals, listings stripped." },
      { id: "cexvenues", title: "Exchange Supply by Venue", post: "cexvenues", desc: "SPX on each exchange over time — how the venue mix shifted as listings landed." },
      { id: "cexvenflow", title: "Exchange Flow by Venue", post: "cexvenflow", desc: "Which exchanges gained vs bled SPX — per-venue net flow, pick the window." },
    ],
  },
  {
    title: "Markets & Positioning",
    color: "#f7931a",
    desc: "SPX6900 against Bitcoin and the majors, plus derivatives positioning.",
    charts: [
      { id: "spxbtc", title: "SPX vs BTC", post: "btc", desc: "The SPX6900 / Bitcoin ratio over time." },
      { id: "btccycle", title: "Bitcoin Cycle", post: "cycle", desc: "SPX6900 tracing Bitcoin's last cycle." },
      { id: "relative", title: "Rich / Cheap vs Majors", post: "majors", desc: "Valuation ratio vs BTC, ETH and SOL." },
      { id: "altmarket", title: "SPX vs the Alt Market", post: "altmarket", desc: "Rich or cheap vs the whole alt sector (ex-BTC/ETH/stables)." },
      { id: "longshort", title: "Perp Positioning", desc: "Hyperliquid perp funding — are traders leaning long or short?" },
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
    title: "Market",
    color: "#2dd4bf",
    desc: "Floor, sales and value for the Project AEON collection (3,333 · Ethereum).",
    charts: [
      { id: "aeonfloor", title: "Floor & Sales", desc: "Floor price (ETH & USD) and trading volume since mint." },
      { id: "aeonvsspx", title: "AEON Floor vs SPX", desc: "The NFT floor priced in SPX6900 — cheap or expensive versus its baseline." },
      { id: "aeonvaluation", title: "MVRV & Supply in Profit", desc: "NFT MVRV and the cost-basis distribution — are holders in profit vs the floor?" },
      { id: "aeonleadlag", title: "Does the Floor Lead the Coin?", desc: "Lead/lag test of AEON's floor and sales against SPX6900 — which one moves first." },
      { id: "aeontraders", title: "Trader Leaderboard", desc: "Who made money trading AEON — realized P&L, hold time and win rate per wallet." },
    ],
  },
  {
    title: "Holders",
    color: "#818cf8",
    desc: "Who holds AEON — age, ownership, concentration and flow.",
    charts: [
      { id: "aeonhodl", title: "Holder Age", desc: "Each AEON by how long since it last changed hands — the maturation story." },
      { id: "aeonowners", title: "Owners Over Time", desc: "The holder base since mint, split by how many tokens each wallet holds." },
      { id: "aeonconcentration", title: "Concentration", desc: "The largest wallets' share of the collection over time." },
      { id: "aeonbehaviour", title: "Holder Flow", desc: "Wallets entering (buying) vs exiting (selling) the collection each month." },
    ],
  },
  {
    title: "Rarity",
    color: "#37d067",
    desc: "Rarity, listings and completed sales for every piece.",
    charts: [
      { id: "aeonrarity", title: "Rarity — Where Does It Sit?", desc: "Look up any AEON — its rarity rank, tier and traits, on the collection's rarity curve." },
      { id: "aeonvalue", title: "Live Listings vs What They Sell For", desc: "Every active ask measured against what comparable pieces actually fetch — what is cheap, and what is over market." },
      { id: "aeonsalesrarity", title: "What Actually Sold — Rarity vs Price", desc: "Completed sales history: what each piece really fetched vs its rarity — the steals and the record sales." },
      { id: "aeontraits", title: "Trait Values", desc: "Which traits command a premium — median sale price per trait." },
    ],
  },
];

// id -> { id, title, post, desc, color, group } for O(1) lookup on chart pages —
// spans BOTH the SPX gallery and the Aeon tab so every chart page resolves.
// ── SPX City — the 3D city + the charts of its development history ────────────
// Its own tab (like Project Aeon), reached from the City nav dropdown. Keeps the city work
// together and out of the general Charts gallery.
export const CITY_GROUPS = [
  {
    title: "SPX City",
    color: "#7dd3fc",
    desc: "The city of SPX6900 holders — the 3D city and how it grew over time.",
    charts: [
      { id: "citygrowth", title: "City Growth", post: "citygrowth", desc: "How SPX City grew — citizens (≥5k held 90d) and its total value climbing through the drawdown." },
      { id: "cityflow", title: "City Flow", post: "citychurn", desc: "The churn under the count — arrivals vs departures, cohort survivorship, and average holding." },
      // City Lab stays `dev` (hidden, direct-link only ?chart=citylab) — the internal A/B page that
      // draws the same block two ways. It lives here rather than the Charts gallery because it's a city
      // tool; dev charts never render as a gallery tile regardless of group.
      { id: "citylab", title: "City Lab (3D)", dev: true, desc: "The same block drawn two ways — comparing the current look against a more realistic one." },
    ],
  },
];

export const CHART_META = Object.fromEntries(
  [...CHART_GROUPS, ...AEON_GROUPS, ...CITY_GROUPS].flatMap(g => g.charts.map(c => [c.id, { ...c, color: g.color, group: g.title }]))
);

export const CHART_IDS = new Set(Object.keys(CHART_META));

// ── Per-chart view toggles ───────────────────────────────────────────────────
// Charts whose page carries a segmented control (2+ mutually-exclusive views) declare
// those views here so the nav dropdowns can surface them as sub-entries. A sub-view
// link opens the chart with the view pre-selected via a URL param — `param` (default
// "v"), read in App.jsx and passed to the component as `initialView`, which the chart
// uses to set its starting toggle. `v` is the exact value the chart's state expects.
// The FIRST view is the chart's own default. Single-axis toggles only — charts with two
// independent toggles on one page (exitflow, aeonfloor, whaleswatching) are left out.
export const CHART_VIEWS = {
  mvrv: [{ label: "Realized Price", v: "realized" }, { label: "MVRV", v: "mvrv" }, { label: "Z-Score", v: "z" }],
  drawdown: [{ label: "Underwater", v: "underwater" }, { label: "By Cycle", v: "cycle" }],
  rally: [{ label: "Cycle Bottoms", v: "cycle" }, { label: "Fire Sale Band", v: "firesale" }],
  monthly: [{ label: "USD", v: "usd" }, { label: "In Bitcoin", v: "btc" }],
  survivorship: [{ label: "Who's Here", v: "who" }, { label: "Survival", v: "survival" }, { label: "Cost Basis", v: "supply" }, { label: "Who Left", v: "exits" }],
  smartmoney: [{ label: "Holdings vs Price", v: "holdings" }, { label: "Net Flow", v: "flow" }, { label: "New Timers", v: "newq" }],
  urpdage: [{ label: "Bars", v: "bars" }, { label: "Heatmap", v: "heat" }, { label: "3D", v: "3d" }],
  whalecohorts: [{ label: "Lines", v: "lines" }, { label: "Stacked", v: "stacked" }],
  cexvenflow: [{ label: "30 Days", v: "4" }, { label: "90 Days", v: "13" }, { label: "180 Days", v: "26" }, { label: "1 Year", v: "52" }],
  citygrowth: [{ label: "Citizens", v: "citizens" }, { label: "Value", v: "value" }, { label: "Skyline", v: "skyline" }],
  cityflow: [{ label: "Net New", v: "flow" }, { label: "Per Resident", v: "percap" }, { label: "Survival", v: "survival" }],
  vsmajors: [{ label: "Since Launch", v: "launch" }, { label: "12 Months", v: "12m" }, { label: "YTD", v: "ytd" }],
  vsmemekings: [{ label: "Since Launch", v: "launch" }, { label: "12 Months", v: "12m" }, { label: "YTD", v: "ytd" }],
  aeontraders: [{ label: "Top Winners", v: "top" }, { label: "Biggest Losses", v: "bottom" }, { label: "By Volume", v: "byVolume" }],
  aeonleadlag: [{ label: "Floor", v: "floor" }, { label: "Sales Volume", v: "volume" }],
  // relative already uses the `rel` param for its asset selector — reuse it.
  relative: [{ label: "vs BTC", v: "BTC" }, { label: "vs ETH", v: "ETH" }, { label: "vs SOL", v: "SOL" }, { label: "vs Majors", v: "BASKET" }],
};
// Which URL param carries the view for a given chart (default "v"; relative reuses "rel").
export const VIEW_PARAM = { relative: "rel" };

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
    charts: ["supply", "holders", "holdersprice", "supplyprofit", "hodlwaves", "freefloat", "concentration", "entities",
             "whales", "whalecohorts", "survivorship", "exitflow", "smartmoney", "walletwaves", "wealthwaves",
             "bagsprofile", "urpdage", "urpdterrain", "lthsth", "sopr", "nrpl", "liveliness", "whaleswatching", "citylab", "walletgrowth", "mvrv", "nupl", "mvrvbtc"],
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
