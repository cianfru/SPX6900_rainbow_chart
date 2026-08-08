// ============================================================================
// AEON SNIPER — real-time "listing below market" alerts to Telegram
// ============================================================================
// A long-running worker (NOT a cron — it holds a websocket). It subscribes to
// OpenSea's Stream API (wss, real-time push, doesn't count against rate limits)
// for Project AEON `item_listed` events, scores each new listing against the
// SAME rarity-implied fair-value model the site's deal-finder uses, and pushes a
// Telegram alert the instant a genuine steal appears — so you can be first to buy.
//
//   node scripts/aeon-snipe.mjs            # run the sniper (needs the env below)
//   node scripts/aeon-snipe.mjs --whoami   # print chat ids that have messaged your bot
//   node scripts/aeon-snipe.mjs --test     # send a test + sample alert, then exit
//   node scripts/aeon-snipe.mjs --dry      # run + log candidates, send NO Telegram
//
// ENV:
//   OPENSEA_KEY           (required)  your permanent OpenSea API key
//   TELEGRAM_BOT_TOKEN    (required for alerts)  from @BotFather
//   TELEGRAM_CHAT_ID      (required for alerts)  from --whoami after you DM the bot
//   MIN_DISCOUNT          default 0.25  fire when the ask is ≥ this fraction under fair value
//   MAX_PRICE             optional      ignore listings above this ETH price (skip whales)
//   MAX_RANK              optional      only alert for rank ≤ this (rarity floor)
//   AEON_OS_SLUG          default project-aeon
//   AEON_CONTRACT         default 0xc374…579c
//
// WHERE TO RUN IT: a machine you keep on (your Mac, a Pi) or a free worker host
// (Fly.io / Railway). It reconnects on drop and reloads the fair-value model hourly,
// so it stays current with the daily banker. Reads public/aeon-rarity.json +
// public/aeon-market.json for ranks + the fair model.
//
// ⚠ HONESTY: rarity explains only ~5% of AEON price (fairModel r² ≈ 0.05), so "fair"
// is a NOISY estimate — an alert is a CANDIDATE, verify the piece before buying. And
// this is alert-only: you still execute the buy manually.
// ============================================================================
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).map(s => { const [k, ...v] = s.replace(/^--/, "").split("="); return [k, v.length ? v.join("=") : true]; }));
const KEY = (process.env.OPENSEA_KEY || "").trim();
const TG = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
const CHAT = (process.env.TELEGRAM_CHAT_ID || "").trim();
const SLUG = process.env.AEON_OS_SLUG || "project-aeon";
const CONTRACT = (process.env.AEON_CONTRACT || "0xc374a204334d4Edd4C6a62f0867C752d65E9579c").toLowerCase();
const MIN_DISCOUNT = process.env.MIN_DISCOUNT ? Number(process.env.MIN_DISCOUNT) : 0.25;
const MAX_PRICE = process.env.MAX_PRICE ? Number(process.env.MAX_PRICE) : null;
const MAX_RANK = process.env.MAX_RANK ? Number(process.env.MAX_RANK) : null;
const DRY = !!args.dry;
const TOTAL = 3333;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ── fair value: identical to the site's deal-finder — fair(rank) = level · e^(a + b·ln rank) ──
export function evaluateListing({ tokenId, priceEth, sym }, cfg) {
  const { rankOf, fm, level, floor, minDiscount = 0.25, maxPrice = null, maxRank = null } = cfg;
  if (!(priceEth > 0)) return { alert: false, reason: "no-price" };
  if (sym && !["ETH", "WETH"].includes(sym)) return { alert: false, reason: "non-eth" };
  const rank = rankOf ? rankOf(tokenId) : null;
  const fair = (fm && level && rank) ? level * Math.exp(fm.a + fm.b * Math.log(rank)) : null;
  const discount = fair ? 1 - priceEth / fair : null;
  let alert = discount != null && discount >= minDiscount;
  if (alert && maxPrice != null && priceEth > maxPrice) alert = false;
  if (alert && maxRank != null && rank && rank > maxRank) alert = false;
  return { alert, rank, fair, discount, priceEth, floor, belowFloor: floor ? priceEth < floor : null };
}

// ── data (reloaded hourly so fair value tracks the daily banker) ─────────────────────────────
let rarity = new Map(), fm = null, level = null, floor = null;
function loadData() {
  try {
    const r = JSON.parse(readFileSync(join(root, "public/aeon-rarity.json"), "utf8"));
    rarity = new Map((r.tokens || []).map(t => [t.id, { rank: t.rank, img: t.img }]));
  } catch (e) { log("rarity load failed:", e.message); }
  try {
    const m = JSON.parse(readFileSync(join(root, "public/aeon-market.json"), "utf8"));
    fm = m.fairModel || null;
    level = m.levelNow ?? m.fairModel?.level ?? null;
    floor = typeof m.floor === "number" ? m.floor : (m.floor?.eth ?? null);
  } catch (e) { log("market load failed:", e.message); }
  if (!floor) { try { floor = JSON.parse(readFileSync(join(root, "public/aeon.json"), "utf8")).floor ?? null; } catch { /* optional */ } }
}
const cfg = () => ({ rankOf: id => rarity.get(id)?.rank ?? null, fm, level, floor, minDiscount: MIN_DISCOUNT, maxPrice: MAX_PRICE, maxRank: MAX_RANK });

// ── Telegram ─────────────────────────────────────────────────────────────────────────────────
async function tg(method, body) {
  if (!TG) throw new Error("no TELEGRAM_BOT_TOKEN");
  const r = await fetch(`https://api.telegram.org/bot${TG}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!j.ok) throw new Error(`telegram ${method}: ${j.description || r.status}`);
  return j.result;
}
async function sendAlert(a, meta) {
  const pct = a.discount != null ? `${Math.round(a.discount * 100)}% under fair` : "";
  const cap = `🎯 <b>AEON STEAL</b>\n`
    + `#${meta.tokenId} · rank ${a.rank ?? "?"}/${TOTAL}\n`
    + `<b>${a.priceEth} Ξ</b>${pct ? ` — ${pct}` : ""}${a.fair ? ` (fair ${a.fair.toFixed(2)} Ξ)` : ""}${a.floor ? ` · floor ${(+a.floor).toFixed(2)} Ξ` : ""}${a.belowFloor ? " · BELOW FLOOR" : ""}\n`
    + `<a href="${meta.permalink}">BUY ▶ open on OpenSea</a>`;
  if (meta.img) { try { return await tg("sendPhoto", { chat_id: CHAT, photo: meta.img, caption: cap, parse_mode: "HTML" }); } catch (e) { log("sendPhoto fell back:", e.message); } }
  return tg("sendMessage", { chat_id: CHAT, text: cap, parse_mode: "HTML", disable_web_page_preview: false });
}

// ── OpenSea Stream (Phoenix protocol over the built-in WebSocket) ─────────────────────────────
const seen = new Set();
function handle(raw) {
  let msg; try { msg = JSON.parse(raw); } catch { return; }
  if (msg.event !== "item_listed") return;
  const p = msg.payload?.payload ?? msg.payload ?? {};
  const nftId = p.item?.nft_id || "";                       // "ethereum/<contract>/<tokenId>"
  const parts = nftId.split("/");
  if (parts[1] && parts[1].toLowerCase() !== CONTRACT) return;
  const tokenId = Number(parts[2]);
  if (!Number.isFinite(tokenId)) return;
  const tok = p.payment_token || {};
  const dec = Number(tok.decimals ?? 18);
  let priceEth = null;
  try { priceEth = p.base_price != null ? Number(BigInt(p.base_price)) / 10 ** dec : null; } catch { priceEth = Number(p.base_price) / 10 ** dec; }
  const sym = (tok.symbol || "ETH").toUpperCase();
  const permalink = p.item?.permalink || `https://opensea.io/assets/ethereum/${CONTRACT}/${tokenId}`;
  const key = `${tokenId}@${priceEth}`;
  if (seen.has(key)) return; seen.add(key);
  if (seen.size > 5000) seen.clear();
  const a = evaluateListing({ tokenId, priceEth, sym }, cfg());
  log(`listing #${tokenId} ${priceEth}${sym} rank ${a.rank ?? "?"} · ${a.discount != null ? Math.round(a.discount * 100) + "% vs fair" : "no-fair"}${a.alert ? "  🎯 STEAL" : ""}`);
  if (a.alert && !DRY) sendAlert(a, { tokenId, permalink, img: rarity.get(tokenId)?.img }).then(() => log("✓ alerted #" + tokenId)).catch(e => log("alert send failed:", e.message));
}

let ws, hb, ref = 0, backoff = 1000;
function connect() {
  ws = new WebSocket(`wss://stream-api.opensea.io/socket/websocket?token=${KEY}`);
  ws.addEventListener("open", () => {
    log(`stream open — joining collection:${SLUG}`);
    ws.send(JSON.stringify({ topic: `collection:${SLUG}`, event: "phx_join", payload: {}, ref: String(++ref) }));
    hb = setInterval(() => { try { ws.send(JSON.stringify({ topic: "phoenix", event: "heartbeat", payload: {}, ref: String(++ref) })); } catch { /* closing */ } }, 30000);
    backoff = 1000;
  });
  ws.addEventListener("message", ev => {
    const raw = typeof ev.data === "string" ? ev.data : ev.data?.toString?.() || "";
    if (raw.includes('"phx_reply"')) { if (raw.includes(`collection:${SLUG}`)) log("subscribed ✓ — watching for listings"); return; }
    handle(raw);
  });
  ws.addEventListener("close", () => { clearInterval(hb); log(`stream closed — reconnecting in ${backoff}ms`); setTimeout(connect, backoff); backoff = Math.min(30000, backoff * 2); });
  ws.addEventListener("error", e => { log("stream error:", e?.message || "?"); try { ws.close(); } catch { /* already gone */ } });
}

// ── entry ────────────────────────────────────────────────────────────────────────────────────
async function main() {
  if (args.whoami) {
    if (!TG) { console.error("set TELEGRAM_BOT_TOKEN first"); process.exit(1); }
    const j = await (await fetch(`https://api.telegram.org/bot${TG}/getUpdates`)).json();
    const chats = new Map();
    for (const u of j.result || []) { const c = u.message?.chat || u.channel_post?.chat || u.edited_message?.chat; if (c) chats.set(c.id, `${c.type} · ${c.title || c.username || [c.first_name, c.last_name].filter(Boolean).join(" ")}`); }
    if (!chats.size) console.log("No chats yet — send your bot a message (any text), then re-run --whoami.");
    else { console.log("Chats that have messaged your bot (use the id as TELEGRAM_CHAT_ID):"); for (const [id, name] of chats) console.log(`  ${id}   ${name}`); }
    return;
  }
  if (!KEY) { console.error("OPENSEA_KEY is required"); process.exit(1); }
  loadData();
  if (args.test) {
    if (!TG || !CHAT) { console.error("set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to test"); process.exit(1); }
    await tg("sendMessage", { chat_id: CHAT, text: "✅ AEON sniper is connected. Real steals will arrive like the sample below:", parse_mode: "HTML" });
    await sendAlert({ alert: true, rank: 152, fair: 0.92, discount: 0.61, priceEth: 0.36, floor: 0.65, belowFloor: true }, { tokenId: 1011, permalink: "https://opensea.io/assets/ethereum/" + CONTRACT + "/1011", img: rarity.get(1011)?.img });
    console.log("sent test + sample alert to chat", CHAT);
    return;
  }
  log(`AEON sniper starting · slug ${SLUG} · min-discount ${Math.round(MIN_DISCOUNT * 100)}%${MAX_PRICE ? ` · max ${MAX_PRICE}Ξ` : ""}${MAX_RANK ? ` · rank≤${MAX_RANK}` : ""}${DRY ? " · DRY (no Telegram)" : ""}`);
  if (!DRY && (!TG || !CHAT)) log("⚠ TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set — running in log-only mode (no alerts)");
  setInterval(loadData, 3600000);                      // refresh fair model hourly
  connect();
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) main().catch(e => { console.error(e); process.exit(1); });
