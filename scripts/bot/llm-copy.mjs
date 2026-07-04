// Shadow-mode LLM copywriter for the "⚡ Notable today" anomaly signals.
//
// The detector (signals.mjs) does the HONEST NUMBER work: it computes the real
// on-chain facts and an analyst-style `framing` + guardrail `note`. This module
// only does LANGUAGE on top — it hands those exact, already-computed numbers to
// an LLM (via OpenRouter) and asks for an engaging, house-style tweet. It NEVER
// fetches or invents data: honest numbers are the moat, so the model is fenced
// to the facts it's given and validated before the draft is ever shown.
//
// SHADOW MODE by design: the draft is written into signals.json for the control
// panel to display NEXT TO the template framing. Nothing auto-posts — the owner
// reads both, copies the LLM draft if it lands better, or queues the template
// card. With no OPENROUTER_API_KEY set, draftCopy returns a clearly-labelled
// MOCK so the control-panel UX is visible before a real key is wired.

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
// Free-model FALLBACK CHAIN. OpenRouter's free endpoints get pooled 429s ("temporarily
// rate-limited") independently per provider, so we try several free models from DIFFERENT
// providers in order and take the first that yields a valid draft — staying $0 while
// surviving one provider being saturated. The chain also tolerates a stale/renamed id
// (that model just fails and we move on). Override the primary with OPENROUTER_MODEL, or
// the whole chain with OPENROUTER_MODELS (comma-separated). Kept env-overridable because
// free ids churn.
const FREE_FALLBACKS = [
  "meta-llama/llama-3.3-70b-instruct:free", // Meta / Together
  "google/gemini-2.0-flash-exp:free",       // Google
  "qwen/qwen-2.5-72b-instruct:free",        // Alibaba / Qwen
];
const DEFAULT_MODEL = FREE_FALLBACKS[0];

// Resolve the ordered list of models to try: explicit chain wins, else the primary
// (opts/env) followed by the remaining free fallbacks (deduped).
function resolveModels(opts = {}) {
  const envList = (process.env.OPENROUTER_MODELS || "").split(",").map(s => s.trim()).filter(Boolean);
  if (opts.models?.length) return [...new Set(opts.models)];
  if (envList.length) return [...new Set(envList)];
  const primary = opts.model || process.env.OPENROUTER_MODEL;
  const chain = primary ? [primary, ...FREE_FALLBACKS] : [...FREE_FALLBACKS];
  return [...new Set(chain)];
}

// Words that read as hype / financial advice — an instant credibility leak for
// an account whose whole moat is honest analysis. A draft containing any of
// these is rejected and we fall back to the template.
const BLOCKLIST = [
  "guaranteed", "guarantee", "will hit", "will reach", "buy now", "sell now",
  "financial advice", "not financial advice", "to the moon", "moonshot",
  "can't lose", "risk-free", "riskless", "pump it", "ape in", "get rich",
];

// X-weighted length: most code points = 1, astral (emoji) = 2, a URL = 23.
// Mirrors how X truncates the timeline (same rule as test/posts.test.mjs).
export function xLen(text) {
  let urls = 0;
  const noUrls = String(text).replace(/https?:\/\/\S+/g, () => { urls += 23; return ""; });
  return urls + [...noUrls].reduce((n, c) => n + (c.codePointAt(0) > 0xffff ? 2 : 1), 0);
}

// The house style + honesty guardrails, shared by the prompt and (loosely) the
// validator. Kept verbatim from CLAUDE.md "Card copy style".
const SYSTEM_PROMPT = `You are the copywriter for the SPX6900 rainbow-chart X (Twitter) account.
Voice: honest, calm on-chain analysis. Confident but never hype. The account's whole reputation is HONESTY — it kept followers through a ~28% drawdown by being straight with them. Interesting AND true, both required.

Write ONE tweet about the notable event described. Hard rules:
- Use ONLY the numbers and facts given. NEVER invent, re-round, or add any figure not provided. If a number isn't given, don't state one.
- Obey the GUARDRAIL note exactly — it fences the one thing you must not claim (e.g. "held, not bought").
- Exactly 3 short lines separated by single newlines: (1) HERO — lead with the number/current state and the hook, (2) one tight description sentence, (3) a short closing takeaway.
- Aim 180-230 characters total; never exceed 235.
- No hype or advice words (guaranteed, will hit, buy now, moon, financial advice, etc.). No price predictions or promises.
- If you @mention a handle, never attach an apostrophe or 's directly to it (X breaks the link) — keep a space after it or put it at the end.
- Do NOT add hashtags, cashtags, a footer, or "NFA" — the system appends the branded footer itself.
Output ONLY the 3 lines of tweet text, nothing else.`;

function userPrompt(signal) {
  const lines = [
    `Event: ${signal.title || ""}`,
    signal.detail ? `Facts (use these numbers verbatim): ${signal.detail}` : "",
    signal.framing ? `Suggested honest angle: ${signal.framing}` : "",
    signal.note ? `GUARDRAIL (must obey): ${signal.note}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

// Validate a candidate draft against the house rules. Returns {ok, reason}.
export function validateDraft(text) {
  const t = String(text || "").trim();
  if (!t) return { ok: false, reason: "empty" };
  const low = t.toLowerCase();
  for (const w of BLOCKLIST) if (low.includes(w)) return { ok: false, reason: `blocked phrase: "${w}"` };
  const len = xLen(t);
  if (len > 235) return { ok: false, reason: `too long (${len} > 235)` };
  if (!/\d/.test(t)) return { ok: false, reason: "no number (hero must lead with the figure)" };
  const lineCount = t.split("\n").filter(l => l.trim()).length;
  if (lineCount < 2 || lineCount > 4) return { ok: false, reason: `expected ~3 lines, got ${lineCount}` };
  // A tagged handle with a trailing apostrophe breaks the X link.
  if (/@\w+['’]/.test(t)) return { ok: false, reason: "possessive on an @handle breaks the link" };
  return { ok: true, reason: "" };
}

// Deterministic mock draft from the signal's own framing — shown when no API key
// is set, so the control-panel shadow UX renders. Clearly flagged mock:true.
function mockDraft(signal) {
  const hero = (signal.title || "SPX6900 update").replace(/\s+/g, " ").trim();
  // Pull the first sentence of the framing as the body; keep it honest + short.
  const body = String(signal.framing || signal.detail || "")
    .replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s/)[0] || "On-chain, worth a look.";
  const close = "Honest on-chain read.";
  const text = `${hero}.\n${body}\n${close}`.slice(0, 260);
  return { text, model: "mock", mock: true, ok: true, reason: "no OPENROUTER_API_KEY — placeholder so the shadow UX renders" };
}

// One OpenRouter call for a single model. Returns
//   { ok, text, status, reason }
// status is the HTTP code (or 0 on a thrown/network error) so the caller can
// decide whether trying the NEXT model would help (e.g. don't bother on 401/403).
async function callModel(model, signal, apiKey, doFetch) {
  try {
    const res = await doFetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // OpenRouter recommends these for attribution; harmless if ignored.
        "HTTP-Referer": "https://spx6900-rainbow-chart.vercel.app",
        "X-Title": "SPX6900 Rainbow Chart",
      },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        max_tokens: 200,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt(signal) },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, text: "", status: res.status, reason: `${res.status}${body ? ": " + body.slice(0, 120) : ""}` };
    }
    const json = await res.json();
    const raw = json?.choices?.[0]?.message?.content;
    const text = String(raw || "").replace(/^["'\s]+|["'\s]+$/g, "").trim();
    const v = validateDraft(text);
    return { ok: v.ok, text: v.ok ? text : "", status: res.status, reason: v.ok ? "" : `invalid draft (${v.reason})` };
  } catch (e) {
    return { ok: false, text: "", status: 0, reason: e.message || "fetch failed" };
  }
}

// Draft engaging copy for one signal, trying the free-model fallback chain in
// order and returning the first VALID draft. Returns
//   { text, model, mock, ok, reason, tried }
// Never throws — no key/fetch degrades to a mock; all-models-failed returns ok:false
// with the aggregated reasons (the template stays the fallback downstream).
// opts.fetchImpl lets tests inject a fake fetch (offline).
export async function draftCopy(signal, opts = {}) {
  const apiKey = opts.apiKey ?? process.env.OPENROUTER_API_KEY;
  const doFetch = opts.fetchImpl ?? (typeof fetch === "function" ? fetch : null);
  if (!signal) return { text: "", model: "none", mock: true, ok: false, reason: "no signal", tried: [] };
  if (!apiKey || !doFetch) return mockDraft(signal);

  const models = resolveModels(opts);
  const tried = [];
  for (const model of models) {
    const r = await callModel(model, signal, apiKey, doFetch);
    tried.push(`${model}: ${r.ok ? "ok" : r.reason}`);
    if (r.ok) return { text: r.text, model, mock: false, ok: true, reason: "", tried };
    // A bad key/quota is the same for every model — stop early, don't hammer the chain.
    if (r.status === 401 || r.status === 403) break;
  }
  return { text: "", model: models[0], mock: false, ok: false, reason: `all ${tried.length} model(s) failed — ${tried.join(" | ")}`, tried };
}
