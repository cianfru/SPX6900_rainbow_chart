// Gate for DEEP FIELD (the members area, formerly "the Terminal") — the granular, on-chain intel hub.
// One access key unlocks BOTH the Deep Field page AND the premium "locked" charts (the gate sets both
// localStorage flags on success), so an invited member types one code and gets everything.
//
// ⭐ ACCESS is ONE site-wide passphrase — "Admin123" — for now (the owner asked to collapse the
//    several per-area passwords into a single one). The plaintext is NOT what's stored; only the
//    FNV-1a hash below is. To re-lock everyone, change the hash and bump the KEY suffix. Per-OG
//    closed-beta invite codes can be re-added to INVITE_HASHES later without disturbing this.
//
// HONEST SCOPE: the repo is public and the JSON is reachable through the raw proxy, so this is a CURTAIN,
// not real security — fine for a free trusted-OG beta. Before charging money, the granular data must
// move behind a real authenticated endpoint (see the paid-tier plan in CLAUDE.md).
export const TERMINAL_KEY = "spx-terminal-v1";
// ONE passphrase everywhere now: "Admin123" (lower-cased on entry → FNV-1a of "admin123"). The owner
// asked for a single password across the whole site (city + Deep Field) instead of a different one
// per area. To re-lock everyone, change this hash (and bump TERMINAL_KEY / CITY_KEY suffixes).
export const TERMINAL_HASH = 1883603724; // FNV-1a of "admin123"
// Closed-beta invite-code hashes (FNV-1a). Any of these OR the owner passphrase opens Deep Field.
// Emptied for now — the single "Admin123" passphrase above covers everything; add per-OG code
// hashes back here when the closed beta actually goes out.
export const INVITE_HASHES = [];
// True if `pw` matches the owner passphrase or any live invite code.
export function isValidAccess(hash) { return hash === TERMINAL_HASH || INVITE_HASHES.includes(hash); }
