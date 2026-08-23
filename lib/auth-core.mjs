// Pure auth primitives for the Deep Field gated login (X / Twitter OAuth 2.0). No network, no env —
// just crypto + string work, so every piece here is unit-testable offline. The serverless handler
// (api/auth.js) and the KV layer (lib/kv.mjs) build on these.
//
// Design notes:
//  • Sessions are a stateless signed token (HMAC-SHA256 over a JSON payload), NOT a DB lookup — the
//    payload carries {uid, un(username), mem(is member), iat, exp}. Tamper-evident: any edit breaks
//    the HMAC. Membership is re-stamped into a fresh token on redeem, so it can't be forged client-side.
//  • PKCE (S256) so the OAuth code exchange is bound to this browser even though we're a confidential
//    client — belt and suspenders, and required by X for OAuth 2.0.
//  • Invite codes are stored only as FNV-style… no — as SHA-256 hashes (see hashCode); the plaintext
//    never lives in the repo or the DB, only the hash, so a DB leak doesn't expose usable codes.
import crypto from "node:crypto";

export const b64url = buf => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const b64urlDecode = s => Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64");

// ---- PKCE (S256) ----------------------------------------------------------
export function makePkce() {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}
export const randomState = () => b64url(crypto.randomBytes(16));

// ---- Signed session token (HMAC) ------------------------------------------
const hmac = (data, secret) => b64url(crypto.createHmac("sha256", String(secret)).update(data).digest());
// sign a payload object → "<b64url(json)>.<b64url(hmac)>". ttlSec default 30 days.
export function signSession(payload, secret, ttlSec = 30 * 86400, nowMs = Date.now()) {
  const body = { ...payload, iat: Math.floor(nowMs / 1000), exp: Math.floor(nowMs / 1000) + ttlSec };
  const p = b64url(JSON.stringify(body));
  return p + "." + hmac(p, secret);
}
// verify + decode a token. Returns the payload or null (bad format / bad sig / expired). Constant-time
// HMAC compare so a tampered token can't be probed byte by byte.
export function verifySession(token, secret, nowMs = Date.now()) {
  if (!token || typeof token !== "string" || token.indexOf(".") < 0) return null;
  const [p, sig] = token.split(".");
  if (!p || !sig) return null;
  const expect = hmac(p, secret);
  const a = Buffer.from(sig), b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let body; try { body = JSON.parse(b64urlDecode(p).toString("utf8")); } catch { return null; }
  if (!body || typeof body.exp !== "number" || body.exp * 1000 < nowMs) return null;
  return body;
}

// ---- Invite codes ---------------------------------------------------------
// Normalise so "DeepField-Diamond-6991 " and "deepfield-diamond-6991" match. Store/compare the hash.
export const normalizeCode = c => String(c || "").trim().toLowerCase().replace(/\s+/g, "");
export const hashCode = c => crypto.createHash("sha256").update("spxdf:" + normalizeCode(c)).digest("hex");

// ---- Cookies --------------------------------------------------------------
export function serializeCookie(name, value, { maxAge, httpOnly = true, secure = true, sameSite = "Lax", path = "/" } = {}) {
  let s = `${name}=${value}; Path=${path}; SameSite=${sameSite}`;
  if (httpOnly) s += "; HttpOnly";
  if (secure) s += "; Secure";
  if (maxAge != null) s += `; Max-Age=${maxAge}`;
  return s;
}
export function parseCookies(header) {
  const out = {};
  for (const part of String(header || "").split(/;\s*/)) {
    if (!part) continue;
    const i = part.indexOf("=");
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1));
  }
  return out;
}
