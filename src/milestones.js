// Market-cap milestones, expressed as the SPX6900 PRICE at which its market cap
// would equal that landmark (fixed, since they're MC / SPX supply ~939M). Used
// by the rainbow chart "Crypto Milestones" overlay AND the bot's bullish
// "milestones" card, so both stay in sync. `price` = SPX price to reach it.
export const CRYPTO_MILESTONES = [
  { price: 11.71,  label: "PEPE ATH MC",     short: "PEPE ATH",      mc: "$11B",  c: "#4ade80" },
  { price: 13.84,  label: "BTC @ $1K MC",    short: "BTC @ $1K",     mc: "$13B",  c: "#f59e0b" },
  { price: 42.60,  label: "SHIB ATH MC",     short: "SHIB ATH",      mc: "$40B",  c: "#f43f5e" },
  { price: 94.57,  label: "DOGE ATH MC",     short: "DOGE ATH",      mc: "$89B",  c: "#c2a633" },
  { price: 197,    label: "BTC @ $10K MC",   short: "BTC @ $10K",    mc: "$185B", c: "#fb923c" },
  { price: 2130,   label: "BTC @ $100K MC",  short: "BTC @ $100K",   mc: "$2T",   c: "#f97316" },
];
