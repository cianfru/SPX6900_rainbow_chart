// Messages left on buildings in Aeon City / Whale City.
//
// ⚠ STORAGE IS STUBBED. Everything below — connecting, signing, ownership checks, the UI — is
// real and final. Only the STORE is temporary: messages currently live in this browser's
// localStorage, so they survive a reload but are visible to nobody else. Swapping in a real
// backend is one object (see `remoteStore` at the bottom) and changes nothing above it.
//
// The signature is not decoration. A message is only accepted with a `personal_sign` over a
// statement naming the wallet, the city and the text, so nobody can post as someone else. Right
// now that's checked client-side; when the backend lands the SAME check has to run on the server,
// because anything a browser asserts about itself can be forged. Kept in one place so that
// migration is a single edit rather than a hunt.

export const MAX_LEN = 140;

// The exact text a wallet signs. Includes the message body, so a signature can't be lifted from
// one post and reused on another, and the city, so it can't be replayed across cities.
export const claimStatement = (address, city, text) =>
  `Claim my building in ${city}\n\nwallet: ${address.toLowerCase()}\nmessage: ${text}\n\nSigning proves you own this wallet. It costs nothing and sends no transaction.`;

// ── wallet ────────────────────────────────────────────────────────────────────────────────────
export const hasWallet = () => typeof window !== "undefined" && !!window.ethereum;

export async function connectWallet() {
  if (!hasWallet()) throw new Error("No EVM wallet found. Install MetaMask, Rabby or Coinbase Wallet — or open this page in your wallet's browser.");
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  const a = accounts?.[0];
  if (!a) throw new Error("No account returned by the wallet.");
  return a.toLowerCase();
}

export async function signClaim(address, city, text) {
  const statement = claimStatement(address, city, text);
  const sig = await window.ethereum.request({ method: "personal_sign", params: [statement, address] });
  return { statement, sig };
}

// ── validation (shared by the client and, later, the server) ──────────────────────────────────
export function validateMessage(text) {
  const t = (text || "").trim();
  if (!t) return "Write something first.";
  if (t.length > MAX_LEN) return `Keep it under ${MAX_LEN} characters (that's ${t.length}).`;
  if (/(https?:\/\/|www\.|\.eth\b|t\.me\/|discord\.gg)/i.test(t)) return "No links — the city stays link-free so it can't be used to shill.";
  // Control characters, plus the bidi overrides — the latter can visually reverse a string, so a
  // message that reads as harmless in the box renders as something else on the building.
  if (/[\u0000-\u0008\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(t)) return "That contains characters we can't display.";
  return null;
}

// ── store ─────────────────────────────────────────────────────────────────────────────────────
// One message per wallet, replaceable — so the city can't be flooded and nobody has to moderate
// a thread. Key is the city id so Aeon and Whale never mix.
const KEY = city => `city-msgs:${city}`;

export const localStore = {
  async list(city) {
    try { return JSON.parse(localStorage.getItem(KEY(city)) || "{}"); } catch { return {}; }
  },
  async put(city, { address, text }) {
    const all = await localStore.list(city);
    all[address.toLowerCase()] = { text: text.trim(), ts: Date.now() };
    try { localStorage.setItem(KEY(city), JSON.stringify(all)); } catch { /* private mode */ }
    return all;
  },
  async remove(city, address) {
    const all = await localStore.list(city);
    delete all[address.toLowerCase()];
    try { localStorage.setItem(KEY(city), JSON.stringify(all)); } catch { /* ignore */ }
    return all;
  },
  persistent: false,   // drives the "only you can see this" notice in the UI
};

// Drop-in replacement once a datastore is chosen. The API shape is identical, so the UI needs no
// changes — point `store` at this and implement /api/city-messages (which MUST re-verify the
// signature server-side and re-check that the wallet owns a building).
export const remoteStore = {
  async list(city) {
    const r = await fetch(`/api/city-messages?city=${encodeURIComponent(city)}`);
    return r.ok ? r.json() : {};
  },
  async put(city, { address, text, statement, sig }) {
    const r = await fetch("/api/city-messages", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ city, address, text, statement, sig }),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Could not save your message.");
    return r.json();
  },
  persistent: true,
};

export const store = localStore;
