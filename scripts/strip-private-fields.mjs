// Strip identifying fields from a committed public feed AFTER the full version has been pushed to the
// private store (KV). This is how a dual-use feed (public aggregate for the X cards + private granular
// for members) keeps ONE builder: build the full file, push it to KV (push-private-feed.mjs), then run
// this to rewrite the committed copy without the sensitive fields.
//
//   node scripts/strip-private-fields.mjs --file=public/smart-money.json --drop-key=wallets
//   node scripts/strip-private-fields.mjs --file=public/whales.json --drop-field=wallets:a
//   node scripts/strip-private-fields.mjs --file=public/whale-entry.json --drop-field=whales:a
//
// --drop-key=<k>          remove a top-level key entirely
// --drop-field=<arr>:<f>  remove field <f> from every element of the top-level array <arr>
// Both flags may be repeated. No-op (exit 0) if the file is missing, so a workflow where the builder
// data-gated out doesn't fail here.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const args = process.argv.slice(2);
const fileArg = args.find(a => a.startsWith("--file="));
const path = fileArg ? fileArg.slice("--file=".length) : null;
const dropKeys = args.filter(a => a.startsWith("--drop-key=")).map(a => a.slice("--drop-key=".length));
const dropFields = args.filter(a => a.startsWith("--drop-field=")).map(a => a.slice("--drop-field=".length));

if (!path) { console.error("usage: strip-private-fields.mjs --file=<path> [--drop-key=k] [--drop-field=arr:f]"); process.exit(1); }
if (!existsSync(path)) { console.error("strip-private-fields: " + path + " not found — skipping"); process.exit(0); }

let obj;
try { obj = JSON.parse(readFileSync(path, "utf8")); }
catch (e) { console.error("strip-private-fields: cannot parse " + path + " — " + e.message); process.exit(1); }

for (const k of dropKeys) { if (k in obj) { delete obj[k]; console.error(`  dropped key .${k}`); } }
for (const spec of dropFields) {
  const [arr, field] = spec.split(":");
  if (Array.isArray(obj[arr])) {
    let n = 0;
    for (const el of obj[arr]) { if (el && typeof el === "object" && field in el) { delete el[field]; n++; } }
    console.error(`  dropped .${arr}[].${field} from ${n} items`);
  }
}
writeFileSync(path, JSON.stringify(obj));
console.error(`strip-private-fields: rewrote ${path} (public-safe copy)`);
