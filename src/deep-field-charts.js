// The members-only "Deep Field" charts — the granular, wallet-level views not on the public site.
// Shared so BOTH the Deep Field page (TerminalPage) and the global favorites launcher name them
// identically. Adding a Deep Field chart = one entry here.
export const DF_CHARTS = [
  { name: "When Whales Bought", href: "/?chart=whaleentry", desc: "Every 100k+ wallet as an orb at the price it bought — in profit / underwater." },
  { name: "Wallet Clusters", href: "/?chart=entities", desc: "The addresses one owner controls, linked from on-chain SPX flows." },
  { name: "Cluster City", href: "/?chart=clustercity", desc: "A 3D city of owners — beams show who's buying (green) / selling (red)." },
  { name: "Whales Watching", href: "/?chart=whaleswatching", desc: "Every 100k+ wallet in 3D, pulsing green/red as they accumulate or distribute." },
  { name: "Cost Basis Terrain", href: "/?chart=urpdterrain", desc: "Where everyone bought, as a landscape deforming week by week." },
  { name: "Smart Money", href: "/?chart=smartmoney", desc: "Proven top-timers — aggregate here; per-wallet P&L pages inside." },
  { name: "SPX City", href: "/city", desc: "Every holder a building — the whole base in 3D, with holding age & flow." },
];

export const DF_BY_HREF = new Map(DF_CHARTS.map(c => [c.href, c]));
