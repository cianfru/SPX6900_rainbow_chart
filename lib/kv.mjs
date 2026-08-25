// Tiny dependency-free Redis (Vercel KV / Upstash) REST client. Same store + auth pattern as
// api/intel.js, factored out so the auth layer can share it. Lives OUTSIDE api/ so it is NOT counted
// as a serverless function (Vercel counts every file under api/). Returns { ok:false } style softly
// when no store is connected, so callers can degrade instead of throwing.
const URL_ = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN_ = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const kvConnected = () => !!(URL_() && TOKEN_());

// Run one Redis command via the REST endpoint, e.g. cmd("SET","k","v","EX","60"). Returns the raw
// `result`. Throws if the store isn't connected or the call fails — callers guard with kvConnected().
export async function cmd(...args) {
  const base = URL_(), token = TOKEN_();
  if (!base || !token) throw new Error("kv not connected");
  const r = await fetch(base.replace(/\/$/, "") + "/" + args.map(encodeURIComponent).join("/"), {
    headers: { Authorization: "Bearer " + token },
  });
  if (!r.ok) throw new Error("kv " + r.status);
  return (await r.json()).result;
}
// Pipeline several commands in one round-trip: pipe([["SET","k","v"],["GET","k"]]) → [res, res].
export async function pipe(commands) {
  const base = URL_(), token = TOKEN_();
  if (!base || !token) throw new Error("kv not connected");
  const r = await fetch(base.replace(/\/$/, "") + "/pipeline", {
    method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error("kv " + r.status);
  return (await r.json()).map(x => x.result);
}

export const getJSON = async k => { const v = await cmd("GET", k); if (v == null) return null; try { return JSON.parse(v); } catch { return null; } };
// SET via the PIPELINE endpoint (POST, value in the JSON body) — NOT the path form cmd() uses. A large
// value in the URL path overflows the server's URI/header limit (HTTP 431); the members-only feeds are
// 0.5–3 MB, so they MUST go in the body. ttlSec optional (Redis EX).
export async function setRaw(key, value, ttlSec) {
  const args = ttlSec ? ["SET", key, String(value), "EX", String(ttlSec)] : ["SET", key, String(value)];
  const [result] = await pipe([args]);
  return result;
}
export const setJSON = async (k, obj) => setRaw(k, JSON.stringify(obj));
