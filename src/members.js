// Who-am-I for the Deep Field gates — one cached fetch shared across every ReleaseGate and the gallery
// covers. The server (/api/auth?action=me) returns { loggedIn, username, member, owner, avatar, fav }.
//   • member = logged in with X (open beta: any real login).
//   • owner  = the project account(s) — full access to EVERY chart, past every gate.
let _mePromise;
export function loadMe() {
  if (!_mePromise) _mePromise = fetch("/api/auth?action=me", { cache: "no-store" })
    .then(r => (r.ok ? r.json() : null)).catch(() => null);
  return _mePromise;
}
// A member (or the owner) may see a RELEASED members chart. The owner also bypasses the release wall.
export const isOwner = me => !!(me && me.loggedIn && me.owner);
export const isMember = me => !!(me && me.loggedIn && (me.member || me.owner));
