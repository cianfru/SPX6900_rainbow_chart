// DEEP FIELD ACCESS — X (Twitter) OAuth 2.0 login + invite-code membership. ONE serverless function
// (Vercel Hobby cap is 12), every operation behind ?action= or a bare ?code callback:
//   GET  /api/auth?action=login   → redirect to X's OAuth consent (PKCE S256)
//   GET  /api/auth?code=…&state=… → X's callback: exchange code, fetch the user, set the session cookie
//   GET  /api/auth?action=me      → { loggedIn, username, member } from the session cookie (+ KV re-check)
//   GET  /api/auth?action=logout  → clear the session cookie
//   POST /api/auth?action=redeem  {code}       → mark the logged-in user a member if the code is valid
//   POST /api/auth?action=seed    {pw, codes}  → owner: load invite-code hashes (gated by CONTROL_PASSWORD)
//   POST /api/auth?action=members {pw}         → owner: list members (gated by CONTROL_PASSWORD)
//
// WHY X-ONLY: the point of the gate is knowing WHO is in. An email can be a burner; an X account is a
// real identity the owner can see. So there is deliberately no email/password path.
//
// Required Vercel env: X_CLIENT_ID, X_CLIENT_SECRET (X app, OAuth2 confidential client), SESSION_SECRET
// (random), a connected KV/Upstash store, and APP_URL (defaults to the production domain). Optional
// OWNER_HANDLES (comma list) = handles auto-granted membership for bootstrapping. Until the env is set
// every action returns {ok:false, err:"not configured"} so the client shows a friendly message.
import crypto from "node:crypto";
import { makePkce, randomState, signSession, verifySession, hashCode, serializeCookie, parseCookies } from "../lib/auth-core.mjs";
import { kvConnected, cmd, getJSON, setJSON } from "../lib/kv.mjs";

const CID = () => process.env.X_CLIENT_ID;
const CSECRET = () => process.env.X_CLIENT_SECRET;
const SECRET = () => process.env.SESSION_SECRET;
const APP_URL = () => (process.env.APP_URL || "https://spx6900rainbow.xyz").replace(/\/$/, "");
const REDIRECT = () => APP_URL() + "/api/auth";
const OWNER_HANDLES = () => new Set((process.env.OWNER_HANDLES || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean));
const SESS = "df_sess", OAUTH = "df_oauth";
const configured = () => !!(CID() && CSECRET() && SECRET());
// The members-only feeds served from the private store (KV key "feed:<name>"), pushed by the crons
// via scripts/push-private-feed.mjs. These are the GRANULAR halves (real addresses / per-wallet lots);
// the public site keeps the anonymized/aggregate versions. Whitelisted so ?f= can't read arbitrary keys.
const PRIVATE_FEEDS = new Set(["entities", "smart-money", "whale-entry", "whales", "city-history", "spx-timeline"]);

const send = (res, code, obj) => { res.setHeader("Content-Type", "application/json"); res.status(code).json(obj); };
const setCookie = (res, c) => { const prev = res.getHeader("Set-Cookie"); res.setHeader("Set-Cookie", prev ? [].concat(prev, c) : c); };
function safeEq(a, b) {
  const x = crypto.createHash("sha256").update(String(a)).digest(), y = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}
const sessionOf = req => { try { return verifySession(parseCookies(req.headers.cookie)[SESS], SECRET()); } catch { return null; } };

export default async function handler(req, res) {
  const url = new URL(req.url, "http://x");
  const q = url.searchParams;
  const action = q.get("action");
  if (!configured()) return send(res, 200, { ok: false, err: "not configured" });

  // ---- X CALLBACK (bare ?code from the OAuth redirect) --------------------
  if (q.get("code") && !action) {
    try {
      const ck = parseCookies(req.headers.cookie);
      const tmp = verifySession(ck[OAUTH], SECRET());
      if (!tmp || tmp.st !== q.get("state")) return bounce(res, "/deepfield?auth=badstate");
      // exchange the authorization code for an access token (confidential client → HTTP Basic)
      const body = new URLSearchParams({ grant_type: "authorization_code", code: q.get("code"),
        redirect_uri: REDIRECT(), code_verifier: tmp.v, client_id: CID() });
      const tr = await fetch("https://api.twitter.com/2/oauth2/token", { method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded",
          Authorization: "Basic " + Buffer.from(CID() + ":" + CSECRET()).toString("base64") }, body });
      if (!tr.ok) return bounce(res, "/deepfield?auth=token");
      const tok = await tr.json();
      const ur = await fetch("https://api.twitter.com/2/users/me?user.fields=profile_image_url", { headers: { Authorization: "Bearer " + tok.access_token } });
      if (!ur.ok) return bounce(res, "/deepfield?auth=user");
      const u = (await ur.json()).data || {};
      const uid = String(u.id || ""), un = String(u.username || "");
      if (!uid) return bounce(res, "/deepfield?auth=user");
      // X returns the 48px "_normal" avatar; ask for the 400px so it stays crisp top-right.
      const pfp = String(u.profile_image_url || "").replace("_normal.", "_400x400.");
      // OPEN BETA: a real X login IS membership. Access is granted to everyone who signs in — the ONLY
      // way to lose it is an explicit ban (banned:true in KV, e.g. an obvious burner). We do NOT honour a
      // stale member:false (those are leftovers from the invite-code era and were wrongly pausing real
      // users). We still record who signs in, from where, and how often (power-user signal).
      const now = new Date().toISOString();
      const country = String(req.headers["x-vercel-ip-country"] || req.headers["x-vercel-ip-country-region"] || "").split(",")[0] || "";
      let banned = false;
      if (kvConnected()) {
        const existing = await getJSON("auth:user:" + uid);
        banned = !!(existing && existing.banned);
        await setJSON("auth:user:" + uid, {
          uid, un, name: u.name || "", member: !banned, banned, pfp: pfp || existing?.pfp || "",
          firstSeen: existing?.firstSeen || existing?.joined || now, lastSeen: now,
          logins: (existing?.logins || 0) + 1,
          country: country || existing?.country || "",
          joined: existing?.joined || now,
        });
        await cmd("SADD", "auth:members", uid);
      }
      const member = !banned;
      setCookie(res, serializeCookie(SESS, signSession({ uid, un, mem: member, pfp }, SECRET()), { maxAge: 30 * 86400 }));
      setCookie(res, serializeCookie(OAUTH, "", { maxAge: 0 }));
      return bounce(res, member ? "/deepfield?auth=ok" : "/deepfield?auth=paused");
    } catch { return bounce(res, "/deepfield?auth=error"); }
  }

  // ---- LOGIN: redirect to X consent --------------------------------------
  if (action === "login") {
    const { verifier, challenge } = makePkce(), state = randomState();
    setCookie(res, serializeCookie(OAUTH, signSession({ v: verifier, st: state }, SECRET(), 600), { maxAge: 600 }));
    const a = new URL("https://twitter.com/i/oauth2/authorize");
    a.searchParams.set("response_type", "code");
    a.searchParams.set("client_id", CID());
    a.searchParams.set("redirect_uri", REDIRECT());
    a.searchParams.set("scope", "users.read tweet.read");
    a.searchParams.set("state", state);
    a.searchParams.set("code_challenge", challenge);
    a.searchParams.set("code_challenge_method", "S256");
    res.setHeader("Location", a.toString()); return res.status(302).end();
  }

  // ---- DATA WALL: serve a members-only feed from the PRIVATE store ---------
  // The granular feeds are pushed to KV by the crons (scripts/push-private-feed.mjs) instead of being
  // committed to the public repo — so they are NOT on raw.githubusercontent. Only a logged-in MEMBER
  // gets them here. Repo (code) stays public; the members' DATA is genuinely private.
  if (action === "data") {
    const name = q.get("f");
    if (!PRIVATE_FEEDS.has(name)) return send(res, 400, { ok: false, err: "unknown feed" });
    const s = sessionOf(req);
    // OPEN BETA: logged in = member (ignore stale invite-era member:false); only an explicit ban blocks.
    let member = !!s;
    if (member && kvConnected()) { try { const u = await getJSON("auth:user:" + s.uid); if (u && u.banned) member = false; } catch { /* trust token */ } }
    if (!member) return send(res, 403, { ok: false, err: "members only" });
    if (!kvConnected()) return send(res, 503, { ok: false, err: "store not connected" });
    const raw = await cmd("GET", "feed:" + name);
    if (raw == null) return send(res, 404, { ok: false, err: "feed not published yet" });
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "private, max-age=60");
    return res.status(200).send(raw);
  }

  // ---- ME: who is this browser --------------------------------------------
  if (action === "me") {
    const s = sessionOf(req);
    if (!s) return send(res, 200, { loggedIn: false });
    // OPEN BETA: logged in = member. Only an explicit ban (banned:true in KV) revokes it — a stale
    // member:false from the invite-code era is IGNORED, so real users are no longer wrongly paused. This
    // also UPGRADES an old paused cookie (mem:false) back to member on the next load, no re-login needed.
    let member = true, avatar = s.pfp || "", fav = null;
    if (kvConnected()) { try {
      const u = await getJSON("auth:user:" + s.uid); if (u) { if (u.banned) member = false; if (!avatar && u.pfp) avatar = u.pfp; }
      const f = await getJSON("auth:fav:" + s.uid); if (Array.isArray(f)) fav = f;
    } catch { /* trust token */ } }
    if (member !== !!s.mem) setCookie(res, serializeCookie(SESS, signSession({ uid: s.uid, un: s.un, mem: member, pfp: s.pfp }, SECRET()), { maxAge: 30 * 86400 }));
    return send(res, 200, { loggedIn: true, username: s.un, member, avatar, fav });
  }

  if (action === "logout") { setCookie(res, serializeCookie(SESS, "", { maxAge: 0 })); return send(res, 200, { ok: true }); }

  // ---- POST actions -------------------------------------------------------
  if (req.method === "POST") {
    const bd = typeof req.body === "object" && req.body ? req.body : await readBody(req);
    if (action === "redeem") {
      const s = sessionOf(req);
      if (!s) return send(res, 401, { ok: false, err: "not logged in" });
      if (!kvConnected()) return send(res, 200, { ok: false, err: "store not connected" });
      const h = hashCode(bd.code);
      const inv = await getJSON("auth:invite:" + h);
      if (!inv) return send(res, 200, { ok: false, err: "invalid code" });
      if (inv.used && inv.by && inv.by !== s.uid) return send(res, 200, { ok: false, err: "code already used" });
      await setJSON("auth:invite:" + h, { ...inv, used: true, by: s.uid, at: new Date().toISOString() });
      const u = (await getJSON("auth:user:" + s.uid)) || { uid: s.uid, un: s.un, joined: new Date().toISOString() };
      await setJSON("auth:user:" + s.uid, { ...u, member: true, code: h });
      await cmd("SADD", "auth:members", s.uid);
      setCookie(res, serializeCookie(SESS, signSession({ uid: s.uid, un: s.un, mem: true }, SECRET()), { maxAge: 30 * 86400 }));
      return send(res, 200, { ok: true, member: true });
    }
    if (action === "fav") {                        // member: save their pinned charts (per-account, KV)
      const s = sessionOf(req);
      if (!s) return send(res, 401, { ok: false, err: "not logged in" });
      if (!kvConnected()) return send(res, 200, { ok: false, err: "store not connected" });
      // Sanitise: a bounded list of short id strings — never trust the client array shape/size.
      const fav = (Array.isArray(bd.fav) ? bd.fav : []).filter(x => typeof x === "string" && x.length <= 40).slice(0, 60);
      await setJSON("auth:fav:" + s.uid, fav);
      return send(res, 200, { ok: true, fav });
    }
    if (action === "seed") {                       // owner: load invite codes (hashes only)
      if (!safeEq(bd.pw || "", process.env.CONTROL_PASSWORD || "\0")) return send(res, 403, { ok: false });
      if (!kvConnected()) return send(res, 200, { ok: false, err: "store not connected" });
      const codes = Array.isArray(bd.codes) ? bd.codes : [];
      let n = 0;
      for (const c of codes) { const h = hashCode(c); if (!h) continue; const ex = await getJSON("auth:invite:" + h); await setJSON("auth:invite:" + h, ex || { used: false, note: bd.note || "", at: new Date().toISOString() }); n++; }
      return send(res, 200, { ok: true, seeded: n });
    }
    if (action === "members") {                    // owner: list who's in
      if (!safeEq(bd.pw || "", process.env.CONTROL_PASSWORD || "\0")) return send(res, 403, { ok: false });
      if (!kvConnected()) return send(res, 200, { ok: false, err: "store not connected" });
      const ids = (await cmd("SMEMBERS", "auth:members")) || [];
      const out = [];
      for (const id of ids) { const u = await getJSON("auth:user:" + id); if (u) out.push({ username: u.un, pfp: u.pfp || "", firstSeen: u.firstSeen || u.joined, lastSeen: u.lastSeen || u.joined, logins: u.logins || 1, country: u.country || "", member: !u.banned }); }
      out.sort((a, b) => (b.logins - a.logins) || String(b.lastSeen).localeCompare(String(a.lastSeen)));
      return send(res, 200, { ok: true, members: out });
    }
  }
  return send(res, 400, { ok: false, err: "unknown action" });
}

function bounce(res, to) { res.setHeader("Location", to); return res.status(302).end(); }
async function readBody(req) {
  try { const chunks = []; for await (const c of req) chunks.push(c); return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
  catch { return {}; }
}
