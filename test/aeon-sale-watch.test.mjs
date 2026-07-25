import test from "node:test";
import assert from "node:assert/strict";
import { pickNotable, saleCopy } from "../scripts/bot/aeon-sale-watch.mjs";
import { tierOf } from "../scripts/bot/aeon-sale-card.mjs";

const TODAY = "2026-07-23";
const d = n => new Date(Date.parse(TODAY) - n * 86400e3).toISOString().slice(0, 10);
const sale = o => ({ id: 1, price: 0.5, rank: 2000, exp: 0.5, disc: 0, img: null, d: TODAY, ...o });

test("picks nothing when no sale clears a notability bar", () => {
  const rows = [sale({ id: 1, disc: 0.05 }), sale({ id: 2, price: 0.6, disc: -0.1 })];
  assert.equal(pickNotable(rows, { level: 0.59, today: TODAY }), null);
});

test("flags a steal (>=20% under what that rarity trades at)", () => {
  const got = pickNotable([sale({ id: 7, price: 0.4, exp: 0.6, disc: 0.33 })], { level: 0.59, today: TODAY });
  assert.equal(got.kind, "steal");
  assert.equal(got.sale.id, 7);
});

test("flags a rare piece trading at all, even at a fair price", () => {
  const got = pickNotable([sale({ id: 9, rank: 42, disc: 0 })], { level: 0.59, today: TODAY });
  assert.equal(got.kind, "rare");
});

test("flags a big sale at >=2x the market level", () => {
  const got = pickNotable([sale({ id: 3, price: 1.4, disc: -0.5 })], { level: 0.59, today: TODAY });
  assert.equal(got.kind, "big");
});

test("a steal outranks a rare and a big sale", () => {
  const rows = [
    sale({ id: 1, rank: 10, disc: 0 }),                       // rare
    sale({ id: 2, price: 2.0, disc: -0.5 }),                  // big
    sale({ id: 3, price: 0.35, exp: 0.6, disc: 0.42 }),       // steal
  ];
  assert.equal(pickNotable(rows, { level: 0.59, today: TODAY }).sale.id, 3);
});

test("ignores stale sales outside the freshness window", () => {
  const rows = [sale({ id: 5, rank: 10, d: d(9) })];
  assert.equal(pickNotable(rows, { level: 0.59, today: TODAY }), null);
  assert.equal(pickNotable(rows, { level: 0.59, today: TODAY, days: 30 }).sale.id, 5);
});

test("never re-posts a sale already recorded", () => {
  const rows = [sale({ id: 8, rank: 12 })];
  const posted = new Set([`8@${TODAY}`]);
  assert.equal(pickNotable(rows, { level: 0.59, today: TODAY, posted }), null);
});

test("copy leads with the number, names the rarity, and stays in the instant-read budget", () => {
  const pick = { sale: sale({ id: 2167, price: 0.417, exp: 0.604, rank: 257, disc: 0.31 }), kind: "steal" };
  const traits = [{ t: "Head Accessory", v: "Ultra-Helmet", pct: 0.54 }];
  const txt = saleCopy(pick, { total: 3333, tier: tierOf(257, 3333), traits, asOf: TODAY });
  assert.match(txt, /#2167/);
  assert.match(txt, /31% under/);
  assert.match(txt, /0\.54%/);
  assert.equal(txt.split("\n").length, 3, "house style is exactly 3 lines");
  assert.ok([...txt].length <= 600, `copy too long: ${[...txt].length}`);
});

// The first live post announced a 4-day-old trade as "just sold" — the freshness clock was
// the market file's build date, not the real one. The tense must track the actual age.
test("copy says 'just sold' only when the sale is actually today", () => {
  const mk = d2 => saleCopy({ sale: sale({ id: 1, exp: 0.6, disc: 0.3, d: d2 }), kind: "steal" },
    { total: 3333, tier: tierOf(1, 3333), traits: [], asOf: TODAY });
  assert.match(mk(TODAY), /just sold/);
  assert.match(mk(d(1)), /sold yesterday/);
  assert.match(mk(d(3)), new RegExp(`sold on ${d(3)}`), "older than a day names the date");
  assert.doesNotMatch(mk(d(3)), /just sold/);
});

test("withFooter turns the 3 lines into airy paragraphs and adds the branded footer", async () => {
  const { withFooter } = await import("../scripts/bot/posts.mjs");
  const txt = withFooter(saleCopy({ sale: sale({ exp: 0.6, disc: 0.3 }), kind: "steal" },
    { total: 3333, tier: tierOf(1, 3333), traits: [], asOf: TODAY }));
  assert.ok(txt.includes("\n\n"), "single newlines must become blank-line separated paragraphs");
  assert.match(txt, /🌈/, "branded footer missing — the first live post went out without it");
});

// ── art resolution ───────────────────────────────────────────────────────────
// The piece IS the post, so these cover the fallback chain and the formats resvg
// can actually decode. Fetch is injected; nothing hits the network.
import { fetchArt } from "../scripts/bot/aeon-sale-card.mjs";

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 7)]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(200, 3)]);
const ok = buf => ({ ok: true, status: 200, arrayBuffer: async () => buf, headers: { get: () => "application/octet-stream" } });
const fail = status => ({ ok: false, status });

test("art: embeds a PNG as a data URI regardless of a wrong content-type header", async () => {
  const art = await fetchArt("https://cdn/a.png", { fetchImpl: async () => ok(PNG) });
  assert.match(art, /^data:image\/png;base64,/);
});

test("art: recognises an SVG body", async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'.padEnd(300, " "));
  const art = await fetchArt("https://cdn/a.svg", { fetchImpl: async () => ok(svg) });
  assert.match(art, /^data:image\/svg\+xml;base64,/);
});

test("art: rejects WEBP (resvg cannot decode it) and moves to the next candidate", async () => {
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(url);
    if (url.includes("getNFTMetadata")) {
      return { ok: true, status: 200, json: async () => ({ image: { cachedUrl: "https://cdn/good.png" } }) };
    }
    return ok(url.includes("good") ? PNG : WEBP);
  };
  const art = await fetchArt("https://cdn/bad.webp", { fetchImpl, key: "k", tokenId: 1, contract: "0xc" });
  assert.match(art, /^data:image\/png;base64,/);
  assert.ok(seen.some(u => u.includes("getNFTMetadata")), "should have asked Alchemy for a fresh URL");
});

test("art: falls back to fresh Alchemy metadata when the cached URL 404s", async () => {
  const fetchImpl = async (url) => {
    if (url.includes("getNFTMetadata")) {
      return { ok: true, status: 200, json: async () => ({ image: { thumbnailUrl: "https://cdn/thumb.png" } }) };
    }
    return url.includes("thumb") ? ok(PNG) : fail(404);
  };
  const art = await fetchArt("https://cdn/dead.png", { fetchImpl, key: "k", tokenId: 7, contract: "0xc" });
  assert.match(art, /^data:image\/png;base64,/);
});

test("art: returns null when every source fails, so the watcher can refuse to post", async () => {
  const art = await fetchArt("https://cdn/x.png", { fetchImpl: async () => fail(404) });
  assert.equal(art, null);
});
