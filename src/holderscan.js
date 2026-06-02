const BASE = "https://api.holderscan.com/v0/eth/tokens";
const CONTRACT = "0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c";
const KEY = import.meta.env.VITE_HOLDERSCAN_KEY || "";

async function get(path) {
  if (!KEY) throw new Error("No API key configured");
  const res = await fetch(`${BASE}/${CONTRACT}${path}`, {
    headers: { "x-api-key": KEY, "Accept": "application/json" },
  });
  if (!res.ok) throw new Error(`Holderscan ${res.status}`);
  return res.json();
}

export async function fetchHolderCount() {
  const data = await get("/holders?limit=1");
  return data.holder_count;
}

export async function fetchHolderDeltas() {
  return get("/holders/deltas");
}

export async function fetchHolderBreakdowns() {
  return get("/holders/breakdowns");
}

export async function fetchTokenStats() {
  return get("/stats");
}

export async function fetchTokenPnl() {
  return get("/stats/pnl");
}

export async function fetchTopHolders(limit = 10) {
  const data = await get(`/holders?limit=${limit}`);
  return data.holders || [];
}

export async function fetchAllHolderscanData() {
  const results = await Promise.allSettled([
    fetchHolderDeltas(),
    fetchHolderBreakdowns(),
    fetchTokenStats(),
    fetchTokenPnl(),
    fetchTopHolders(10),
  ]);

  return {
    deltas: results[0].status === "fulfilled" ? results[0].value : null,
    breakdowns: results[1].status === "fulfilled" ? results[1].value : null,
    stats: results[2].status === "fulfilled" ? results[2].value : null,
    pnl: results[3].status === "fulfilled" ? results[3].value : null,
    topHolders: results[4].status === "fulfilled" ? results[4].value : null,
  };
}
