# SPX6900 Rainbow Chart — project notes

## Anomaly detector — "⚡ Notable today" (built 2026-07-03)
- `scripts/bot/signals.mjs` `detectSignals(history)` runs at the end of the snapshot
  cron (`scripts/snapshot.mjs`) and writes `public/signals.json` (committed by
  snapshot.yml, deploy-ignored, read by the control panel via raw). Scans the daily
  on-chain snapshots for notable day-over-day changes — **break-even/profit cross**
  (price vs crowd cost basis), **holder-count surge** (>2.2σ vs trailing 30d),
  **diamond-share jump**, **F&G extremes** — top 3 by severity. COMPLEMENTARY to
  band-watch (price/band) and milestone-watch (meme prices), which own those lanes.
- **HUMAN-IN-THE-LOOP by design — nothing auto-posts.** It surfaces candidates + an
  honest suggested **framing** + a **guardrail note** in the control panel's
  "⚡ Notable today" strip; owner reviews and one-click **queues** the mapped card,
  or ignores. Rationale (owner-aligned): anomaly DETECTION is easy, INTERPRETATION
  is human — auto-posting risks misreading a spike, eroding the honesty moat.
- **⭐ Find the interesting TRUE angle — don't debunk (owner, 2026-07-03).** The
  detector's job is to surface events worth posting, NOT to fact-check them into a
  dry logbook. Every signal **LEADS with the honest hook** (`framing`) and uses the
  guardrail `note` only to fence the ONE thing you can't claim. The diamond jump is
  the canonical case: the hook is real and good — *coins reach the diamond tier only
  by being HELD through everything, so an 8M jump = a cohort held through the
  drawdown and matured into the strongest tier, conviction deepening* — POST THAT;
  the narrow guardrail is just "word it as HELD, not BOUGHT." (Holder-COUNT growth →
  safe to call accumulation outright — genuinely new wallets.) Honest AND interesting,
  both required. Only shows TODAY's signals.
- To add a signal type: add a block in signals.mjs returning
  `{type, severity, emoji, title, detail, framing, note, card}` (card = the post id
  the Queue button fires). Keep thresholds conservative — noise/false-positives cost
  credibility + posting fatigue.
- **⭐ SHADOW-MODE LLM COPYWRITER — BUILT 2026-07-04 (owner greenlit; OpenRouter).**
  Direction: move the account from purely descriptive rotation cards toward
  event-driven "interesting TRUE angle" posts — the diamond-hands tweet (50+ likes
  in <10h vs ~25 avg) is the proof point. The DETECTION half is the anomaly detector
  above; this adds an LLM to write the ENGAGING COPY from the detector's real numbers.
  - `scripts/bot/llm-copy.mjs` `draftCopy(signal, opts)` — feeds ONLY the detector's
    already-computed honest facts (title/detail/framing/note) to OpenRouter and returns
    house-style 3-line copy. **The LLM does LANGUAGE ONLY — never fetches or invents
    numbers** (honest numbers are the moat). Output is validated (`validateDraft`):
    ≤235 xLen, blocklist (hype/advice words), must contain a number, ~3 lines, no
    possessive-on-@handle. Fails soft to nothing rather than surfacing a bad draft.
  - **SHADOW MODE — nothing auto-posts.** The snapshot cron attaches an `llmDraft` to
    each signal in `signals.json`; the control panel shows it NEXT TO the honest framing
    (airy, via `footerize`) with a 📋 Copy button. Owner reads both, copies the LLM
    draft if it lands better, or queues the template card. Flip to live only once it
    visibly beats the templates.
  - **No key → labelled MOCK draft** so the control-panel UX renders before a real key
    is wired (owner asked to see the UX first). Wire it by adding repo secret
    `OPENROUTER_API_KEY` — already referenced in snapshot.yml, so the next snapshot picks
    it up automatically. Free/1-post-a-day fits free tiers.
  - **FREE-MODEL CHAIN → RUNTIME DISCOVERY (owner chose "stay free"; churn fix 2026-07-06).**
    OpenRouter's `:free` endpoints (a) throw pooled 429s per provider AND (b) CHURN — on
    2026-07-06 the whole hardcoded chain died at once: `gemini-2.0-flash-exp:free` → 404
    (deleted), `qwen-2.5-72b:free` → 404 (moved to paid-only), `llama-3.3-70b:free` → 429.
    A static list rots. **Fix:** `resolveModelsAsync` now DISCOVERS the live free models at
    runtime from OpenRouter's public `/models` endpoint (no key needed), filters to text→text
    chat models, orders by context length, and tries them first — with `FREE_FALLBACKS`
    (nvidia-nemotron-3-super-120b **owner-confirmed live** · deepseek-v3 · llama-3.3-70b ·
    gemma-3-27b) as seed/fallback anchors after.
    Cached 10 min per warm lambda; degrades to the seeds if `/models` is unreachable. Both
    `draftCopy` (shadow copy) and `chat` (control agent) use it. A 401/403 still stops early
    (bad key). Pin to skip discovery: repo/Vercel var `OPENROUTER_MODEL` (primary) or
    `OPENROUTER_MODELS` (whole comma-separated chain). **NOTE: the control agent runs on
    VERCEL, so `OPENROUTER_API_KEY` must be set in VERCEL env (not just the GH Actions secret
    the snapshot cron uses) — they're separate.**
  - **⭐ SWITCHED TO A CHEAP PAID PRIMARY — free tier gave up (owner opted in 2026-07-08).**
    "Stay free" proved too unreliable for a once-a-day draft. On 2026-07-08 the ENTIRE
    8-model chain failed at once: 2 dead (deepseek-v3-0324 & gemma-3-27b → 404/paid-only),
    2 rate-limited (llama-3.3 & qwen3-coder → 429), **2 reasoning-leak** (nemotron super &
    ultra dumped their `<think>` scratchpad inline → "too long 802/714 > 235"), 2 empty.
    Fixes shipped together: (1) `callModel` (shadow `draftCopy`) now sends
    `reasoning:{effort:"low",exclude:true}` + `stripReasoning()` (inline `<think>` strip,
    mirrors `api/agent.js`) + `max_tokens` 200→500 — it was MISSING the reasoning guard that
    `chat()` already had, which is why Nemotron leaked. (2) **`PAID_PRIMARY` = `openai/gpt-4o-mini`
    now LEADS the chain** (`resolveModels`), free seeds (nemotron-super, llama-3.3) + discovery
    stay as fallback. Non-reasoning, ~$0.15/$0.60 per M → a ~500-tok draft is a fraction of a
    cent; 1 draft/day. Override via `OPENROUTER_MODEL` (that wins over the code default). The
    account already has OpenRouter credits. Dead seeds deepseek-v3-0324 & gemma-3-27b DROPPED.
  - **⭐ ONLY THE TOP SIGNAL GETS AN LLM DRAFT (owner, 2026-07-08).** `snapshot.mjs` used to
    `draftCopy` all 3 "Notable today" signals → 3 calls/day, which is what triggered the 429
    cascade (1 drafted, 2 failed). Now it drafts **`sig.signals[0]` only** — the one actually
    up for posting — and the other signals show just their honest template framing in the
    panel. Cuts LLM calls 3×→1× (cost + rate-limit headroom).
  - Offline-tested (`test/llm-copy.test.mjs`, injectable fetch). `signals.json` stays
    deploy-ignored, so drafts never trigger a Vercel deploy.
- **⭐ CONTROL-PANEL LLM "AGENT" ("ask the agent") — BUILT 2026-07-05 (owner request).**
  A **chat section in the control panel** (`/control` daily view), connected to OpenRouter,
  where the owner asks an "agent" directly — *"what's notable today?"*, *"which card should
  I fire today?"*, *"give me a draft for the best card"* — instead of round-tripping through
  Claude Code. It reasons about the day's post choice from the **current state**.
  - **`api/agent.js`** — password-gated (`CONTROL_PASSWORD`) POST endpoint. A browser LLM
    can't read the repo, so this ASSEMBLES the context server-side and feeds it to OpenRouter
    with the owner's question. Context gathered (the SAME numbers the bot uses): today's
    `computeStats` facts (price/band/risk/vs-fair-value/drawdown/F&G/break-even/MVRV/holders/
    diamond-share), the deterministic **rotation pick** (`buildPost(stats)`), the **full card
    catalog** (`buildAll(stats)` → `{id, hero}` per card — id + its live hero line), the
    **"Notable today" signals** (`signals.json`), and queue/last-posted state — all via raw
    for the deploy-ignored runtime files. Answers are grounded in REAL numbers only (the
    honesty guardrail).
  - **Actionable recommendations:** the system prompt tells the agent to append machine tags
    when it lands on a card — `[[card:<id>]]` and optionally `[[draft]]…3 lines…[[/draft]]`.
    `parseAction` strips them from the visible answer and returns `{answer, card, draft,
    model, rotationPick}`. The chat UI then renders a recommendation block with an **editable
    draft textarea** + **Queue / Post-now / Save-as-copy / Copy** buttons wired to the
    existing control actions — so the decision goes straight to the queue. (Save-as-copy only
    shows for `EDITABLE` ct-cards, since plain overrides only apply to those.)
  - **Reuses existing infra:** `chat()` in `llm-copy.mjs` runs the SAME `OPENROUTER_API_KEY`
    + free-model fallback chain; `buildAll()`/`allIds()` added to `posts.mjs` for the one-pass
    catalog; `vercel.json` bundles `scripts/bot/**` + `history.json` into the function (mirrors
    og.js/recap.js). Multi-turn: the UI sends back a capped (~12-msg) history.
  - **Not streaming** (kept simple — one request/response with a "…thinking" placeholder).
    Future: expose "tools" (call rotation/stats live) for a truer agent; add streaming if the
    single-shot latency ever grates.

## Backlog / decisions
- **⭐ BUILD THE FOUNDATION — collect data now, even at 3yr (owner, 2026-07-05).** Many
  ITC charts encode 15-year / multi-cycle BTC insights that SPX is TOO YOUNG to show yet
  (quantile fan, Cowen corridor, cross-cycle diminishing returns). Owner's directive:
  don't skip them — **build the DATA-COLLECTION foundation now** so they mature over time
  (same model as the MVRV / holder-growth data-gated charts). For each: bank the raw
  inputs daily/weekly (snapshot cron, price-history builder, a futures-L/S banker) and
  put up chart scaffolding that FILLS IN as history accumulates. The ask is infrastructure
  + patience, not forcing a premature signal onto thin data.
  - **Futures Long/Short foundation — data source (2026-07-05).** `scripts/build-longshort.mjs`
    + `longshort.yml` (daily) bank positioning into `public/longshort.json`. **Binance's
    L/S endpoints geo-block CI (HTTP 451 to US GitHub runners)** — not a symbol issue
    (SPX's Binance perp IS `SPXUSDT`, TradingView `SPXUSDT.P`), Binance just refuses US
    IPs. So we source from venues reachable from CI: **Bybit** (global long/short account
    ratio = the ITC metric, seeds ~30d) + **Hyperliquid** (on-chain funding + OI, banked
    daily). To use Binance's actual numbers later: Coinglass (free key, US-ok) or a
    non-US Vercel-cron committing via GH_PAT. Override symbols via repo vars
    `BYBIT_LS_SYMBOL` / `HL_COIN`.
    - **RESULT (2026-07-05 dispatches): CEX all geo-block CI, Hyperliquid is it.**
      Binance 451, Bybit `api.bybit.com` 403 AND the `api.bytick.com` mirror also
      failed — SPXUSDT is correct, it's purely a US-runner IP block. **Hyperliquid
      works** (coin `SPX`): the banker now BACKFILLS full daily funding-rate history
      (`fundingHistory`, hourly → daily mean) + banks today's OI (only current OI is
      exposed, so OI accumulates). So the positioning chart is Hyperliquid on-chain
      funding + OI — unmanipulable, with real history from run one. CEX L/S stays a
      soft-try (harmless 403s) in case it unblocks; Coinglass is the fallback if
      Binance's crowd L/S is ever wanted.
    - **Chart + card BUILT (2026-07-05):** site `longshort` (On-Chain group, drag-zoom)
      + rotation card (`type:"longshort"`, LOOK "dual", data-gated ≥8 days). **Funding
      is NORMALISED to its neutral baseline** (the median APR ≈ HL's structural ~+10%):
      owner noted that pivoting on 0 made "just neutral" read as "crowd long," so bars
      show deviation FROM neutral (green above / red below), while the right axis still
      reads absolute APR. Baseline computed over full history so it's stable when zoomed.
- **❌ "Diminishing returns" — I GOT IT WRONG, reverted (owner correction, 2026-07-05).**
  Diminishing returns = each **cycle's RALLY (bottom→top) is less steep / a smaller
  multiple than the previous cycle** (cross-cycle). I mistakenly drew a trendline through
  the 365D-ROI *peaks within one cycle* — that's just the last bull→bear ROI rolloff, NOT
  diminishing returns. **SPX is too young** (≈2 cycles) to show real cross-cycle
  diminishing returns. Removed the ROI-card trendline. The honest home for this is the
  **rally chart** (cycle bottom→top multiples, +16240% → +415% → +81%), which already
  shows the maturation as far as the data allows — it just needs more cycles to bank.
- **Dense historical price data — SOLVED IN STAGES (2026-07-05 → 2026-07-10).** Original
  finding: coinbase gave 300 pts (2025-09→now), GeckoTerminal FREE only ~6mo depth, bybit
  nothing → `price-history.json` densified 2025-09→today only, launch era stayed boxy weekly.
  Two free sources added since (`scripts/build-price-history.mjs`):
  - **✅ CoinGecko COIN API (`market_chart`, free) — LIVE 2026-07-10.** Distinct from
    GeckoTerminal (DEX product). Free/demo tier caps history to the last **365 days** — which
    still reaches ~a year back and covers the true ATH region. Owner ran it: price-history.json
    now dense **2025-07-11 → today** (365 pts); Jul '25 top peaks **$2.15 daily on 2025-07-28**.
    Merged as lowest-priority gap-filler. Pro key (`COINGECKO_PRO_KEY`) auto-upgrades to
    `days=max` (full history) — the cheapest full-history tier is **Analyst ~$129/mo**; a
    ONE-MONTH backfill (subscribe, run once, cancel) = ~$129 one-time, then free keeps it fresh.
  - **🔲 Uniswap subgraph (The Graph) — WIRED, NEEDS A KEY TO ACTIVATE (2026-07-10).** The
    promising FREE route to the FULL launch-era daily history (CoinGecko free can't pass 365d).
    `tokenDayDatas` gives one priceUSD/day back to Aug '23, on-chain lineage. **PENDING OWNER
    ACTION (on mobile, do later):** (1) create a free Graph Studio key at thegraph.com/studio;
    (2) add repo secret `GRAPH_API_KEY`; (3) run the "Build price history" workflow; (4) CHECK
    the `uniswap-subgraph:` log line — if `N pts (2023-08…→)` it worked (full history dense, no
    Pro needed); if `0 pts`/error the pool is v3 → set repo var `GRAPH_SUBGRAPH_ID` to the v3 id
    `5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV` and re-run (`GRAPH_TOKEN` overrides the
    contract). Defaults to Uniswap v2 mainnet id `A3Np3RQbaBA6oKJgiwDJeo5T3zrYfGHPWFYayMwtNDum`.
    If it flows, we can eventually re-bundle DEFAULT_RAW from real daily data + retire the ATH
    constant — but that touches the FROZEN model fit, so do it deliberately as a separate step.
- **⭐ TRUE ATH = $2.28 intraday (2025-07-28), NOT the bundle's $1.82 (owner flagged 2026-07-10).**
  DEFAULT_RAW is thinned to ~weekly, so its peak SAMPLE ($1.82) missed the intraday spike. Fixed
  via `ATH = {price:2.28, date:"2025-07-28"}` in `src/data.js` (intraday high-water mark, kept
  SEPARATE from the close-based line + frozen fit). Folded into `stats.ath`/`athDate` and
  threaded through drawdown (`buildDrawdownSeries`/`buildDrawdownCycles` take an `ath` param and
  floor the running peak from its date — line stays on closes, depth reflects the true high) and
  rally/fire-sale (`withAthFloor` lifts the ATH-date sample so a rally's peak = the real high).
  CoinGecko daily confirmed the peak DAY is 2025-07-28 ($2.15 daily; $2.28 = intraday). Update
  the one constant if a higher high prints.
- **⭐ CARD vs WEBSITE — different audiences, different defaults (owner, 2026-07-03).**
  **Cards are for the general public** → keep them digestible: a tight, cropped, single
  clear read at a glance. **The website is for DIGGING INTO THE DATA** → default to the
  FULL history/dataset with interactive **zoom** to narrow the timeframe. First applied
  to `riskheat` (card = ~18-month crop of the 20W-extension; site page = full history +
  drag-to-zoom, PR #150/#151). Apply the same split to the other interactive charts over
  time: a card may show a tight recent window while its site page shows everything + zoom.
  Don't crop the website to match a card — that's backwards.
- **Holder-tier "diamond" spikes are AGING, not accumulation (verified 2026-07-03).**
  On 2026-07-03 the diamond tier jumped **+8.0M tokens** (60.1%→60.9% of supply) — but
  **gold fell −8.9M**, while total classified supply AND holder count were flat. So a
  cohort **graduated gold→diamond by crossing the holding-age threshold**, NOT new
  buying: HolderScan's tiers are by HOLDING TIME, so fresh buys land in the newest
  (`wood`) tier, and diamond can only grow by coins aging in. Read: a diamond-share
  spike is **mostly mechanical** (supply maturing into the longest-held bucket) — a
  *lagging* confirmation that a cohort held through, mildly positive (stickier float /
  less sell-side overhang) but NOT a leading signal, NOT "diamonds accumulated," and
  ~uncorrelated with the same-day price move. **Do not post a diamond spike as
  accumulation** — it would be inaccurate (honesty is the moat).
- **⭐ TWO diamond numbers — 61% of SUPPLY vs 86% of CLASSIFIED (owner, 2026-07-05).**
  Community confusion (whythatnickname/Robert): the `diamondtrend` card headlines
  diamond as a share of TOTAL 939M supply (~61%), while the `distribution` donut +
  HolderScan headline diamond as a share of CLASSIFIED holders (~86%, which EXCLUDES
  exchanges, LP pools & contracts). Same coins, two denominators — 86% of the real
  holder base = 61% of the whole float; nobody "dropped" 86→61. **Decision (option 2):
  BRIDGE both on the card** — `diamondtrend` now headlines "61% of supply · 86% of
  classified" and its copy states both, so the numbers never read as a contradiction.
  86%-of-classified = `s.supply.diamondTokens / s.supply.classified`; the donut already
  footnotes "86% of classified ≈ 61% of all supply." When posting diamond numbers,
  always say WHICH denominator (or bridge them).
- **❌ "Grade my entry" / "entry report card" — PARKED (owner, 2026-07-02).** Mocked
  three variants (personal entry-vs-bands card, site widget + og share, and a 5-row
  archetype "report card" graded by buy-date band). Owner parked the whole thread:
  not exciting enough to justify the risk — **part of the community already dislikes
  the daily chart posting ("walking on eggs"), so anything cringey could create real
  problems.** Do not revive without a strong pull signal from the audience.
- **⭐ CONTENT PRINCIPLE (owner, 2026-07-02): don't force new formats for the sake
  of novelty.** The bar for NEW content types is high and rising. Prefer **insights
  that EMERGE from accumulating data over time** (the data-gated queue: MVRV line
  ~Jul 23, realized-price line for `rsidots`, 30d holder-growth, 690 milestone,
  Uptober in Sept) over invented engagement mechanics. When in doubt: quality of the
  existing rotation > adding to it.
- **Revisit band-watch daily-suppression — likely too restrictive (flagged 2026-06-24).**
  The anti-flap **hysteresis** (fire once per excursion into a marquee/extreme zone,
  re-arm only on return to a calm band) is the right guard and is NOT over-restrictive —
  a genuine new crossing still fires every time. But the SECOND layer (suppress ANY band
  post if the daily rotation already posted today) can kill the highest-value moment: a
  marquee crossing on a green PUMP day (exactly when engagement peaks — see the Jun 17
  data). Since hysteresis already blocks flapping, daily-suppression is probably redundant
  and costs pump-day reach. **TODO:** relax it — e.g. let a genuine FIRST-excursion marquee
  crossing post even after the daily (esp. bullish BUY / big up-moves), keeping hysteresis
  + cooldown as the flap guards. Tie to the engagement-scheduling idea below. (Owner asked
  to be reminded.)
- **Engagement-tiered, price-aware card scheduling — explore, needs data first (2026-06-24).**
  Idea: tier cards by observed engagement (high ~100 likes / med ~40 / low ~20) and fire
  the high-engagement bullish chart cards on GREEN / up-momentum days to amplify reach
  (pump day = peak attention); alternate lower-tier cards on flat/down days. **Caveats
  before building:**
  - **Confound — day vs card.** The ~100-like cards so far almost certainly coincided with
    the Jun 16–17 pump (everything got reach that day), so we can't yet tell if engagement
    came from the CARD or the high-attention DAY. Need the same card type on a FLAT day to
    attribute it — that's the data to gather.
  - **Measurement constraint.** Free X API is effectively write-only — the bot CAN'T read
    its own per-tweet likes/impressions. So tiering is a MANUAL owner-maintained map
    (`card id → tier`), a human-in-the-loop config, not an auto-optimizer (unless paid API).
  - **Brand risk.** Always firing "extremely bullish" cards on green days reads as buy-the-
    top hype — the opposite of the honest-analysis trust that retained followers through the
    ~28% drawdown. Honesty is the moat; lean gentle on hype-timing.
  - **Buildable mechanism:** a price-momentum check (today green / up X% over 24h) biases the
    daily rotation toward a manually-tagged high-tier card that day; normal weighted rotation
    otherwise. One post/day cadence unchanged.
  - **Measurement solved via Grok (2026-06-24):** Grok (inside X) has the read access the free
    API lacks, so it can classify posts by likes/views — it's the metrics source + classifier.
    Plan: wait ~2 weeks for more data, then have Grok tier the posts and overlay vs price.
  - **Early Grok read (Jun 15–24, directional only — n thin, one pump cycle, AND Grok's
    retrieval is unreliable: a 2nd pass surfaced top cards the 1st had MISSED, incl. the #1).**
    Authoritative roster lives in git (post-state.json / band-state.json history), not Grok's
    scrape. Engine is visual CHART cards with a big-number narrative; text/replies = low.
    Fuller top-7 by likes: targets $1/$6.90/$69 (93, Jun 16), 517×-since-launch (83, Jun 15),
    BUY! band (79, Jun 18), holder-underwater (60, Jun 16), Fire Sale (51, Jun 24), BUY! (50,
    Jun 16), diamond-hands (48, Jun 23). **5 of 7 on GREEN/up days; Jun 16 (+13%) alone made 3,
    incl. the aspirational targets card** — so the owner's "bullish/aspirational cards amplify on
    green up-days" instinct DOES hold; the dip-signal band cards (BUY!/Fire Sale) carry the red
    days. Card quality is the floor, day-color amplifies. (Corrects an earlier note that over-
    weighted red days — that was Grok's incomplete first pull omitting the green-day winners.)
  - **FULL CSV analysis supersedes the above (2026-06-24, X analytics export Jun 7–24, ~50
    posts incl. all metrics — the authoritative dataset).** Findings:
    1. **Likes are a REACH game**: likes↔impressions corr = **0.94**; every chart card converts
       at ~4–5% like-rate, so the 25× like spread is a 25× *reach* spread, not card quality.
    2. **Reach is NOT green-day driven**: impressions vs daily price return = **0.01**. Reach
       tracks follower count + the post-pump attention regime + occasional algorithm pickup
       (targets/alltime hit 2.7–3.5K impr via reposts/expands, not green-ness).
    3. **Growth confound**: Jun 7 cards got 2–5 likes, Jun 16–24 got 50–96 — mostly the account
       maturing to ~100 followers + pump bump. Same breakeven card: 4→17→61 likes but like-RATE
       held ~4.5–5.3%. The audience grew, the card didn't change.
    4. **Reach-controlled (like-rate), VALUE/dip/fear cards resonate best per viewer** (Fire Sale
       5.5%, F&G dial 8.3%, monthly-returns 5.5%, diamond/underwater ~4.6–5%); aspirational
       targets (2.7%) / alltime (3.2%) UNDER-resonate — they won absolute likes purely on reach.
    **Verdict:** "fire bullish cards on green days" is NOT supported — day-color barely moves
    reach. Real levers: chart cards >> text; honest value cards convert best per-viewer; virality
    is algorithm luck (unschedulable); the reliable engine is follower growth + consistency.
    So: protect the band cards (don't over-suppress), keep chart quality high, post daily.
  - **Post log now OPTIONAL** (the CSV export already carries post id + text + all metrics, and
    classifies cleanly by text). A {date, card id, tweet id} append-only log would still auto-tag
    card ids for future exports, but it's a convenience, not a blocker.
- **First follower-milestone post = 690, NOT 100 (decided 2026-06-24).** Hit 100
  followers in 17 days; owner wants to hold for **690** as the first milestone post
  because it's the on-brand memeable number (69 / 6900). Build it like the other
  event posts: a one-off celebratory card, fired manually (`BOT_POST=`) / time-gated,
  **suppressed around the daily** (same fatigue logic as band posts — see band-watch).
  Tone: humble community thanks ("690 of you, early"), NOT a flex or follow-for-more.
  - **Analytics aside (2026-06-24, for context, do NOT turn into a post claim):**
    overlaid SPX price vs X impressions/follows for Jun 11–24. Price peaked $0.473 on
    Jun 17 alongside an 8K-impression spike (discovery via the pump), then price fell
    ~28% while followers KEPT growing (Jun 22 was the biggest follow day, no price
    catalyst). Read = "volatility drives discovery, content drives retention." The
    level-correlation (0.90) is a one-day artifact; daily-return corr is only ~0.36.
    So there is NO strict price↔followers relationship — never post it as one.
- **"Uptober" seasonal card — parked; fire it in September, NOT in the daily rotation.**
  Idea (2026-06-20): a card leaning on the crypto-wide "Uptober" / Q4-strength meme —
  "autumn has historically been SPX6900's hot streak." Descriptive curiosity only,
  framed like the cycle what-ifs. **MUST NOT** be framed as a "Sep/Oct-only strategy
  beats HODL by X×" backtest — that number is an overfit artifact of a single year.
  Data caveat: excluding 2023 (launch), the Sep/Oct strength is driven ~entirely by
  **2024** (Sep +685% / Oct +889%); **2025 was flat-to-negative** (Sep −8%, Oct +1%).
  So n≈2 with one dominating outlier — an *event*, not a repeatable *edge* (drop 2024
  and the effect vanishes). Delivery: a **time-gated seasonal post around September**
  (like the band-change / milestone event posts), not a year-round rotation card.
  Revisit once there are a few more autumns to judge. (Noted 2026-06-20.)
- **LLM-written copy + auto-replies — split by cost; only the free half is worth doing.**
  Explored 2026-06-20 (making the bot more "AIXBT-like"). The two halves sit on
  opposite sides of X's API paywall, and the cost is the *read* access, not the LLM:
  - **✅ LLM-written post copy — BUILT (shadow mode) 2026-07-04.** First applied to the
    "Notable today" anomaly signals via OpenRouter (see the detector section up top —
    `scripts/bot/llm-copy.mjs`), NOT (yet) the daily rotation templates. Same rules as
    planned: pass only real numbers, validate (length / must-contain-a-number /
    hype-blocklist), template stays the fallback, post nothing until it beats the
    templates. Extending it from the event signals to the DAILY rotation copy is the
    natural next step once the shadow output proves out. Original note kept below:
    Have a free-tier LLM write each day's text from the exact computed stats instead
    of the templates. ~1 post/day, so free tiers cover it (the LLM was never the
    expensive part). Note: templates are already good post-hook-rewrite, so the LLM
    mainly buys variety vs. accuracy/brand risk.
  - **Auto-reply to repliers — parked, needs paid X API.** Blocker is READ access,
    not the LLM. Reading replies/mentions (`conversation_id` search or the mentions
    timeline) starts at X API **Basic (~$100/mo)**; the **Free** tier the bot runs
    on is effectively write-only (that's why posting today is free). Owner won't pay
    $100/mo for a self-funded fun project, and scraping replies violates X ToS /
    risks the account. Free alternative if interaction is ever wanted:
    human-in-the-loop — owner reads replies in the app, a tool drafts an in-voice
    response to paste/edit. (Noted 2026-06-20.)
- **Holder-growth card: not yet.** The daily holder snapshot (`history.json`) only
  has a few days of data. Wait until there are **at least 30 days** of holder
  snapshots before building a "holders over time / holders up X%" card, so it's
  actually informative. (Noted 2026-06-16.)
- **Future card ideas — greenlit, build when ready (noted 2026-06-23):**
  - ✅ **SPX6900 vs the real S&P 500 — BUILT 2026-06-25** (card id `spxvssp`). Growth-
    multiple returns race on a log axis: SPX ~497× vs the S&P ~+68% since launch, two
    honest returns from day one (S&P closes already bundled in `src/sp500-history.js`).
    Distinct from the cap-scale `sp500` cube and the `monthlyreturnssp` heatmap.
  - ✅ **Power-law price roadmap — BUILT 2026-06-25** (card id `roadmap`). Projects the
    fitted fair-value (center) line forward and stamps the dates it crosses the meme
    targets (currently $6.90 Oct '27 / $69 Dec '30 / $690 Mar '36 — auto-computed via the
    inverse of `predict()`, so the dates shift if the model is ever re-fit). Framed as
    "the trend, extrapolated"; companion to the `channel` card.
  - ✅ **Price color-coded by valuation z-score — BUILT 2026-06-25, RETOOLED to a
    z-score 2026-06-26** (card id `riskcolor`, `scripts/bot/risk-cards.mjs`). Price line
    recolored segment-by-segment by a continuous color gradient (blue→cyan→green→yellow→red).
    - **Now a z-SCORE, not min-max risk (changed 2026-06-26, owner asked for "a slightly
      different flavour" so it differs visibly from the rainbow cards).** Each segment is
      shaded by the **valuation z-score** = how many standard deviations the log-residual
      (log price − power-law fair value) sits from its full-history mean, mapped ±2.5σ →
      blue..red (`zScoreSeries(m)` + `zToUnit`). The tweet now explains exactly this
      ("how many σ from fair value; blue = cheap below trend, red = stretched above";
      headline e.g. "-1.3σ — cheap"). The post computes the SAME z inline from `s.model`
      so card readout and tweet agree. This is distinct from the OTHER cards' rainbow-band
      risk (0–1 min-max) — a fresh statistical "cheap vs heated" read on the same data.
    - **Horizon note (still true):** this is the LONG-TERM power-law deviation (vs the
      whole fitted trend). The SHORT-TERM "heat vs its average" (Cowen's BMSB / 20W-MA
      idea) is a DIFFERENT horizon and is the `riskheat` card (20W extension). Complementary
      (long-term vs short-term), not redundant — don't conflate them.
    - **+ power-law fair-value line (added 2026-06-26, owner request):** the z-score card
      now also draws the dashed fair-value (center) line for reference — derived as
      `price / exp(z)` so it agrees exactly with the colouring. Original greenlit note:
  - ✅ **PlanB-style RSI dots — BUILT 2026-06-26** (card id `rsidots`, `scripts/bot/rsi-card.mjs`).
    An explicit homage to @100trillionUSD's Bitcoin "Realized Price & Geometric MA" chart:
    SPX6900 price plotted as DOTS coloured by Wilder's RSI (blue cold/oversold → red
    hot/overbought, jet colormap via the shared `riskColor`). Left-side RSI colour legend
    like his. The post copy **@-mentions PlanB directly** and uses the shared `rsiNow()`
    helper so the headline matches the card. (RSI colour domain fixed 35..85.)
    - **Reference line = GEOMETRIC MA, not our power-law fair value** (owner: "PlanB
      associates RSI with realized price, not our fair value"). Trailing geometric MA
      (`GMA_MONTHS=6` on the monthly closes), only once primed. We CAN'T match him exactly:
      a true 200-week MA needs >3yr (we have <3), and his REALIZED PRICE line is the
      `be`/break-even, which is data-gated (revisit ~mid-July once ~30d banked — THEN we
      can add the realized line for an even closer match).
    - **Cadence/period = "variant F" (changed 2026-06-27 after mocking 6 variants).**
      MONTHLY closes (one dot per month, like his ~12/yr — was weekly ~52/yr and read as a
      dense band that "fired" too often), Wilder **RSI(6)** on those monthly closes
      (`RSI_PERIOD`), **left edge cropped to the first primed dot** so the dots fill the
      chart edge-to-edge (his warm-up sits off-screen in pre-2013 data; we crop ours),
      chunkier dots (r=7), current month overridden by the live price. `monthlyCloses()`
      + `rsiNow()` are exported so the post headline can't drift from the card.
    - **🔭 REVISIT as history grows — we get closer to PlanB over time (owner, 2026-06-27).**
      The whole reason we're on a short RSI(6) + crop is that SPX6900 is only ~3yr old: a
      true **14-month RSI** (his) burns 14 months of warm-up and leaves ~20 dots starting
      in 2025 (mocked it — too sparse, loses the launch cycle). As we bank more history the
      tradeoff eases — **lengthen `RSI_PERIOD` toward ~9→12→14 months and relax the crop**
      to march toward true PlanB parity (and pair it with the realized-price line once `be`
      is banked). Rough cadence to re-check: **~every 6 months** (next ~2026-12), or whenever
      we've added a full extra year of monthly closes. Caveat baked in: SPX's moves are so
      violent that even a 14-month RSI still saturates red at tops — fewer/cleaner MONTHLY
      dots is the realistic win, not making red rare like his 15-yr chart.
  - ✅ **Monthly returns, year-vs-year grouped bars — BUILT 2026-06-26** (card id
    `monthcompare`, `scripts/bot/monthly-compare-card.mjs`). Owner asked for monthly
    returns where the same calendar month from each year sits side by side (Jan '25 next
    to Jan '26, Feb next to Feb…). Grouped column chart diverging from a 0% line, the
    **two most recent years** per month (older = sky blue, current = gold). Deliberately
    only 2 years: including 2024 would drag in the launch-pump outliers (Sep '24 +685%,
    Oct '24 +889%) which flatten everything. Self-contained from DEFAULT_RAW (live price
    overrides the current month so the latest bar is month-to-date); generalises to the
    two newest years automatically. Distinct from `monthlybars` (one bar/month, all
    history) and the `monthlyreturns` heatmap.
  - **Card visual-impact pass (owner, 2026-06-26): thin price-only lines read as weak.**
    Fix applied to the recent custom-SVG cards (`riskcolor`, `risklevels`, `riskheat`,
    `runningroi`, `cyclesync`): thicker primary line + a blurred same-colour **glow underlay**
    (`feGaussianBlur`) + a **fading area fill** (vertical gradient → transparent) under the
    hero line. Big legibility/impact win for ~free. Principle: any new line-only card should
    ship with glow + fading fill, not a bare 2px polyline. (The `line`-type cards already
    support `fill` via `lineCardSvg`.)
    - **`lineCardSvg` now also supports a per-series `glow: true` flag** (blurred underlay,
      filter `lglow`) — opt-in so existing line cards are untouched. The **S&P-500 race
      cards** got the treatment (2026-06-26): `spxvssp` (since-launch, log) + `sp500ytd` /
      `sp500roll12` (% race via `spVsSpec`) now set `fill` + `glow` on the SPX hero line
      (and `fillBase: 0` on the % cards so the fill shades out/under-performance vs the 0%
      start). To punch up any other `line` card: add `fill: 0.15` + `glow: true` to its hero series.
    - **Round 2 retouches (2026-06-26, owner):** S&P race lines made THICKER (the grey/blue
      S&P benchmark line was too thin). `breakeven` zoomed to the **last 365d** (the launch
      run-up flattened the recent cost-basis read) + fill/glow. `runningroi` deeper fills
      (price + ROI) + thicker. `risklevels` y-axis now **anchored to the levels** so all
      bands fill the FULL card height (were bunched at the top), recent window cut to ~1yr,
      price gets a fading fill. **`riskheat` reworked** (Cowen-style): bigger price panel
      with a colour BAND filling the gap between price and the 20W MA (red stretched-above /
      blue below — the extension drawn onto price, the prominent read), THICKER amber MA,
      and the bottom oscillator is now **tanh-scaled** (`yE = cyc − tanh(e/maxAbs)·half`) so
      big extensions compress toward the edge instead of hard-clipping flat ("cut off" fix).
  - **Price color-coded by risk — greenlit (2026-06-25, owner ref: Into the Cryptoverse).**
    The actual SPX price line (log y vs time) with each SEGMENT recolored by the risk/
    band value at that point: deep blue/purple = cheap/low-risk, through cyan→green→
    yellow, up to red at stretched/high-risk tops. Same rainbow data as the `rainbow`/
    `channel` cards, but rendered as ONE color-shifting line (no banded background) —
    a fresh, eye-catching visual. **We already have all the inputs:** risk per point
    (`M.buildRiskSeries` / `bandIndex` → 0–1), and the band palette (`M.BAND_LABELS[i].c`).
    Build = draw the price polyline as many short segments, each colored by its point's
    risk (use `BAND_LABELS[bandIndex].c`, or interpolate a continuous 0–1 → blue→red
    gradient for the smoother ITC look). Card + optional website tab. NOTE the right-
    hand "Time In Risk Bands" histogram in the owner's ref screenshot ≈ our existing
    `timeinband` card, so no need to rebuild that.
  - ✅ **Current risk levels projected onto price — BUILT 2026-06-25** (card id
    `risklevels`, `scripts/bot/risk-cards.mjs`). Recent price + a dashed line per risk
    level (0.1–0.7) labeled `risk : price`. Original greenlit note:
  - ✅ **Price + 20-week EXTENSION oscillator — BUILT 2026-06-25** (card id `riskheat`,
    `scripts/bot/risk-cards.mjs`). Two-panel: price + its 20W MA (amber) on top; below,
    a hot/cold bar oscillator of price's EXTENSION from the 20-week MA, centered at the
    MA (zero line) — red above = stretched, blue below = discounted. This is Cowen's
    SHORT-TERM bubble risk (mean-reversion vs the 20W MA), deliberately NOT the long-run
    rainbow risk (owner note 2026-06-26 — looks different + a faster signal). Scale =
    90th-pctl extension so a launch-era spike doesn't flatten it (outliers clamp).
  - **Current risk levels projected onto price — greenlit, buildable now (2026-06-25,
    ITC ref).** A zoomed RECENT-price chart with a horizontal line at each rainbow
    band's price *today*, each labeled `risk-value : price` (e.g. "0.45 : $X") — i.e.
    "what price = what risk level right now." All inputs exist: `M.bandVal(m, day, i)`
    for every band edge + a risk value per band. Near-term cousin of the rainbow (price
    targets by risk). Card + optional tab. (Several other ITC charts the owner shared
    are already covered: Time-in-Risk-Bands = `timeinband`; Historical Risk Levels =
    `risk`/`fngtrend`; Market-Cap Hypotheticals = `majorcaps`/`sp500`. The whole-market
    cap TREEMAP is not SPX-specific — skip.)
  - **ITC batch 2 verdicts (2026-06-25, owner shared 5 more ITC charts):**
    - ✅ **Running ROI — BUILT 2026-06-26** (card id `runningroi`, `scripts/bot/roi-card.mjs`).
      365D running ROI = price ÷ price 365d ago, over time; dual log axes (price blue
      left / ROI red right) + a green 1× break-even line, ITC-style. Card + og share.
    - **Quarterly Returns** (buy Q-start / sell Q-end seasonality table) — buildable,
      minor; the monthly heatmap (`monthlyreturns`) already tells the story.
    - **Historical Monthly Average ROI** — already covered by `monthlyreturns`/`monthlybars`.
    - **SKIP — Average Daily Returns** (avg ROI per day-of-month): same overfit trap as
      the already-rejected day-of-week idea (thin samples, 24/7 asset). Don't build.
    - **SKIP — Supertrend** (ATR trend indicator w/ buy/sell arrows): off-brand — the
      moat is honest VALUATION, not trade signals; "buy/sell" arrows invite blowback.
    - **SKIP — Pi Cycle Bottom/Top** (111D vs 2×350D SMA): a BTC-halving-cycle top caller;
      borrowed/overfit for a ~2yr memecoin (same reasoning as Uptober). Not meaningful.
      - **✅ BUILT 2026-07-08 as the CONTINUOUS RATIO (owner "lets build both. I like it").**
        Owner read Cowen's Pi Cycle page and wanted an angle. We use the "MAs Divided" RATIO
        `111DMA / (350DMA × 2)` (350/111 ≈ π) as a descriptive extension/accumulation gauge —
        NOT the binary "top in 3 days" cross (overfit/borrowed for a ~2yr memecoin; the cross is
        the honesty trap). Thresholds: **>1 = top zone, <0.5 = accumulation, <0.4 = deep**.
        - **Shared core:** `piCycleRatio(series)` + `piCycleState(ratio)` in `src/models.js`
          (same daily-interpolation as `goldenCross`, so MAs are smooth over sparse early data).
          Unit-tested (`test/models.test.mjs`). Card + site chart both import it → can't drift.
        - **Site chart:** `src/PiCycleChart.jsx`, catalog id `picycle` (Valuation group) — ratio
          area line, quantile-independent zones, top/accumulation threshold lines, drag-zoom.
        - **Card:** `scripts/bot/picycle-card.mjs` (type `picycle`, LOOK "dual") — glanceable:
          ratio line + zones + peak annotation + hero "N.NN — <zone>". Wired charts.mjs+posts.mjs.
        - **⭐ THE REAL FINDING (708 days of ratio, since 2024-07-31):** SPX crossed **above 1
          (top zone) in Oct 2024**, peaked **1.53 on 2025-01-09 at its ~$1.34 cycle top**, fell
          back below 1 in Apr 2025, entered accumulation (<0.5) Dec 2025, and today sits at
          **~0.25 (16th %ile, deep accumulation)**. A RHYME with the MVRV-vs-BTC read: two
          independent lenses (realized-value + trend-extension) both say SPX is deeply cheap now.
        - **Honesty guardrails baked in:** copy/caption say "a Bitcoin indicator applied to SPX,
          for context — a rhyme, not a signal." Do NOT claim it "called SPX's top in 3 days" — for
          SPX the cross fired ~3mo EARLY (Oct 2024 vs the Jan 2025 top); it's the CONTINUOUS ratio
          that's honest, not the cross. Only ~1 SPX cycle so far → descriptive of WHERE WE ARE,
          not a repeatable prediction. Diminishing-peaks idea still needs more cycles (SPX young).
        - **⭐ THRESHOLD CALIBRATION — 1.0/0.5 are BITCOIN's, checked vs SPX (owner asked 2026-07-08).**
          Ran the SAME 111/(350×2) math on BTC (btc-history.js, 5457 days) vs SPX (705 days):
          **BTC** median 0.58, above 1.0 only **7.9%** of the time (1.0 = ~92nd pct, its real tops
          2013/2017/2021), below 0.5 **31%**. **SPX** median 0.72, above 1.0 a full **26%** of the
          time (1.0 = only ~73rd pct), below 0.5 **30%**. Verdict: **0.5 accumulation FITS SPX**
          (30% ≈ BTC's 31% — keep it), but **1.0 is TOO LOW a "top" for SPX** — SPX runs hotter
          (above it 3× as often), so a top comparable in rarity to BTC's 1.0 sits at SPX's ~p90 ≈
          **1.4** (SPX's actual top printed 1.53). **DECISION (owner 2026-07-08): keep 0.5/0.4
          fixed (validated) and TILT THE TOP ONLY to SPX's own p90 (`zones.top = max(1.1, q0.90)`
          ≈ 1.49); 1.0 kept as a faint labelled "Bitcoin's top line" reference, not an SPX zone
          boundary.** Shipped: `piCycleRatio(...).zones = {deep:0.4, accum:0.5, top:p90, btcTop:1.0}`
          + `piCycleState(ratio, zones)`; card + `PiCycleChart` + copy all read from it. So 1.0–1.49
          now reads "mid-range" (SPX runs hot but not topped for SPX), only >1.49 = top zone.
  - **⭐ "AM I CHEAP?" VALUATION DASHBOARD — greenlit for memory (owner, 2026-07-08).** A view/card
    that flags when MULTIPLE INDEPENDENT valuation gauges AGREE that SPX is cheap/heated — the
    corroboration is the signal (one metric can mislead; three aligning is stronger + honest). The
    lenses already built & data-ready: **MVRV percentile vs BTC** (mvrvbtc — currently ~1st %ile),
    **Pi Cycle ratio zone** (picycle — deep accumulation), **rainbow band** (Fire Sale?), **20W
    heat / z-score** (riskheat/riskcolor), **F&G**. Concept: a compact "N of 5 gauges say cheap"
    readout, each a labelled chip with its live value, leading to a single honest headline. MUST
    read at a glance (owner's anti-techy bar) — chips with plain words ("underwater", "accumulation",
    "Fire Sale"), not raw indicator jargon. Guardrail: it's a VALUATION-POSITION statement (where we
    sit), never a buy signal or a "bottom is in" call — agreement of lagging value metrics ≠ timing.
    Build after the Pi Cycle calibration is settled. Distinct from any single card; the value is the
    CONVERGENCE. (Idea emerged because MVRV + Pi Cycle independently landed on "deeply cheap".)
  - **ITC batch 3 verdicts (2026-06-25, MA-based TA charts) — different lane from our
    valuation moat; cherry-pick at most one:**
    - **Bull Market Support Band (BMSB)** (20W SMA / 21W EMA band) — the pick if any:
      recognizable crypto macro-support zone, descriptive (no buy/sell arrows), enough
      history. Mild OK.
    - **Color-Coded MA Strength** (price recolored by above/below key MAs) — buildable,
      nice colored-line visual, but TA momentum. Optional/low.
    - **SKIP — Cowen Corridor** (corridor of 20WMA multiples): redundant — we already
      have two better-grounded corridors (`rainbow` power-law + `channel`).
    - **Meta:** ITC's library is large and much of it (these + supertrend + pi-cycle) is
      generic price-derived TA. Off the SPX6900 moat (honest VALUATION: rainbow, realized
      price, risk, S&P flex). Don't rebuild their whole TA suite; favor valuation/on-chain.
  - **⭐ WHAT LANDS WITH THE AUDIENCE (owner, 2026-06-28) — read before building cards.**
    The best-received cards are ALL **price-TARGET / "how many X it's run"** cards — the
    aspirational growth-multiple framing: `targets`, `milestones`, `memecoins`, `btcgrade`,
    `dogeclock`, `roadmap`, `alltime`, `hundred`, and the S&P-500 flexes. **"Techy" stats
    land WEAKLY** — volatility, correlation, RSI, z-score, etc.: the average holder doesn't
    decode them at a glance, which is a barrier to entry (this is why `volatility` was
    removed and `correlation` never built). **A visual must tell its story at first glance**
    — if you have to read the axis to get it, it's too techy. So for any NEW card: favour
    a big aspirational number ("X× to $69 / DOGE's cap / the next target") over a clever
    metric. The roster already rotates ~40+ days without repeat, so the bar for adding is
    high — only add if it's an obvious X-multiple/target win, not another indicator.
  - **Card-variety principle (owner, 2026-06-25) — IMPORTANT framing correction.**
    The daily FEED has a LOWER bar than a site tab: a visually-fresh card keeps the
    rotation from going stale even if its data overlaps an existing one. Bot cards are
    DECOUPLED from site tabs (a card can be rotation-only — just a `posts.mjs` entry,
    cheap) so: ADD visually-distinct cards to the rotation liberally; promote only the
    standouts to permanent site tabs. So the "redundant/skip" verdicts above were about
    SITE-TAB / info value — several of them (e.g. MA-strength line, BMSB, even a fresh
    corridor) are still fine as ROTATION-variety cards. Still skip the genuinely
    off-brand/overfit ones (supertrend buy/sell signals, pi-cycle, day-of-month returns).
  - ✅ **SITE REDESIGN — nav declutter + Charts gallery + interactive chart pages —
    BUILT 2026-06-29.** Replaced the crowded 12-tab top strip with **3 routes**:
    - **Home (`/`)** = the Rainbow hero ONLY + its rainbow-specific sections (band
      stats, target timeline, scale plan, model footer). Decluttered, breathing room.
    - **Charts gallery (`?view=charts`)** = ITC-style grid of preview tiles grouped by
      category (Valuation / Performance / On-Chain / Bitcoin & Markets) + a featured
      Rainbow tile. `src/ChartsGallery.jsx`. **Tile previews are LIVE, scaled-down
      renders of the REAL chart component** (App passes `renderPreview={id => chartEl(id,
      {preview:true})}`), lazy-mounted via IntersectionObserver and CSS-scaled to fit —
      the actual look of the site chart, NOT the tweet-card image (owner: "don't use the
      cards as previews but the actual look of the chart"). `chartEl(id)` in App.jsx is
      the single render switch shared by the gallery previews and the chart pages.
    - **Dedicated chart page (`?chart=<id>`)** = each interactive chart full-width with
      back-to-gallery · category · title · description · share. Reuses the existing
      lazy React chart components.
    - **Minimal nav** = `Rainbow (home) · Charts · X` (the `relative` variant dropdown
      moved out of the nav — `RelativeChart` has its own in-chart selector).
    - **`src/charts-catalog.js` = single source of truth** (CHART_GROUPS / CHART_META /
      CHART_IDS) shared by gallery + routing + deep-links. Adding/removing a site chart =
      edit this one file (id must match the render switch in App.jsx + a lazy import).
    - Deep-links: `?chart=`/`?view=`; legacy `?tab=` still honored (old shared links).
  - **⭐ KEY DECISION (owner, 2026-06-29): the website is INTERACTIVE charts only;
    INFOGRAPHIC cards are tweet-only and do NOT live on the site at all.** The library
    splits in two: (a) **time-series charts** that benefit from zoom/hover/toggle → these
    get interactive React pages in the gallery; (b) **infographic cards** (targets,
    memecoins, milestones, hundred, btcgrade, dogeclock, F&G dial, sp500 cube, etc.) —
    complete at a glance BY DESIGN → stay as bot/tweet cards, NOT on the website. Do not
    mirror tweet cards onto the site (an earlier "gallery of card images" attempt was
    rejected for exactly this — destinations must be genuinely interactive).
  - **NEXT (incremental): convert card-only TIME-SERIES charts to interactive React
    pages**, one at a time, adding each to `charts-catalog.js`. Phase-1 shipped the 11
    that already had components (channel, risk, model, rally, drawdown, monthly, supply,
    holders, spxbtc, btccycle, relative). **Since shipped as interactive pages (2026-06/07):**
    `riskcolor` (z-score), `riskheat` (20W extension), `runningroi` (Performance / windowed
    growth), `rsidots` (RSI dots), `roadmap` (power-law projection), `holdersprice` (holders
    vs price), `mvrv` (MVRV & Realized Price — realized/MVRV/Z-score modes). **Still
    card-only, candidates to build next:** `spxvssp` (vs S&P), `breakeven` (cost basis),
    `diamondtrend` (**diamond-hands SHARE of total supply over time** — NOTE: this is the
    conviction-tier share, NOT "% supply in profit"; that's a separate, data-blocked metric,
    see below). The `diamondtrend` BOT CARD is already in production; only the interactive
    site page is unbuilt. Each is a per-chart React build (like `ChannelChart.jsx`); the
    data/model logic is already shared in `src/`, so it's a rendering job. (NOT the
    infographic cards above.)
  - **❌ Volatility "how wild is it" — BUILT then REMOVED 2026-06-28.** Was a 3-bar SPX
    vs BTC vs S&P annualized-weekly-vol card. Owner pulled it: a bar of "120% annualized
    volatility" is too abstract — the average user can't decode it at a glance, so it's a
    barrier to entry. (The numbers, if ever revived: weekly vol — NOT monthly, which the
    launch pumps inflate to a bogus 768% — gives SPX ~120% / BTC ~41% / S&P ~11%, i.e.
    ~3× BTC, ~10× S&P. A "±17% in a typical week" reframe is more visceral but still techy.)
  - **❌ Decoupling from Bitcoin — CHECKED & SHELVED (2026-06-28).** The "SPX finding its
    own legs" story does NOT survive scrutiny. The flattering 0.49→0.20→0.11 figures were
    MONTHLY-return correlations over 24/12/6mo — i.e. only **6–12 data points**, a tiny-
    sample artifact. A robust **26-week rolling** correlation (weekly returns) bounces
    0.0–0.75 and is currently **RISING to ~0.49** (more correlated, not less). So a
    decoupling card would either tell the opposite story or require cherry-picking the
    noisy monthly metric — dishonest, against the moat. Mocked it to confirm; do not build.
    (Also tensions with the BTC-cycle cards' "we follow BTC" thesis.)
  - **% of supply in profit / MVRV.** price ÷ holders' realized cost (we already compute
    break-even, so current value is free). A respected, crypto-native on-chain metric.
    Full over-time chart needs ~30 days of snapshot history (same wait as holder-growth).
    - **✅ MVRV / Realized-price / MVRV-Z SHIPPED as an interactive site page 2026-07-01**
      (`mvrv`, `src/OnchainValueChart.jsx`, On-Chain group). Three modes off the daily
      snapshots: Realized price (price vs `be`), MVRV (price ÷ `be`, 1× break-even line),
      MVRV Z-score ((mcap−rcap)/std(mcap), SUPPLY=939M). Young data by design — caption
      says it fills in as snapshots accumulate; the Z std is still tiny (~1 month) so early
      Z reads are exaggerated. **Exact "% supply in profit" is STILL NOT shipped/computable**
      — it needs the cost-basis DISTRIBUTION HolderScan doesn't give (the collab ask); MVRV
      is the buildable proxy and it's what shipped.
    **Status (2026-06-23):** now banking `upnl` (unrealized) + `rpnl` (realized) $ PnL
    daily in `history.json` alongside `be`. HolderScan's `/stats/pnl` only gives
    break-even + aggregate realized/unrealized totals — NO cost-basis distribution, so
    the *exact* "% supply in profit" isn't computable from it; **MVRV = price ÷ be** is
    the buildable proxy. **✅ pnl-fields question ANSWERED (2026-07-02, read from the CI
    log; debug log removed):** `/stats/pnl` returns exactly {break_even_price,
    realized_pnl_total, unrealized_pnl_total} — NO percent-in-profit / cost-basis
    distribution field. All three are already banked; the distribution stays blocked on
    the HolderScan collab. **Revisit ~2026-07-23** once ~30 days of `be`/`upnl`/`rpnl`
    are banked, to build the MVRV-over-time card (line + zones).
    - **= the BTC "Realized Price" analog the owner asked for (2026-06-25, ref ITC
      Bitcoin Terminal Price chart).** SPX6900's realized price IS the break-even (`be`)
      = avg on-chain cost basis; the buildable card is the ITC-style **price line + the
      realized/break-even line tracking beneath it over time** (same data-gate: ~30 days
      of `be`, ~mid-July). The snapshot version already ships as the `breakeven` card
      (price vs current cost basis). **NOT buildable: Terminal Price (21× transferred
      price) and Balanced Price (transferred − realized)** — they need Value-Days-
      Destroyed / coin-days-destroyed on-chain spending data HolderScan doesn't provide;
      only realized price (= `be`) is available, so don't try to fake terminal/balanced.
    - **MVRV Z-Score (owner shared ITC's BTC MVRV Z-Score, 2026-06-26) = the SAME item,
      a normalization of MVRV: (MarketCap − RealizedCap) / std(MarketCap).** For us
      MarketCap = price × supply, RealizedCap = `be` × supply, so it's computable from
      `be` — but it's MORE data-gated than the plain MVRV ratio: the `std()` over history
      needs a meaningful run of daily `be` to be stable (the plain MVRV-over-time line
      unlocks ~mid-July at ~30 days; the Z-score wants more history before it's
      trustworthy). So: nothing to build yet — revisit with the rest of the MVRV work.
    - **⭐ MVRV OVERLAY vs BTC's MVRV — FOUNDATION BUILT 2026-07-08 (owner "build it now").**
      Develops the MVRV concept: overlay SPX's MVRV on **Bitcoin's ~decade of MVRV** to ask
      "are we down/heated SIMILARLY to some BTC moment?" — the cross-asset "rhyme" idea from
      `cyclesync`, but on the VALUATION metric. MVRV is UNITLESS (mcap ÷ realized-cap) so it's
      directly comparable across assets — that's what makes the overlay honest despite BTC
      having years and SPX only weeks. **Shipped:**
      - **Data:** `scripts/build-btc-mvrv.mjs` fetches BTC MVRV (Coin Metrics COMMUNITY API,
        free/no-key, metric `CapMVRVCur`), samples ~weekly, writes `public/btc-mvrv.json`
        (`{asset,metric,sampledDays,updated,points:[["YYYY-MM-DD",mvrv],…]}`). Pure core
        `sampleMvrv()` is unit-tested (`test/btc-mvrv.test.mjs`). Workflow `btc-mvrv.yml` =
        dispatch + **monthly** cron (BTC MVRV is ~static/append-only; the daily-moving part
        is SPX's own MVRV from history.json). Coin Metrics is BLOCKED from the dev sandbox
        (egress policy) — it only runs in CI, so **the owner must run the "Build BTC MVRV
        context" workflow ONCE to populate `btc-mvrv.json`** (then monthly keeps it fresh).
      - **Chart:** `src/MvrvContextChart.jsx`, catalog id `mvrvbtc` (On-Chain group). BTC MVRV
        line over its full timeline (log y), **zones derived from BTC's OWN quantiles**
        (capitulation/cheap/fair/warm/hot — self-consistent, no hardcoded thresholds), a
        break-even 1× line, a bold **"SPX today N×" marker line** + shaded ±12% band across
        BTC's map, and a "Nth percentile of BTC history" metric. Loads `btc-mvrv.json` +
        history.json; graceful "being banked" empty state until the workflow runs. Reads live
        `price÷be`.
      - **⭐ "SEE THE SIMILARITIES" (owner iteration 2026-07-08):** magenta **match dots**
        (`Scatter` + the `similar` memo) highlight every Bitcoin week whose MVRV sat within ±12%
        of SPX's today, clustered into periods. Against the REAL data they land exactly on BTC's
        **2011, 2015 and 2018 cycle bottoms**. Ordinal metric fixed (2nd, not "2th"); dots +
        band + percentile recompute live as SPX's MVRV moves.
      - **⭐ THE HONEST FINDING (REAL DATA landed 2026-07-08 — owner ran the workflow):**
        `btc-mvrv.json` = 811 weekly points 2011→2026 (BTC MVRV min 0.443 / max 7.743). SPX's
        current MVRV ~**0.70×** — average holder UNDERWATER — is the **2nd percentile** of
        Bitcoin's entire history (cheaper on MVRV than 98% of all BTC days); BTC only traded
        this cheap at its 2011/2015/2018 GENERATIONAL BOTTOMS. So "are we down similarly?" →
        YES, decisively. Interesting AND true — a strong candidate angle once there's enough
        SPX history to post it without the "weeks vs decade" caveat misleading.
      - **⭐ SPX'S OWN MVRV TRAIL added (owner point 1, 2026-07-08):** `MvrvContextChart` now
        also draws SPX6900's real MVRV series (`spxSeries`, price÷be per snapshot) as a purple
        line on BTC's timeline at its true dates (right/2026 region). Short now (~weeks), grows
        into a longer path over time — you watch it climb/fall through BTC's zones. Dots shown
        while ≤40 points, then just the line.
      - **⭐ CARD BUILT (owner point 2, "the card makes sense now"):** `scripts/bot/mvrv-card.mjs`
        (`renderMvrvBtcCard`, type `mvrvbtc`, LOOK "dual", data-gated `btcMvrv.length>=100 &&
        supply.breakEven>0`). Glanceable: BTC MVRV line + BTC-quantile zones, SPX marker line +
        ±12% band, the "we've been here" match dots at BTC's bottoms, hero "Nth %ile · cheaper
        than X% of BTC history". `stats.btcMvrv` added via `loadBtcMvrv()` (reads
        public/btc-mvrv.json, mirrors loadLongShort). Copy leads with the honest POSITION stat
        ("MVRV Nx, cheaper than X% of Bitcoin's history — a level BTC only reached at its cycle
        bottoms") — a valuation-LEVEL claim true right now, NOT "SPX will follow BTC's path"
        (the guardrail). Wired in charts.mjs + posts.mjs; test whitelist updated. 71 tests green.
      - **Honesty guardrails (same as cyclesync):** SPX's MVRV history is ~weeks vs BTC's
        ~decade — do NOT force a numeric "SPX today = BTC date X" claim; the chart/card frame it
        as a VISUAL position on BTC's map (zones are a REFERENCE, not a target). The card copy
        is a valuation-LEVEL statement (as cheap as BTC's bottoms WERE), never a path forecast.
        Pairs with the plain MVRV-over-time line + Z-score on the `mvrv` page (~2026-07-23).
  - **Day-of-week "best day to buy" — rejected.** Same overfit trap as Uptober (~150
    samples/weekday, crypto is 24/7). At best a low-impact myth-buster ("weekday barely
    matters"); don't present it as a buy signal.

## BTC-cycle "rhyme" cards — the "why ≈ BTC Aug '22" representation (2026-06-26)
- **Problem the owner raised:** the cycle cards asserted "today ≈ BTC Aug '22" but
  never SHOWED the relationship, so people asked why. The alignment maps SPX's launch
  to BTC's 2019-10 (`shift=3395` in `src/btc-cycle.js`), which makes SPX's recent
  **double top (Jan '25 + Jul '25)** line up — within WEEKS — with BTC's **2021 double
  top (Apr & Nov)**, and today land on BTC's post-top **Aug '22** low. Verified: SPX
  peaks at age 522/714 vs BTC tops mapped to age 529/737. Strong TIMING rhyme.
- **Key honesty constraint — timing rhymes, amplitude does NOT.** BTC's 2021 spike was
  a far bigger *relative* move than SPX's (BTC ~3.4× over its now-price into the top;
  SPX only ~5.5× but from a tiny base). Any single-axis **beta-scaled** overlay
  overshoots SPX's real peaks ~7× — looks wrong, overclaims. So the rhyme card uses a
  **dual-axis, time-aligned** overlay: SPX on the LEFT log axis, Bitcoin's REAL price on
  the RIGHT log axis, each on its own scale, lined up in time. No fake amplitude scaling.
- **BUILT — `cyclesync` card** (`scripts/bot/cycle-card.mjs`, render `renderCycleSyncCard`,
  wired in `charts.mjs`). SPX green (left) + BTC orange real (right), vertical guides at
  the two mapped BTC tops + a "today ≈ BTC Aug '22" NOW line, plus a dashed stub of BTC's
  ACTUAL 2022→23 recovery past NOW (honest "BTC ran from here", not a projection). Data
  comes from `btcCycleProjection()` which now also returns `histPts` (BTC real aligned,
  launch→now), `histFwd` (the post-now real stub) and `peaks` (the two mapped tops).
- **The `cycle` post now uses `cyclesync`** (was the forward-projection `line` card) and
  its copy explains the double-top reasoning. Website **BtcCycleChart.jsx** mirrors
  it: added a right BTC axis + the aligned real-cycle line + the two peak guides, and the
  caption now opens with the "why ≈ BTC Aug '22" explanation. The forward beta-scaled
  projection (the aggressive ~$85–90 top) is UNCHANGED and kept as the dashed path — note
  it's deliberately more aggressive than realized history (effective beta ~1.4 vs the
  3.4 used forward); left as owner-tuned, not re-calibrated here.
- ✅ **`cycleclock` REDESIGNED — "The Halving Clock" custom card (BUILT 2026-06-29,
  `renderCycleClockCard` in `cycle-card.mjs`).** Was a single up-only orange projected
  line (`type:"line"`) people couldn't read. Now a full-context card: SPX's REAL history
  (green, with its true double-top + drawdown) flows into a NOW marker; ahead, the
  beta-scaled path is a bear→bull **CONE** (`projLo`/`projHi`) up to the projected top;
  dashed `$1/$6.90/$69` lines anchor the scale; and a **phase strip** (journey so far →
  recovery → bull run → cool-off) with a ▼ YOU ARE HERE pointer makes the "halving clock"
  legible. Card text kept minimal (owner: "the tweet will describe") — title, `cycle top
  ~$X`, `~$X · ~Y×` at the peak, phase labels; the DATE lives only in the tweet copy.
  Wired: `posts.mjs` cycleclock → `card:{type:"cycleclock"}` + 3-line copy; `charts.mjs`
  dispatch. The ~$91/272× top is the owner-tuned aggressive beta (3.4) — dial down if ever
  wanted. (`cyclesync` = the rhyme overlay card is separate and unchanged.)

## Model re-fit hygiene — IMPORTANT, recurring (noted 2026-06-23)
- The rainbow's power-law fit is **frozen on the bundled `DEFAULT_RAW`** (`buildModel`
  in `src/models.js`); live price only extends the drawn line, it does NOT re-fit.
  The launch-era exponent is steep (~4.6), so the fair-value **center marches up
  ~0.5–1¢/day even if price is flat** — price then drifts down through the bands and
  can fall **off the Fire Sale floor** (the p2 residual). The rainbow is the project's
  main attraction, so we must not let price escape the bands.
- **Policy = monitor monthly, act rarely (decouple the two).** Run
  `node scripts/rebundle-model.mjs --check` ~monthly: it pulls recent closes from
  `public/history.json` (kept current by the snapshot cron), thins to ~weekly, and
  prints where a re-fit WOULD move exponent/center/band — **without touching
  `src/data.js`**. Watching the drift ≠ changing the model.
- **Only APPLY** (run without `--check`, then `npm run build && node --test
  'test/**/*.test.mjs'`, commit `src/data.js`) **when price has UNDERSHOT the lower
  band for a sustained stretch** — i.e. the model is genuinely failing to contain
  price. Do NOT re-fit reactively the moment Fire Sale fires: that's a rare, valuable
  signal (good content), and re-fitting it away is goal-seeking and erodes credibility.
  Also note the dataset is still small, so each re-fit is noisy — another reason to
  wait. Heads-up: a re-fit moves EVERY band + can lengthen a band label enough to tip a
  post over the 290-char guard (check the length test).
- **2026-06-23: trialed a re-fit, then REVERTED it.** Adding real Jun snapshots moved
  exponent 4.60→4.16, center $1.69→$1.44, price BUY!→Accumulate, headroom ~127→~195d
  (R² 0.742→0.734). But Fire Sale had just fired ~1h earlier, so per the policy above we
  kept the original curve and the owner is monitoring price behaviour instead.
- **Revisit ~2026-07-23** (monitor with `--check`), roughly monthly after.

## Deploy hygiene — Vercel free tier = 100 deploys/day (learned 2026-06-26)
- Production deploy (`.github/workflows/deploy.yml`) fires on every push to `main`
  and ships via the Vercel CLI. The free plan caps **100 deployments/day**; over it,
  `vercel deploy` fails with `api-deployments-free-per-day` (rolling ~24h window).
- **Root cause hit on 2026-06-26:** the hourly band-watch rewrote `band-state.json`
  every run (just the timestamp) → ~24 deploys/day, plus a push-heavy build session +
  control-panel state saves + crons → over 100. Fixed: (1) `deploy.yml` `paths-ignore`
  ALL runtime-state files (next-post/post-state/band-state/daily-band-state/
  milestone-state/post-copy/card-ar/recap-pending) — read at runtime / via raw, never
  from the deployed site; (2) band-watch only writes state on a real change, not the ts.
- **Keep it under control:** batch commits where practical (each code push = 1 deploy);
  only files the DEPLOYED SITE serves (src, api, scripts/bot via includeFiles, public
  assets, `history.json` which the site fetches client-side) need to trigger a deploy.
- The MCP GitHub integration is READ-ONLY for Actions (can't dispatch/rerun) — to force
  a deploy, push a commit touching a non-ignored file (or hit "Run workflow" in the UI).

## Card copy style — write tweet text like this (owner rules, 2026-06-27)
- **Structure: hero / (blank) / description / (blank) / closing.** Each card's `ct``…```
  template is **exactly 3 short lines** (single `\n` between them). `withFooter`
  doubles every `\n` into a blank line, so 3 template lines render as 3 airy
  paragraphs + the branded footer. Don't write 2-line or 4-line cards.
- **Hero leads with the current number/state**, not the explanation. e.g.
  "🌡️ SPX6900 is -4% from its 20-week moving average." NOT "Short-term risk: how
  far SPX is stretched from its 20-week MA, the line it reverts toward, red=hot…".
  The long-explanation-as-hero is the #1 mistake on new cards.
- **Concise. No wall text.** Owner: "wall text don't land well with users." Aim
  ~180–230 chars (the `xLen` test ceiling is 290 but that's a hard cap, not a target).
  Hero = the hook + number; description = one tight sentence; closing = a short
  takeaway ("A rhyme, not a forecast." / "Seasonality, not a forecast.").
- **@mentions: NEVER attach a possessive `'s` or any apostrophe/punctuation directly
  to an @handle.** X fails to parse `@100trillionUSD's` as a tag — the link breaks.
  Keep the handle followed by a SPACE or end-of-clause punctuation; prefer putting it
  at the end: "A homage to the Bitcoin RSI chart by @100trillionUSD." (✅) not
  "@100trillionUSD's Bitcoin RSI chart" (❌). Same for `@benjamincowen` (the `dcaladder`
  COWEN mention — say "@benjamincowen BTC risk strategy", not "@benjamincowen's").
- **Owner overrides win:** `public/post-copy.json` (control-panel edits) take
  precedence over the `ct``` template via `applyCopy`. If you reword a card, update
  BOTH the template AND any matching override key, and keep them in sync. Overrides
  must use **single `\n`** (withFooter doubles them — `\n\n` in an override → triple
  spacing). Token form: `{0}`,`{1}`… map to the template's interpolation order.

## How the bot picks a post
- Daily rotation is deterministic: `rota[epochDay % rota.length]` in
  `scripts/bot/posts.mjs` (`buildPost`). Weights still apply — `valuation` 3×,
  bullish posts 2×, rest 1× (`WEIGHT`/`BULLISH`) — so the post for any date is
  computable ahead of time and bullish topics recur more often.
- **ALTERNATING look order (owner, 2026-06-29): the feed must not spam the same
  green log-scale line day after day.** Every card has a visual `LOOK` family,
  split into two TIERS: **A** = the line-on-log "chart" looks (`rainbow`/`channel`/
  `ladder` target cards / `race` rebased lines / plain `trend` lines — they read
  alike) and **B** = the visually distinct "flavour" cards (heatmaps, bars, dial,
  donut, cube, scatter, colour/dual-axis charts). `rotation()` (1) spreads each
  tier's families EVENLY via a deficit round-robin (`spreadByFamily` — so the
  flagship rainbow and other low-count cards space out, not clump), then (2)
  `interleave()`s A and B Bresenham-style so a flavour card breaks up the green
  charts as often as the counts allow (B is ~39% of slots → runs of green ≤2, and
  even those differ in sub-family). To re-tune: edit the `LOOK` map / `A_FAMILIES`.
- Override a single run with `BOT_POST=<id>` (real) or `--post=<id>` (forces dry-run).
- Scheduled post: `.github/workflows/post-tweet.yml`, targets **08:00 America/New_York
  (Eastern — most of the audience)** year-round (changed 2026-06-26). GitHub cron is
  UTC-only with no DST, so TWO crons are registered (`0 12` = 08:00 EDT, `0 13` = 08:00
  EST) and a "Gate to 08:00 ET (DST-aware)" step lets only the offset matching the
  current EDT/EST state proceed (the other run no-ops; the once-per-day guard in
  post.mjs is a second backstop). GitHub schedules are still best-effort and fire
  late/drift by minutes — known limitation, left as-is per owner. To change the target
  timezone, swap the two UTC hours + the `want` offsets in the gate step.
- Cards render via `renderPostCard` (shared by the bot and `api/og.js`).
