async function get(endpoint) {
  const res = await fetch(`/api/holderscan?endpoint=${encodeURIComponent(endpoint)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Proxy returned ${res.status}`);
  }
  return res.json();
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

export async function fetchSupplyBreakdown() {
  return get("/stats/supply-breakdown");
}

export async function fetchTopHolders() {
  const data = await get("/holders?limit=10");
  return data.holders || [];
}

export async function fetchAllHolderscanData() {
  const results = await Promise.allSettled([
    fetchHolderDeltas(),
    fetchHolderBreakdowns(),
    fetchTokenStats(),
    fetchTokenPnl(),
    fetchTopHolders(),
  ]);

  return {
    deltas: results[0].status === "fulfilled" ? results[0].value : null,
    breakdowns: results[1].status === "fulfilled" ? results[1].value : null,
    stats: results[2].status === "fulfilled" ? results[2].value : null,
    pnl: results[3].status === "fulfilled" ? results[3].value : null,
    topHolders: results[4].status === "fulfilled" ? results[4].value : null,
  };
}
