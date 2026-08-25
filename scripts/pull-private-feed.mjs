// Pull a members-only feed back OUT of the private store (KV) to a local file — the inverse of
// push-private-feed.mjs. Used by dispatch workflows (e.g. whale-video.yml) that need a walled feed
// which is no longer committed to the public repo:
//   node scripts/pull-private-feed.mjs --key=spx-timeline --out=public/spx-timeline.json
// Soft-skips (exit 0) when KV isn't connected so a workflow without the secrets fails later with a
// clear "file not found" rather than here.
import { writeFileSync } from "node:fs";
import { kvConnected, cmd } from "../lib/kv.mjs";

const arg = k => { const a = process.argv.find(x => x.startsWith(k)); return a ? a.slice(k.length) : null; };
const key = arg("--key=");
const out = arg("--out=");

if (!key || !out) { console.error("usage: pull-private-feed.mjs --key=<name> --out=<path>"); process.exit(1); }
if (!kvConnected()) { console.error("pull-private-feed: KV not connected (KV_REST_API_URL/TOKEN unset) — skipping " + key); process.exit(0); }

const raw = await cmd("GET", "feed:" + key);
if (raw == null) { console.error("pull-private-feed: feed:" + key + " not in KV yet — nothing to pull"); process.exit(0); }
try { JSON.parse(raw); } catch { console.error("pull-private-feed: feed:" + key + " is not valid JSON"); process.exit(1); }
writeFileSync(out, raw);
console.error(`pull-private-feed: feed:${key} → ${out} (${raw.length.toLocaleString()} bytes)`);
