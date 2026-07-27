// Messages left on buildings in Aeon City / Whale City.
//
// ⭐ THE NOTES LIVE ON-CHAIN, NOT WITH US. A note is a transaction to CityNotes.sol, which emits it
// as an event and stores nothing. We run no database, no endpoint and no key, and there is nothing
// of ours to trust: anyone can read the same logs and rebuild this noticeboard exactly.
//
// That also removes the weakest part of the first design. When a message was a signature checked in
// the browser, a browser could be told to skip the check, so a server would eventually have had to
// re-verify everything. A transaction can't be forged — `msg.sender` IS the proof — so the
// verification problem doesn't get deferred, it disappears.
//
// What does NOT disappear:
//   • Permanence. Nobody can delete a note, us included. We can only stop rendering it. Moderation
//     moves from "what we keep" to "what we display" — validateMessage is now a DISPLAY FILTER
//     rather than a gate. Someone can write a link on-chain; the city won't show it.
//   • Ownership. The contract can't know who holds AEON or SPX, so "only residents get a sign" is
//     applied at render time by the city, not at write time by the chain.
//
// Reading follows the same snapshot-forward pattern as every other series here: a daily job banks
// the logs into public/city-notes.json, and a wallet's own fresh note is echoed locally so it shows
// up immediately instead of tomorrow.
import { encodePost } from "./evm.js";

export const MAX_LEN = 140;

// ── chains ────────────────────────────────────────────────────────────────────────────────────
// Both are supported deliberately. Mainnet is where the holdings actually are, so a note there
// costs real money and means it; Base costs a fraction of a cent, so it's where people will
// actually talk. Every note is labelled with the chain it was written on — colour AND text, never
// colour alone, because "grey versus blue" is not a distinction everyone can see.
//
// Colours are this repo's existing per-chain convention (the multichain card): Ethereum grey, Base
// blue. The honest caveat: that Ethereum grey is near-neutral by design, which is exactly why the
// written chain name beside it is not optional.
export const CHAINS = {
  ethereum: {
    id: "ethereum", chainId: 1, hexId: "0x1", label: "Ethereum", short: "MAINNET",
    colour: "#98a2b7", ink: "#0b1020", tint: "rgba(152,162,183,0.14)",
    blurb: "written on mainnet — real gas, so it was meant",
    explorer: "https://etherscan.io/tx/",
    rpc: "https://eth-mainnet.g.alchemy.com/v2/",
  },
  base: {
    id: "base", chainId: 8453, hexId: "0x2105", label: "Base", short: "BASE",
    colour: "#3b82f6", ink: "#f8fafc", tint: "rgba(59,130,246,0.16)",
    blurb: "written on Base — a fraction of a cent",
    explorer: "https://basescan.org/tx/",
    rpc: "https://base-mainnet.g.alchemy.com/v2/",
  },
};
export const CHAIN_IDS = ["base", "ethereum"];          // cheapest first — it's the default
export const chainOf = id => CHAINS[id] || CHAINS.base;

// Deployed CityNotes addresses. EMPTY UNTIL DEPLOYED — every surface degrades quietly rather than
// half-working, so the city simply shows no noticeboard until these are filled in. Set them once
// and both reading and writing light up, on the site and in the daily reader.
export const CONTRACTS = {
  ethereum: "",
  base: "",
};
export const isLive = id => !!CONTRACTS[id];
export const anyLive = () => CHAIN_IDS.some(isLive);

// ── validation — a DISPLAY filter, applied on the way in AND on the way out ────────────────────
// On the way in so nobody spends gas on something the city won't render; on the way out because
// the chain accepts anything and the city is what people actually see.
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
export const displayable = text => validateMessage(text) === null;

// ── wallet ────────────────────────────────────────────────────────────────────────────────────
export const hasWallet = () => typeof window !== "undefined" && !!window.ethereum;

export async function connectWallet() {
  if (!hasWallet()) throw new Error("No EVM wallet found. Install MetaMask, Rabby or Coinbase Wallet — or open this page in your wallet's browser.");
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  const a = accounts?.[0];
  if (!a) throw new Error("No account returned by the wallet.");
  return a.toLowerCase();
}

export async function currentChain() {
  if (!hasWallet()) return null;
  const hex = await window.ethereum.request({ method: "eth_chainId" });
  return CHAIN_IDS.find(id => CHAINS[id].hexId === hex) ?? null;
}

// Move the wallet to the chain the note is being written on. 4902 means the wallet doesn't know the
// chain yet — realistically only Base — so offer to add it rather than dead-ending someone.
export async function switchChain(id) {
  const c = chainOf(id);
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: c.hexId }] });
  } catch (e) {
    if (e?.code !== 4902 && e?.data?.originalError?.code !== 4902) throw e;
    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: c.hexId, chainName: c.label, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: ["https://mainnet.base.org"], blockExplorerUrls: ["https://basescan.org"],
      }],
    });
  }
}

// ── writing ───────────────────────────────────────────────────────────────────────────────────
// One transaction. No approval step, no value, no signature to store — the chain records who sent
// it and that is the whole proof.
export async function postNote({ address, chain, city, text }) {
  const to = CONTRACTS[chain];
  if (!to) throw new Error("The noticeboard isn't deployed on that chain yet.");
  const bad = validateMessage(text);
  if (bad) throw new Error(bad);

  if ((await currentChain()) !== chain) await switchChain(chain);
  return window.ethereum.request({
    method: "eth_sendTransaction",
    params: [{ from: address, to, data: encodePost(city, text.trim()) }],
  });
}

// ── reading ───────────────────────────────────────────────────────────────────────────────────
// The banked logs (public/city-notes.json, refreshed daily) plus a local echo of what THIS browser
// just posted, so your own note appears the moment it confirms rather than after the next run. The
// echo is cosmetic and self-expiring: once the banked file catches up it takes over, and an echo
// nobody can corroborate is dropped after a week so a failed transaction can't leave a ghost sign.
const ECHO = "city-notes-echo";
const ECHO_TTL = 7 * 864e5;

const readEcho = () => { try { return JSON.parse(localStorage.getItem(ECHO) || "{}"); } catch { return {}; } };

export function echoNote({ address, chain, city, text, tx }) {
  const all = readEcho();
  all[`${city}:${address.toLowerCase()}`] = { chain, text: text.trim(), tx, ts: Date.now() };
  try { localStorage.setItem(ECHO, JSON.stringify(all)); } catch { /* private mode */ }
}

export function clearEcho(city, address) {
  const all = readEcho();
  delete all[`${city}:${address.toLowerCase()}`];
  try { localStorage.setItem(ECHO, JSON.stringify(all)); } catch { /* ignore */ }
}

// Merge banked + echoed into { address: { text, chain, ts, pending } }. Exported and pure so the
// precedence rules are testable rather than tangled into a component.
export function mergeNotes(banked, echo, city, now = Date.now()) {
  const out = {};
  for (const [addr, n] of Object.entries(banked?.[city] || {})) {
    if (displayable(n.text)) out[addr.toLowerCase()] = { ...n, pending: false };
  }
  for (const [key, e] of Object.entries(echo || {})) {
    // Lowercase on the way out as well as in: wallets hand back checksummed addresses, and a
    // mixed-case key would never match the banked one — the note would show as pending forever
    // and the building would end up with two signs on it.
    const [c, raw] = key.split(":");
    const addr = (raw || "").toLowerCase();
    if (c !== city || now - e.ts > ECHO_TTL) continue;
    const known = out[addr];
    // The chain is the source of truth: once it reports this note, the echo has nothing to add.
    if (known && known.text === e.text && known.chain === e.chain) continue;
    if (!displayable(e.text)) continue;
    out[addr] = { text: e.text, chain: e.chain, ts: e.ts, tx: e.tx, pending: true };
  }
  return out;
}

export async function loadNotes(city) {
  let banked = {};
  try {
    const r = await fetch("/city-notes.json", { cache: "no-cache" });
    if (r.ok) banked = await r.json();
  } catch { /* offline or not deployed yet — the echo still renders */ }
  return mergeNotes(banked.cities || banked, readEcho(), city);
}
