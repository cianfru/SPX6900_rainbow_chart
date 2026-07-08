// Offline tests for the shadow-mode LLM copywriter (scripts/bot/llm-copy.mjs).
// No network: draftCopy takes an injectable fetch, and the no-key path returns a
// deterministic mock. Guards the honesty rails (numbers only, blocklist, length).
import { test } from "node:test";
import assert from "node:assert/strict";
import { draftCopy, validateDraft, xLen, resolveModelsAsync, _resetFreeModelCache, stripReasoning } from "../scripts/bot/llm-copy.mjs";

const MODELS_LIST = {
  data: [
    { id: "provider-a/big:free", context_length: 128000, architecture: { input_modalities: ["text"], output_modalities: ["text"] } },
    { id: "provider-b/small:free", context_length: 8000, architecture: { input_modalities: ["text"], output_modalities: ["text"] } },
    { id: "provider-c/vision:free", context_length: 64000, architecture: { input_modalities: ["image"], output_modalities: ["text"] } },
    { id: "provider-d/paid", context_length: 200000, architecture: { input_modalities: ["text"], output_modalities: ["text"] } },
  ],
};

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

test("stripReasoning removes a leaked <think> scratchpad, keeping only the answer", () => {
  const leaked = "<think>Let me plan the three lines and count characters carefully...</think>\n" + good3;
  assert.equal(stripReasoning(leaked), good3);
  // unclosed opener (truncated block) → keep what follows the closer if any, else trim
  assert.equal(stripReasoning("<reasoning>partial thoughts</reasoning>  " + good3), good3);
});

test("a reasoning model that leaks its scratchpad is salvaged, not rejected as too-long", async () => {
  // Nemotron-style: the whole chain-of-thought dumped inline ahead of the real 3 lines,
  // which pushed the raw content to 800+ chars ("too long"). stripReasoning must rescue it.
  const leaked = "<think>" + "reasoning ".repeat(90) + "</think>\n" + good3;
  const fakeFetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: leaked } }] }) });
  const d = await draftCopy(SIGNAL, { apiKey: "sk-test", fetchImpl: fakeFetch, model: "reasoner/x:free" });
  assert.equal(d.ok, true, d.reason);
  assert.equal(d.text, good3);
});

test("draftCopy sends reasoning.exclude so reasoning models don't leak into the draft", async () => {
  let body = null;
  const fakeFetch = async (_url, init) => { body = JSON.parse(init.body); return { ok: true, json: async () => ({ choices: [{ message: { content: good3 } }] }) }; };
  await draftCopy(SIGNAL, { apiKey: "sk-test", fetchImpl: fakeFetch, model: "test/model" });
  assert.equal(body.reasoning?.exclude, true, "reasoning must be excluded from the response");
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

test("resolveModelsAsync tries owner-vetted seeds first, then appends discovered free models", async () => {
  _resetFreeModelCache();
  const doFetch = async () => ({ ok: true, json: async () => MODELS_LIST });
  const models = await resolveModelsAsync({}, doFetch);
  // the cheap PAID primary leads (dependable, non-reasoning), then the free seeds
  assert.equal(models[0], "openai/gpt-4o-mini");
  assert.ok(models.includes("nvidia/nemotron-3-super-120b-a12b:free"), "free seed kept as fallback");
  // discovered text→text :free models appended as the churn safety net
  assert.ok(models.includes("provider-a/big:free"), "discovered text model appended");
  assert.ok(models.includes("provider-b/small:free"));
  // bigger-context discovered model precedes the smaller one
  assert.ok(models.indexOf("provider-a/big:free") < models.indexOf("provider-b/small:free"));
  // vision-input and non-free models dropped
  assert.ok(!models.includes("provider-c/vision:free"), "image-input model excluded");
  assert.ok(!models.includes("provider-d/paid"), "non-free model excluded");
});

test("resolveModelsAsync skips discovery when models are pinned explicitly", async () => {
  let called = false;
  const doFetch = async () => { called = true; return { ok: true, json: async () => MODELS_LIST }; };
  const models = await resolveModelsAsync({ models: ["only/this:free"] }, doFetch);
  assert.deepEqual(models, ["only/this:free"]);
  assert.equal(called, false, "no /models call when the chain is pinned");
});

test("resolveModelsAsync falls back to static seeds when discovery fails", async () => {
  _resetFreeModelCache();
  const doFetch = async () => ({ ok: false, status: 500, text: async () => "err" });
  const models = await resolveModelsAsync({}, doFetch);
  assert.deepEqual(models, [
    "openai/gpt-4o-mini",
    "nvidia/nemotron-3-super-120b-a12b:free",
    "meta-llama/llama-3.3-70b-instruct:free",
  ]);
});

test("xLen counts emoji as 2 and URLs as 23", () => {
  assert.equal(xLen("ab"), 2);
  assert.equal(xLen("💎"), 2);
  assert.equal(xLen("see https://example.com/x/y"), "see ".length + 23);
});
