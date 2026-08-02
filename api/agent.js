// Control-panel LLM "agent" — a chat endpoint the owner consults from /control to
// see what's notable today and decide which card to post. The browser only sends a
// password (checked against CONTROL_PASSWORD) plus the conversation; ALL context is
// assembled here server-side from the SAME pipeline the bot uses (computeStats +
// the deterministic rotation pick + the full card catalog + the "⚡ Notable today"
// signals + queue/post state) and fed to OpenRouter with the owner's question.
//
// The agent reasons over REAL numbers only — it can't fetch or invent figures, the
// same honesty guardrail as the rest of the project. When it recommends a specific
// card it appends machine-readable action tags:
//   [[card:<id>]]                 → the panel shows Queue / Post-now buttons for it
//   [[draft]]line1\nline2\nline3[[/draft]]  → an editable tweet draft to load
// Those tags are parsed out here and returned structured; the visible answer has
// them stripped so the chat reads clean.
//
// Required Vercel env vars:
//   CONTROL_PASSWORD    the control-page password (same as api/control.js)
//   OPENROUTER_API_KEY  the free-model chain key (same as llm-copy.mjs)
import { DEFAULT_RAW } from "../src/data.js";
import { fetchLivePrice, fetchMajors, fetchHistory, computeStats } from "../scripts/bot/stats.mjs";
import { buildPost, buildAll, isCopyMarker, bindCopy } from "../scripts/bot/posts.mjs";
import { topAngles } from "../scripts/bot/quant.mjs";
import { chat, draftCopy } from "../scripts/bot/llm-copy.mjs";

const OWNER = "cianfru", REPO = "SPX6900_rainbow_chart", BRANCH = "main";
// Read a committed file with GH_PAT (so it still works once the repo is private) and fall back to
// public raw while the repo is public / no token is set. Returns the fetch Response; caller checks ok.
async function ghGet(path) {
  const pat = process.env.GH_PAT;
  const tries = [];
  if (pat) tries.push([`https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`,
    { Accept: "application/vnd.github.raw", Authorization: "Bearer " + pat, "User-Agent": "spx6900-agent" }]);
  tries.push([`https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${path}?t=${Math.floor(Date.now() / 60000)}`, {}]);
  let last = null;
  for (const [url, headers] of tries) {
    try { const r = await fetch(url, { headers, cache: "no-store" }); if (r.ok) return r; last = r; } catch { /* next */ }
  }
  return last;
}

// Best-effort read of a committed public JSON file (signals / queue / state). These
// are deploy-ignored runtime files served via raw, never bundled — so we fetch them
// live. Any miss degrades to the fallback rather than failing the whole request.
async function rawJson(name, fallback = null) {
  try {
    const r = await ghGet(`public/${name}`);
    if (!r || !r.ok) return fallback;
    return await r.json();
  } catch { return fallback; }
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let raw = "";
  for await (const c of req) raw += c;
  try { return JSON.parse(raw || "{}"); } catch { return {}; }
}

// The FULL resolved copy of a card = exactly "what this card says today", REAL numbers
// and all — so the agent grounds its "why" in the card's own figures instead of inventing
// them (only the first line isn't enough: the numbers usually live on line 2/3). Resolve
// any ct`` copy marker, drop the NFA line, collapse blanks, and cap the length.
function cardSays(post) {
  const text = isCopyMarker(post.text) ? bindCopy(post.id, post.text) : String(post.text || "");
  return text
    .replace(/\n?(?:🌈 )?NFA\s*$/u, "")
    .split("\n").map(l => l.trim()).filter(Boolean).join(" · ")
    .slice(0, 300);
}

// Hyperliquid funding APR from an hourly rate, matching the longshort card.
const toAPR = hourly => hourly * 24 * 365 * 100;
const median = xs => { const a = [...xs].sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : null; };

// Distil the FULL computeStats logic output — every number the cards are built from —
// into a compact, array-free facts snapshot the agent reasons over. This IS "the whole
// logic", not per-card lines: valuation, performance, on-chain, positioning, BTC/majors.
function assembleContext(stats, todayPick, catalog, signals, queue, postState, onchain) {
  const s = stats;
  const price = s.price;
  const dp = price < 1 ? 4 : 2;
  const r = (n, d = 2) => (n == null || Number.isNaN(n) ? null : Number(n.toFixed(d)));
  const pct = (n, d = 1) => (n == null ? null : r(n * 100, d) + "%");
  const be = s.supply?.breakEven ?? null;

  // Hyperliquid positioning: latest funding vs its neutral (median) baseline + OI.
  let positioning = null;
  const ls = Array.isArray(s.longshort) ? s.longshort.filter(x => x?.hlFunding != null) : [];
  if (ls.length >= 8) {
    const aprs = ls.map(x => toAPR(x.hlFunding));
    const neutral = median(aprs), now = aprs.at(-1);
    positioning = {
      fundingAPRnow: r(now, 1) + "%", neutralBaselineAPR: r(neutral, 1) + "%",
      deviationFromNeutral: r(now - neutral, 1) + "pp",
      lean: now - neutral > 1 ? "crowd leaning long" : now - neutral < -1 ? "crowd leaning short" : "roughly neutral",
      openInterestUSD: s.longshort.at(-1)?.hlOI != null ? Math.round(s.longshort.at(-1).hlOI) : null,
      daysOfData: ls.length,
    };
  }

  const facts = {
    date: s.date, price: r(price, dp),
    ageDays: s.day, launchDate: s.firstDate, launchPrice: r(s.firstPrice, 6),
    valuation: {
      band: s.band?.l ?? null, riskScore: r(s.risk, 3),           // 0–1 rainbow risk
      vsFairValue: pct(s.vsCenter), fairValue: r(s.center, dp),   // power-law center
      nextBand: s.nextUp?.l ?? null, nextBandPrice: s.nextUpPrice != null ? r(s.nextUpPrice, dp) : null,
      cheaperOrEqualShareOfHistory: pct(s.cheaperFrac),          // how much of its life was this cheap or cheaper
    },
    performance: {
      allTimeReturnMultiple: s.allTimeReturn != null ? r(s.allTimeReturn + 1, 1) + "×" : null,
      drawdownFromATH: pct(s.drawdown), ath: r(s.ath, dp), athDate: s.athDate,
      deepestDrawdownEver: pct(s.maxDrawdown),
      hindsightStrategyEdgeVsHodl: s.edge != null ? r(s.edge, 2) + "×" : null,
      lastFireSaleRally: s.lastFireSale ? {
        from: s.lastFireSale.date, lowPrice: r(s.lastFireSale.low, dp),
        sinceLowMultiple: r(s.lastFireSale.sinceGain + 1, 2) + "×", peakMultiple: r(s.lastFireSale.peakGain + 1, 2) + "×",
      } : null,
    },
    onChain: s.supply ? {
      holders: s.supply.holders, holdersSnapshotDate: s.supply.snapDate,
      diamondShareOfSupply: pct(s.supply.diamondShare),
      diamondShareOfClassified: s.supply.classified ? pct(s.supply.diamondTokens / s.supply.classified) : null,
      breakEven: be != null ? r(be, dp) : null,                  // crowd avg cost basis (realized price)
      mvrv: (be && price) ? r(price / be, 2) : null,             // price ÷ cost basis
      avgHolderPnL: s.supply.avgHolderPnl != null ? pct(s.supply.avgHolderPnl) : null,
      giniConcentration: r(s.supply.gini, 3),
    } : null,
    positioning,
    sentiment: { fearGreed: s.fng ?? null, sp500close: s.sp ?? null },
    vsBitcoin: s.btc ? {
      priceInSats: r(s.btc.sats, 2), btcPrice: r(s.btc.btcNow, 0),
      relStrength90d: r(s.btc.rel90, 2), relStrength365d: r(s.btc.rel365, 2), // >1 = SPX outperforming BTC
    } : null,
    vsMajors: (s.majors || []).map(m => ({ coin: m.name, relStrength365d: r(m.rel365, 2), spxPriceAtItsMarketCap: r(m.spxAtCap, 2) })),
    memeTargets: (s.targets || []).map(t => ({ target: t.label, multipleFromHere: r(t.mult, 1) + "×" })),
  };

  const notable = (signals?.signals || signals || []).slice(0, 3).map(x => ({
    title: x.title, detail: x.detail, framing: x.framing, note: x.note, card: x.card,
    llmDraft: x.llmDraft?.text || null,
  }));
  return {
    today: facts,
    // The "Quant": ranked candidate ANGLES pre-computed from the full stat set — each a
    // READ (often a cross-metric divergence) mapped to the card that expresses it,
    // sorted by how notable/interesting. This is the agent's starting point.
    quantAngles: topAngles(s, 6, { recent: postState?.recent || [], onchain: Array.isArray(onchain) ? onchain : [] }),
    rotationPickForToday: { id: todayPick.id, says: cardSays(todayPick) },
    notableToday: notable,
    queuedCard: queue?.id || null,
    lastPosted: postState ? { date: postState.lastPostedDate, id: postState.lastId } : null,
    cardCatalog: catalog, // [{ id, says }] — every card buildable today, id + its full live copy (the exact numbers each would post)
  };
}

const SYSTEM = `You are the QUANT for the SPX6900 rainbow-chart X (Twitter) account, chatting with the account owner in his private control panel. Your job: crunch the day's numbers and surface the single most interesting HONEST angle to post — then reason it out WITH him and refine it as he pushes back.

The CONTEXT gives you REAL, already-computed numbers — the FULL analysis engine's output. Two parts to lean on:
1. today.* — the raw grouped stats: valuation (band, risk, vs-fair-value, cheapness pctl), performance (all-time ×, drawdown, deepest-ever, last Fire-Sale rally), onChain (holders, diamond share of supply AND classified, break-even/realized price, MVRV, avg holder PnL, gini), positioning (Hyperliquid funding vs neutral), sentiment (Fear & Greed, S&P), vsBitcoin, vsMajors, memeTargets.
2. quantAngles — a RANKED shortlist of candidate reads already computed for you across the WHOLE dataset (valuation, on-chain cost-basis & holder trends, positioning, drawdown, momentum, vs-Bitcoin/peers, S&P flex, 20-week heat, BTC-cycle, targets), each with {read, why, card, framing, guardrail, score}. Pre-scored so DIVERGENCES and cross-metric/trend reads outrank generic single-metric restatements. Higher score = more notable. An angle flagged firedRecently had its card posted in the last several days — it's already de-ranked; prefer a fresher one so the feed doesn't repeat.

The quantAngles are your SHORTLIST, not a cage: you also have the full cardCatalog (dozens of cards with live "says" copy). Lead with the strongest angle, but if a catalog card fits today's story better, use it — just ground it in real numbers from the context.

How to answer:
- DEFAULT to the TOP quantAngle unless the owner steers elsewhere or you can justify a better one from today.*. Lead with its READ, in the account's honest voice — a cross-metric divergence beats restating the valuation band. Do NOT default to "price is X% below trend / BUY band" when a richer angle is available; that's the lazy answer.
- Name the angle's mapped card as your recommendation, tie it to the real number, and obey the angle's guardrail (e.g. "describe the divergence, not a bottom call").
- Also given: the "Notable today" signals, the deterministic rotation pick, and the full card catalog (each card's id + its live "says" copy). Ground every claim in this context — quantAngles numbers ARE from the context, so you may use them.

Hard rules:
- OUTPUT ONLY YOUR FINAL ANSWER for the owner to read. NEVER show your reasoning, planning, step-by-step deliberation, or meta-commentary about these instructions. No "we need to…", no thinking out loud. Just the answer.
- Answer in 2–4 tight sentences. The owner is an expert; skip preamble. No essays.
- Use ONLY numbers that appear in the CONTEXT (the stats, a signal, or a card's own "says" text). NEVER invent, compute, extrapolate, or re-round a figure that isn't given — no made-up ages, dates, cycle percentages, multiples, or prices. Honesty is the account's whole moat: a fabricated number is a firing offence. If you don't have a number for a point, make the point qualitatively or don't make it.
- Describe a card ONLY from its "says" text. Do not infer what a card shows from its id — e.g. don't assume what "btcage" plots; read its says line. If unsure what a card conveys, pick a different one whose says text is clear.
- When you recommend a card, name it by its catalog id and give ONE sentence of why today, tied to a real number from its "says" text, the stats, or a Notable-today signal.
- If nothing is notable, recommend the day's rotation pick (rotationPickForToday) — that's what auto-posts anyway — UNLESS it's a promo (e.g. kraken) and the owner wants analysis, in which case suggest the strongest evergreen value card that fits today's price (the deep Fire-Sale/discount cards when price is low).

Recommending a card — if (and only if) you land on a clear single pick, append action tags at the very end, each on its own line:
[[card:<id>]]
Optionally also hand over ready copy as a 3-line draft:
[[draft]]
line 1 — the hook (lead with the number or current state)
line 2 — one tight description sentence
line 3 — a short takeaway
[[/draft]]
Draft guidance (soft — the owner edits it): ~3 short lines, under ~230 chars, calm not hype, no hashtags/footer (added automatically), include a number when the card is data-driven, and never attach 's to an @handle. If a card has no natural number (e.g. a promo), just skip the draft — recommend the card without one.
For open-ended "what do you see" questions with no clear decision, skip the tags entirely. The <id> MUST be one from the catalog — never invent an id.`;

// Parse the agent's action tags out of the reply. Returns { answer, card, draft }
// with the tags stripped from the visible answer.
function parseAction(text, validIds) {
  let answer = String(text || "");
  // Reasoning models sometimes leak their scratchpad inline — strip <think>/<reasoning>
  // blocks. If the model emitted an unclosed opener, keep only what follows it.
  answer = answer.replace(/<(think|thinking|reasoning|analysis)>[\s\S]*?<\/\1>/gi, "");
  const openTag = answer.match(/<\/(think|thinking|reasoning|analysis)>/i);
  if (openTag) answer = answer.slice(answer.lastIndexOf(openTag[0]) + openTag[0].length);
  let card = null, draft = null;
  // Draft: prefer a closed block, but tolerate an UNCLOSED [[draft]] (truncated reply)
  // by taking everything after it. Then strip the whole matched span from the answer.
  let draftMatch = answer.match(/\[\[draft\]\]([\s\S]*?)\[\[\/draft\]\]/i);
  if (!draftMatch) draftMatch = answer.match(/\[\[draft\]\]([\s\S]*)$/i);
  if (draftMatch) {
    const body = draftMatch[1].split("\n").map(l => l.trim()).filter(Boolean).slice(0, 3).join("\n");
    draft = body || null;
    answer = answer.replace(draftMatch[0], "");
  }
  const cardMatch = answer.match(/\[\[card:\s*([a-z0-9_-]+)\s*\]\]/i);
  if (cardMatch) {
    const id = cardMatch[1];
    if (!validIds || validIds.includes(id)) card = id;
    answer = answer.replace(cardMatch[0], "");
  }
  // Safety net: drop any stray/leftover tag literals so they never render in the bubble.
  answer = answer.replace(/\[\[\/?(?:card|draft)[^\]]*\]\]/gi, "");
  return { answer: answer.trim(), card, draft };
}

const NEEDS_COINS = new Set(["btc", "majors", "majorcaps", "ytd"]);

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  if (!process.env.CONTROL_PASSWORD) { res.status(500).json({ error: "Server not configured: set CONTROL_PASSWORD." }); return; }
  const body = await readBody(req);
  if (body.password !== process.env.CONTROL_PASSWORD) { res.status(401).json({ error: "Wrong password." }); return; }

  // ON-DEMAND "Notable today" draft: the daily auto-draft was removed to save credits, so
  // the owner clicks ✨ Draft on a signal when he wants one. Feeds ONLY the signal's honest
  // facts (title/detail/framing/note) to the same shadow copywriter. No key → labelled mock.
  if (body.draftSignal && typeof body.draftSignal === "object") {
    try {
      const d = await draftCopy(body.draftSignal);
      res.setHeader("Cache-Control", "no-store");
      res.status(200).json({ llmDraft: d });
    } catch (e) {
      res.status(200).json({ llmDraft: { text: "", model: "none", mock: false, ok: false, reason: String(e?.message || e) } });
    }
    return;
  }

  if (!process.env.OPENROUTER_API_KEY) { res.status(200).json({ error: "No OPENROUTER_API_KEY set — the agent needs it to answer.", answer: "" }); return; }

  // Accept either a single {message} or a running {messages:[{role,content}]} history.
  const history = Array.isArray(body.messages) ? body.messages.filter(m => m && (m.role === "user" || m.role === "assistant") && m.content).map(m => ({ role: m.role, content: String(m.content).slice(0, 4000) })) : [];
  const latest = String(body.message || "").slice(0, 4000);
  if (!history.length && !latest) { res.status(400).json({ error: "empty message" }); return; }

  try {
    const price = (await fetchLivePrice())?.price ?? DEFAULT_RAW.at(-1).price;
    const history_ = await fetchHistory();
    const opts = { history: history_ };
    // A few cards need the major-coin series; fetch it so they appear in the catalog.
    try { opts.coins = await fetchMajors(); } catch { /* catalog just omits those cards */ }
    const stats = computeStats(price, undefined, opts);

    const todayPick = buildPost(stats);
    const catalog = buildAll(stats).map(p => ({ id: p.id, says: cardSays(p) }));
    const validIds = catalog.map(c => c.id);

    const [signals, queue, postState, onchain] = await Promise.all([
      rawJson("signals.json", { signals: [] }),
      rawJson("next-post.json", { id: null }),
      rawJson("post-state.json", {}),
      rawJson("history.json", []),   // on-chain daily history → the Quant's trend reads
    ]);

    const context = assembleContext(stats, todayPick, catalog, signals, queue, postState, onchain);
    const messages = [
      { role: "system", content: SYSTEM },
      { role: "system", content: "CONTEXT (today's real numbers):\n" + JSON.stringify(context, null, 1) },
      ...history,
    ];
    if (latest) messages.push({ role: "user", content: latest });

    // Generous budget: reasoning models still spend hidden tokens even with
    // effort:low+exclude, so leave ample room for the visible answer + draft.
    const out = await chat(messages, { maxTokens: 1600, temperature: 0.4 });
    if (!out.ok) { res.status(200).json({ error: out.reason || "agent unavailable", answer: "", model: out.model }); return; }

    const { answer, card, draft } = parseAction(out.text, validIds);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ answer, card, draft, model: out.model, rotationPick: todayPick.id });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}
