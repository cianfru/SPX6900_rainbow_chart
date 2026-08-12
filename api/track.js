// First-party analytics ingest — writes events to Redis (Vercel KV / Upstash) via the REST API.
// No dependency, no third party. Enriches each event with Vercel's edge geo headers (country/city,
// free) and a SALTED IP HASH (the raw IP is never stored). Degrades to a silent no-op when no store
// is configured, so it's safe to ship before the KV store is connected.
//
// Setup to activate: connect a Vercel KV / Upstash Redis store to the project (Vercel dashboard →
// Storage). That injects KV_REST_API_URL + KV_REST_API_TOKEN (or the UPSTASH_* equivalents). Optional
// INTEL_SALT to rotate the IP-hash salt. Read the data at /api/intel (gated by CONTROL_PASSWORD).
import crypto from "node:crypto";

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const SALT = process.env.INTEL_SALT || "spx6900-intel";
const TYPES = new Set(["pageview", "wallet_search", "city_open", "chart_open", "click"]);
const CAP = 50000, WCAP = 20000;

async function kvPipeline(commands) {
  const r = await fetch(KV_URL.replace(/\/$/, "") + "/pipeline", {
    method: "POST",
    headers: { Authorization: "Bearer " + KV_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
  });
  return r.ok;
}
const clip = (s, n) => (typeof s === "string" && s ? s.slice(0, n) : undefined);
const host = (u) => { try { return new URL(u).host.replace(/^www\./, ""); } catch { return ""; } };

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.status(405).end(); return; }
  if (!KV_URL || !KV_TOKEN) { res.status(204).end(); return; } // store not connected yet → no-op

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const t = body.t;
  if (!TYPES.has(t)) { res.status(204).end(); return; }

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const iphash = ip ? crypto.createHash("sha256").update(SALT + ip).digest("hex").slice(0, 12) : "";
  const ev = {
    t, ts: Date.now(),
    path: clip(body.path, 200), ref: host(clip(body.ref, 300) || ""),
    country: req.headers["x-vercel-ip-country"] || "",
    city: decodeURIComponent(req.headers["x-vercel-ip-city"] || "") || "",
    region: req.headers["x-vercel-ip-country-region"] || "",
    wallet: clip(body.wallet, 80), chart: clip(body.chart, 40), mode: clip(body.mode, 16),
    ip: iphash,
  };
  const json = JSON.stringify(ev);
  const cmds = [
    ["LPUSH", "intel:events", json], ["LTRIM", "intel:events", "0", String(CAP - 1)],
    ["HINCRBY", "intel:geo", ev.country || "??", "1"],
    ["HINCRBY", "intel:pages", ev.path || "/", "1"],
  ];
  if (ev.ref) cmds.push(["HINCRBY", "intel:refs", ev.ref, "1"]);
  if (t === "wallet_search" && ev.wallet) { cmds.push(["LPUSH", "intel:wallets", json], ["LTRIM", "intel:wallets", "0", String(WCAP - 1)]); }
  if (t === "chart_open" && ev.chart) cmds.push(["HINCRBY", "intel:charts", ev.chart, "1"]);

  try { await kvPipeline(cmds); } catch (e) { /* swallow — analytics must never break the page */ }
  res.status(204).end();
}
