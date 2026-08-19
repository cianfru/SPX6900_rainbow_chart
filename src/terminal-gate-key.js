// Gate for /terminal — the owner's daily intel one-pager. SEPARATE passphrase + localStorage key from
// the city gate (city-gate-key.js), so unlocking the public premium charts does NOT reveal the owner
// terminal, and vice-versa.
//
// ⭐ Passphrase: "spxterminal" (FNV-1a hashed below so it isn't sitting in the bundle in plain sight).
//    Change it by picking a new word, recomputing the FNV-1a hash, and BUMPING the key suffix to
//    re-lock every browser that unlocked the old one.
//
// HONEST SCOPE: the repo is public and daily-snapshot.json is reachable through the raw proxy, so this
// is a curtain, not real security — it stops casual wandering, not a determined visitor. Anything that
// must be truly private cannot live behind it.
export const TERMINAL_KEY = "spx-terminal-v1";
export const TERMINAL_HASH = 2391349826; // FNV-1a of "spxterminal"
