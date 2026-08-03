// SPX6900-on-Base FULL transfer history — keyless, ZERO Dune credits. Base has 6.08M SPX transfers;
// Dune's result-read would cost ~19-48k credits (19× the monthly budget), and BigQuery has no free
// Base dataset — so we paginate Blockscout's etherscan-compatible getLogs (up to 1000 logs/call →
// ~6k calls) over the SPX contract's Transfer events. The repo already hits base.blockscout.com from
// CI (the Base headcount), so this is the same proven transport. Streams straight to a CSV
// (sender,receiver,value,time) — value RAW uint256 (exact) — which build-base-onchain.mjs reconstructs
// into net balances → residents/ages/flow/exits, full parity with the ETH suite.
//
//   node scripts/build-base-transfers.mjs --out=base-transfers.csv
//
// ENV: BASE_BLOCKSCOUT (default https://base.blockscout.com/api), BASE_SPX (contract),
//   BASE_START_BLOCK (default 0), BASE_DELAY_MS (default 120 — be polite to the public node),
//   BASE_PAGE (default 1000 — the getLogs cap; lower it only if a single block ever exceeds it).
import { createWriteStream } from "node:fs";
import { fileURLToPath } from "node:url";

const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"; // Transfer(address,address,uint256)
const API = process.env.BASE_BLOCKSCOUT || "https://base.blockscout.com/api";
const CONTRACT = (process.env.BASE_SPX || "0x50dA645f148798F68EF2d7dB7C1CB22A6819bb2C").toLowerCase();
const PAGE = Number(process.env.BASE_PAGE || 1000);
const DELAY = Number(process.env.BASE_DELAY_MS || 120);

const addrFromTopic = t => "0x" + String(t).slice(-40).toLowerCase();   // last 20 bytes of a 32-byte topic

// One etherscan-style log → a canonical row, or null if it isn't a well-formed ERC-20 Transfer.
// value kept RAW (BigInt string, exact); time as ISO. Pure → unit-tested.
export function decodeLog(log) {
  const topics = log?.topics;
  if (!Array.isArray(topics) || topics.length !== 3 || String(topics[0]).toLowerCase() !== TRANSFER) return null;
  let value; try { value = BigInt(log.data).toString(); } catch { return null; }
  const tsNum = Number(log.timeStamp);                    // Blockscout returns hex "0x.." or decimal — Number handles both
  if (!Number.isFinite(tsNum)) return null;
  const block = Number(log.blockNumber);
  return {
    sender: addrFromTopic(topics[1]),
    receiver: addrFromTopic(topics[2]),
    value,
    time: new Date(tsNum * 1000).toISOString(),
    block,
    key: `${String(log.transactionHash).toLowerCase()}:${Number(log.logIndex)}`,
  };
}

// Pagination step: given a raw getLogs batch and the current `from` block + the seen-set for the
// boundary block, return the rows to APPEND (deduped), the next `from`, the next boundary seen-set,
// and whether we're done. Advancing `from` to the batch's max block (re-including it, deduped) is what
// makes block-range paging lossless when >PAGE logs share the boundary block's neighbourhood. Pure.
export function paginate(batch, from, seen) {
  const rows = [];
  let maxBlock = from;
  for (const log of batch) {
    const row = decodeLog(log);
    if (!row) continue;
    if (seen.has(row.key)) continue;
    rows.push(row);
    if (row.block > maxBlock) maxBlock = row.block;
  }
  const done = batch.length < PAGE;                       // a short page = the last page
  if (!done && maxBlock === from && rows.length === 0) {
    throw new Error(`no progress at block ${from} (a single block exceeds BASE_PAGE=${PAGE}) — lower BASE_PAGE or add offset paging`);
  }
  const nextSeen = new Set();
  if (!done) for (const log of batch) { const r = decodeLog(log); if (r && r.block === maxBlock) nextSeen.add(r.key); }
  return { rows, nextFrom: maxBlock, nextSeen, done };
}

async function getLogs(fetchImpl, from) {
  const url = `${API}?module=logs&action=getLogs&fromBlock=${from}&toBlock=99999999&address=${CONTRACT}&topic0=${TRANSFER}`;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const r = await fetchImpl(url, { headers: { Accept: "application/json" } });
      if (r.status === 429 || r.status >= 500) throw new Error(`http ${r.status}`);
      const j = await r.json();
      // Blockscout: {status:"1",result:[...]} on hits; {status:"0",message:"No records found",result:[]} when empty.
      if (Array.isArray(j.result)) return j.result;
      if (j.status === "0") return [];
      throw new Error(`unexpected: ${JSON.stringify(j).slice(0, 200)}`);
    } catch (e) {
      if (attempt === 5) throw e;
      await new Promise(res => setTimeout(res, DELAY * 2 ** attempt));   // backoff on 429/5xx/network
    }
  }
}

export async function fetchAll({ fetchImpl, write, startBlock = Number(process.env.BASE_START_BLOCK || 0), onProgress } = {}) {
  let from = startBlock, seen = new Set(), total = 0, calls = 0;
  for (;;) {
    const batch = await getLogs(fetchImpl, from);
    calls++;
    if (!batch.length) break;
    const { rows, nextFrom, nextSeen, done } = paginate(batch, from, seen);
    for (const r of rows) { write(`${r.sender},${r.receiver},${r.value},${r.time}\n`); total++; }
    onProgress?.({ calls, total, block: nextFrom });
    if (done) break;
    from = nextFrom; seen = nextSeen;
    if (DELAY) await new Promise(res => setTimeout(res, DELAY));
  }
  return { total, calls };
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map(s => { const [k, ...v] = s.replace(/^--/, "").split("="); return [k, v.length ? v.join("=") : true]; }));
  const out = args.out || "base-transfers.csv";
  const stream = createWriteStream(out);
  stream.write("sender,receiver,value,time\n");
  const write = line => stream.write(line);
  const t0 = Date.now();
  const { total, calls } = await fetchAll({
    fetchImpl: fetch, write,
    onProgress: ({ calls, total, block }) => { if (calls % 50 === 0) console.log(`  …${calls} calls · ${total.toLocaleString()} transfers · block ${block}`); },
  });
  await new Promise(res => stream.end(res));
  console.log(`✓ ${out} — ${total.toLocaleString()} transfers in ${calls} calls (${((Date.now() - t0) / 1000 / 60).toFixed(1)} min)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exit(1); });
