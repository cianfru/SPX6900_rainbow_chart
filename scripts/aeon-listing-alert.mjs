// ============================================================================
// AEON LISTING ALERT — a periodic "worth a look right now" Telegram digest
// ============================================================================
// Runs on the EXISTING daily AEON cron (aeon.yml), right after the listings are
// pulled — no always-on machine. It reads the freshly-built public/aeon-listings.json
// and scores each active listing against the SAME rarity fair-value model as the
// site's deal-finder, then Telegram-pings ONLY when something is priced at or below
// fair value (a real buy on a thin market). Dedups so the same listing never pings
// twice; stays silent when nothing's interesting.
//
//   node scripts/aeon-listing-alert.mjs           # evaluate + send (needs the env below)
//   node scripts/aeon-listing-alert.mjs --dry     # log the digest, send nothing
//
// ENV: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID (from @BotFather / --whoami in aeon-snipe.mjs),
//   AEON_ALERT_TOL     default 0.10  "at fair" = priced ≤ fair × (1 + this)
//   AEON_ALERT_MINDISC default 0.20  a listing this far under fair is flagged 🎯 a steal
//   AEON_ALERT_DRY=1   log only.  Repo var AEON_ALERT_DRY=1 keeps the schedule in watch-only mode.
//
// ⚠ rarity explains ~5% of AEON price (fairModel r²≈0.05) — "fair" is a NOISY estimate, so an
// alert is a CANDIDATE to eyeball, not a guaranteed steal. Alert-only; you buy manually.
// ============================================================================
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const p = f => join(root, f);
const args = new Set(process.argv.slice(2).map(s => s.replace(/^--/, "")));
const DRY = args.has("dry") || process.env.AEON_ALERT_DRY === "1";
const TG = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
const CHAT = (process.env.TELEGRAM_CHAT_ID || "").trim();
const TOL = process.env.AEON_ALERT_TOL ? Number(process.env.AEON_ALERT_TOL) : 0.10;
const MINDISC = process.env.AEON_ALERT_MINDISC ? Number(process.env.AEON_ALERT_MINDISC) : 0.20;
const STATE = p("public/aeon-listing-alert-state.json");
const CONTRACT = (process.env.AEON_CONTRACT || "0xc374a204334d4Edd4C6a62f0867C752d65E9579c").toLowerCase();
const TOTAL = 3333;

// Pure: which active listings are priced at/under fair value. fair(rank)=level·e^(a+b·ln rank),
// exactly the deal-finder's model. Sorted best-value first. Unit-tested.
export function pickInteresting(listings, { fm, level, tol = 0.10, minDisc = 0.20 } = {}) {
  if (!fm || !level) return [];
  const out = [];
  for (const l of listings || []) {
    if (!(l.price > 0) || l.rank == null) continue;
    const fair = level * Math.exp(fm.a + fm.b * Math.log(l.rank));
    if (!(fair > 0)) continue;
    const discount = 1 - l.price / fair;                    // >0 = under fair
    if (l.price <= fair * (1 + tol)) out.push({ id: l.id, rank: l.rank, price: l.price, img: l.img, fair, discount, steal: discount >= minDisc });
  }
  return out.sort((a, b) => b.discount - a.discount);
}

async function tg(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${TG}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!j.ok) throw new Error(`telegram ${method}: ${j.description || r.status}`);
  return j.result;
}
const pctFair = d => d >= 0 ? `${Math.round(d * 100)}% under fair` : `${Math.round(-d * 100)}% over fair`;
const osLink = id => `https://opensea.io/assets/ethereum/${CONTRACT}/${id}`;

function digest(fresh, floor) {
  const head = `🏙 <b>AEON — listings worth a look</b>${floor ? `\nfloor ${(+floor).toFixed(2)} Ξ` : ""}`;
  const lines = fresh.slice(0, 6).map(l =>
    `${l.steal ? "🎯 " : "• "}<a href="${osLink(l.id)}">#${l.id}</a> · rank ${l.rank}/${TOTAL} — <b>${(+l.price).toFixed(3)} Ξ</b> · ${pctFair(l.discount)} (fair ${l.fair.toFixed(2)} Ξ)`);
  return [head, "", ...lines].join("\n");
}

async function main() {
  if (!existsSync(p("public/aeon-listings.json"))) { console.log("listing-alert: no aeon-listings.json — skip"); return; }
  const L = JSON.parse(readFileSync(p("public/aeon-listings.json"), "utf8"));
  let fm = null, level = null, floor = null;
  try { const m = JSON.parse(readFileSync(p("public/aeon-market.json"), "utf8")); fm = m.fairModel; level = m.levelNow ?? m.fairModel?.level; floor = typeof m.floor === "number" ? m.floor : (m.floor?.eth ?? null); } catch { /* market optional */ }
  if (!floor) { try { floor = JSON.parse(readFileSync(p("public/aeon.json"), "utf8")).floor ?? null; } catch { /* ok */ } }

  const interesting = pickInteresting(L.listings || [], { fm, level, tol: TOL, minDisc: MINDISC });

  // dedup: only ping listings (by id@price) we haven't already pinged; prune vanished ones.
  const prev = existsSync(STATE) ? (JSON.parse(readFileSync(STATE, "utf8")).seen || {}) : {};
  const keyOf = l => `${l.id}@${(+l.price).toFixed(4)}`;
  const active = new Set((L.listings || []).map(keyOf));
  const fresh = interesting.filter(l => !prev[keyOf(l)]);
  const seen = {};
  for (const l of interesting) seen[keyOf(l)] = prev[keyOf(l)] || new Date().toISOString().slice(0, 10);
  for (const k of Object.keys(prev)) if (active.has(k)) seen[k] = prev[k];   // keep still-active memory

  console.log(`listing-alert: ${interesting.length} at/under fair · ${fresh.length} new${fresh.length ? " → " + fresh.slice(0, 6).map(l => `#${l.id} ${(+l.price).toFixed(3)}Ξ ${Math.round(l.discount * 100)}%`).join(", ") : ""}`);
  writeFileSync(STATE, JSON.stringify({ updated: new Date().toISOString(), seen }) + "\n");

  if (!fresh.length) { console.log("listing-alert: nothing new to ping"); return; }
  if (DRY || !TG || !CHAT) { console.log(DRY ? "DRY — digest that would send:\n" + digest(fresh, floor).replace(/<[^>]+>/g, "") : "no TELEGRAM_* set — skipping send"); return; }
  await tg("sendMessage", { chat_id: CHAT, text: digest(fresh, floor), parse_mode: "HTML", disable_web_page_preview: true });
  console.log(`✓ pinged ${fresh.length} listing(s)`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) main().catch(e => { console.error("listing-alert:", e.message); });
