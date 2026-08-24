// Push a members-only feed into the PRIVATE store (KV), instead of committing it to the public repo.
// Run in a cron AFTER the feed is built, with the KV env present:
//   node scripts/push-private-feed.mjs --file=public/entities.json --key=entities
// The member-gated endpoint (api/auth.js ?action=data&f=entities) serves it to logged-in members only.
//
// This is HALF of the Phase-2 wall: the granular JSON stops being publicly fetchable once (a) the
// builder writes the members-only fields to a file we push here and DON'T commit, and (b) the client
// loader reads via the authed endpoint. Until a feed is fully cut over it stays committed (public),
// so nothing breaks — cut each feed over one at a time.
import { readFileSync } from "node:fs";
import { kvConnected, cmd } from "../lib/kv.mjs";

const arg = k => { const a = process.argv.find(x => x.startsWith(k)); return a ? a.slice(k.length) : null; };
const file = arg("--file=");
const key = arg("--key=");
const ttl = arg("--ttl=");   // optional expiry (seconds); omit to persist

if (!file || !key) { console.error("usage: push-private-feed.mjs --file=<path> --key=<name> [--ttl=<sec>]"); process.exit(1); }
if (!kvConnected()) { console.error("push-private-feed: KV not connected (KV_REST_API_URL/TOKEN unset) — skipping " + key); process.exit(0); }

let raw;
try { raw = readFileSync(file, "utf8"); JSON.parse(raw); }   // validate it's JSON before publishing
catch (e) { console.error("push-private-feed: cannot read/parse " + file + " — " + e.message); process.exit(1); }

const args = ttl ? ["SET", "feed:" + key, raw, "EX", String(parseInt(ttl, 10))] : ["SET", "feed:" + key, raw];
await cmd(...args);
console.error(`push-private-feed: published ${file} → feed:${key} (${raw.length.toLocaleString()} bytes)${ttl ? " ttl " + ttl + "s" : ""}`);
