// The small slice of Ethereum encoding the city noticeboard needs, and nothing more.
//
// ethers and viem are both ~100 KB into the bundle, for one function call and one event decode.
// This is the alternative: keccak256, an ABI encoder for post(string,string), and a decoder for
// the Note event. It's about 120 lines, it's tested against the published Keccak vectors, and it
// keeps the site's payload where it is.
//
// Keccak-256 is NOT SHA3-256 — Node's crypto has the latter and they differ in the padding byte
// (0x01 here, 0x06 there). Reaching for createHash("sha3-256") silently produces valid-looking
// hashes that no Ethereum node agrees with, so the implementation is here on purpose.

const MASK = (1n << 64n) - 1n;
const RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];
// rho rotation offsets, laid out row by row as r[x][y] at index x + 5y
const ROT = [
  0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39,
  41, 45, 15, 21, 8, 18, 2, 61, 56, 14,
];
const rotl = (v, n) => (n === 0n ? v : ((v << n) | (v >> (64n - n))) & MASK);

function keccakF(A) {
  for (let round = 0; round < 24; round++) {
    const C = [], D = [];
    for (let x = 0; x < 5; x++) C[x] = A[x] ^ A[x + 5] ^ A[x + 10] ^ A[x + 15] ^ A[x + 20];
    for (let x = 0; x < 5; x++) D[x] = C[(x + 4) % 5] ^ rotl(C[(x + 1) % 5], 1n);
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) A[x + 5 * y] ^= D[x];

    const B = new Array(25);
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) B[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(A[x + 5 * y], BigInt(ROT[x + 5 * y]));
    }
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) A[x + 5 * y] = B[x + 5 * y] ^ ((~B[(x + 1) % 5 + 5 * y] & MASK) & B[(x + 2) % 5 + 5 * y]);
    }
    A[0] ^= RC[round];
  }
  return A;
}

export function keccak256(bytes) {
  const RATE = 136;                                    // 1088-bit rate for keccak-256
  const pad = RATE - (bytes.length % RATE);
  const buf = new Uint8Array(bytes.length + pad);
  buf.set(bytes);
  buf[bytes.length] |= 0x01;                           // Ethereum's padding, not SHA3's 0x06
  buf[buf.length - 1] |= 0x80;

  const A = new Array(25).fill(0n);
  for (let off = 0; off < buf.length; off += RATE) {
    for (let i = 0; i < RATE / 8; i++) {
      let lane = 0n;
      for (let b = 7; b >= 0; b--) lane = (lane << 8n) | BigInt(buf[off + i * 8 + b]);
      A[i] ^= lane;
    }
    keccakF(A);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 4; i++) {
    let lane = A[i];
    for (let b = 0; b < 8; b++) { out[i * 8 + b] = Number(lane & 0xffn); lane >>= 8n; }
  }
  return out;
}

// ── hex + bytes ───────────────────────────────────────────────────────────────────────────────
export const toHex = bytes => "0x" + [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
export const fromHex = hex => {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
};
const utf8 = s => new TextEncoder().encode(s);
export const hashOf = sig => toHex(keccak256(utf8(sig)));
export const selectorOf = sig => hashOf(sig).slice(0, 10);

// ── ABI ───────────────────────────────────────────────────────────────────────────────────────
// Only what post(string,string) needs: a head of two offsets, then each string as
// [32-byte length][data padded to 32]. Deliberately not a general encoder — a general one is
// where the bugs live, and this contract will only ever have the one function.
const word = n => n.toString(16).padStart(64, "0");
const padRight = bytes => {
  const rem = bytes.length % 32;
  return rem === 0 ? bytes : new Uint8Array([...bytes, ...new Uint8Array(32 - rem)]);
};

export function encodePost(city, text) {
  const a = utf8(city), b = utf8(text);
  const aPad = padRight(a), bPad = padRight(b);
  const offA = 64;                                     // two head words
  const offB = offA + 32 + aPad.length;
  return selectorOf("post(string,string)")
    + word(offA) + word(offB)
    + word(a.length) + toHex(aPad).slice(2)
    + word(b.length) + toHex(bPad).slice(2);
}

// Decode the `data` field of Note(address indexed who, string city, string text). The address is
// indexed, so it arrives in topics[1] and never in the data.
export function decodeNoteData(dataHex) {
  const d = fromHex(dataHex);
  const at = i => Number(BigInt("0x" + toHex(d.slice(i, i + 32)).slice(2)));
  const str = off => {
    const len = at(off);
    return new TextDecoder().decode(d.slice(off + 32, off + 32 + len));
  };
  return { city: str(at(0)), text: str(at(32)) };
}

export const topicAddress = topic => "0x" + topic.slice(-40).toLowerCase();

export const NOTE_TOPIC = hashOf("Note(address,string,string)");
