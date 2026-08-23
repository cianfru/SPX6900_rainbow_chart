import { test } from "node:test";
import assert from "node:assert/strict";
import { makePkce, signSession, verifySession, normalizeCode, hashCode, serializeCookie, parseCookies, b64url } from "../lib/auth-core.mjs";

test("PKCE: verifier + S256 challenge are url-safe and distinct", () => {
  const { verifier, challenge } = makePkce();
  assert.match(verifier, /^[A-Za-z0-9_-]+$/);
  assert.match(challenge, /^[A-Za-z0-9_-]+$/);
  assert.notEqual(verifier, challenge);
  assert.notEqual(makePkce().verifier, verifier); // random each time
});

test("session: sign → verify round-trips the payload", () => {
  const t = signSession({ uid: "42", un: "andrea", mem: true }, "s3cret", 3600, 1000000);
  const p = verifySession(t, "s3cret", 1000000);
  assert.equal(p.uid, "42"); assert.equal(p.un, "andrea"); assert.equal(p.mem, true);
  assert.equal(p.iat, 1000); assert.equal(p.exp, 1000 + 3600);
});

test("session: wrong secret is rejected", () => {
  const t = signSession({ uid: "1" }, "right", 3600, 0);
  assert.equal(verifySession(t, "wrong", 0), null);
});

test("session: tampered payload is rejected", () => {
  const t = signSession({ uid: "1", mem: false }, "k", 3600, 0);
  const [p, sig] = t.split(".");
  const forged = b64url(JSON.stringify({ uid: "1", mem: true, iat: 0, exp: 9999999999 })) + "." + sig;
  assert.equal(verifySession(forged, "k", 0), null);
});

test("session: expired token is rejected", () => {
  const t = signSession({ uid: "1" }, "k", 100, 0);      // expires at t=100s
  assert.ok(verifySession(t, "k", 50 * 1000));            // ok at 50s
  assert.equal(verifySession(t, "k", 200 * 1000), null);  // expired at 200s
});

test("session: garbage / empty tokens return null, never throw", () => {
  for (const g of ["", null, undefined, "nodot", "a.b.c", "x.y"]) assert.equal(verifySession(g, "k"), null);
});

test("invite codes: normalise is case/space-insensitive and hash matches", () => {
  assert.equal(normalizeCode("  DeepField-Diamond-6991 "), "deepfield-diamond-6991");
  assert.equal(hashCode("DeepField-Diamond-6991"), hashCode("deepfield-diamond-6991 "));
  assert.notEqual(hashCode("code-a"), hashCode("code-b"));
  assert.match(hashCode("x"), /^[0-9a-f]{64}$/);
});

test("cookies: serialize sets HttpOnly/Secure/SameSite; parse round-trips", () => {
  const c = serializeCookie("df_sess", "tok123", { maxAge: 3600 });
  assert.match(c, /df_sess=tok123/); assert.match(c, /HttpOnly/); assert.match(c, /Secure/);
  assert.match(c, /SameSite=Lax/); assert.match(c, /Max-Age=3600/);
  const got = parseCookies("df_sess=tok123; other=zz");
  assert.equal(got.df_sess, "tok123"); assert.equal(got.other, "zz");
});
