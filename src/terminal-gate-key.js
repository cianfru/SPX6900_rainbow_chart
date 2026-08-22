// Gate for DEEP FIELD (the members area, formerly "the Terminal") — the granular, on-chain intel hub.
// One access key unlocks BOTH the Deep Field page AND the premium "locked" charts (the gate sets both
// localStorage flags on success), so an invited member types one code and gets everything.
//
// ⭐ ACCESS is a small list of INVITE CODES (closed beta). Hand one to each OG follower; any valid code
//    unlocks. The plaintext codes are NOT in the repo — only their FNV-1a hashes below. To revoke one
//    person, delete their hash; to re-lock everyone, bump the KEY suffix. The owner's own passphrase
//    ("spxterminal") is kept in the list too.
//
// HONEST SCOPE: the repo is public and the JSON is reachable through the raw proxy, so this is a CURTAIN,
// not real security — fine for a free trusted-OG beta. Before charging money, the granular data must
// move behind a real authenticated endpoint (see the paid-tier plan in CLAUDE.md).
export const TERMINAL_KEY = "spx-terminal-v1";
export const TERMINAL_HASH = 2391349826; // FNV-1a of "spxterminal" — the owner's own passphrase (kept working)
// Closed-beta invite-code hashes (FNV-1a). Any of these OR the owner passphrase opens Deep Field.
export const INVITE_HASHES = [
  3005697834, 1753595292, 2610668880, 4028895469, 1582276410, 3941100307,
  2098270866, 1546826361, 3124523449, 1533993848, 2856158257, 2198114664,
];
// True if `pw` matches the owner passphrase or any live invite code.
export function isValidAccess(hash) { return hash === TERMINAL_HASH || INVITE_HASHES.includes(hash); }
