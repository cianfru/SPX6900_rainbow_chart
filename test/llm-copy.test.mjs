// Offline tests for the shadow-mode LLM copywriter (scripts/bot/llm-copy.mjs).
// No network: draftCopy takes an injectable fetch, and the no-key path returns a
// deterministic mock. Guards the honesty rails (numbers only, blocklist, length).
import { test } from "node:test";
import assert from "node:assert/strict";
import { draftCopy, validateDraft, xLen } from "../scripts/bot/llm-copy.mjs";

const SIGNAL = {
  type: "diamond-jump", emoji: "💎",
  title: "Diamond share up +0.8pp → 60.9%",
  detail: "571,000,000 SPX now in the longest-held tier.",
  framing: "8M SPX just aged into diamond hands — coins reach it only by being held, conviction deepening.",
  note: "Word it as HELD, not BOUGHT.",
  card: "diamondtrend",
};

const good3 = "Diamond hands now hold 60.9% of SPX6900 supply.\n8M coins just aged into the longest-held tier — held through everything, not bought.\nConviction, maturing on-chain.";

test("validateDraft accepts a clean 3-line, numbered draft", () => {
  const v = validateDraft(good3);
  assert.ok(v.ok, v.reason);
});

test("validateDraft rejects hype/advice, over-length, no-number, bad @handle", () => {
  assert.ok(!validateDraft("This will hit $69 for sure.\nBuy now.\nMoon.").ok);
  assert.ok(!validateDraft("60.9% today.\n" + "x".repeat(260) + "\nclose").ok);
  assert.ok(!validateDraft("Diamond hands are strong.\nHeld through everything.\nConviction.").ok, "no number should fail");
  assert.ok(!validateDraft("@planb's chart shows 60%.\nHeld.\nStrong.").ok, "possessive @handle should fail");
});

test("no API key → labelled mock that still validates loosely", async () => {
  const d = await draftCopy(SIGNAL, { apiKey: "", fetchImpl: null });
  assert.equal(d.mock, true);
  assert.ok(d.text.length > 0);
  assert.match(d.reason, /OPENROUTER_API_KEY/);
});

test("real path parses a good completion and returns it", async () => {
  const fakeFetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: good3 } }] }),
  });
  const d = await draftCopy(SIGNAL, { apiKey: "sk-test", fetchImpl: fakeFetch, model: "test/model" });
  assert.equal(d.mock, false);
  assert.equal(d.ok, true);
  assert.equal(d.text, good3);
  assert.equal(d.model, "test/model");
});

test("falls back to the next free model when the first is rate-limited (429)", async () => {
  const calls = [];
  const fakeFetch = async (_url, init) => {
    const model = JSON.parse(init.body).model;
    calls.push(model);
    if (calls.length === 1) return { ok: false, status: 429, text: async () => "temporarily rate-limited" };
    return { ok: true, json: async () => ({ choices: [{ message: { content: good3 } }] }) };
  };
  const d = await draftCopy(SIGNAL, { apiKey: "sk-test", fetchImpl: fakeFetch });
  assert.equal(d.ok, true);
  assert.equal(d.text, good3);
  assert.ok(calls.length >= 2, "should have tried a second model");
  assert.notEqual(d.model, calls[0], "returned model should be the fallback, not the 429'd one");
});

test("a bad key (401) stops the chain early — no hammering every model", async () => {
  let n = 0;
  const fakeFetch = async () => { n++; return { ok: false, status: 401, text: async () => "no auth" }; };
  const d = await draftCopy(SIGNAL, { apiKey: "bad", fetchImpl: fakeFetch, models: ["a:free", "b:free", "c:free"] });
  assert.equal(d.ok, false);
  assert.equal(n, 1, "should stop after the first 401, not try the rest");
});

test("a hallucinated/hype completion is rejected, not surfaced", async () => {
  const fakeFetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: "SPX will hit $69 guaranteed.\nBuy now.\nMoon." } }] }),
  });
  const d = await draftCopy(SIGNAL, { apiKey: "sk-test", fetchImpl: fakeFetch });
  assert.equal(d.ok, false);
  assert.equal(d.text, "");
});

test("fetch failure degrades gracefully (no throw)", async () => {
  const boom = async () => { throw new Error("network down"); };
  const d = await draftCopy(SIGNAL, { apiKey: "sk-test", fetchImpl: boom });
  assert.equal(d.ok, false);
  assert.match(d.reason, /network down/);
});

test("xLen counts emoji as 2 and URLs as 23", () => {
  assert.equal(xLen("ab"), 2);
  assert.equal(xLen("💎"), 2);
  assert.equal(xLen("see https://example.com/x/y"), "see ".length + 23);
});
