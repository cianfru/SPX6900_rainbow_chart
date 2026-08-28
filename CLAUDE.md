# SPX6900 Rainbow Chart — project notes

## ⭐⭐ NORTH STAR — RADICAL TRANSPARENCY IS THE MOAT (owner affirmed 2026-07-19)
- **The strategy is to be COMPLETELY OPEN about the project.** Not secret alpha — the durable edge is being the
  transparent, SPX-native, REPRODUCIBLE on-chain analytics source. Every number must be checkable; methodology is
  published; the data suite, the article, the open approach ARE the competitive advantage (a reputation/focus moat
  that compounds, not a bag of secrets). Well-funded firms (Glassnode/Nansen) won't do this depth for a memecoin;
  influencers can't do it credibly (black-box composites). We can, openly — that's the whole game.
- **What would KILL it:** drifting into hype or an unverifiable "trust me" composite to juice engagement. The moment
  a number stops being reproducible we become just another account with an opinion. Honesty/openness = the moat, full
  stop. Every card/chart/article/decision defaults to: show the real numbers, state the method, label the caveats,
  share it freely. When in doubt, MORE transparent.

## 🔭 "DEEP FIELD" — MEMBERS AREA (renamed from "the Terminal" 2026-08-22; FREE CLOSED BETA now, paid later)
- **Owner decided (2026-08-22): rename the Terminal → "Deep Field"** (Bloomberg/ITC both use "Terminal"; needed to differentiate)
  and run a **FREE CLOSED BETA now** — invite ~10 trusted OG followers, gather feedback, add payment only once it's validated
  (NOT "wait for 1k followers", NOT "full paid launch now"). Rationale: the granular charts are built and idle; a free invite beta
  costs nothing, proves the granularity is valued, and avoids asking a 2-month-old / 360-follower account to charge before trust.
- **✅ SHIPPED — the Deep Field foundation:** `src/TerminalPage.jsx` renders as **"DEEP FIELD"** at **`/deepfield`** (`/terminal` kept
  as an alias; App.jsx route name stays `"terminal"` internally). **ONE members key** now unlocks EVERYTHING: `terminal-gate-key.js`
  holds `INVITE_HASHES` (FNV-1a of ~12 closed-beta invite codes) + the owner passphrase; `isValidAccess(fnv(pw))` gates, and on success
  the gate sets BOTH `TERMINAL_KEY` and `CITY_KEY` in localStorage — so one invite code opens the Deep Field page AND every `locked:true`
  chart (entities/clustercity/whaleswatching/whaleentry). **Plaintext codes are NOT committed** (repo is public — only the hashes are);
  the owner hands one to each OG. Revoke = delete a hash; re-lock all = bump the key suffix. A **"Deep Field · charts"** members menu
  (`DF_CHARTS`) at the top of the page links the granular set (When Whales Bought · Wallet Clusters · Cluster City · Whales Watching ·
  Cost Basis Terrain · Smart Money · SPX City). Public gallery still shows those charts as locked teasers.
  - **⚠ STILL A CURTAIN — fine for the FREE beta, MUST become a real wall before charging.** Data is public JSON via the raw proxy;
    codes are client-side. Before money: KV + magic-link + move the granular JSON behind an authed endpoint (the P2 plan below).
  - **✅ FRESHNESS + FLASHING EXTREMES (owner, 2026-08-22 — SPX pumped ~40%, funding hit ~112% APR, but the desk showed "stretched · 0%").**
    Three fixes: (1) **funding bug** — `valuation-check.mjs` showed `hlFunding × 100` (a per-hour rate → rounds to 0%); now ANNUALISED
    (`× 24 × 365 × 100`) so it reads the real **~112% APR** and ranks 100/100 stretched. (2) **NEW "20-week heat" gauge** (price vs its
    140-day average, % above/below) so "price is stretched" surfaces with a value. (3) **LIVE + FLASHING** — new `api/hl.js` proxies
    Hyperliquid `metaAndAssetCtxs` for CURRENT funding APR + OI (no CORS, ~60s cache), Deep Field pulls it every 90s, and a **flashing
    "⚠ heads-up · short-term overheated" banner** now sits at the TOP of the page: pills for each stretched gauge (pct≥85) + the live
    funding ("Traders paying ~118% APR to be long · LIVE"), with a plain combined caution. `.tmflash` keyframe (respects reduced-motion).
    So a funding spike surfaces immediately, not a day late. ⚠ the baked `conditions` (heat20 + APR funding) update on the next
    daily-snapshot cron; the live funding pill works now via `/api/spot?hl=1`. Banner threshold knob: pct≥85 / APR≥40 in TerminalPage.
  - **⚠⚠ DEPLOY-BREAK LESSON (2026-08-22): `api/hl.js` was a 13th serverless function → over Vercel HOBBY's 12-FUNCTION CAP → 3 failed
    deploys.** Fix: folded the live Hyperliquid read into `api/spot.js` under `?hl=1` and deleted `api/hl.js` (back to 12). **RULE: count
    `ls api/*.js` before adding a function — 12 is the ceiling; extend an existing endpoint with a query branch instead.** Also removed the
    flashing/pulse + "LIVE" badge from the banner (owner: "don't like it, make it consistent") — it's now a static, squared, mono alert
    like `.tmalert`; the `.tmflash` keyframe + `.tmbanner-live` are gone.
  - **✅ MENU RESTYLE (owner, 2026-08-22: "don't use generic icons; same fonts as the menu with a left-to-right typewriter on hover").**
    Dropped the emoji cards; the `DF_CHARTS` list now renders as `DFLink` rows in the SITE NAV STYLE — mono, uppercase, `_` cursor, and
    the name types itself out on hover via the shared `useHoverType` (chart-ui.jsx) with the `menubtn-t/g/y` ghost markup. CSS `.dfrow/
    .dfname/.dfdesc` in terminal.css (left-border accent + green on hover). No generic icons anywhere.
  - **🔲 NEXT (Deep Field), owner-flagged direction (2026-08-22):** it holds MORE than these 7 charts (also all the daily-tracked data),
    and reads a bit thin — build a **proper dropdown nav with per-chart SUBSECTIONS/leaves** (e.g. "When Whales Bought" has more than one
    view). Owner will drive the exact IA; keep the menu-typewriter style. Also Phase 2 = retheme the public locked tiles as "Deep Field ·
    request access".
    Phase 3 (only when charging) = authed endpoint + Stripe $2.99/mo (owner: monthly only, no annual — project young, uncertain).
  - **🔲 TO REVIEW LATER — gate the CITY/whale WALLETS behind login too (owner, 2026-08-25).** After un-walling SPX City + whales +
    spx-timeline back to fully PUBLIC (owner call — the city is a public showpiece + reach engine, its per-building Zerion cards open to
    all), the owner reflected that "putting wallets behind logged-in members is not a bad idea after all — leave it as is for now, revisit
    later." So: a FUTURE option is to move the per-wallet identity (whales addresses / Zerion cards / the city's clickable wallets / the
    Story card) behind the members wall too, leaving only the anonymized skyline public. Needs a proper discussion (reach vs. exclusivity
    trade-off) before doing it. Currently: entities (cluster linkage) + granular smart-money/whale-entry are members-only; everything else
    (incl. whales.json addresses + the city) is public. **The `data wall` machinery (fetchPrivate + strip-private-fields + KV push) already
    supports re-walling whales/spx-timeline by re-adding them to the strip/push list + flipping their loaders back to fetchPrivate.**

## 💳 "THE TERMINAL" — PAID TIER / FREEMIUM (design agreed 2026-08-17, owner travelling; BUILD PENDING — SUPERSEDED by Deep Field beta above)
- **First monetisation. Owner cautious (first time charging).** Structure DESIGNED, not built. Reconciled with the
  NORTH STAR by a hard rule: **wall DEPTH / CONVENIENCE / REAL-TIME / LABOUR, NEVER CHECKABILITY.** The composite,
  rainbow, methodology page, headline on-chain reads and the X cards stay FREE FOREVER — that's the moat + the
  marketing. The paywall is for going deep, not for seeing whether SPX is cheap.
- **PRICING (owner chose):** one paid tier, **$19.99/yr + $2.99/mo, 7-day free trial.** Monthly = the trust unlock for
  a young site; annual (~44% off vs monthly) = the value anchor; cheap on purpose so smallholders join, not just
  whales. Launch lever (undecided): a **founding-member** price — first ~100 at $9.99/yr locked, OR $49 lifetime.
- **FREE vs PAID split:** FREE = rainbow · valuation composite · methodology · headline reads (holders/MVRV/sip/HODL
  top-line) · daily X cards. PAID ("The Terminal") = the **daily synthesiser brief** (the flagship — "what's happening
  today", real daily labour; likely hero, pending final owner confirm) · Wallet Clusters + per-wallet drill-downs ·
  Smart Money detail · exchange-flow by wallet · the 3D cities (already gated) · alerts (band/whale/AEON) · CSV/API export.
- **AUTH — Stripe, NO WALLET (owner ruled out token-gating: MetaMask/Phantom connect is max friction + a 3-month-old
  site can't ask a stranger to sign in first, and it self-selects whales).** Plan: **Stripe Checkout + Customer Portal
  + magic-link email login** (passwordless). Stripe webhook → subscription status (reuse the KV/Upstash store or query
  Stripe on demand) → session cookie/JWT → authed endpoints verify it. **⚠ THE REAL WALL:** the granular JSON must move
  OUT of `public/` (and the public repo) behind an **authenticated Vercel endpoint** — today's gate is only a curtain.
- **✅ WALLET CLUSTERS GATED (cosmetic curtain, 2026-08-17):** `entities` chart marked `locked:true`; `App.jsx` wraps it
  in `CityGate` (defers child mount → `/entities.json` isn't even fetched until unlocked). Added a `blurb` prop to
  CityGate. **⚠ HONEST SCOPE — NOT real protection:** entities.json is still a public static file in a public repo, so
  this stops the casual majority + signals premium but a technical visitor can fetch the JSON directly. Copy is
  deliberately soft ("we think this one's a little too good to give away for free just yet") — NO "community/members"
  wording (there is no community yet). Real walling waits for the authed-endpoint work above.
- **DIVISION OF LABOUR (when we build):** OWNER (can't automate) = create the Stripe account + products/prices, a bare
  Terms/Refund/Privacy page. CLAUDE = magic-link auth + Stripe webhook + subscription check + move granular feeds behind
  the authed endpoint + the member Terminal page.
- **PHASES:** P0 cosmetic curtain (done) → P1 design (done, this) → P2 MVP end-to-end (Stripe checkout → email login →
  Wallet Clusters unlocked FOR REAL via authed endpoint) → P3 the Terminal page (daily synthesiser) + cities/feeds behind
  auth + alerts → P4 trial/founding-member/marketing. **🔲 OPEN before build:** confirm the hero (daily synthesiser vs
  "unlock all gated"), confirm the free/paid line, pick the founding-member option.
- **HONEST FLAGS:** this is community-support scale ($20/yr × N members ≈ low thousands), not a business — set
  expectations. Needs Terms/Refund/Privacy (Stripe basically requires it). Don't wall existing-free things retroactively
  in a way that angers current users — new paid stuff is ADDED value.

## Anomaly detector — "⚡ Notable today" (built 2026-07-03)
- `scripts/bot/signals.mjs` `detectSignals(history)` runs at the end of the snapshot cron (`scripts/snapshot.mjs`) and
  writes `public/signals.json` (committed by snapshot.yml, deploy-ignored, read by the control panel via raw). Scans
  daily on-chain snapshots for notable day-over-day changes — **break-even/profit cross**, **holder-count surge**
  (>2.2σ vs trailing 30d), **diamond-share jump**, **F&G extremes** — top 3 by severity. COMPLEMENTARY to band-watch
  (price/band) and milestone-watch (meme prices), which own those lanes.
- **HUMAN-IN-THE-LOOP by design — nothing auto-posts.** It surfaces candidates + an honest suggested **framing** + a
  **guardrail note** in the "⚡ Notable today" strip; owner reviews and one-click **queues** the mapped card, or ignores.
  Anomaly DETECTION is easy, INTERPRETATION is human — auto-posting risks misreading a spike, eroding the honesty moat.
- **⭐ Find the interesting TRUE angle — don't debunk (owner, 2026-07-03).** The detector surfaces events worth posting,
  NOT fact-checks them into a dry logbook. Every signal **LEADS with the honest hook** (`framing`) and uses the guardrail
  `note` only to fence the ONE thing you can't claim. Canonical case: a diamond jump — hook is *coins reach the diamond
  tier only by being HELD through everything, so an 8M jump = a cohort held through the drawdown and matured into the
  strongest tier* — POST THAT; the narrow guardrail is just "word it as HELD, not BOUGHT." (Holder-COUNT growth → safe
  to call accumulation outright — genuinely new wallets.) Honest AND interesting, both required. Only shows TODAY's signals.
- To add a signal type: add a block in signals.mjs returning `{type, severity, emoji, title, detail, framing, note, card}`
  (card = the post id the Queue button fires). Keep thresholds conservative — noise/false-positives cost credibility.
- **⭐ SHADOW-MODE LLM COPYWRITER (owner greenlit; OpenRouter).** Move the account from descriptive rotation cards toward
  event-driven "interesting TRUE angle" posts. `scripts/bot/llm-copy.mjs` `draftCopy(signal, opts)` feeds ONLY the
  detector's already-computed honest facts (title/detail/framing/note) to OpenRouter and returns house-style 3-line copy.
  **The LLM does LANGUAGE ONLY — never fetches or invents numbers** (honest numbers are the moat). Output is validated
  (`validateDraft`): ≤235 xLen, blocklist (hype/advice words), must contain a number, ~3 lines, no possessive-on-@handle.
  Fails soft to nothing rather than surfacing a bad draft. **SHADOW MODE — nothing auto-posts.** No key → labelled MOCK draft.
  - **⭐ FREE-MODEL CHAIN → RUNTIME DISCOVERY (owner chose "stay free"; churn fix 2026-07-06).** OpenRouter's `:free`
    endpoints throw pooled 429s AND CHURN (whole hardcoded chain died at once on 2026-07-06: 404 deleted / 404 moved-to-paid
    / 429). A static list rots. **Fix:** `resolveModelsAsync` DISCOVERS live free models at runtime from OpenRouter's public
    `/models` endpoint (no key), filters to text→text chat, orders by context length, tries them first — with `FREE_FALLBACKS`
    (nvidia-nemotron-3-super-120b · deepseek-v3 · llama-3.3-70b · gemma-3-27b) as seed/fallback anchors. Cached 10 min per warm
    lambda. Both `draftCopy` and `chat` use it. 401/403 stops early (bad key). Pin to skip discovery: `OPENROUTER_MODEL`
    (primary) or `OPENROUTER_MODELS` (whole chain). **NOTE: the control agent runs on VERCEL, so `OPENROUTER_API_KEY` must be
    set in VERCEL env (not just the GH Actions secret the snapshot cron uses) — they're separate.**
  - **⭐ SWITCHED TO A CHEAP PAID PRIMARY (owner opted in 2026-07-08).** "Stay free" too unreliable for a once-a-day draft
    (2026-07-08 the whole 8-model chain failed: 2 dead, 2 rate-limited, 2 reasoning-leak — Nemotron dumped `<think>` inline,
    2 empty). Fixes: (1) `callModel` (shadow `draftCopy`) now sends `reasoning:{effort:"low",exclude:true}` + `stripReasoning()`
    (inline `<think>` strip) + `max_tokens` 200→500 — it was MISSING the reasoning guard `chat()` already had. (2) **`PAID_PRIMARY`
    = `openai/gpt-4o-mini` LEADS the chain** (`resolveModels`), free seeds (nemotron-super, llama-3.3) + discovery stay as
    fallback. ~$0.15/$0.60 per M, 1 draft/day. Override via `OPENROUTER_MODEL`. Dead seeds deepseek-v3-0324 & gemma-3-27b DROPPED.
  - **⭐ ONLY THE TOP SIGNAL GETS A DRAFT (owner, 2026-07-08).** snapshot.mjs used to draft all 3 signals → 3 calls/day
    (the 429 cascade). Now drafts **`sig.signals[0]` only**; others show template framing.
  - **⭐ DAILY DRAFT REMOVED — ON-DEMAND ONLY (owner, 2026-07-13).** The snapshot cron NO LONGER calls OpenRouter at all
    (`draftCopy` + import dropped from snapshot.mjs); it just banks detector signals + template framing. **Zero LLM credits
    spent on the daily cron or on opening the control panel** (panel only READS signals.json + renders card images + the
    deterministic schedule — no LLM in the load path). Owner generates a draft on demand: each signal shows a **✨ Draft with
    AI** button that POSTs to **`api/agent.js` (`body.draftSignal` branch → `draftCopy`)**. No-key → labelled MOCK. The two
    LLM touchpoints left are BOTH click-to-run: ✨ Draft + Ask the agent. Offline-tested (`test/llm-copy.test.mjs`, injectable
    fetch). signals.json stays deploy-ignored, so drafts never trigger a Vercel deploy.
- **⭐ CONTROL-PANEL LLM "AGENT" ("ask the agent") — BUILT 2026-07-05.** A chat section in the control panel (`/control`
  daily view) connected to OpenRouter where the owner asks directly — *"what's notable today?"*, *"which card should I fire?"*,
  *"give me a draft for the best card"*. **`api/agent.js`** — password-gated (`CONTROL_PASSWORD`) POST endpoint. A browser LLM
  can't read the repo, so this ASSEMBLES context server-side: today's `computeStats` facts, the deterministic **rotation pick**
  (`buildPost(stats)`), the **full card catalog** (`buildAll(stats)` → `{id, hero}`), the **signals** (signals.json), and
  queue/last-posted state — all via raw. Answers grounded in REAL numbers only. **Actionable recommendations:** the system
  prompt tells the agent to append machine tags — `[[card:<id>]]` and optionally `[[draft]]…3 lines…[[/draft]]`. `parseAction`
  strips them and returns `{answer, card, draft, model, rotationPick}`; the UI renders a recommendation block with an editable
  draft textarea + Queue / Post-now / Save-as-copy / Copy buttons (Save-as-copy only for `EDITABLE` ct-cards). Reuses `chat()`
  in llm-copy.mjs (same key + fallback chain); `buildAll()`/`allIds()` in posts.mjs; vercel.json bundles `scripts/bot/**` +
  history.json into the function. Multi-turn: UI sends back a capped (~12-msg) history. Not streaming (one request/response
  with a "…thinking" placeholder). Future: expose "tools" (call rotation/stats live); add streaming if latency grates.

## ✅ DATA FRESHNESS AWARENESS — control panel + chart tags (owner asked 2026-07-19)
- Owner wanted visibility into WHEN each chart/card's data last updated, to spot staleness (some feeds daily-auto, some — the
  FIFO on-chain bundle — manual until BigQuery automation).
- **Control panel `#fresh` strip** (`public/control.html`, `FRESH_SOURCES`/`loadFreshness`/`renderFreshness`, called
  non-blocking in `refresh()`): a "🗂 Data freshness" section listing each source with a status dot, last-updated date +
  "N days ago", and cadence. **Colour logic: green = current; RED = a DAILY source that missed its window (snapshot cron
  didn't run — action needed); AMBER = a MANUAL source (onchain/urpd) getting old (expected to lag, re-run the BigQuery
  extract).** Reads raw JSON dates via raw.githubusercontent (same `raw()` helper). Header summarises "all current" / "N need
  a refresh".
- **Site chart tag** (`src/freshness.js` + `src/ChartFreshness.jsx`, mounted in App.jsx chart-page header): a small "● data
  as of <date> · today/N days ago · manual" pill on charts backed by a runtime JSON file. `CHART_SOURCE` maps chart id →
  source (onchain/urpd/chainwallets/btcmvrv/snapshot); price-derived charts aren't listed → no tag (always live). Same
  green/amber/red logic.
- **Sources tracked + cadence + stale window:** history.json (daily, 2d), chain-wallets.json (daily, 2d), signals.json
  (daily, 2d), longshort.json (daily, 3d), onchain.json (manual, 35d), urpd.json (manual, 35d), btc-mvrv.json (monthly, 40d).
  To add a source: add to `FRESH_SOURCES` (panel) and/or `SOURCES`+`CHART_SOURCE` (site). Both derive the date from the file
  itself (last array `.d`/`.date` or object `.updated`).

## ⭐ PROJECT AEON NFT TRACKING — greenlit, planned (owner, 2026-07-19)
- NFT-focused analytics track for the **Project Aeon** collection, mirroring the coin (floor, holders, HODL waves,
  concentration). HODL/holder-age is CLEANER for NFTs than the coin: each tokenId is a discrete unit with ONE owner + ONE
  last-transfer timestamp → "holder age" = now − last transfer per token, NO FIFO/lots/intra-block ordering.
- **Metric map (coin → NFT):** Floor price + history ← Reservoir/OpenSea, daily. Owners over time + owners-vs-floor ← distinct
  current owners. HODL waves / holder age (stacked) ← per-token time-since-last-transfer. Concentration (top-N share) +
  distribution donut ← ownership snapshot. Sales volume (bars) ← marketplace daily volume. Optional: realized floor / cost
  basis (MVRV-like), floor-by-trait / rarity.
- **✅ KICKED OFF 2026-07-23 — address + chain confirmed.** Collection = **Project AEON**, ERC-721 on **Ethereum mainnet**,
  contract **`0xc374a204334d4Edd4C6a62f0867C752d65E9579c`**, **3,333 supply**. **Data decision: for a small collection, pull
  the WHOLE transfer history each refresh (a few thousand rows), no archive/incremental complexity.** Two transfer queries:
  **`dune/aeon_transfers.sql`** (primary — `erc721_ethereum.evt_Transfer`) + **`bigquery/aeon_transfers.sql`** (FREE fallback —
  decodes ERC-721 Transfer from `crypto_ethereum.logs` via hexToInt UDF + ARRAY_LENGTH(topics)=4 to exclude ERC-20). Both
  output `from_address,to_address,token_id,time`.
- **✅✅ RESOLVED 2026-08-20 — see the "AEON MOVED TO ALCHEMY" entry just below; the 🔴 block here is kept for the diagnosis history.**
- **🔴 AEON SALES/TRANSFERS FEED STALLED SINCE ~2026-07-23 — the Dune refresh is failing (found 2026-08-19 via CI logs).**
  Owner reported real AEON sales that the site wasn't showing. CI truth from `aeon.yml` run 2026-08-19: **`aeon-dune: refresh
  failed (using last committed CSVs) — timed out (last state QUERY_STATE_PENDING)`** — `build-aeon-dune-refresh.mjs` polls 120×3.5s
  (~7 min) and the Dune query never leaves PENDING, so it falls back to the frozen `dune/out/aeon_{sales,transfers}.csv` (last row
  2026-07-23). On days it DOES complete it returns no rows past 2026-07-23, so **both transfers AND sales have been frozen ~4 weeks**
  (holder-age/concentration/MVRV/trader-P&L/sales all stale). Separately, **`aeon-listings: auth 401 — check OPENSEA_KEY`** → listings
  frozen too. **⚠ The heartbeat `aeon-dune-status.json` only trips on a THROWN error, so a completed-but-empty day still stamps
  `ok:true` — which masked the stall.** ⚠ Claude CANNOT run Dune/OpenSea from the sandbox, so this needs the owner.
  - **✅ HONESTY FIX SHIPPED (2026-08-19):** the /terminal AEON section now compares the sales data's as-of date to today — if it hasn't
    advanced in >3 days it shows Sales = "—" with "⚠ sales feed stalled — no new data since <date>", and the freshness footer flags
    `aeonSales` stale. Floor (ETH via Alchemy · SPX derived from the live floor) stays current. NEVER present the frozen CSV as "0 sales today".
  - **🔲 OWNER ACTIONS to restore the feed:** (1) renew/replace `OPENSEA_KEY` (401). (2) open Dune queries **8218959 (sales)** +
    **8218956 (transfers)**, run them manually for AEON since 2026-07-23 — determine whether they TIME OUT (too heavy for the free/
    community engine → the `getNFTSales`-style Seaport-decode may need optimising or a lighter incremental) or COMPLETE EMPTY (the
    source table/marketplace decoding stopped capturing AEON trades → query needs fixing). Then the daily banker resumes on its own.
  - **🔲 CLAUDE FOLLOW-UP (offered):** make the heartbeat/audit catch "completed-but-frozen" (compare newest DATA date to today, not just
    catch thrown errors) so a future stall surfaces in feed-health.json/the control panel without waiting for a person to notice.
- **✅✅ AEON MOVED TO ALCHEMY — STALL FULLY RESOLVED (2026-08-20). Transfers off Dune for good; sales unjammed; gap 07-23→today filled.**
  - **⭐ THE REAL ROOT CAUSE (corrects the 🔴 block's "account suspended" guess).** The pipeline's own Dune account was NOT suspended
    (that was the SEPARATE Dune MCP key — `getUsage` showed `suspended_account`, which I wrongly extended to the pipeline). The actual
    freeze: `build-aeon-dune-refresh.mjs` pulled **transfers FIRST, then sales, in one run**; the heavy `erc721_ethereum.evt_Transfer`
    transfers query kept timing out at `QUERY_STATE_PENDING`, threw, and **killed the run before the sales pull ever executed** — so sales
    were collateral damage, not independently broken. Splitting transfers off (to Alchemy) let the lightweight sales query finish in ~5s.
    One fix healed both halves. **LESSON: when two pulls share a script and the first is heavy/flaky, its timeout starves the second —
    split independent feeds into independent steps.**
  - **⭐ TRANSFERS NOW COME FROM ALCHEMY — `scripts/build-aeon-transfers-alchemy.mjs` (NEW).** `alchemy_getAssetTransfers` (category
    erc721, contractAddresses=[AEON], order asc, withMetadata, maxCount 0x3e8, pageKey paginate — the same pattern as
    `build-base-alchemy.mjs`) writes the EXACT CSV the reconstructions already read (`from_address,to_address,token_id,time`, ISO ts,
    tokenId hex→decimal) to `dune/out/aeon_transfers.csv`. So `build-aeon-onchain.mjs` + `build-city-timeline.mjs` are UNTOUCHED — same
    interface, new producer. **FULL-history pull each run (~26 pages / ~25k rows, ~12s)** — no archive/merge complexity, on-brand with
    AEON's "pull the whole small collection each refresh" decision. **SOFT-FAILS + NEVER TRUNCATES** (refuses to shrink the committed
    archive on a partial pull; 3,333 mint floor). Pure core (`tokenIdToDecimal`/`normalizeTransfer`/`transfersToCsv`) unit-tested
    (`test/aeon-transfers-alchemy.test.mjs`). ⭐ Because it re-pulls mint→now every run, **the transfer-derived charts (holder age /
    concentration / holder flow / owners-over-time / timeline / skyline) are STRUCTURALLY gap-proof** — a frozen middle is impossible.
  - **⭐ SALES STAY ON DUNE, but SALES-ONLY.** `aeon.yml` now runs the Alchemy transfers step, then `build-aeon-dune-refresh.mjs`
    (retired the `--only` flag — the script is sales-only; the header, heartbeat and dead `AEON_TRANSFERS_QUERY_ID` var were removed and
    `dune/aeon_transfers.sql` DELETED, since `build-aeon-transfers-alchemy.mjs` + `bigquery/aeon_transfers.sql` cover transfers). Sales
    feed trader P&L / MVRV / realized price — the one thing Alchemy can't reconstruct historically (`getNFTSales` is a recent window +
    deprecates 2026-09-30). **BigQuery-for-sales is NOT set up and NOT worth building while Dune-sales works** — `onchain-bigquery.yml`
    has never run (0 runs), `GCP_SA_KEY` is unset, and there is no `bigquery/aeon_sales.sql` (a marketplace decoder = real work). Only
    build it if Dune-sales breaks again or to kill Dune on principle.
  - **⭐ FRESHNESS HEARTBEAT FIXED (was the "control panel says 2 days, chart says July" bug).** `aeon-dune-status.json` stamped the RUN
    date on any non-throwing pull, so a completed-but-empty pull looked fresh. Now `updated` = the **newest SALES DATA date in the CSV**
    (`checked` keeps the run date); `build-ens`-style masking gone. The control panel gained a second row so both halves show honestly:
    "AEON · sales (Dune)" + "AEON · holder analytics (transfers via Alchemy)". `audit-feeds` already reads each file's internal date, so
    it was honest for onchain/sales; only the run-stamped heartbeat + market/timeline could mask (heartbeat now fixed).
  - **✅ OPENSEA KEY RESTORED (2026-08-20).** New `OPENSEA_KEY` set → `build-aeon-listings.mjs` returns 67 genuine listings (401 gone);
    deal-finder + fire-sale inputs live again.
  - **✅ WATCHERS: kill-switched then RE-ENABLED.** During the outage a kill-switch forced `DRY_RUN:'1'` on all three
    `aeon-sale-watch.yml` watchers (notable-sale/firesale/sweep). Re-enabled 2026-08-20 (restored the `vars.AEON_SALE_DRY_RUN` toggle)
    once all feeds were verified. ⚠ Known non-blocker: the Alchemy live-sales accelerator (`getNFTSales`) returns 0 on a block-range quirk,
    so the notable-sale watcher falls back to the DAILY Dune sales (day-latency, within the 3-day window) — sub-day sale alerts are not active.
  - **✅ ens.json PERSISTS NOW.** `build-ens` rewrote `public/ens.json` (skyline wallet labels) every run but `aeon.yml`'s commit step
    never staged it, so resolved names were thrown away daily and the audit flagged it stale. The commit step now stages `public/ens.json`.
  - **✅ GAP 07-23→today FILLED, verified on committed data.** onchain weekly series continuous (…07-20·07-27·08-03·08-10·08-17·08-24…);
    sales backfilled 21 sale-days across 07-23→08-20 (17,040→17,105 rows). Charts fresh; owners 1178. Verified live via dispatched
    `aeon.yml` + `aeon-sale-watch.yml` (dry-run) runs, both green, deploy succeeded. **KEPT as reference/tooling (not dead):**
    `bigquery/aeon_transfers.sql`, `dune/aeon_spx_balances.sql` + `gen-aeon-spx-query.mjs`, `scripts/aeon-snipe.mjs`, `aeon-live-tail.mjs`.
- **⚠ ALCHEMY NFT API DEPRECATIONS — DUE 2026-09-30 (owner forwarded the notice 2026-08-19). AUDIT DONE: only `getNFTSales`
  affects us; nothing breaks, latency degrades.** Alchemy is removing a set of redundant NFT endpoints (V2+V3) on 2026-09-30.
  Grepped every endpoint we call:
  - **SAFE / not on the list:** `getFloorPrice`, `getOwnersForContract`, `getNFTMetadata` (build-aeon.mjs, aeon-sale-card.mjs).
    `getContractMetadata` is IN the notice only as the RECOMMENDED replacement — we already use it, so no change.
  - **We do NOT use any of the removed ones** (getCollectionsForOwner, getCollectionMetadata, isHolderOfContract, getSpamContracts,
    searchContractMetadata, summarizeNFTAttributes, computeRarity, invalidateContract, isAirdrop) — our rarity is computed LOCALLY.
  - **⚠ THE ONE HIT: `getNFTSales`** (`scripts/bot/aeon-live-sales.mjs`, `build-aeon-live-bank.mjs`, used by `aeon-sale-watch.mjs`).
    It has **no direct replacement**. BUT it is only the LOW-LATENCY accelerator — the sale watcher already tries it and falls
    back to `market.recentSales` (the **daily Dune sales pipeline**, `dune/aeon_sales.sql` → build-aeon-sales.mjs) on ANY failure,
    and build-aeon-live-bank soft-skips. **So on 2026-09-30 the 404 is caught → we fall back to the Dune daily pull. Impact =
    sub-day → ~1-day latency on notable-sale posts (the 3-day freshness window already covers this), NOT breakage.**
  - **🔲 OWNER DECISION before Sep 30 (parked, low urgency):** (a) accept ~1-day latency (zero work — the graceful path), or
    (b) rebuild a true low-latency sales feed by decoding Seaport `OrderFulfilled` logs via `eth_getLogs` + `alchemy_getAssetTransfers`
    (what Dune already does, but live). Recommendation: (a) unless sub-day AEON sale posts become important. No code change needed now.
- **✅✅ AEON SUITE BUILT 2026-07-24 — a full "OpenSea/Blur on steroids" track (its OWN site tab + control-panel tab).**
  Reservoir SHUT DOWN 2025-10 → **Alchemy** is the floor/owners/metadata source (secret `ALCHEMY_KEY`). Pipeline (all
  keyless/cheap except listings): **`build-aeon.mjs`** (daily Alchemy floor/owners/supply → `aeon.json`+`aeon-history.json`),
  **`build-aeon-onchain.mjs`** (transfer reconstruction from `dune/out/aeon_transfers.csv` → `aeon-onchain.json`:
  owners/HODL-age/concentration/holder-flow/per-wallet holders top-500; `--spx=` joins per-wallet SPX balances),
  **`build-aeon-sales.mjs`** (`dune/aeon_sales.sql` → `aeon-sales.json` floor+volume ETH/USD), **`build-aeon-rarity.mjs`**
  (Alchemy metadata → `aeon-rarity.json`, 3,333 tokens, 11 trait types, statistical rarity), **`build-aeon-listings.mjs`**
  (OpenSea active listings × rarity → `aeon-listings.json`). `.github/workflows/aeon.yml` runs floor+rarity(once)+listings
  daily. Raw extracts kept in `dune/out/` as provenance. SPX balance query = **`dune/aeon_spx_balances.sql`** (generated by
  `gen-aeon-spx-query.mjs`, embeds all 1,172 holders, cheap evt_Transfer net-flow — NOT balances_daily which TIMED OUT).
  **Site charts (Project Aeon tab, `AEON_GROUPS`):** Floor&Sales · **Holder Skyline (3D, three.js — towers = AEON+SPX×duration,
  hover→wallet, click→Zerion; up to 500 wallets, toggles)** · Rarity lookup · **Rarity-vs-Price deal finder** · AEON-floor-vs-SPX ·
  Holder Age · Owners · Concentration · Holder Flow. **Cards (1:1, via `/api/og?aeon=<id>`):** skyline + floor/hodl/owners/
  concentration/behaviour — shown in the control panel's **🌌 Project Aeon tab** (for MANUAL posting).
  **🔲 OWNER PENDING (deal-finder is the ONLY thing waiting on data):** get an **OpenSea API key** → repo secret `OPENSEA_KEY`
  (or swap to Magic Eden EVM API) → dispatch the Aeon banker; the Rarity-vs-Price chart flips from empty to live deals.
- **✅ DECIDED 2026-07-25 — ONE ACCOUNT, NO SEPARATE AEON HANDLE (owner call). Do NOT relitigate or add a cadence cap.**
  Everything posts from @SPX6900Rainbow. Two facts settled it: (1) **the verified long-form is load-bearing** — the AEON sale
  post is 331 chars and an unverified account caps at 280, and `spxcohort`(700)/`cexflow`(600)/`hodlcompare`(340) are over too,
  so a second handle would strip the honest-methodology tails that ARE the moat; (2) a dedicated account has a ceiling of
  ~1,173 people (total AEON owners), and likes↔impressions r=0.94 → reach IS follower count, so structurally low-reach
  permanently. Owner **declined a lane cap**: `aeonsale` keeps its 1/day budget. **The honest bridge for an SPX audience: 346
  of 1,173 AEON holders (29%) also hold SPX, and AEON's weekly returns correlate 0.53-0.57 with SPX** — so the Holder Skyline
  and AEON-vs-SPX charts are genuinely SPX content. To refresh on-chain: re-run the free BigQuery/Dune transfers extract →
  `build-aeon-onchain.mjs`.
  **RARITY MODEL BACKLOG:** floor-by-rarity, a rarity tweet card, per-token last-sale-vs-rarity.
- **✅✅ AEON VALUATION CORRECTED 2026-07-24 — the deal finder was advertising fake bargains.** Four linked fixes:
  - **JOKE LISTINGS STRIPPED.** One ask sat at 1,000,000,000 Ξ; others at 69/690/6900/69000/2222 (meme prices that can never
    sell). `build-aeon-listings.mjs` keeps asks within **25× the cheapest listing** (real asks stop at 10Ξ, joke tier starts
    at 69Ξ). 60 of 71 kept; excluded count disclosed, never silently dropped.
  - **⭐ FAIR VALUE FITS ON SALES, NEVER ON ASKS (the core bug).** The chart fitted "fair value" on the asking prices it was
    plotting — circular. Now: `fair(rank,t) = market level at t × rarity factor`, the rarity factor fitted on **17,040 realized
    sales with the market trend divided out** (rolling median level; a static 180d fit scored old sales as steals purely for
    being old). Emitted as `fairModel {a,b,r2,n,level,method}`. **LESSON: never fit a benchmark on the same quantity you're judging.**
  - **⚠ RARITY IS A WEAK PRICE DRIVER HERE — publish that, don't hide it.** R²=**0.05**; slope wanders 1.3–2.4× by window. Left
    at **1.90×** rarest-vs-commonest (vs the ask-fit's fake 2.9×); `r2`/`n` published. Chart retitled "Live Listings vs What
    They Sell For". Honest result: **0 of 60 listings below market**.
  - **⭐⭐ SPX IS THE RIGHT DENOMINATOR (owner's call, right).** AEON weekly returns correlate **0.53–0.57 with SPX** vs 0.36
    with ETH → **SPX explains ~28% of AEON's variance vs rarity's 5%** (~5× better). `spxValue` in aeon-market.json carries
    `saleSeries` (weekly median sale in SPX) + `floorSeries` (daily 7d-median floor in SPX); `src/aeon-spx-value.js` owns the
    math (ladderOf/percentileOf/zStats). Both the listings chart and `AeonVsSpxChart` read them so they can't drift.
  - **⭐ BASELINE IS TRAILING, NOT FLAT FULL-HISTORY (owner caught this too).** AEON-in-SPX fell structurally from ~45,800 SPX
    (late 2023) to ~2,100 now — because SPX ran ~130×, not because AEON dropped. Full-history median compares to a regime that
    can't recur AND flatters (floor read 59th pct all-history vs 88th since Oct-24 vs 98th last-12m). Now: trailing 12-month
    median baseline, σ on deviations FROM it (curved, regime-tracking) → reads **EXPENSIVE, +45% vs baseline, 93rd pct**.
    `WINDOW_DAYS = 365` is the one knob. **LESSON: never average across a structural regime change — both errors flattered.**
- **✅ RARITY CURVE REBUILT ON CANVAS 2026-07-24 (owner: "useless… show every NFT when hovering").** Old chart drew a 240-point
  downsampled line. Now all **3,333 tokens** plotted, coloured by tier, hover shows the art + id + tier + rank, click pins it.
  **`src/AeonRarityCloud.jsx` = CANVAS, not recharts** — the SVG version was **18s to first paint, ~1s/hover** (3,333 DOM nodes
  + recharts rescanning on mousemove). Canvas = one node, hit-testing via per-pixel-column buckets. **Rank on a LOG axis**
  (statistical rarity is heavy-tailed). **Any future 1k+ point scatter in this repo should start from this component, not recharts.**
- **⭐⭐ POST LANES REPLACED THE GLOBAL ONE-PER-DAY GATE 2026-07-24 (owner: "two things should fire in a timely manner").**
  `post-state.json` used to carry a single `lastPostedDate`, and band-watch/milestone-watch each OVERWROTE the whole file — so
  a real event waited for tomorrow, and the overwrite wiped the `recent` log. Now each publisher owns a **LANE** (`daily`/`band`/
  `milestone`/`aeonsale`) with its own once-a-day budget, recorded by MERGING into post-state (`lanePostedToday`/`recordLanePost`
  in posts.mjs). Lanes fire independently; none can spam. `lastPostedDate` keeps its old meaning (the daily rotation posted
  today) because band-watch reads it. **To add a publisher: pick a lane name, gate on `lanePostedToday(lane)`, call
  `recordLanePost(lane, id)` — never write post-state directly.**
  - **⚠⚠ THE DAILY ROTATION ITSELF WAS CLOBBERING THE LANES — fixed 2026-08-16 (owner: "the bot is firing non stop").**
    `post.mjs` wrote post-state as a FRESH `{lastPostedDate,lastId,recent}` object, DROPPING the `lanes` map — so every daily
    post wiped every event lane's gate, re-opening aeonsale/aeonsweep/firesale to fire AGAIN (and with the reverting-floor steal
    bug always having a candidate, the hourly AEON watcher re-fired). Fix: post.mjs RE-READS the freshest post-state and MERGES
    (`{...cur, lastPostedDate, lastId, recent}`) so `lanes`/`lastEventId` survive. **THE RULE — "never write post-state directly"
    — extends to the daily rotation too; the only correct writers are `recordLanePost` (merges) and the spread-merge in post.mjs.**
    Incident response: a KILL-SWITCH forced all three AEON event watchers in `aeon-sale-watch.yml` to `DRY_RUN: '1'`; re-enable
    only once BOTH this lane fix AND the clearing-level steal fix are live in committed `aeon-market.json` and verified.
- **✅ NOTABLE-SALE EVENT POST BUILT 2026-07-24.** `scripts/bot/aeon-sale-watch.mjs` + `aeon-sale-card.mjs` — posts a fresh
  notable AEON sale showing the piece, what it fetched, how that compares to what its rarity trades at, plus rarest traits.
  Notable = a **steal** (≥20% under rarity's going rate) OR a **rare piece** (rank ≤150) trading OR a **big sale** (≥2× market
  level); steal > rare > big. Posted token/date pairs remembered in `public/aeon-sale-state.json` (deploy-ignored). **The card
  embeds art as a DATA URI — resvg does NOT resolve remote hrefs**, so `<image href="https://…">` renders as nothing; failed
  fetch → placeholder, never a failed post. Runs in aeon.yml after the market rebuild, `continue-on-error`. Repo var
  `AEON_SALE_DRY_RUN=1` watches without posting. **🔲 LATENCY:** detection rides the DAILY Dune pull, so a sale can be ~a day old
  (3-day freshness covers it). Sub-day would need a live feed (Alchemy `getNFTSales`, key set) — NOT wired (can't validate from sandbox).
  - **✅ REVERTING-FLOOR FALSE-POSITIVE FIXED 2026-08-16 (bot was firing ~1/day on ordinary common sales).** After a July
    16-piece sweep doubled the floor on a thin market, the floor spent ~3 weeks reverting to ~0.48Ξ — and the steal test measured
    `disc` against `levelNow`, a ±30-day median that still averaged in the pump sales (0.70Ξ) → EVERY ordinary sale at the new
    floor read 22–34% "under typical" → 12 of the last 20 fired as fake steals. **Root cause: a market-wide repricing read as a
    field of individual deals.** Fix, both in `build-aeon-market.mjs`/`aeon-sale-watch.mjs`: (1) **`clearingLevel(sorted, K=14)`**
    — `levelNow` (and `fairModel.level`) is now COUNT-based: median of the last **14 DISTINCT BUYERS'** prices, **deduped by
    buyer so a single sweep can't set the market price**. The rarity FIT still uses the per-sale time level (scatter unchanged);
    only "how cheap TODAY" moves. (2) **Correction guard** — the builder emits `floorTrend`; `pickNotable` raises the steal bar
    while the floor falls fast (`stealDisc = 0.20 + min(0.14, max(0, −trend − 0.10))`), settling to 20% once stable. Verified:
    clearing 0.503 vs lagging 0.70, trend −22% → 12 false steals → 0, a genuine 44%-under steal still fires. **LESSON for any
    "cheap vs typical" surface: anchor on the CURRENT clearing price (count-based, buyer-deduped), never a time-window median —
    and treat a fast one-directional floor move as a regime, not a stream of signals.**
  - **✅✅ REDESIGN — CALIBRATED CADENCE + SPX REGIME (owner brainstorm 2026-08-16: "fire ~once a week; the real problem is a
    real market price, not the 20/40% number").** Threshold-tuning was the wrong lever. Backtested the full 4,079-ETH-sale log:
    OLD fixed-20%-vs-lagging = 1.53 posts/wk; NEW = **~0.8/wk** with a healthy steal/rare/big MIX and **0 fires through the July
    pump+reversion window**. Two pieces, live: (1) **`stealBar` — self-calibrating to cadence, not a fixed %.** `build-aeon-market.mjs`
    emits it = the discount (vs the clearing level at each sale's own time) that ~1 day in 7 clears over trailing 60 days, floored
    at 15%. The watcher reads `market.stealBar` (falls back to 20% pre-rebuild). (2) **`spxStretch` — the SPX regime reference
    (owner's key insight).** On a thin market one $28k buyer IS the market for a day — the only way to see through it is to price
    AEON in a STABLE denominator (SPX) and watch it revert. `spxStretch` = current AEON-in-SPX vs its trailing-120d median; >0 =
    overvalued/reverting → `pickNotable` raises the steal bar; `max()`-combined with `floorTrend`. Cadence caps: 4-day STEAL
    cooldown + **3-day GLOBAL min-gap between any notable-sale post** (`GLOBAL_GAP`). Rare/big have no cooldown. Dials:
    `TARGET`/`CAL` in stealBar, `GLOBAL_GAP`/`STEAL_COOLDOWN` in the watcher. **🔲 POST (owner wants it): "how one $28k buyer
    broke a whole NFT floor" — AEON floor in ETH (unreadable spike) next to AEON-in-SPX (spike + clean reversion), the honest
    illiquidity/microstructure story + why you price against something stable.**
- **✅✅ AEON "STEROIDS" — MARKET + TRADER INTELLIGENCE BUILT 2026-07-24 (all KEYLESS, from raw sales+transfers).** Two engines
  off `dune/out/aeon_sales.csv` + `aeon_transfers.csv` + rarity + live floor, daily in aeon.yml: **`build-aeon-market.mjs`** →
  `aeon-market.json` (NFT **MVRV** = floor÷realized ≈ 1.01×, realized 0.42Ξ, **supply-in-profit 62%** of priced-held, **URPD**
  cost-basis histogram, recent-fit fair-value model + rarity-vs-sale scatter + **deals** (steals >20% under fair), **biggest
  sales** #1798→20Ξ, **trait premiums**) · **`build-aeon-traders.mjs`** → `aeon-traders.json` (per-wallet **realized P&L** by
  matching each token's buy↔sell chain — top +39Ξ / 98% win, 976Ξ net across 2,994 traders). Realized P&L counts ROUND-TRIPS
  ONLY (mint cost + free transfers unknown → excluded = honest "trading P&L"). Site charts: **Trader Leaderboard · MVRV &
  Supply-in-Profit · Rarity vs Sale Price · Trait Values**. Tab is now ~13 charts. **🔲 NEEDS THOUGHT (owner parked):** a
  **Trait Explorer** (browse-by-trait gallery) + a **Cross-holder value board** (the 346 AEON+SPX dual-holders ranked by combined value).

## 🏙 AEON CITY / WHALE CITY — the 3D holder cities (built 2026-07-27, IN DEVELOPMENT, gated)
- Two pages, ONE shared engine (`src/Skyline3D.jsx`): **Aeon City** (`?chart=aeonskyline`, AEON holders) and **Whale City**
  (`?chart=whalewatch`, biggest SPX wallets from `public/whales.json`). Every wallet is a BUILDING on real Manhattan geometry —
  height = size × holding time (√ scale), colour warm (new) → cyan (long-held), the WHOLE building lights **green when the wallet
  added / red when it reduced** over the window. Archetypes (townhouse → condo → tower → skyscraper → spired landmark) so scale
  reads from the silhouette. City/Skyline toggle; "Where do you live?" search places ANY address by hash.
- **Geometry is real**: `src/nyc-geo.js` (baked OSM outlines) + `src/city-map.js` (weighted neighbourhoods, lots clipped to
  coastline, co-prime-stride placement). ⚠ Two traps: Nominatim "Manhattan" returns the ADMIN boundary (extends into rivers) —
  use the natural feature "Manhattan Island"; and RDP simplification degenerates on a CLOSED ring (first==last ⇒ zero-length
  baseline) — split at the farthest point first.
- **✅✅ REALISM PASS 2026-07-27 (owner: improve colors/building quality). MEASURE FIRST — it changed the answer.**
  `window.__cityStats()` showed **6,836 draw calls to push 14,908 triangles** — ~2 tris/call. Cause: every box carried a
  **6-material array** and three.js emits one draw call per material group. The city was CPU-bound on state changes, GPU idle.
  - **❌ DOWNLOADED HI-DEF MODELS ARE THE WRONG TOOL (measured):** one hi-def building is 50k–500k tris = 3–30× the whole city;
    they can't stretch (heights come from holdings) and are 2–20MB each. **Where such a site DOES pay: an HDRI env map, CC0
    façade/roof textures, and 3–5 hero landmark models for the top wallets only.**
  - **THE FIX = MERGING → `src/city-render.js`** (shared by both cities + the lab so they can't drift). Walls and roofs are
    SEPARATE single-material geometries (`wallGeometry` = 4 side quads, `roofGeometry` = a lid), so hundreds of buildings merge
    into ONE mesh per **(family × age × flow)** bucket via `mergeGeometries`. **Per-building floor counts survive because the
    window pattern is UV SCALE, not a per-building texture.** **Result: 6,836 → 85 draw calls with 7× the geometry (109,444 tris).**
  - **⭐⭐ HEIGHT IS MOSTLY LOG, AND HAS A FLOOR (owner, 2026-07-28: "small condos should be higher"; was worse than it looked).**
    Height was `sqrt(score/maxScore) * HMAX` — against a 0.92 footprint the MEDIAN resident was 0.62 units (wider than tall),
    78% of the city under two units. A sqrt can't compress a power law spanning ~2,800×. **Fix = `heightOf()` in `city-render.js`
    (shared by building geometry AND district labels): `HMIN + (HMAX-HMIN) × (0.50·lognorm + 0.50·sqrt)`, HMIN 1.0 / HMAX 21.**
    Log for the power law; root half mixed back so PURE log doesn't flatten the top. HMIN not decoration (smallest resident
    cleared 5,000 tokens held 90+ days; nothing in Manhattan is one storey). **Ordering stays exact** (honesty rail); caption
    says "mostly-logarithmic… the ranking is exact, the spacing is compressed".
    - **⚠⚠ THE SECOND MISTAKE / MORE USEFUL LESSON: 0.70·log / HMIN 1.6 OVERSHOT into "too busy" — a UNIFORM city is just as
      unreadable.** At 0.70/1.6, p50 6.5 / p95 12.9 — everything tall, so nothing read tall. **Measure the INTERQUARTILE RANGE,
      not the median.** IQR barely moves across curves (2.6→2.1 from 0.70·log to 0.40·log) because **the uniformity is IN THE
      DATA** — Manhattan's middle half holds within a narrow band. Curve tuning can NEVER spread the middle; **contrast has to
      come from peaks standing clear of a LOW mass**, so the fix was lowering the mass (p50 6.5→4.9, boroughs 3.2→2.4). If more
      silhouette variety is wanted, vary FOOTPRINT/setbacks by wallet hash (footprint encodes nothing = free); **height encodes
      the data and must not be jittered.**
    - **⚠ ARCHETYPE THRESHOLDS ARE CALIBRATED TO THE CURVE — retune them TOGETHER, never one alone.** Old 1.8/4/9 on the log
      curve made every building glass. Now **3.5 / 6 / 11** → Manhattan 5% glass towers · 24% concrete mid-rise · 71% masonry,
      boroughs 97% low-rise ZERO towers. That tall-island/low-borough split falls out of the DATA (Manhattan takes the top 1,693
      by conviction rank), not a per-district rule. The warm brick mass gives the eye somewhere to rest — load-bearing.
    - **Slenderness is the sanity check:** aspect ratio = `h / 0.92`. Real supertalls ~24:1 (HMAX 21 ⇒ 22.8:1); old median
      0.67:1, now ~3.1:1. `test/city-height.test.mjs` pins monotonicity, range, "no building wider than tall", median ≥ 2.5:1
      (below live 3.1 to guard the sqrt regression), all four families occur, and degenerate inputs return a number (a NaN
      poisons a merged bucket). Draw calls unaffected (82 at 4,893 buildings).
  - **⭐⭐ TOWERS NEED ROOM — CLEARANCE IS A PLACEMENT RULE, NEVER A HEIGHT RULE (owner, 2026-07-28: "buildings south of central
    park all bonded together").** Dense districts filled from the core outward in CONVICTION ORDER, so ranks 1,2,3… took adjacent
    innermost lots — the tallest buildings were neighbours by construction, merging into one dark slab over Midtown.
    - **The owner proposed capping a tower's neighbours' height. DON'T — that changes a wallet's height because of where it
      sits, the one thing the city cannot lie about.** The same visual comes free from PLACEMENT (already a declared game). The
      tall cohort claims a RADIUS and mid-rise fills around it: `clearanceFor(rank)` in city-map.js — 5.2 units for the top 8,
      3.6 to rank 40, 2.6 to 120, 1.8 to 320, then 0. Both placement branches honour it, always falling back to nearest free lot
      (a homeless wallet is worse than a close one). Result: top-8 separation 5.6+, top-40 3.6+.
    - **`prime: true` on the Upper East/West Side** makes the Central Park frontage tower-ELIGIBLE (in `TOWER_HOODS`) without
      core-packing, so big holders who don't fit downtown scatter along the park. Top 120: Midtown 52 · UWS 36 · UES 17 · FiDi 15.
    - **⚠ PRE-EXISTING BUG THE MEASUREMENT FLUSHED OUT: UES and UWS were both handed the lot on the centre line** (`u < 0` /
      `u > 0` both passed `u === 0` → two wallets one spot). West is now `u >= 0`. Found only because the nearest-neighbour sweep
      printed 0.03 units. `test/city-place.test.mjs` pins no-duplicate-lots, no-coincident-buildings, landmark separation, spread.
      **Lesson: measure the nearest-neighbour distance after ANY placement change — geometry bugs are silent.**
  - **⭐ THE BRIDGE NEEDS AN APPROACH (owner, 2026-07-28: "the bridge's road lands in a building").** The span is `BRIDGE_LINE`
    in **city-map.js** (NOT city-infra — the lot grid needs it; a second copy is the drift that put the deck through a facade).
    `underBridge()` subtracts a 2.5-unit corridor **plus 3.0 units of ramp beyond each end**; `SITES.bridge` spreads `BRIDGE_LINE`.
    Costs 9 of Manhattan's lots (1,692→1,683). **⚠ THE CATCH: the bridge lands on BOTH shores; Manhattan's grid and `boroughLots`
    are built separately — clearing only the island left the BROOKLYN abutment on the ramp.** Both grids call `underBridge` now.
    Size the corridor past the point of contact (post-placement setback jitter can pull a lot ~0.1 back AFTER it passes). Pinned
    in `test/city-place.test.mjs` (both shores).
  - **⭐⭐ THE DESIGN RULE — "STONE AND LIGHT": realism goes into FORM, MATERIAL and LIGHTING; the DATA stays in the LIGHT.**
    Albedo is the real material with only ~12% age hue (brick still looks like brick); age + flow live at FULL strength in the
    emissive windows + street glow. **If a future change starts tinting facades by data again it will look worse AND say less.**
    - **✅ FACADE ALBEDO ADDED 2026-07-31 (owner: improve buildings without affecting performance).** `facadeAlbedo(family)` in
      city-render.js paints the actual SURFACE — mullions, spandrels, brick coursing, per-panel tone — on the SAME 8×8 window
      grid, via the material's `map`. **ZERO frame cost, verified: buckets 50→50, draw calls/triangles unchanged, buildMs ~1600;
      only +3 textures.** Per family: glass = curtain wall, concrete = punched windows, masonry = brick + stone trim. anisotropy 4
      (facades at grazing angles). ⚠ Look UNVERIFIED on real GPU (sandbox is a software rasteriser).
  - **What the budget bought:** PBR `MeshStandardMaterial`, a procedural sky as BOTH env map and background (`skyEnv`), ACES
    filmic tone mapping (without it bright windows clip to white and the age ramp dies), a sun casting real shadows whose shadow
    camera FOLLOWS `controls.target`, material FAMILIES by archetype (glass/concrete/masonry), roof life (water towers + HVAC +
    parapets, ~free once merged).
  - **⚠ TWO THINGS ONLY LOOKING AT IT CAUGHT:** (1) the top-down overview went nearly BLACK — from above the sky env barely lit a
    horizontal surface. **Fix = a `HemisphereLight`** + brighter land/water. Brightness is a stated owner requirement. (2) a flat
    background left a hard seam (read as a diorama on a table) — the sky gradient is now the actual background, ground extended,
    fog set to the horizon colour.
  - **Picking had to change** (merged meshes have no per-building object): an invisible InstancedMesh of bounding boxes, one draw
    call, returns `instanceId` → building. Hover moves a wireframe cage.
  - **Day / Dusk / Night** toggle in `CityControls`, default **dusk** (night prettiest but too dark outdoors; day washes emissive
    windows out, so day pushes `win` intensity).
  - **`?chart=citylab` (`src/CityLab.jsx`, dev-gated) = the A/B page** — the same 12 wallets drawn both ways, one camera. Keep it.
- **three.js gotchas baked in:** BoxGeometry maps one texture to ALL six faces (→ windows on rooftops); the ORIGINAL per-face
  material-array fix caused the 6,836-draw-call problem — the real fix is separate wall/roof geometry. Materials are SHARED and
  binned, so hover moves a wireframe cage (recolouring a material would light every building in the bin). three is code-split.
  **`window.__cityStats()` is the perf probe — run it on a REAL device; everything here was measured on a CPU software rasteriser.**
- **🔒 GATING — SPX City is LISTED-BUT-LOCKED, City Lab stays DEV-HIDDEN (owner, 2026-07-28).** `src/CityGate.jsx` wraps both
  with the passphrase (`aeoncity`) + explainer + synthesised pop. Two catalog flags: **`locked:true`** (SPX City) = LISTED for
  everyone but the tile shows a lock cover (`LockedCover`, never mounts three.js) and opening hits the passphrase wall (CityGate's
  `locked` prop → "🔒 Password protected", field shown straight away). **`dev:true`** (City Lab) = never listed, direct-link-only
  (`?chart=citylab`), still password-gated. **⚠ DECOUPLED the gallery's dev-reveal from the gate-pass:** it used to reveal ALL
  `dev` charts once `localStorage[CITY_KEY]` was set — but now SPX City is a listed shared-password page, so that would leak City
  Lab; `dev` charts are strictly direct-link-only regardless of the gate. **HONEST SCOPE: listed+locked, NOT security** — passphrase
  is in this file + hashed in the bundle (public repo), the data is public anyway.
- **✅ CLAIM YOUR BUILDING — wallet messages (owner, 2026-07-27).** Connect an EVM wallet → `personal_sign` a free statement →
  your note hangs over your building (`src/CityWallet.jsx` + `src/city-messages.js`; signs are CSS2D labels). Rules, all
  deliberate: **only wallets that own a building can post**; **one message per wallet, replaceable**; the signature binds
  **wallet + city + text** (can't be lifted/replayed); validation caps length, blocks **links** (city stays unshillable) and
  strips control + **bidi-override** characters. Tested in `test/city-messages.test.mjs`.
  - **✅✅ NOW ON-CHAIN — NO BACKEND AT ALL (owner: "just what the blockchain stores?" Yes, strictly better).** A note is a tx to
    **`contracts/CityNotes.sol`** (one function, one event, NO storage/owner/admin/payable). No DB, no endpoint, no key. **KEY
    WIN: the signature became REDUNDANT** — `msg.sender` can't be forged, so the "server must re-verify" problem DISAPPEARS.
  - **BOTH CHAINS, COLOUR + LABEL (owner: "identify if left on base or MN by color").** Mainnet = real gas (~$0.50-4/note, a
    statement); **Base = fractions of a cent, the default.** Colours reuse the repo per-chain convention (**Ethereum #98a2b7 grey
    · Base #3b82f6 blue**) on the sign border + a written `MAINNET`/`BASE` chip. **The chip is NOT optional** — the ETH grey is
    near-neutral (palette validator FAILs it on chroma while PASSing separation ΔE 16), so colour alone isn't enough.
  - **⭐ WHAT PERMANENCE COSTS (say it):** nobody can delete a note. So `validateMessage` is a **DISPLAY FILTER, not a gate**
    (applied posting AND rendering AND in the log reader) — anyone can write a link on-chain, the city won't draw it. Ownership is
    checked at RENDER time (contract can't know who holds AEON/SPX).
  - **NO web3 DEPENDENCY** — ethers/viem are ~100KB for one call. **`src/evm.js`** hand-rolls keccak256 + ABI encode/decode. ⚠
    **Node's `sha3-256` is NOT keccak256** (different padding) — it would yield valid-looking topics no node agrees with, which
    is why it's implemented, tested against published vectors AND cross-checked against `transfer(address,uint256)` = `0xa9059cbb`.
  - **Reading = snapshot-forward:** `scripts/build-city-notes.mjs` (daily step in snapshot.yml, `ALCHEMY_KEY`, `continue-on-error`)
    walks logs per chain from the last head → `public/city-notes.json` (latest note per city+wallet wins). A local echo shows your
    own note on confirmation; self-expires in 7d so a dropped tx can't leave a ghost sign.
  - **🔲 OWNER — 2 steps to go live:** (1) deploy `CityNotes.sol` to Base (and mainnet if wanted), verify; (2) paste the addresses
    into **`CONTRACTS`** in `src/city-messages.js`. Until then every surface says "not deployed yet". Claude can't deploy.
- **⭐⭐ GREENLIT 2026-07-27 — "SPX CITY": EXPAND THE CITY INTO THE WHOLE TOKEN, NOT JUST ETH HOLDERS.** Owner loved expanding to
  "the chains, the cexes and all". Every element is a number ALREADY in the repo:
  - **The boroughs become the other chains.** Brooklyn = **Base (~114.5k wallets)**, Queens = **Solana (~66k)**, Manhattan =
    **Ethereum (~49.5k)**. The true image: **Base has 2× Manhattan's population while Manhattan holds ~94% of the VALUE.**
  - **Real bridges** thickness = the **111.5M Wormhole bridged supply**. **An exchange district in the harbour** — the **27 tagged
    CEX wallets / 138.6M (13.9% of supply)** as docks (Kraken ~43% dwarfs; Binance/Coinbase ~0.7M each). Uses `cexVenues` +
    `EXCLUDE_LABELS`. **The burn as a monument** — 69.01M at `0x…dead`, alone in the bay. **Uniswap LP (13.2M)** its own district.
  - Honesty framing: **the populations, supplies and bridges are REAL; which borough gets which chain is a game.** Say it.
  - **⚠⚠ THE BLOCKER: BASE AND SOLANA HAVE NO PER-WALLET DATA** (only headcounts, `chain-wallets.json`). Their boroughs CANNOT
    have real individual buildings yet. Do NOT fake them. Two honest options: (a) massed low-rise from true headcount + supply
    (labelled), or (b) outlines with a "population 114,652 — not yet reconstructed" marker. Real buildings need a **Base ERC-20
    transfer extract through the SAME FIFO engine** (Base SPX `0x50dA645f…bb2C`, decimals 8, + a Base `EXCLUDE_LABELS`). Solana
    needs an SPL equivalent.
  - **⭐⭐ EXPANSION PLAN LOCKED-IN 2026-07-31 (owner scoped from Basescan/Solscan).** Real per-chain qualifying sets at the
    ≥5,000-SPX residency bar: **Base ≈ ~500 gross → ~400 real** after stripping Wormhole/LP/Coinbase/CEX = mostly infrastructure.
    **Solana ≈ ~2,000, WELL DISTRIBUTED** — a genuine retail community, ~5× Base. **THE PEOPLE LIVE ON SOLANA → SOLANA IS THE
    PRIORITY chain to reconstruct.**
    - **⭐ TECHNICAL SHAPE (Solana is SPL, does NOT reuse the ETH FIFO engine — doesn't need to):** the city needs per-wallet
      **{balance, holding-age, flow}**, NOT FIFO cost basis. **Balance is already FREE** from the Solana RPC (`getProgramAccounts`
      on the SPX mint) for the daily headcount. So the extract only supplies **age + recent net-flow** from SPL transfer history →
      join to live RPC balances → ~2,000 Queens buildings.
    - **⚠ RUN IT ON BIGQUERY, NOT DUNE** (Dune Solana as-of scanned 10.5 TB / ~650 credits — the credit-blowout of record). Scope
      to the SPX mint FIRST → inside free 1 TB/mo. (Owner runs BigQuery for Solana.)
    - **⭐⭐ DUNE DRY-RUN 2026-08-03 — the "must use BigQuery" rule is HALF wrong.** Probed via the Dune MCP (~23 credits total,
      SPX Wormhole mint `J3NKxx…3KFr`): **❌ RAW `tokens_solana.transfers` IS the ~4,000-credit trap** — ~32 TB (SPX slice ~16 TB),
      no partitioning, mint doesn't prune; a 2-day COUNT = 8.47 credits, ~975 days ≈ ~4,100 credits. Chunking doesn't help (total
      scan unchanged). Keep transfers on BigQuery. **✅ `solana_utils.daily_balances` CHUNKED IS VIABLE ON DUNE — ~24 credits full
      history.** 1.36 TB, mint doesn't prune (one-shot timed out at the 2-min wall) **BUT it prunes on `day`**: 7-day window =
      0.177 credits, ~0.025 credits/day anywhere. Full history from ~11 × ~90-day CHUNKS (~24 credits), concatenated OFFLINE.
      Earliest SPX Solana balance day **2023-12-20** (launch). **RECIPE for Queens:** `daily_balances` gives per-owner
      balance-state-on-change → current balance, **holder age** (first `day`), **net-flow** (deltas); since current balance is
      already free-live from the RPC, Dune only needs age + recent flow. Build = a parameterized ~90-day-chunk `daily_balances`
      query + local `build-solana-onchain.mjs` (age/flow offline) → join to live RPC balances. **Semantics caveat: Wormhole-minted,
      so cost-basis/MVRV/realized-price are NOT honest on Solana — but the city only needs balance+age+flow.**
    - **⚠⚠ CAPACITY TENSION — Solana's 2,000 puts us OVER the land for the first time.** ETH 4,895 + Solana ~2,000 + Base ~400 ≈
      **7,300 qualifying wallets vs 6,259 lots.** THREE levers: (a) extend the borough grid further out; (b) **raise ETH's own
      threshold** so Manhattan thins toward the 1,680 island; (c) top-N per chain + cap. **Owner's lean (Claude concurred):
      Solana → Queens, Base → a slice of Brooklyn, ETH bar nudged up just enough to fit — no geometry gamble, every borough
      populated.** **⚠ ~7,300 buildings is PAST what's been tested** (current ~4,895); draw calls constant (bucketed) but memory
      ≈ 19 KB/building → ~140 MB. **Needs a real-device `window.__cityStats()` check before shipping.** **Keep the honesty rail:
      the flat 5k bar means Base-as-Brooklyn is ~400 REAL buildings under a "114,900 wallets" headcount LABEL — do NOT bend to a
      chain-relative threshold** (breaks "height means the same thing in every borough").
- **🔲 GREENLIT / PARKED — MULTICHAIN "CONVICTION RACE" (ETH vs Base vs Solana, over time). Owner: "conviction on a three-line
  race" (2026-08-26).** We shipped a single-line **Conviction Score** (0–100 supply-weighted holding age; `src/conviction.js`,
  `ConvictionChart`, id `conviction`) + **Holder Change Breakdown** (`src/holder-change.js`, `HolderChangeChart`, id `holderchange`,
  from the engine's per-day `wealth` USD-tier headcounts) — **both ETH-native** (labelled), reading `onchain.json`. Owner wants the
  conviction as a **3-line race across chains**. ⭐ THE DATA IS ALREADY STORED — NO re-extraction: **Solana** = `dune/out/spx6900_solana_balances.csv`
  (166k rows, full `daily_balances` history since 2023-12-21) + **Base** = the Alchemy transfer replay in `build-base-alchemy.mjs`; both
  builders currently collapse to a CURRENT snapshot (`solana-onchain.json`/`base-onchain.json` = per-wallet {a,bal,days,flow}, ≥5k floor).
  **What's needed = builder work only:** extend `build-solana-onchain` (replay the stored CSV) + `build-base-alchemy` to each emit a
  **daily/weekly age-band series** (same `age:[0-1m,1-3m,3-6m,6-12m,1y+]` shape as ETH's onchain.json), then a `ConvictionRace` chart
  reading all three + a combined SPX line. **$0 for Solana (offline CSV reprocess), cheap for Base (Alchemy).** Caveats (neither blocks
  the race): Base/Solana are **≥5,000-SPX scoped** (fine for a SUPPLY-WEIGHTED conviction — those wallets hold ~all supply; only matters
  for dust headcount), and **cost-basis metrics stay ETH-only** (Wormhole-bridged) but conviction is age, not cost basis. FULL multichain
  parity (dust tiers + cost basis) is a separate, bigger ask.
- **📐 HOW MANY BUILDINGS CAN THE CITY AFFORD (re-measured 2026-07-28).**
  - **Manhattan holds 1,693 lots** at full scale (real streets take ~a third of the island). `cityScale` caps k at 1 deliberately.
  - **⭐ OVERFLOW GOES TO THE OUTER BOROUGHS, and the NEWEST wallets move** (owner: "expand outside manhattan for newer wallets").
    `boroughLots()` grids Brooklyn/Queens/Bronx/Jersey → **+4,582 lots, total capacity 6,275.** AEON's worst case (3,333 distinct
    hands) fits. Picking by TENURE means nobody is displaced by a price move — only by arriving later. Manhattan mean tenure 0.745
    vs boroughs 0.244.
  - **⚠ TWO TRAPS in the borough grid, both would put buildings in the water:** borough outlines are ADMIN boundaries crossing open
    water (lots rejected inside the WATER rings), and the East River above LIC + the whole Harlem River are NARROWER than 400 m and
    fully inside those boundaries — so a lot within `CHANNEL = 4` units of Manhattan's coastline is in a river. Uses the FULL
    outline (subsampling left 22 buildings mid-channel). **Check after any change: 0 borough lots within 4 units of the shoreline.**
  - **DRAW CALLS ARE CONSTANT** — 63 at 600 and 63 at 1,172 (per (family × age × flow) bucket). ~200 tris / ~0.4 ms build per
    building. Ceilings are triangles, memory (~19 KB/building, non-indexed — the real mobile wall) and startup freeze.
  - ⚠ **3,333 buildings could not be rendered in this sandbox** (~660k tris on a CPU software rasteriser = minutes/frame). That's
    a rasteriser limit, says nothing about a real GPU. **STILL UNMEASURED ON REAL HARDWARE.**
  - **⭐ THE CITY CAN NEVER SHOW EVERYONE ON THE COIN SIDE — say so.** ETH 49.5k + Base 114.5k + Solana 66k ≈ 230k vs 6,275 lots.
    Whale City is inherently a top-N view; the AEON side (3,333 tokens) genuinely fits.
- **✅ BUILT — "WHALES WATCHING" 3D (owner greenlit 2026-08-03).** Listed-but-locked chart **`whaleswatching`** (On-Chain group,
  `locked:true`, gated). A whale-activity monitor: WHO IS BUYING OR SELLING BY WALLET SIZE. Distinct from Whale City (abstract,
  about BEHAVIOUR not geography). **Scope: only wallets ≥ 100k SPX.** Slice into CATEGORIES/COHORTS (100k–250k / 250k–1M / 1M–5M /
  5M+ and/or arrival cohort), GROUP towers by cohort. **CUBES, not buildings** — reuse the Skyline3D engine but plain cubes (no
  archetypes/façades/roof-life); height = holding size (√/log), KEEP the age/hold-time warm→cyan colour ramp. **BEAMS ON TOP =
  per-wallet ACTION: green = accumulating, red = distributing, none/dim = flat** (net-flow sign over trailing window). **COHORT
  OVERALL SENTIMENT under/over each cluster** (coloured slab/ring or floating label). THE POINT: one glance answers "are the big
  wallets accumulating or distributing, and which SIZE band is moving?" Build on `city-render.js` + `Skyline3D.jsx`. Gate like the
  other city pages.

- **🔲 PROJECT — "WHALE ACTIVITY SCORE" — a scored/quantitative composite to COMPLEMENT the 3D Whales Watching (owner flagged
  2026-08-14, from an ITC video). NOT greenlit to build — parked.** ITC shipped a "whales watching" section (theirs analytical,
  ours interactive/3D). This is the missing ANALYTICAL layer: a reproducible 0–1 "how unusual is whale activity vs SPX's own
  history" oscillator, gauges, sub-scores, per-metric drill. **What ITC built:** a master "Whale Activity Score" gauge (0–1,
  Normal/Elevated/Extreme) = each input normalised to its own historical percentile, weighted-averaged; + a score-vs-BTC-price
  history chart. FOUR sub-scores each with a gauge + expandable "Score Table" + per-input WEIGHT SLIDERS: (1) Whale Transactions
  ($100K+/$1M+ tx count/share/avg size/volume); (2) Exchange Activity (avg inflow/outflow size, Top-10 net inflow, net inflow,
  Top-10 outflow share); (3) Exchange Inflow Composition (exchange whale ratio, inflow share from 100–1K/1K+ holders, inflow CDD,
  inflow share from coins 1–5y / >5y old); (4) Whale Holder Positioning (supply held by 100–1K/1K+, address COUNT holding 100–1K/
  1K+). Interactivity: weight sliders + Re-normalize Average + Moving Average (30D SMA) + Chart Type + Price Scale; a TIME-SCRUBBER
  with play; Weightless Indicators; tabs; Data details toggle.
  - **HOW WE'RE ALREADY AHEAD:** ours is the 3D BEHAVIOURAL view (whaleswatching cubes+beams, cities, holder skyline). The gap is
    the scored composite + historical oscillator + per-metric drill.
  - **WE ALREADY HAVE MOST INPUTS (no new data for a v1):** exchange net-flow + venue flow (`cex-flow.json`), inflow-by-age / CDD
    (FIFO engine + URPD age + liveliness/NRPL from `build-onchain-local.mjs`), whale holder positioning (`whale-cohorts.js`,
    concentration/top-N, entity clusters, per-wallet balances+flow), smart-money. The ONE missing pillar is **whale TRANSACTION
    COUNTS/sizes** ($100K+/$1M+) — derivable from the raw-transfer archive (a reduction in the FIFO engine, not a new source).
  - **BUILD SHAPE (reuse the valuation-composite pattern):** a `scripts/bot/whale-activity-score.mjs` mirroring `valuation-composite.mjs`
    (INDICATORS list, each series percentile-ranked → weighted sub-scores → master), writing `public/whale-score.json` (keyless,
    $0). Site: a `WhaleActivityScore.jsx` page + a rotation CARD ("whalescore"). Group with the whale charts under a unified
    **"Whales"** sub-section.
  - **HONESTY CAVEATS:** ETH-native only; SPX is THIN so whale-tx counts are noisy → smooth (30D) + frame as a POSITION read, not
    a signal; publish the weights + let people tune them. A valuation/activity POSITION, never a buy/sell call.
  - **⭐ TWO ANGLES OWNER FLAGGED (2026-08-14, 2nd look):** (1) **"COIN MOVEMENT AS ACTIVITY, REGARDLESS OF DESTINATION"** — ITC
    scores coins MOVING at all (dormant→active). **We ALREADY compute this** (`liveliness`, `dormancy`, `cdd` from the FIFO engine;
    we ship a `Liveliness` chart + NRPL) — we just don't BADGE it as "whale activity." Cheap win: reframe liveliness+CDD as an
    "on-chain activity" reading (old coins waking up), optionally whale-filtered. (2) **OUR DIFFERENTIATOR — SEGMENT THE ACTIVITY
    BY IDENTITY, not one aggregate gauge.** We have per-wallet identity + entity clustering + cohorts + the city, so we answer
    "*which* whales are active" and render it in 3D. The play: add the scored/history layer AND keep per-entity granularity + 3D.
  - **NEXT:** owner may send an HD screenshot to lock the input list; then scope v1 (start with the 3 pillars we have data for —
    Exchange Activity, Exchange Inflow Composition, Whale Holder Positioning — add Whale Transactions once the archive reduction is wired).

- **✅ MOSTLY SHIPPED — CITY TVL + INHABITANTS, WITH HISTORY (owner, 2026-08-06).** Landed: the **`City Growth` chart**
  (`CityHistoryChart.jsx`, id `citygrowth`) plots citizens AND city TVL over time (climbing through the drawdown), and the
  **`cityvalue` card** (`scripts/bot/city-value-card.mjs`), both on the daily city-history build. **🔲 Possibly still open (verify):**
  the SPX-City 3D-page HEADER showing current TVL + inhabitants tiers with Δw/Δm deltas (the chart covers the history; the in-page
  header stat may not be wired). Brief:
  - **City TVL** = Σ balance × live SPX price, with WoW and MoM change. Data: whales.json per-wallet `bal` + live price; historical
    series from **spx-timeline.json** × price-history.json. **Inhabitants tiers** = residents per tier (archetype or size cohorts
    100–250k/250k–1M/1M–5M/5M+ from whale-cohorts.js); the **whale-cohort-history.json** series already IS "inhabitants by size
    cohort over time". **Historical LINE CHART of both** — dual axes.
  - **⭐ DAILY, not weekly (owner, 2026-08-06): "we compute it daily."** Prefer daily. The cleaner daily source is the **FIFO engine**
    (`build-onchain-local.mjs`) — `onchain.json` is already daily (1087 rows). Extend it to emit per daily sample the **≥100k
    inhabitant count** + **daily TVL** (Σ held balance × that day's price), so both reconcile exactly with whales.json (644) at the
    leading edge. Build: extend `build-onchain-local.mjs` to emit daily `inhabitants` + `tvl` into onchain.json (or a companion
    `public/city-tvl.json`), same daily onchain-dune run. Surface both on the SPX City header (current + Δw/Δm) + a daily line
    chart. Register any new feed in audit-feeds.

- **🔲 OTHER 3D CANDIDATES PROPOSED (owner liked the set, 2026-07-27) — the test is THREE genuine dims (two axes + a magnitude);
  single series/ratios stay 2D (rainbow, MVRV, NUPL, SOPR, composite — a third axis adds occlusion, Urpd3D proved it).**
  - **⭐ URPD TERRAIN OVER TIME** — cost basis × time × supply as a landscape deforming week by week, price cutting through as a
    moving plane. The strongest unbuilt object; needs the FIFO engine to emit **weekly URPD history** (one loop change).
  - **The cycle helix** (wrap time into a spiral, cycles stack — pure reprojection of price history). **A globe of where SPX trades**
    (the 27 venue tags carry geography — Coinbase US · Bybit/Binance/Upbit/Gate/MEXC/Indodax Asia · Bitpanda/Bitvavo/Revolut Europe
    · CoinSpot AU; arcs sized by supply). **The AEON museum** (walk 3,333 pieces by rarity). **The city through TIME** (launch→today
    slider). **Weather from the composite** (the sky IS the valuation). **Residency cards** ("resident since Aug 2023 · held through
    −83% · never sold" — retrospective facts only).
  - **⚠ THE LINE FOR ANY GAMIFICATION:** celebrate **tenure and behaviour**, never score a person's entry price or P&L (that got
    the "grade my entry" report card parked — cringe risk). The city changed it from JUDGING to PLACING — keep it there. And **no
    price-prediction/leaderboard mechanics** (reads as gambling, the one idea that would cost the honesty position).
- **✅ SELF-SERVE VIDEO STUDIO — EXPANDED 2026-08-22 (owner: "extend videos to other parts… make the pipeline sustainable so I don't
  call you for a new render").** The in-browser recorder (client-side `MediaRecorder` via `src/canvas-record.js`, encodes on the owner's
  GPU, downloads locally, MP4 on Chrome/Safari) is the no-Claude path. `/control` → 🏙 SPX City tab → **🎥 Video studio** now exposes a
  scene × format grid: **SPX City** (`?chart=spxcity`, `CityRecorder`/`__cityRecord`) and **Whales Watching** (`?chart=whaleswatching`,
  `__whaleRecord`) both do **9:16 · 1:1 · Wide**; **Cluster City** records Wide for now. The studio opens the scene past the gate
  (sets `spx-city-dev2` + `spx-rec` in localStorage) with `?rec=1&ar=<vert|square|wide>` — the recorders read `?ar` (`initialAr` in
  CityRecorder; the 3-way `ar` state in WhalesWatching, which reuses the scene's existing PORTRAIT camera framing for 9:16). ⭐ Owner's
  two social formats (9:16 for Reels/TikTok/Shorts, 1:1 for the X feed) lead. ⚠ The note/name SIGNS are DOM overlays, NOT in the capture
  (screen-record for those); and 3D framing at 9:16 is UNVERIFIED on a real GPU (sandbox is a software rasteriser) — eyeball on device.
  To add another scene: expose `__<name>Record`, honour `?ar`, add a row of `.vbtn`s (`data-chart`/`data-ar`) to the studio grid.
- **🔲 OPEN:** real-GPU perf is UNMEASURED (only a CPU software renderer here) so the 600-building default is caution — the "all
  buildings" toggle needs a real device; borough tones still dim; bridges dropped when the real geometry landed. Intro fly-through
  doubles as the video path (`tools/render-city-video.mjs` drives `window.__citySeek(u)` frame-by-frame → H.264). **Owner hardware
  note (2026-07-29): iPhone 13 Pro Max + MacBook Air M1 + 27" iMac all run the full city at full res** — the floor is fine on decent
  hardware; tail risk is visitors' low-end Androids (adaptive resolution below covers it).
- **✅ "LAUNCH RESIDENTS / FOUNDERS" VIEW KILLED 2026-08-11 (owner: "launch residents shows zero… kill the chart").** Structurally
  degenerate: a resident needs **≥5,000 SPX held 90 DAYS**, impossible in the launch week, so the "founders" cohort was
  empty-by-construction; the same launch baseline made "since launch" multiples nonsense (city "4,957× bigger"). Removed the
  **Founders view + "launch residents left" metric** from `CityFlowChart.jsx` (the **Survival** view already tells it honestly).
  The **`citychurn` card + post** now read survivorship from the earliest REAL arrival cohort (`vintages`, ≥20 wallets — "101 of
  the 627 who arrived in 2023 Q4 remain, 16%") and dropped the "N× bigger than launch" claim; `CityHistoryChart`'s multiple is
  baselined on the city's FORMATION (first row ≥500 residents, ~late 2023), relabelled "citizens since <month>". **LESSON: any
  launch-anchored stat on a 90-day-residency metric is degenerate.**
- **✅ SURVIVORSHIP / COHORT ANALYSIS SHIPPED 2026-07-29.** `scripts/build-cohort-survival.mjs` re-slices spx-timeline.json →
  `public/cohort-survival.json` (~5KB, daily via onchain-dune.yml, audit-registered): per arrival half-year {arrived, holdNow,
  supplyNow, survivalPct}, overall {everHeld 26,484, holdNow 5,489, gonePct 79, diamondPct 91}, top-peak survival, weekly
  living-holders-by-vintage. **THE FINDING: 79% of every wallet that ever held ≥5k SPX is gone; the 2023 launch crowd down to 4%
  — YET 91% of today's holders never once sold to zero** (survivorship). **Card `survivorship`** (stacked living-holders-by-vintage,
  in rotation) + **site chart `Who's Still Here`**. ⚠ Reconciles WITH diamond-hands (those measure CURRENT holders' conviction;
  this measures all-time churn). Honesty caveats on-surface: right-censoring (recent cohorts read high), "gone" = balance below the bar.
- **✅ 2ND CARD — "WHERE TODAY'S FLOAT BOUGHT IN" (supplyera) SHIPPED 2026-07-30 (owner: "couple it with price, tower charts
  aren't interesting").** `scripts/bot/supply-era-card.mjs` places each surviving cohort ON the real SPX price curve at the price
  it first paid (era median), bubble-sized by SPX still held, **green ring = in profit / red ring = underwater** vs a dashed "now"
  line, ±%/×-multiple label. The story the towers hid: **~40-48% of the float held today bought ABOVE today's price and still
  hasn't sold** — the biggest bag (166M) came in near the $1.08 top (−69%) and never moved; 164M bought at $0.22 (+51%).
  `build-cohort-survival.mjs` emits per-era `medPrice`. Card reads `stats.cohorts`+`stats.drawn`+`stats.price` (spot LIVE, not
  frozen). LOOK "dual", in rotation, ≤290. Site: 3rd toggle ("Cost basis") in `Who's Still Here`.
  - **⭐ COHORTS ARE QUARTERLY (owner: "increase granularity, maybe monthly?").** Was half-year; QUARTERLY (13 cohorts) is the
    sweet spot — ~2× resolution while views stay readable, cohorts keep enough wallets for stable survival %. Rejected MONTHLY
    (~35): vintage ramp becomes indistinguishable, bubbles overlap, survival % noisy. Knob: `halfOf` in build-cohort-survival.mjs.
    Surfaced the sharper find — biggest surviving bag is **2025-Q3, 100M bought at the ~$1.46 ATH quarter (−77%), still held**. The
    survivorship card's right-edge legend went ADAPTIVE (compact one-line rows once nC>9).
  - **⚠ FRAME FIX (owner caught it): the price line fell BELOW the lower frame.** SPX genuinely spent ~21 days sub-$0.004 at launch
    (true min $0.00067). Both card + site now floor the log y-axis at `max(0.0005, min(price,medPrice)×0.85)`. **Any price-vs-log
    card: set the floor from the data min, don't hard-code it.**
- **✅ 3RD CARD — "HOW HOLDERS LEFT" (exitmap) SHIPPED 2026-07-30 (owner: "who left? where and at what price?").** Does NOT overlap
  NUPL (that's UNREALIZED P/L of who's STILL here); this is the REALIZED exit of who's GONE. `build-cohort-survival.mjs` emits
  `exits` (per-quarter {n,profit,loss} + overall {left,profitPct}): for each departed wallet, the quarter of its LAST week above
  the 5k bar, split by exit price ≥ entry (both ≈ price when it crossed the bar — a realized-P/L proxy). **THE COUNTERINTUITIVE
  FINDING: of the 21,008 wallets that left, 71% sold in PROFIT (76% of departing supply). The churn was profit-taking, NOT
  capitulation** — exits ran 77-89% green through 2023-2025; loss-exits only cluster in the recent drawdown. Card `exit-map-card.mjs`
  = two panels sharing a time axis (price on top + per-quarter departure bars, green profit/red loss). Site: 4th toggle ("Who left").
  - **⭐ MADE DAILY 2026-07-30 (owner: "if SPX runs I want to know who's selling on a daily TF; NUPL is daily").**
    `scripts/build-exit-flow.mjs` streams the raw transfer ARCHIVE (exact exit DAY per wallet) → `public/exit-flow.json`
    (`{res, overall, days:[[date,profit,loss]]}`), in onchain-dune.yml. **Two input modes:** `--transfers=` (daily, CI) +
    `--timeline=` (weekly, from committed spx-timeline.json) — weekly mode reconciles EXACTLY to cohort-survival (21,008 left, 71%
    profit), which unit-tests the crossing logic (`test/exit-flow.test.mjs`) and seeds the local render. Card + site render RAW
    STACKED BARS (one bar per day/week — NO smoothing; owner: "I want daily bars"). ⚠ vercel.json includeFiles was ALSO missing
    `cohort-survival.json` (so survivorship/supplyera rendered null in og.js) — added it + exit-flow.json to all three fns. Registered in audit-feeds.
- **✅✅ SMART MONEY COHORT SHIPPED 2026-07-30 (owner: "smart money cohort is a strong part to develop").** A "Live Smart Money" desk
  — aggregate behaviour of proven top-timers vs price. Definition hammered out; the journey IS the lesson:
  - **$ realized was the WRONG spine** (a whale nets big $ on mediocre %). Metric = **ROI (realized ÷ capital deployed)**, with a
    **capital floor**. ROI alone too loose (token 500×'d — 1,800+ wallets cleared 5×).
  - **A qualifying wallet must be STILL TRACKABLE** (owner: "otherwise what's the point?"). A zeroed-out wallet is DROPPED. Cohort =
    **invested ≥ $25k · realized ROI ≥ 5× · still holds ≥ 50k SPX → 26 wallets** (median 11×, banked $33M, hold ~$10M).
    **Recomputed every run** — dumps-to-zero drop, new proven+live winners join. ⚠ Qualification needs a REALIZED sell (a
    bottom-accumulator is invisible until it sells); on-chain has no identity (fresh wallet resets) — both stated on-surface.
  - **⭐⭐ TWO-LAYER WALLET REVEAL (owner amended the "never named" rule 2026-08-22).** The chain is already transparent (the city
    makes wallets identifiable), so the point isn't secrecy — it's presentation. `build-smart-money.mjs` now emits a per-wallet
    `wallets:[{a,bal,d1,d7,d30,roi}]` array (real addresses, sorted by bag), and **excludes any wallet in a multi-wallet cluster**
    (`loadClustered` reads `entities.json` — union of all member wallets; ~4,228 excluded) so the cohort is **genuine independent
    traders**, not one operator's split wallets. **PUBLIC layer** (`SmartMoneyChart.jsx`): anonymized "Wallet 1/2/3 · 30-day balance",
    NO addresses. **TERMINAL layer** (`TerminalPage.jsx`, password curtain): a "Smart money · the wallets" dropdown revealing the REAL
    short addresses (Zerion-linked + info tooltip w/ Etherscan) with 24h/7d/30d holding deltas. ⚠ Honest scope: the terminal reads the
    same public `smart-money.json` via the `/api/control` curtain, so addresses ARE technically fetchable by someone who finds the
    public repo — owner accepted this (repo obscurity = the practical curtain; addresses are derivable from public chain data anyway).
    The exclusion applies to the cohort itself, so the AGGREGATE (heldNow/cohortSize) is independent-traders-only too. Data-gated: the
    `wallets` array appears after the next cron regenerates the JSON. Unit-tested (cluster exclusion + per-wallet output).
  - **⭐ TERMINAL "WHALE CLUSTERS · THE OWNERS" SECTION (owner, 2026-08-22 — the flip side of independent traders).** Since the smart-money
    cohort excludes clusters, the terminal also gets a dedicated CLUSTERS section (`TerminalPage.jsx`, reads `entities.json` via the
    `/api/control` curtain): top clusters by combined balance (flagged/over-merged excluded), each row = owner # + cluster id + combined
    SPX + net 24h/7d/30d. **Hovering "N wallets" pops a popover of the member wallets, each a Zerion link + its balance** (`ClusterWallets`
    component, same viewport-positioned pattern as `Info`) — the "multiple Zerion tooltips" the owner asked for. **"open ↗" → Bubblemaps
    token map** (the cluster page). Shared helpers `shortAddr`/`netSpxCell`. Net columns are data-gated on `entities.json` d1/d7/d30
    (populate on the next onchain-dune run). This is the terminal-granular twin of the public (anonymized) Wallet Clusters chart.
  - **⭐ PER-WALLET PAGE (owner, 2026-08-22 — "a specific page per wallet with the orbs, sells, position vs price, and real-time PnL").**
    `build-smart-money.mjs` now emits per-cohort-wallet LOT DETAIL into `smart-money.json` `wallets[]`: `buys:[[t,price,qty]]`,
    `sells:[[t,price,qty,realized]]` (capped 300, avg-cost), `avgCost`, `realized`, `nBuys/nSells` — from a lot-recording pass alongside
    the balance forward (daily) or the timeline change-points (weekly). `src/WalletDetail.jsx` (route `?view=wallet&addr=0x…`, lazy,
    terminal-gated via `TERMINAL_KEY`) renders: position tiles (bag · avg cost · realized · **unrealized live** · total P&L · ROI), a
    "where it bought & sold" chart (recharts: price line + **green buy orbs sized by amount + red sell triangles** + avg-cost & now
    reference lines), and a "realized P&L over time" step-area. Reached by clicking a wallet on the terminal smart-money list (address →
    the page; Zerion/Etherscan in the (i) tooltip). Data-gated on the `wallets[]` lots (next cron). ⚠ terminal-tier only — the public
    SmartMoneyChart stays anonymized (Wallet 1/2/3), no per-wallet page.
  - **"When Whales Bought" (`whaleentry`) made taller** (owner): `H` 380/520 → 460/680 (mobile/desktop) so the orb field reads bigger.
  - **The aggregate history stays the hero** (the "NEVER a wallet named" rule is superseded by the two-layer reveal above). Read earlier: they
    accumulated ~76M under $0.03, distributed into the run-up, hold 30M, **NOT buying** (12w net −3.7%, 0 adding). **The net-flow
    view is the forward signal — it flips green the week they buy again.** `scripts/build-smart-money.mjs` → `public/smart-money.json`.
    Card `smart-money-card.mjs` (`smartmoney`, LOOK dual) + site `SmartMoneyChart.jsx`. avg-cost proxy, caveated. The #1 candidate
    for a future held/paid tier — kept OPEN for now.
  - **⭐ DAILY + NEW-QUALIFIERS (owner: "need daily. That must be the north star. We have the data.").** Two input modes like
    exit-flow: **`--transfers=` (DAILY, from the raw archive)** + `--timeline=` (weekly, reconciles to 26/30.2M/11×), both exported
    + unit-tested (`test/smart-money.test.mjs`). **NEW QUALIFIERS**: emits `newQualifiers` [[date,count]] — wallets FIRST crossing
    the ROI+capital bar each period (a burst = distribution starting). Site 3rd toggle "New timers" + a `new (90d)` metric (red >3).
    Today **1 in 90d** (nobody minting in a dead market). `newQual90` in the JSON.
- **✅✅ TIME MACHINE SHIPPED 2026-07-29 (owner: "Amazing idea").** The launch→today replay in SPX City: a **Time machine** toggle
  (SPX + AEON modes; hidden in BOTH — an honest historical join isn't built) opens a violet slider; scrub → rebuild at that week
  — **Jan-2024 = 579 → Apr-2025 peak ≈ 4,427 → today 4,894** (far right = LIVE data). Verified end-to-end.
  - **Data:** `scripts/build-city-timeline.mjs` — a NET-BALANCE weekly replay (deliberately NOT the FIFO engine; balance is a plain
    sum so the slider can't destabilise the cost-basis pipeline). Sparse change-points `p:[[weekIdx,bal]]` on a Monday grid; helpers
    unit-tested (`test/city-timeline.test.mjs`). Outputs `public/spx-timeline.json` (~3MB, 26,484 wallets ever ≥5,000, 155 wks) +
    `aeon-timeline.json` (0.3MB, 3,728 wallets); both REGENERATE DAILY (onchain-dune.yml + aeon.yml) + declared in audit-feeds.
  - **⭐⭐ THE CAP LESSON (a real finding): churn is enormous.** A first cut kept the top 9,000 by PEAK balance — reproduced only
    1,279 of today's 4,894 residents, because **7,397 of the 9,000 biggest-ever wallets have since sold out**; today's city is
    mostly wallets that never had huge peaks. Ranking by any one moment's size silently rewrites every other week → **NO CAP,
    everyone who ever cleared the bar ships.**
  - **Client:** `loadCityTimeline()` (history-data.js) + `histTowers` in SpxCity — same residency bar (5,000 held 90d, "held" =
    weeks since last zero; AEON ≥1), flow = Δ vs 4 weeks earlier, 250ms-debounced rebuild, `intro={week==null}`, trade arcs hidden
    mid-replay. Seam: timeline last week ≈5.5k vs live 4,894 (live FIFO day-counting is finer) → far-right SWITCHES to live towers.
  - **⚠ EMPTY-EARLY-WEEK FREEZE FIXED 2026-07-31 (owner: "time machine doesn't work at First pump").** The live bar is "5,000 held
    90 days", but launch is week 0, so for the first ~13 weeks nobody has held 90 days → `histTowers` returned EMPTY → Skyline3D's
    `if (!towers?.length) return;` early-returned AFTER cleanup → frozen/blank city. FIX (`histTowers`): the SPX days bar is
    **`Math.min(90, W*7)`** — you can't hold longer than the token has existed. Now week 0 = 849 launch-pump buyers, thinning to
    ~129 diehards by First pump. AEON was never affected (bar is ≥1 token). **LESSON: any replay bar that references a duration
    must clamp to the asset's age, or the earliest frames are unsatisfiable.**
  - **⚠ MOBILE SETTINGS POPOVER FIXED (same report):** the gear's `right:0` menu (236px) ran off the LEFT edge on a phone. Now on
    `isMobile` it's a `position:fixed` bottom sheet (`left/right:12, bottom:16, maxHeight 70vh`); desktop keeps the dropdown.
    `src/CityControls.jsx`.
  - **🔲 STILL TO DO:** the rendered VIDEO export (wire a `__cityWeek(u)` hook into `render-city-video.mjs` like `__citySeek`); a
    play button; possibly per-week tween/lerp instead of hard rebuilds.
- **✅✅ GROUND-LEVEL FINISH PASS SHIPPED 2026-07-31 (owner: "these cost nearly nothing and upgrade the look").** Coastline/street
  detail, all the SAME cheap CLASS — flat geometry / merged meshes riding the existing render paths, ~free (the merge is what makes
  surface/material detail free; per-object geometry is the expensive kind we DON'T add). Each verified by screenshot (the only valid
  check). All in `src/city-map.js` + `src/Skyline3D.jsx`; docs in `docs/reading-the-city/districts.md` + `boroughs.md`.
  - **REAL AVENUES** (`streetGrid` TAGS each segment avenue/street; renderer builds asphalt ribbons — avenues ~2× width + dashed
    centre + planted MEDIAN broken at each cross-street via `avenueMedians`). Widths from the lot grid's own gaps (`ROAD_W`) so a
    road can NEVER be paved under buildings. Median first drawn as one ribbon read as a green corridor joined to the park; fixed to
    per-block planters.
  - **CENTRAL PARK INTERIOR** (`parkFeatures()`): Reservoir + Lake + Pond, Great Lawn + southern lawns, 4 transverse roads. Built
    from the park's own axis-space bbox as fractions (59th=0, 110th=1); test pins no point escapes the 9-point park polygon.
  - **WATERFRONT PIERS** (`waterfrontPiers()`): finger decks; each checked so BOTH outer corners land in open water. **CROSSWALKS**
    (`crosswalks()`): faint pale band across each avenue at cross-streets.
  - **⭐ THE BOROUGHS BROUGHT UP TO THE ISLAND'S FINISH** (owner: "other areas look unfinished"). `boroughLots` refactored →
    **`boroughGrid` (lots + blocks, mirroring `hoodGrid`)** with a shared **`boroughAt`** predicate; **`boroughStreets`** traces the
    same ribbons clipped through it. **THE HEIGHT WRINKLE:** borough buildings at y=0 but borough land is the backdrop at y=-0.30, so
    each block slab is a **PLATFORM bridging -0.30→0.17**. Preserves the lot set EXACTLY (4,579 lots: brooklyn 731 · queens 434 ·
    bronx 2,517 · jersey 897). Tests pin borough streets never run onto the island or into water. **This is the borough grid the
    Base/Solana chains will drop into.**
  - **NOTE-MARKER SIMPLIFIED:** a claimed-building note first got a gold ring-on-a-tether (owner: "weird yellow beam"). Now the note
    bubble is **click-to-select the building** + a small caret. Made ~day visibility honest (own note instant via local echo; others
    after the daily chain read).
  - The REMAINING upgrades are the expensive tier (bloom / animated water / HDRI sky) — GPU-costly and UNVERIFIABLE in this sandbox.
- **⭐⭐ GREENLIT 2026-07-29 — VISUAL "WOW" PASS before launch (owner: "must be a wow factor").** Judged via City Lab A/B before
  touching the live city: **HDRI sky** (biggest believability win, ~free) · **animated water** · **bloom at dusk/night** · **CC0
  façade textures** + **3–5 hero landmark models for the top wallets only** (never wholesale downloaded buildings) · better variety
  (footprint/setback by hash — free; height stays data). Bloom/water are the GPU-costly two — adaptive resolution makes shipping safe.
- **✅ ADAPTIVE RESOLUTION SHIPPED 2026-07-29 (implemented as MEASURED dynamic resolution scaling, not device sniffing — a UA list
  rots, a frame-time meter is true on hardware that doesn't exist yet).** `src/city-drs.js` (`makeDrs`): EMA of frame time; ~0.8s of
  sustained jank (TIME-based) → pixel ratio ×0.8 down to a floor (0.4×DPR, ≥0.55); ~4s at-vsync headroom → ×1.2 up (quick down, slow
  up — can't oscillate). Single hitches clamped; >2s gaps = tab switch, skipped; on step-down the EMA RESETS (without it, it
  double-stepped — a unit test caught it). CSS2D labels are DOM → text stays sharp at any render scale.
  **⚠ THE SANDBOX CANNOT EXERCISE THIS LIVE:** headless rAF fires ~0.7Hz and a SwiftShader frame takes seconds (slower than the
  tab-switch cutoff), so two in-page versions sat silently dead while "passing." The controller is a pure module with 7 unit tests
  (`test/city-drs.test.mjs`) feeding synthetic frame sequences — **the ONLY valid verification path for frame-pacing logic in this
  repo.** `window.__cityStats()` reports `pixelRatio` + `frameMs` — check on real hardware.

## 🧩 ENTITY CLUSTERING — "who owns what" (built 2026-08-11, VALIDATED, live)
- Owner flagged whales **splitting/consolidating into fresh wallets** to hide holdings + drop out of the city. Built a 3-phase
  pipeline off the FIFO archive (`build-onchain-local.mjs`), all guarded against the one dishonesty that matters — **over-merging
  OVERSTATES concentration**, so every rule errs conservative and flags rather than fuses.
- **Phase 0 — self-move detection (`scanSelfMoves`, in-engine).** Same-BLOCK splits (whale → N fresh near-equal wallets) +
  consolidations (N emptying → 1 fresh) detected so the pieces/target **INHERIT the source coin age** (not reset to fresh) and the
  move is NOT counted as a spend → a wallet hop keeps its city standing. Emits `public/self-moves.json`. ⚠ MEMORY: scans the
  engine's OWN already-sorted tx IN PLACE — never copies the 2.7M array (a prior copy OOM'd CI).
- **Phase 1 — is-contract cache (`scripts/enrich-addr-types.mjs` → `public/addr-types.json`).** `eth_getCode` per NEW address
  (keyless public RPC, monotonic, immutable). A self-move/cluster that TOUCHES a contract/Safe is surfaced but NOT re-aged/linked.
  Runs after the FIFO step in `onchain-dune.yml`.
- **Phase 2 — the clustering engine (`clusterEntities`).** Generalises self-moves to unequal amounts across days. Links a wallet to
  another **plain EOA** only on: **FUND** (a fresh/empty-before wallet seeded ≥50k SPX) or **DRAIN** (a wallet empties ≥90% into
  another). NEVER on a partial send between two live wallets (payment/sale), NEVER through a CEX/LP/contract. Union-find → entities.
  **Three guards:** in-degree HUB (>8 funders = untagged service, drop edges in), out-degree FAN-OUT (>40 recipients = distributor,
  drop edges out), SIZE cap (>30 wallets = flagged oversized, kept for review, never trusted). Emits `public/entities.json`.
  **⭐ THE SUPERNODE LESSON:** the first live run fused a **5,402-wallet blob** because untagged routers (1inch `0x1111…1582`, a
  `0x0000…`-prefixed settlement contract) were treated as EOAs; the addr-types cache + the fan-out guard collapsed it → 106 → **66**
  as the cache converges. 94% of entities are small 2–5-wallet clusters. Unit-tested (8 cases); memory-safe (654MB heap on 1.2M
  synthetic tx @ 2GB cap).
- **Phase 3 — the "Wallet Clusters" view (`src/EntityClustersChart.jsx`, id `entities`, On-Chain group).** A disclosed, toggleable
  SECOND lens beside the by-wallet charts: ranked cluster list, each expandable to member wallets (Etherscan links) + drain/fund
  timeline + a Bubblemaps cross-check. Shows **real concentration** — the largest OWNER controls **14.16M SPX (~2.2% of holder
  supply) across 5 wallets**, invisible in the by-wallet view. The raw by-wallet charts stay the DEFAULT; the page states its limits.
- **⭐ VALIDATED against Bubblemaps** (owner supplied a cluster 2026-08-11): our engine had already found all 4 of its addresses + a
  5th, via the SPX fund/drain chain (`0xa10b30` common funder). The 8-vs-22 top-holder gap is explained, NOT a bug: (a) **we read
  SPX flows ONLY** — a shared ETH/gas funder that never touched SPX is invisible (a data limitation, not a knob); (b) Bubblemaps
  shows CEX/contract fans, which we exclude. So this is a **floor** on real clustering, never an over-count — stated on the page.
- **🔲 NEXT — ENTITY-ADJUSTED CONCENTRATION (owner greenlit for memory 2026-08-11).** Recompute top-10/top-100 concentration (+ the
  whale cohort / gini / city) by **OWNER instead of by wallet**, as a toggle on the existing `concentration` chart (raw ↔ entity).
  The engine already has every entity's combined balance. RULES: use ONLY unflagged, non-hub clusters (never fuse a flagged/oversized
  one — overstates concentration, the exact error we guard); show BOTH numbers side-by-side, method disclosed; keep the ETH-funder
  limitation caveat. **Later mini-project (its own data pull, NOT a knob):** ETH common-funder linking to close the Bubblemaps gap.
- **✅ BUY/SELL SIGNAL ON WALLET CLUSTERS — SHIPPED 2026-08-15 (owner: "identify whether these wallets are buying or selling").**
  Each cluster carries a **30-day net flow**. **Engine (`build-onchain-local.mjs`):** reuses the whale-watcher lookback snapshots
  (balance maps at 1/7/30d ago) — for each entity, sum every member's (now − then) over the window → `e.d1/d7/d30`; fresh members
  count whole balance as inflow, drained as outflow. Also emits per-member **`walletFlow`** (30d) + **`walletAge`** (holding days) →
  raw material for the 3D cubes/beams. Verified on synthetic data. **⚠ DATA-GATED until the next `onchain-dune.yml` run** regenerates
  entities.json (the src/spx-onchain-* bundle can't be rebuilt in-sandbox); the chart hides all flow UI until fields appear. **2D
  chart:** bubble halos + wallet nodes tinted green (accumulating) / red (distributing) / grey (flat); a **"clusters · net 30d"**
  headline, **Holdings/Buying/Selling** sort tabs, flow pills, legend. Threshold for "significant": |flow| ≥ max(2000 SPX, 1% of
  cluster size).
- **✅ 3D "CLUSTER CITY" — SHIPPED 2026-08-15 (owner: "have some 3d renderings too similar to whales watching").** Gated chart
  **`clustercity`** (On-Chain group, `locked:true`, `src/ClusterCity.jsx`) — Whales Watching grouped BY OWNER. Every entity is a
  **district** of member-wallet cubes (height = wallet balance log, colour = holding age, a **beam green=buying / red=selling** from
  30d flow); each district's rim + label read the owner's overall net flow. Click a cube → WalletCard/Zerion. **Architecture (DRY +
  safe):** `buildClusterGroups(entities)` in `whale-cohorts.js` emits the SAME model shape `buildCohorts` does (unit-tested); the
  Whales Watching scene was extracted into **`src/skyline-scene.js` `renderSkyline(el, model, opts)`**. **⚠ Whales Watching itself
  was LEFT UNTOUCHED** (kept its own `buildScene`) so the live gated page can't regress — skyline-scene.js is a parameterised copy
  used only by ClusterCity; migrate WhalesWatching to it later only after an on-device check. **DATA-GATED** on per-member
  `walletFlow`/`walletAge`. Mount-verified with synthetic flow (48 districts / 79 cubes, 331 tests pass); the 3D can't render in the
  sandbox → visual tuning + real numbers are an on-device check after the cron. `TOP=48` biggest owners knob; flagged/over-merged
  clusters excluded (never fuse an uncertain one).

## 💱 CEX FLOW — the exchange-flow project (owner: "where the real story is", 2026-08-16)
- **✅ "WHERE THE VOLUME GOES" SANKEY SHIPPED 2026-08-16.** The middle-stick flow map: exchanges are the vertical stick in the
  centre, **wallets SUPPLYING them on the left (green inflow), wallets WITHDRAWING on the right (red outflow)**, band thickness =
  amount, headline "X onto exchanges · Y off · net". Own chart in the **Exchanges group** (`cexsankey`, `src/CexSankeyChart.jsx`,
  recharts `<Sankey>`) — NOT in the city (owner + Claude agreed: the city's scope is "who holds", the Sankey's is "where flow goes";
  keep separate).
  - **Data: `computeCexFlow()` in `build-onchain-local.mjs`** → `public/cex-sankey.json` on the daily onchain-dune run. Over a
    trailing window (default 90d) aggregates every transfer touching a tagged CEX hot wallet into INFLOW (wallet→venue) and OUTFLOW
    (venue→wallet), grouped by `canonVenue` + counterparty. **DUST = ≥25k SPX** per wallet→venue (owner: "1k is noise, 100k is the
    story"); the sub-dust tail rolls into a "+N smaller" band, never hidden. Unit-tested; feed registered. Data-gated until the next
    onchain-dune run (validated visually on synthetic data — no fake flows ever committed/served).
  - **⭐ EXCHANGE-CANDIDATE DETECTOR (owner: "don't over-count wallets that are clearly not people").** Same reduction flags
    untagged wallets with exchange-like throughput (≥30 transfers IN and OUT, ≥25 counterparties) → `candidates[]` for the owner to
    Etherscan-verify + add to `EXCLUDE_LABELS` (kinds: cex/lp/mm). Systematises the manual infra-tagging (the $20M-throughput wallet
    lives in the engine — throughput not SPX drives its value; whales.json can't see it).
  - **🔲 NEXT (parked): (1)** volume PROVENANCE — split each venue's inflow by the AGE/cohort of arriving coins (the FIFO engine has
    per-lot age). **(2)** a CITY-ARCS overlay — green/red arcs from whale-buildings to exchange-docks (reuses the AEON-arc mechanism).
    Owner likes it but flagged the limits: the city is only reactive on time+amount, and a wallet can hop to a secondary wallet before
    a CEX (multi-hop), so arcs show only direct whale→CEX + top-N whales. **Keep it as a fun SECONDARY view, not the project** — the
    Sankey is the complete tool; the entity-cluster BUBBLE MAP might be a better home for the arcs. Revisit after the Sankey's real data lands.

## Backlog / decisions
- **🔲🔲 DUE AUG 1 — MONTHLY RECAP (July), UPGRADED (owner, 2026-07-31: "after four weeks of intense work we can give a better
  recap. Real intel while selecting the best cards").** The recap engine is `scripts/bot/recap-thread.mjs` `buildRecapPost(month,
  history)` → ONE long-form X post + up to 4 image cards (last month: Hero scorecard · Rainbow · SPX vs the field · Diamond supply;
  preview via `api/recap.js` → control panel "Monthly recap" tab; runner `recap-run.mjs`). **OWNER WANTS BETTER THAN THE STOCK 4:**
  CURATE the best cards from what actually shipped rather than defaulting to the same four. **"Real intel"** = pick with the honest
  engagement + data signal (likes↔impressions r=0.94, aspirational X-multiple/target cards land best, techy content NO LONGER
  barred per owner 2026-07-29) plus the month's genuine NEW findings — July shipped the **valuation composite (`valband`)**,
  **survivorship / cost-basis / exit-flow / smart-money** cohort suite, **NRPL + liveliness**, **CEX venue flows**, the whole **SPX
  City**. Candidate angles: the composite's "deeply undervalued" read, the survivorship finding (79% gone / 91% never sold to zero),
  smart-money "not buying yet," SPX City as the flagship. **Plan:** review real numbers → propose a curated ≤4-image lineup → owner
  picks. X caps 4 images/post → if the story needs more, a short THREAD.
- **✅✅ THE MANUAL IS HOSTED ON THE SITE — `?view=docs` (owner, 2026-07-31). GitBook is retired.** The city manual (18 pages) lives
  in `docs/*.md` (GitBook-shaped: `SUMMARY.md` = TOC, `.gitbook.yaml` deleted). **`scripts/build-docs.mjs` pre-renders `docs/` →
  `src/docs-content.js` at BUILD time** (wired into `npm run build`; `npm run build:docs` alone). `marked` is a **devDependency —
  never reaches the browser**. Handles GitBook syntax: front-matter `description:` → subtitle, `{% hint style=x %}` → callout,
  relative `.md` links → `?view=docs&p=<slug>`, external → `target=_blank`. Strips the leading `<h1>` (rendered from SUMMARY) + any
  orphaned heading. **`src/DocsPage.jsx`** — sidebar grouped as SUMMARY orders, prev/next, deep-linkable, mobile nav; styled like
  MethodsPage (one column, rules not boxes). Code-split: ~19 KB gzipped, zero main-bundle cost. Nav pill "Manual" + the city's Docs
  button point here. **⚠ NO MERMAID ON THE SITE** — pulling in mermaid (~500 KB) for one diagram is a bad trade; `dropMermaid`
  strips the fences (the one flowchart in `docs/README.md` was rewritten as prose + a table). **Editing rules: `docs/*.md` is the
  single source; `src/docs-content.js` is GENERATED and committed — never hand-edit it; run `npm run build`.** The `docs/SUMMARY.md`
  + `{% hint %}` shape STAY (build-docs.mjs reads them). **🔲 OWNER — the only step Claude can't do (GitBook-side):** in the GitBook
  UI, disconnect Git Sync AND delete/rename the space at `andrea-cianfruglia.gitbook.io` (that URL + the embedded `repoName` in its
  page source carried the real name / repo identity). Nothing in the repo points at it anymore. Separately, `docs/x-bot-plan.md` is
  a stale internal planning doc (not in SUMMARY) — delete or relocate on the owner's word.
- **✅ METHODS PAGE — RESTORED 2026-07-26 (owner asked for it back; do NOT delete it again).** History: built, trimmed, then I
  DELETED it on my own reasoning — reversed. Owner: *"we can have a methods page with the data. Design must be simple and not
  feeling AI generated. Keep the same visual styling."* `src/MethodsPage.jsx` = one-column rules-and-text (NO pills/cards/boxes/
  gradients — pill grids were the AI-tell that killed v1). **"With the data" = the numbers that CAN be live ARE:** rainbow
  equation/R²/σ from the live `m` model (App.jsx passes `m={m}`); seven family counts from `METHOD_FAMILIES[].charts.length`;
  composite weights from `INDICATORS` (valuation-composite.mjs). Nav is a 4th peer at `?view=methods`. Sections: the rainbow · the
  valuation composite · the seven families · what none of it can tell you (5 limits) · sources + cadence. **If ever cutting it
  again, that's an OWNER call, not a Claude call.**
- **🕵 PAGE INTEL — first-party analytics (owner, 2026-08-12): "vercel info is very limited, I want to know more."** Motive: a
  **5.4M-coin split across several wallets + a 640-day-dormant wallet moving happened shortly after the city launch**; owner suspects
  someone reacted, and wants to see who visits, from where, what they click, and — the novel bit — **which wallets get looked up in
  the city's "where do you live?" search.** Built (owner chose "both: custom events + an analytics tool"):
  - **Custom pipeline (first-party, no third party):** `api/track.js` (POST ingest → Redis via the Vercel KV / Upstash REST API,
    dependency-free; enriches with Vercel edge geo headers `x-vercel-ip-country/city` + a salted IP hash, raw IP never stored;
    degrades to a silent **204 no-op when no store is connected**). Events: `pageview` / `wallet_search` / `city_open` / `chart_open`.
    Keys: `intel:events` (capped list), `intel:wallets` (the hypothesis list), `intel:geo|pages|refs|charts` (HINCRBY). Client:
    **`src/track.js`** `track()` (sendBeacon, no-op on localhost); wired in App.jsx (pageview per route + chart_open + city_open) and
    CityControls.jsx (`wallet_search` on a valid lookup = the key signal). The landing is an iframe inside home so its pageview is
    already the App's `home` pageview.
  - **Viewer:** **`api/intel.js`** — password-gated (**CONTROL_PASSWORD**) HTML dashboard at **`/api/intel`**: recent wallet
    searches (address · geo · time · iphash), top pages/countries/referrers/charts, live event feed. **Analytics tool:** a
    **Plausible** snippet in `index.html`, loaded only on the live domain (`spx6900rainbow.xyz`). Inert until owner adds the site.
  - **🔲 OWNER — 1 step to activate:** connect a **Vercel KV / Upstash Redis** store (Vercel → Storage) so `KV_REST_API_URL` +
    `KV_REST_API_TOKEN` (or `UPSTASH_*`) get injected; redeploy. Until then everything ships but silently no-ops (safe). Optional: a
    Plausible site; `INTEL_SALT` to rotate the IP-hash salt.
  - **✅ CONTROL-PANEL 🌍 AUDIENCE TAB (built 2026-08-22, owner asked — "add location, I've noticed it affects reach").** The audience
    geography now lives in the owner's hub next to the Engagement tab: `/control` → 🌍 Audience (`loadAudience` in `public/control.html`)
    POSTs the control password to `api/intel` and renders KPIs + a **countries table** (flag · name · visits · share bar · top cities) +
    referrers + pages — the same data the `/api/intel` dashboard shows, reusing that endpoint (no new backend). **Until a KV store is
    connected it shows an in-panel SETUP CARD** with the exact switch-on steps + live var diagnostics (so the owner knows precisely what
    to do). Pairs the two halves the owner wanted: posting-reach-by-location (Engagement → Location log) + real audience geography (Audience).
- **⭐⭐ HIGH CONTRAST IS A HARD RULE — NEVER LOW CONTRAST (owner, 2026-08-20, emphatic: "put in memory that I don't want low
  contrast. All the opposite").** Body text, table cells, section headers, notes — anything a user must READ — must have strong
  contrast against its ground. **Do NOT use `--faint` for readable copy** (it's a de-emphasis token for truly incidental chrome only);
  prefer `--tx` for primary text and `--dim` for secondary. Table `th` must not use `--line2` (near-invisible on both themes) — use at
  least `--dim`. **And fonts default TOO SMALL — bump them:** on the terminal/data surfaces, body/table text ≥14px, section headers
  ≥12–13px, never 10–11px for anything that carries meaning. When in doubt, MORE contrast and BIGGER, both. This applies retroactively —
  audit existing surfaces (the /terminal page was the trigger) and fix low-contrast/tiny text wherever found.
- **⭐⭐ MOBILE IS A FIRST-CLASS PRIORITY, NOT AN AFTERTHOUGHT (owner, 2026-08-11).** Data shows **>half of all traffic lands from the
  X account → mobile.** So mobile responsiveness / cleanness / charts / menus must be **top-notch** — "we cannot afford a very nice
  desktop and a half-baked mobile." **Every new surface must be verified on a phone viewport** — screenshot it on an iPhone-13-class
  viewport (Playwright `devices['iPhone 13']`, `hasTouch:true`) and check: no horizontal overflow, tap targets ≥40px, no hover-only
  affordances, opaque overlays.
  - **✅ BOTH NAVS HAVE A FULL-SCREEN TAP MENU ON PHONES (2026-08-11).** The hover cascade is desktop-only; on ≤700px (landing) /
    ≤760px (React sub-pages) it's a **hamburger → full-screen tap-driven drill-down**. **Landing:** `public/landing-next.html`
    (`#mobtog`/`#mobmenu`, `buildMobMenu`/`wireMobMenu`). **React sub-pages:** `src/TerminalNav.jsx` (`MobileMenu`/`MobRow`, `.tmob-*`
    in `src/terminal.css`) — navigates via SPA callbacks.
    - **⚠ GOTCHA (cost 2 debug rounds): a `backdrop-filter` ancestor becomes the containing block for `position:fixed` descendants.**
      The sticky sub-page `<nav>` has `backdrop-filter:blur`, so a fixed `.tmobmenu` with `inset:0` filled the 51px nav, not the
      screen. FIX: use **viewport units** (`top:0; left:0; width:100vw; height:100dvh`) instead of `inset:0`. Remember for any
      full-screen fixed overlay inside a blurred/transformed container.
  - **✅ TYPEWRITER EFFECT IS CONSISTENT everywhere (headers + leaves, desktop hover + mobile tap).** Landing: `wireTypeRow` drives
    `.lbl`/`.ml-term`/`.mml`. React nav: shared `useTypewriter` + `TypeHead` (trigger on the whole `.mhead`, since React derives
    `onMouseEnter` from `mouseover` — dispatch `mouseover`, not a raw `mouseenter`, in tests).
- **✅ SHIPPED & LIVE — the terminal landing (owner iterated 2026-07/08).** Lives in **`public/landing-next.html`** (self-contained
  terminal aesthetic — pixel VGA font, near-black ground, single green accent, mono data, uppercase micro-labels, rainbow hairline,
  boot sequence, LOOK toggles Blend/Green-DOS/Calm), mounted full-bleed as an **iframe** by App.jsx at `?view=next` AND at the home
  route `/` (**`HOME_IS_LANDING = true`** — the terminal landing IS the homepage; the old React `LandingPage.jsx` is retired from
  `/`). The generated nav (`@gen-menu` block) is rebuilt from charts-catalog by `scripts/build-landing-nav.mjs` during `npm run
  build` — **DO NOT hand-edit it.** **🔒 The live site is PASSWORD-LOCKED while the owner refines things (2026-08-11) — a locked live
  site is expected, not a bug.**
  **⭐⭐ RESOLVED 2026-08-11 — THE COMPOSITE IS THE HERO, THE RAINBOW IS DEMOTED, AND THAT IS DELIBERATE. Do NOT "restore" the rainbow
  as the anchor.** The 2026-07-26 "rainbow must be the ANCHOR" ruling is SUPERSEDED. Owner's reasoning (the honest call): the frozen
  power-law model's floor marches up, so **price will most likely fall BELOW the Fire Sale floor** — a hero showing the price line
  under all the bands reads to a first-timer as *a model that is inherently broken*. The **composite cannot go below 0** (0–100
  percentile oscillator), so it's an always-valid hero that never looks broken. The site also **outgrew its "just a rainbow" scope**
  — it's a full valuation/on-chain terminal. So the rainbow is downgraded to a CHART (still the FIRST chart in Charts). This does NOT
  abandon the model-refit hygiene policy — a durable floor breach is still the trigger; demoting the rainbow just avoids the "broken
  hero" UX without goal-seeking a reactive re-fit.
  **✅ FIXED 2026-08-11 — the `q is not defined` load error:** the default-look setter built a selector with an undefined `q` →
  replaced with the literal `.look button[data-v="calm"]`; zero page errors now.
  **⚖ TASTE CALL — the stats ticker is a ROLLING TAPE, nothing is cut** (correct seamless marquee, 4% edge-fade mask). A
  fade-narrowing (4%→1.6%) was applied then REVERTED to 4% — owner wasn't at a computer to judge. **CURRENTLY 4% (original).** One-line
  flip in `.ticker` mask if the owner prefers the subtler fade; do NOT treat as a bug either way.
  **ORIGINAL 2026-07-26 BRIEF (kept for the honesty rationale; its rainbow-anchor ruling is SUPERSEDED above):** dark data-terminal
  look. **Two rulings, one now superseded:** (1) ~~the RAINBOW must be the ANCHOR~~ ⛔ SUPERSEDED — the composite is the hero now.
  (2) **The valuation COMPOSITE is a prominent supporting read** (owner: *"I like the composite valuation on the landing page"*) — a
  "Six measures, one scale" strip plot: all six lenses on ONE 0→100 axis (cheapest→dearest), placed by real percentile, coloured by
  zone AND labeled (never color-alone), with a composite marker. Data = `valuation.json` `cur.composite`+`cur.byLens`+`zones`+
  `indicators`. **THREE FIXES to keep:** (a) clean price NUMERAL, not the segment-display "1.42.13"; (b) the six measures on ONE
  strip plot, not scattered dots; (c) EVERY number derives from a single source (`valuation.json`/the model) so nothing drifts —
  band labels DERIVED live, never hand-written. **🔲 TO SHIP (still-open work list):** (1) **Wire the crossing-date solver for REAL
  target dates** — `whenHitsCenter(m, price)` exists; the preview's target YEARS (~2027/2031/2038) are placeholders — solve
  $6.90/$69/$690 crossings for real. (2) already implemented as a React route (`?view=next`) reading live `valuation.json` + the
  model, reusing `ValuationComposite.jsx` + `build-valuation.mjs` + the rainbow model. (3) **Reconsider the 5Y/10Y/20Y/30Y range
  toggles** — SPX is ~3yr old; label any forward span as PROJECTION. (4) **Theme decision:** the landing is dark-COMMITTED (matches
  the mock); decide deliberately vs dual-theme (no seam into the charts). Honesty rail: label live vs illustrative; never fake band
  geometry or crossing dates.
- **⭐ MULTI-CHAIN WALLET GROWTH + OUR-OWN-METRICS (owner, 2026-07-16) — shipped.** Two linked asks:
  (1) **Ditch HolderScan's confusing "classified/total supply" framing** (it burned us: 86%-of-classified vs 61%-of-supply diamond
  mess) — replace with our transparent Dune-reconstruction **HODL waves** (age bands as % of TOTAL supply) + **supply-in-profit**.
  Plan: SUNSET the HolderScan-sourced `diamondtrend` + `distribution` cards in favour of those. (2) **Wallet growth over time,
  MULTI-CHAIN (ETH+Base+Solana), from launch** — race card + "holders vs price", showing the holder base growing through the
  drawdown (adoption decoupled from price). Headcount is legitimately multi-chain (unlike MVRV/cost-basis which stay ETH-only).
  - **✅ DATA LANDED & BUNDLED 2026-07-16.** Merged into **`src/chain-wallets.js`** (`CHAIN_WALLETS = [{d,eth,base,sol}]`, aligned on
    the ETH Monday grid, null before each chain's start) → `stats.chainWallets`. VALIDATED: latest ETH 49,541 + Base 114,652 + Sol
    65,968 = **~230k** (≈ the known total). One artifact left (a genuine event): Base **+50,246 in one week (2024-12-23)** = an
    airdrop distribution (real wallets, many dust) → a visible step. Left as-is (honest). Solana starts **Dec-2023 at ~1,235**
    (current-holders-as-of reconstruction from `tokens_solana.transfers`, no cold-start).
  - **✅ CARDS + SITE CHARTS SHIPPED 2026-07-16.** `walletgrowth` card (`scripts/bot/wallet-growth-card.mjs`, LOOK "stack") — stacked
    area ETH(grey)/Base(blue)/Solana(purple), total "230,341 across 3 chains from 1,433" + a "Solana tracked from here" marker.
    `holdersprice` card (HISTORICAL from launch off `stats.onchain`, reuses `holderspair` dual-axis render) — holders climbed to
    ~49.5k (+35×) and held FLAT while price round-tripped an ~83% drawdown = conviction. Site: `WalletGrowthChart.jsx` (id
    `walletgrowth`, On-Chain, stacked area) + `HoldersPriceChart.jsx` upgraded to `loadOnchain` (historical, log price axis, floored
    holders domain at 0). ⚠ Fixed the shared dual-axis render's floors (`Math.max(0,…)`) — full-range linear padding showed NEGATIVE labels.
  - **✅✅ FINAL — SNAPSHOT-FORWARD, ZERO DUNE (owner call 2026-07-16, after a 2,500-credit blowout).** We HAVE the validated
    historical series (bundled `src/chain-wallets.js`, launch→2026-07-13) AND bank all three chain counts DAILY for FREE in the
    snapshot cron (ETH=HolderScan, Base=Blockscout, Solana=public RPC — `snapshot.mjs`). So `build-chain-wallets.mjs` is now a pure
    local merge — **bundle (past) + daily snapshot counts (forward)** → `public/chain-wallets.json`, a step INSIDE snapshot.yml
    (rides the same commit+deploy). **`chain-wallets.yml` (the Dune-executing weekly workflow) DELETED. The old 🔲 "save the Base
    query + set DUNE_BASE_WALLETS_QUERY_ID" action is MOOT — do NOT do it.** Why: ~88% of the 2,500/mo went to heavy transfer-scan/
    as-of executions that timed out/cancelled/aborted (which STILL charge). The dune/*.sql queries are kept as REFERENCE only.
    - **SEAM SPLICE (the one subtlety):** the snapshot's Base source (Blockscout ~127k) sits ~12.6k ABOVE the bundle's Dune
      reconstruction (~114k) — a holder-DEFINITION gap, not real growth. `extendForward()` rebases each chain's forward points by the
      per-chain offset measured at the seam date (ETH +24 / Sol −181 = noise, Base −12,633), so the PAST stays the reconstruction and
      the FORWARD carries real day-over-day deltas from a continuous level. Unit-tested (`test/chain-wallets.test.mjs`).
    - **⚠ SOLANA IS TOO HEAVY TO EXECUTE ON THE FREE-TIER API** — the as-of reconstruction over ~363k ever-seen wallets returns 0
      rows when EXECUTED via the API (no error, just empty). That's why the builder does NOT touch Dune. **Optional path to TRUE
      Base/Solana auto:** a lighter crossing/net-flow query (entry=0→+, exit=+→0, cumulative sum, NO non-equi join) that runs under
      the 2-min limit; provided in dune/*.sql. For now the chart is reliably correct (230,159) with zero fragile external calls.
    - **✅ BASE HOLDER-COUNT CORRECTION (owner confirmed 114,535 truth).** Blockscout (the free daily Base source) OVER-COUNTS by
      ~12.8k (127k vs ~114.5k; Basescan/Dune agree at ~114.6k). The wallet-growth chart rebases this away at the seam. The multichain
      donut card + copy used to read raw 127k — now routed through a shared `currentChainHolders(stats)` helper (stats.mjs) that
      prefers the CORRECTED `chain-wallets.json` latest point. snapshot.mjs still banks the raw Blockscout reading in history.json
      (honest raw); nothing user-facing displays it. ONE data-driven correction (the seam offset), no magic constants.
    - **⚠ FIXED 2026-07-18 — chainrace printed ~0% for ALL chains.** It read `supply.chainSeries` (the DAILY snapshot log, only ~6
      flat days since 2026-07-13) → rounds to +0%; also holder growth has PLATEAUED for ~6mo. FIX: card + copy use a shared
      **`chainRaceData(stats)`** reading the LONG `stats.chainWallets` (157 wks) rebased to a **COMMON post-cold-start date** = first
      week each chain ≥5% of its current count (~Oct 2024) — dodging the "Base starts at 1 holder → +11,000,000%" artifact. Now:
      **Base +898% · Solana +784% · Ethereum +437% since Oct 2024.** Also scaled the y-axis gridline step to the range.

## ⭐ DUNE STANCE — USE IT, RECONSTRUCT LIBERALLY, WITHIN THE BUDGET (owner, 2026-07-17)
- **Policy shift from "avoid Dune / snapshot-forward everything":** the owner WANTS to use Dune and **reconstruct as much as
  possible** (on-chain metrics that aren't free elsewhere) — "keeping in mind the credit limit." Reconstruction is GREENLIT where
  it adds value, NOT avoided.
- **This does NOT relax the credit discipline below — it works THROUGH it.** The 2,500/mo budget is a hard ceiling; reconstruct
  freely within it via the discipline: read pre-computed balance tables, ONE-TIME chunked backfills (concat CSVs offline), weekly/
  monthly sampling, develop on `LIMIT`/short-window slices, stage intermediates, and NEVER the heavy transfer-scan/as-of pattern
  that times out (still charges). Reconstruct boldly, run carefully.
- **Prefer the LOCAL FIFO engine where it fits** (cheap raw-transfer extract → Node compute) so heavy math stays off Dune's meter;
  use Dune executions only for what genuinely needs the indexed chain (balances, counts, spends).
- **⭐ "GO DEEP ON SPX, NOT WIDE" — the wall-free frontier (owner morale reset 2026-07-17).** EVERY wall we hit was CROSS-ASSET
  (other coins' proprietary on-chain data paywalled — TOTAL3ES export, Coin Metrics active supply, Glassnode). NONE were about SPX
  itself — SPX's own chain data is fully reconstructable (Dune ERC-20 history + local FIFO engine, ~free). So the moat + the no-wall
  path is DEPTH on SPX. **THE RUNWAY (one cheap raw-transfer extract → local FIFO → a whole suite, $0 compute, no paywall):** NUPL ✅
  → URPD (cost-basis histogram) → FIFO LTH/STH → SOPR — all SPX-native, none gated.
- **✅ NRPL + LIVELINESS/DORMANCY SHIPPED 2026-07-26 (corecharts.com gap-fill).** We already match most BTC on-chain terminal
  metrics; the genuine gaps (pure transforms of what the FIFO engine replays): **Net Realized Profit/Loss** (dollar magnitude, we
  had SOPR the ratio) + the **coin-days family**. Engine: `consume()` returns realized profit/loss (split per lot) + coin-days
  destroyed (qty × lot age); per window emits `nrplProfit`/`nrplLoss`/`nrpl` (USD), `cdd`, `dormancy`; `snapshot()` sums still-alive
  `coinDays` so `liveliness = cumCDD ÷ (cumCDD + coinDays)`. Unit-tested (`test/onchain-local.test.mjs`). Cards `nrpl` (diverging
  green/red bars) + `liveliness` (0-1 line, rising=distribution) — `NO_ROTATE` hand-postable. Site `NrplChart.jsx` + `LivelinessChart.jsx`.
  🔲 DATA-GATED until the next `onchain-dune.yml` run. **Considered + skipped as off-moat:** active addresses (noisy on a thin token),
  SMA50/200 · Bollinger · Mayer (generic TA — we have riskheat/riskcolor).
- **✅ NUPL CARD SHIPPED 2026-07-17 — the immediate no-wall win.** `scripts/bot/nupl-card.mjs` (`nupl`, LOOK "dual", data-gated
  `mvrvSeries.length>=100`). NUPL = (mcap−rcap)/mcap = **1 − 1/MVRV** → a PURE TRANSFORM of `stats.mvrvSeries` (no new Dune).
  Capitulation→hope→optimism→belief→euphoria zones + break-even 0. SPX overshoots the BTC-calibrated bands (true range −3.84→+0.85)
  so the DISPLAY clips to [−1, 0.95] while the hero shows the true value. Site `NuplChart.jsx` (same transform live off history.json +
  `mvrvHistory()`).
- **✅ PLAIN-LANGUAGE EXPLANATION SWEEP 2026-07-17 (owner: techy charts need a "numbers-go-up" gloss; "wall text is a barrier of
  entry — slightly longer tweets, paragraphs separated by spaces").** A reusable **`<Explain>`** component (`src/chart-ui.jsx`:
  accent-bordered box, bold plain-language QUESTION + one airy sentence) on the techy site charts (SupplyInProfit, AltMarket,
  MvrvContext, OnchainValue, PiCycle, HolderConcentration, HodlWaves, Nupl) + a one-line plain-language **subtitle under the title**
  on the matching cards (mvrvtrend/supplyprofit/floormodel/altmarket/concentration/hodlwaves + mvrvbtc/picycle). Tweet copy left
  as-is (3 airy blank-line paragraphs leading with a plain hook).
- **✅ BITCOIN HODL WAVES SHIPPED 2026-07-18 — first FREE BigQuery reconstruction.** `bigquery/btc_hodl_waves.sql` (public
  `crypto_bitcoin`, UTXO age = EXACT, no FIFO) → 916 weekly rows genesis→now (~0.5 TB, inside free 1 TB/mo) → bundled
  `src/btc-hodl-waves.js` (`BTC_HODL`, same 5-band split as SPX hodlwaves). **A standalone BTC card is OFF-BRAND on an SPX account →
  rebuilt as a SIDE-BY-SIDE COMPARISON:** `hodl-compare-card.mjs` (`hodlcompare`, LOOK "stack") = SPX on top + Bitcoin below.
  **⭐ ALIGNED BY AGE, cropped to SPX's age, MINIMAL CHROME (owner: "same age, less explanation — visuals are the story, the tweet
  explains").** Reveal: at the same age SPX holds 53% of supply 1y+ vs BTC's 30% (post-FIFO-swap numbers) — SPX's diamond base
  matured FASTER than the king's. The standalone `btc-hodl-waves-card.mjs` REMOVED (superseded); the bundle + query stay. Proves the
  free-BigQuery path for BTC on-chain metrics — same route opens BTC realized-price/MVRV/supply-in-profit.
- **✅ FREE-FLOAT REBUILT AS SPX-vs-BTC SAME-AGE COMPARISON 2026-07-18 (later reframed to LIQUID/ILLIQUID — see below).** Free float
  = 100 − (age 6-12m + 1y+) = share that moved in the last 6 months — for BOTH SPX (stats.onchain) and BTC (src/btc-hodl-waves.js),
  same definition. **This RETIRES the dead Coin Metrics peers path** (SplyAct180d was paid-gated). ETH dropped (no ETH HODL data).
- **⭐⭐ HODL-WAVES IS THE VISUAL NORTH STAR (owner, 2026-07-18): "clean, colorful, impactful."** Full-bleed colour, minimal chrome,
  one big plain-word stat, no gridline clutter. **Any new card (and any visual pass) should aim for that energy.** The 2026-07-18
  brightness batch moved the 8 on-chain cards toward it (edge-bright gradient zones — vivid at the outer extreme, fading toward the
  middle so the line stays clean; vivid #fb7185/#38bdf8). `supply-profit-card.mjs` is the template.
  - **✅✅ ROSTER-WIDE VISUAL PASS 2026-07-25 (owner: "improve the look of all the cards").** Rendered all 74 on contact sheets. The
    roster had split into two header systems; unifying would mean rewriting 40 layouts and the bold-headline style IS the north star,
    so the fix was the opposite: give every card ONE shared signature, leave each headline alone.
    - **⭐ `scripts/bot/chrome.mjs` is now the live brand helper.** `brandStripe(H)` = a rainbow stripe down the left edge in the
      rainbow chart's OWN band colours (`BAND_LABELS` order, minus the near-black Max Bubble step). Emits its own `<defs>`, ONE line
      after the background rects. Matches the Aeon cards' teal→violet stripe so the two tracks read as siblings. **Any new card must
      include it.**
    - **Y-AXIS LABELS WERE CLIPPING OFF THE LEFT EDGE on ~15 cards** (floormodel "$0.0030"→".0030"; btcage "1,000×" lost its 1). Two
      fixes: the shared builder's `mL` 120→136 AND **`fitAxisFont`** measures the widest tick and shrinks type to clear the stripe;
      `xAnchor` anchors an edge x-tick inward so it can't print through the y-axis column. Also: right-gutter legend clipping →
      `mR` bumps; axis tick ink lifted #64748b→#8b98ad; generic title → #f1f5f9/800; footer 26→21px.
    - **Method worth reusing:** render `node scripts/bot/post.mjs --all`, build 4-up contact sheets, then scan the PNGs for ink in
      the first/last few pixel columns — catches clipped labels far more reliably than eyeballing 74.
  - **⭐⭐ ROUND 2 — "MORE CHART, LESS WRITING" (owner, 2026-07-25). Three conventions — any new card must follow them; do not
    reintroduce what they removed.**
    - **NO NEON UNDERLAYS.** 28 cards drew a 6–12px blurred copy of each line beneath the real one — owner: "makes the card not very
      readable" (halos bled into the zone colours). All line underlays gone; the crisp line carries ~1.2px more weight. **KEEP**
      marker/dot halos, the multichain donut gloss, the RSI dot bloom (those are the mark itself). The FADING AREA FILLS stay.
      `lineCardSvg`'s `glow: true` now just thickens the line. ⚠ Several blur filters were NOT named `*glow*` (`#ug`, `#hgG`,
      `#cyGlow`…) — match on `<filter>` defs containing `feGaussianBlur`, not the name.
    - **AXIS VALUES ARE REFERENCE, NOT CONTENT: 22px, regular weight, `#94a3b8`** (were bold near-white 26–30px). Smaller ticks need
      a narrower `mL` — trim each card's margins to what ITS gutters need (cards with real right-hand legends — hodlwaves,
      walletgrowth, floormodel, risklevels — can't give back the same width).
    - **A SUBTITLE ONLY EARNS ITS PLACE WHERE THE HERO IS STILL JARGON.** Cut on 11 cards. KEPT on `picycle`/`sopr`/`nupl` (hero is a
      bare number), `mvrvbtc` (the subtitle IS the card's question), `firesalerally` (defines the axes), `holdergrowth` (mind-the-scale
      warning), `multichain` (no hero). Delete in-plot labels that restate a gridline (`supplyprofit`'s "half in profit" vs the 50% tick).
    - **Net:** `supplyprofit`'s plot 51%→60%. **Header layout NOT changed** — owner kept the two bold lines (title 39 / hero 32):
      *"I want more charts and less writings."* Don't re-litigate the header.
    - **⚠ Layout constraints found the hard way:** the shared headline's descenders reach y≈180, so the generic builder's `mT` cannot
      go below **186**; the bottom y-tick's descenders reach the x-tick row unless `mB` ≥ **84**; and anchoring an edge x-tick inward
      is HARMFUL at 22px (merged roadmap's "20242025") — removed. At 22px the ticks clear the y-axis column on their own.
- **✅ FULL PROJECT AUDIT (Fable-5 review, 2026-07-18) — 3 defects fixed.** (1) **`model` copy hit 292 xLen live** (band-label
  variance) → trimmed ~12 chars AND the posts length test now checks EVERY post at 3 price points ($0.05 Fire Sale / default / $12
  Max Bubble) so value-drift can't slip past. (2) **whatnext hline label truncated under end-logos** → generic lineCardSvg fix: when
  end-logos reserve the gutter, plain hline labels anchor INSIDE the plot (mL+PW−10) with a dark chip. (3) **holdergrowth over-sold
  flat growth** (zoomed 49.0–49.4k axis made +0.9%/44d look like a surge) → hero/copy carry the honest % + "zoomed axis — mind the
  scale" subtitle, neutralised copy, rotation-EXCLUDED (superseded by holdersprice + walletgrowth, kept visible/monitored). Remaining
  (owner-pass, not bugs): mvrvbtc (price÷be) vs mvrvtrend (mvrvSeries) can print two MVRVs the same day — unify someday; breakeven
  hero duplicates floormodel. Owner on gloom cards: don't worry — negative cards are hand-curated/excluded and monitored.
  - **AUDIT CORRECTIONS (owner) — the "near-duplicate pairs" call was mostly WRONG:** (1) **rally vs firesalerally are different BY
    DESIGN** — `rally` = the run since the LAST Fire Sale low, must RESET when price falls back into Fire Sale; `firesalerally` = ALL
    fire-sale→fire-sale cycles overlaid. (2) **milestones is a VIDEO** (animated `scale` zoom-out) while memecoins is a chart — not
    duplicates. (3) cycle vs cycleclock same purpose → `cycleclock` rotation-excluded (kept `cycle`, the honest rhyme explainer;
    cycleclock = the aggressive owner-tuned projection, hand-postable).
- **✅ FIRE-SALE RALLY RESET BUG FIXED (owner caught it, 2026-07-18).** With price back in Fire Sale, `rally` still said "+4,036%
  since Sep '24". ROOT CAUSE: `ralliesFromAnchors` (models.js) dropped the LIVE episode because its bounce was still under `minGain`
  30% (a filter meant for HISTORY), so `lastFireSale` stayed on the old cycle. FIX: **the FINAL window (the live episode) survives the
  filter** — re-entry into band 0 starts a new cycle anchored on the NEW low, the prior cycle keeps its recorded top. Both posts got a
  FRESH-episode copy branch; the rally card widens to ~90d. Regression test (fire-sale-rally.test.mjs). NOTE the model-relative
  semantics: a "new low" is band-relative (the frozen model's floor marches up), so the new cycle's low can be a HIGHER price than an
  old out-of-band dip — correct by design.
- **⭐ "GO DEEP ON SPX" RUNWAY — ENGINE READY (2026-07-17), RUNWAY COMPLETE (2026-07-19).** The single extract yields ALL FOUR:
  `consume()` returns realized {val,cost}; `replayFifo` accumulates per-window spends → **`sopr`** per row (realized value ÷ cost of
  coins that MOVED; >1 = profit; null when nothing moved). New **`computeUrpd(wallets, spot, updated, nBuckets=42)`** → log-spaced
  cost-basis histogram of CURRENT held supply, each bucket flagged in/out of profit; `main` writes a companion **`urpd.json`**.
  Unit-tested. **FREE alternative to Dune: `bigquery/spx6900_raw_transfers.sql`** (public `crypto_ethereum.token_transfers`, free 1
  TB/mo). Owner only needs the TRANSFERS csv (price csv generated locally from `src/spx-daily.js`).
  - **✅✅ REAL EXTRACT RAN, ALL 3 CARDS SHIPPED 2026-07-19.** Owner ran the free BigQuery extract (545.9 GB, NO Dune credits) →
    **2,645,958 transfers** → local FIFO → onchain.json + urpd.json. **⚠ Two engine bugs surfaced only at real scale + FIXED:** (1)
    `Math.min(...transfers.map())` stack-overflows on 2.6M args → reduce loop; (2) held supply inflated ~1.75× (1.2B > 931M total)
    because BigQuery `block_timestamp` is per-BLOCK with no tx/log index, so a receive-then-send in the SAME block got mis-ordered →
    **engine now replays each same-timestamp block RECEIVES-first.** RECONCILES EXACTLY to Dune: rp $0.534 (Dune $0.538), 49,566 ETH
    holders, top100 58.1%, held 687.7M. Bundled `src/spx-fifo.js` (later merged into spx-onchain.js) + `src/spx-urpd.js`. **⚠ For
    EXACT intra-block ordering on a future extract, add `block_number`+`log_index` to the SQL and sort by them (drops the
    receives-first heuristic).** 3 cards:
    - **`urpd`** (`urpd-card.mjs`, LOOK "bars") — cost-basis histogram, green in-profit / red underwater at a spot line. **⚠ SPOT
      MUST BE LIVE, NOT THE EXTRACT'S FROZEN spot.** The BARS are historical but the spot LINE + green/red split + "% in profit" must
      track the LIVE price. Card uses `stats.price`; site `UrpdChart` takes a `price` prop (App passes `last.price`) → daily-snapshot
      fallback → frozen spot last resort; each bucket's in-profit = midpoint(lo·hi) < spot (recomputed; `urpd.json`'s baked `inProfit`
      ignored). Keep it live on any future edit.
      - **✅ COST BASIS × HOLDING AGE — engine + card + heatmap BUILT 2026-07-21, LIVE 2026-07-22.** `computeUrpd` splits each bucket
        by holder AGE (`bucket.age` = 5 HODL bands, % of held; free — FIFO lots carry acquisition ts). Card `urpdage` (`urpd-age-card.mjs`,
        LOOK "bars") = URPD walls stacked by age (fresh #fb7185 → old #22d3ee), headline "N% held 1y+". Real data: **"55% held 1y+ ·
        biggest wall 62% fresh (<3m)"**. **Site `UrpdAgeChart.jsx` = Bars / Heatmap / 3D toggle** (owner: DEFAULT is BARS — the card
        reproduced interactively; Ridgeline DROPPED). **URPD buckets bumped 42→72** (`urpdBuckets: args.buckets ?? 72`; `computeUrpd`
        default stays 42 for tests). **3D = `Urpd3D.jsx`** — orbitable three.js bar field (x=cost basis, z=age, y=supply%) with axis
        REFERENCE VALUES via `CSS2DRenderer`; **three.js is code-split** via `vite.config.js` manualChunks (`return 'three'`, ~135KB
        gzip) so it NEVER loads unless the 3D tab is opened.
        - **🔲 SIDE PROJECT — 3D SHOWCASE RENDERS (owner: "little side project", 2026-07-23).** A Python renderer for HAND-POSTED
          tweets (the Node/Resvg bot pipeline can't do 3D). **`tools/3d/render_3d.py`** (reads `public/onchain.json` + `public/urpd.json`;
          deps `matplotlib numpy pillow imageio imageio-ffmpeg`; `out/` gitignored). Renders **cba** (cost basis × age), **hodl** (⭐ HODL
          Waves in 3D = time×age×supply — the STANDOUT: fresh-wave collapses while the 1y+ diamond band swells 0→56%), **ven** (exchange
          supply by venue over time) + a `--spin` 360° MP4/GIF helper. **Rule: 3D only earns its keep with THREE genuine dims (two axes +
          magnitude) — NOT single series/ratios (rainbow, MVRV, NUPL, SOPR, valuation composite → stay 2D).** Backlog: URPD terrain over
          time (needs weekly URPD history), seasonality 3D calendar. Parked.
    - **`lthsth`** (`lth-sth-card.mjs`, LOOK "stack") — long vs short-term holders in profit/loss, 4-band stacked area. ROTATION-EXCLUDED
      by default (gloomy-leaning). **`sopr`** (`sopr-card.mjs`, LOOK "dual") — spent-output profit ratio oscillator, green/red zones at
      break-even 1.0. ROTATION-EXCLUDED by default (techy). Site charts `UrpdChart.jsx` / `LthSthChart.jsx` / `SoprChart.jsx` shipped
      2026-07-19 (read the SAME `/onchain.json` (FIFO) as the cards, so site + cards never drift).
    - **✅ AGE-BAND SWAP DONE — FIFO IS NOW THE SINGLE ON-CHAIN SOURCE (owner: "be consistent with data", 2026-07-19).** FIFO **per-lot**
      age differs from Dune's **per-address** age (Dune reset a whole address's age on ANY receive — a whale's small top-up flipped its
      entire balance to "0–1m fresh", reading 1y+ 37.7%; FIFO reads **1y+ 52.9%** = the TRUE coin age, BTC's UTXO method). All on-chain
      surfaces now read ONE FIFO series: **`src/spx-onchain.js` REGENERATED from the FIFO output** (kept `SPX_ONCHAIN` name+shape, now a
      superset with per-lot age + sopr + LTH/STH; every reader picks it up with NO rewiring); **`public/onchain.json` RESEEDED**;
      `stats.onchain` and `stats.fifo` are the SAME array (`src/spx-fifo.js` DELETED). **`.github/workflows/onchain.yml` (the Dune
      weekly master-query refresh) DELETED** — it would have re-clobbered onchain.json back to per-address age; dune/*.sql +
      `build-onchain.mjs` stay as dormant REFERENCE. New headlines: hodlwaves **53%** 1y+, hodlcompare SPX 53% vs BTC 30% (apples-to-
      apples), freefloat 22% liquid vs BTC 48%, supplyprofit sip 45%.
    - **✅ HOLDERSCAN vs FIFO ALIGNED — "COMMON GROUND = >90-DAY HOLDER" (owner clarified 2026-07-19).** I first mis-read an
      inconsistency and sunset the HolderScan cards; owner CORRECTED and I reversed it. **KEY FACT: HolderScan "diamond" = wallets
      holding >90 DAYS — the SAME cohort as FIFO LTH (lthsth, >90d).** They RECONCILE: HolderScan diamond 86% of classified / 61% of
      supply ≈ FIFO LTH >90d 86% of holders / ~63%. My false alarm (61 vs 53) was a THRESHOLD MISMATCH (I compared >90d against the
      1-year+ hodlwaves band, 53%). Three labelled thresholds coexist: **>90d "diamond/long-term"** (86% holders / 61% supply), **1y+**
      (hodlwaves 53%), **moved-in-6mo "free float"** (22%). **WHY HOLDERSCAN STAYS: it pulls DAILY (auto) while the FIFO series is
      MANUAL until the daily pipeline is built** — the daily-fresh BRIDGE; FIFO is the long-term source. So the NO_ROTATE sunset was
      REVERTED. `distribution` + `diamondtrend` KEPT in rotation, relabelled "held 90 days+" so the threshold is explicit. `marketcap`
      KEPT on the FIFO free-float basis (22% float). Site `HolderscanDashboard` reframed "61% in diamond hands" → "61% of supply held 90
      days+"; `SupplyConviction` tile KEPT as the daily bridge. Migrate distribution/diamondtrend/SupplyConviction to FIFO once daily lands.
    - **⭐⭐ PARKED FOR A PROPER CONVERSATION — HODL / HOLDER-AGE / FREE-FLOAT STANDARDS + A LONG-FORM ARTICLE (owner, 2026-07-19 —
      LEAVE ALL CARDS AS-IS, resume when back).** State to resume from:
      - **ONE FIFO age curve** (SPX bands [0-1m,1-3m,3-6m,6-12m,1y+] = 5/9/9/25/53%): held **>90d = 86%** holders / 61% total · **>6mo
        = 78%** → free float 22% · **>1y = 53%**. "Free float" (moved WITHIN the window) GROWS with the window: 14% (90d) → 22% (6mo) →
        47% (1y). **INDUSTRY-STANDARD LTH = Glassnode 155 days (~5mo)** (spend probability flattens ~155d). 90d (HolderScan) = the
        SOFT/short end; 1y+ = strong-conviction. SPX at ~3yr doesn't need the 90d crutch. RECOMMEND adopting **155d as "long-term
        holder"** + keep 1y+ as diamond; 90d = HolderScan daily bridge, always labelled ">90d".
      - **⭐ CEX-HELD COINS SHOULD COUNT AS FREE FLOAT (owner's key point, AGREED).** The old `marketcap` applied the HOLDER
        age-distribution to TOTAL supply, so the ~243M on the 16 excluded addresses got lumped into "locked" — but exchange/LP coins are
        the MOST tradable. **⭐ REAL NUMBERS COMPUTED 2026-07-19 (SPX is a FAIR LAUNCH — no team/VC lockup):** 931M circulating (1B −
        69M burn) = **holders 687.7M (74%) · CEX+unlabeled 118.6M (13%) · Wormhole bridge 111.5M (12%, backs Base/Solana) · Uniswap LP
        13.2M (1%)**. The ONLY burn is `0x…dead` = 69.01M (received-only); `0x0` is the MINT source. Owner-tagged sinks: `0xdc154f…` =
        BitGo custody (7.25M, float-eligible), `0xf35a6b…` = CoinSpot, `0x6d6cc6…` = KuCoin. All 16 in **`EXCLUDE_LABELS`** with a
        `kind` (null/burn/bridge/lp/cex/custody). **TRUE FREE FLOAT = circulating − burn − bridge = 819.5M ≈ 88% (ETH-native); ~99%
        multi-chain.** So the "22% thin float" story is WRONG — the honest read is **~88% free float but LOW TURNOVER (~78% hasn't moved
        in 6mo)**. LTH: @90d 86.5% · @155d 80.8% · @1y 52.9%.
      - **✅ REFRAME RESOLVED — the concept is LIQUID vs ILLIQUID SUPPLY, not "free float".** "Locked" is the WRONG word (self-custody
        held 6mo can move any second); "free float" is WEAK for a fair-launch token (~88-100% available). The RIGHT standard is
        **Glassnode's Liquid vs Illiquid Supply** (how likely supply is to come to market, from holder behaviour). Glassnode's TRUE
        metric is BEHAVIOURAL (per-entity outflow÷inflow) needing entity-clustering; **OUR reproducible version = age + location:**
        **ILLIQUID** = LTH supply, self-custody, held **>155 days**; **LIQUID** = STH (<155d) **+ exchange balances + LP** (they're
        liquid regardless of age). Bridge shown separately; burn out. **SPX NUMBERS (ETH-native, denom 819.5M):** illiquid 555.5M =
        **~68%**; liquid (STH 132M + CEX 118.6M + LP 13.2M) = ~32%. Comparable to **BTC ~70-75% illiquid** ("nearly as sticky as
        Bitcoin's"). OPTIONAL refinement: a per-address spend-ratio (outflows÷inflows) = a lightweight behavioural version.
      - **✅ BUILT 2026-07-19 — "LIQUID vs ILLIQUID SUPPLY" reframe shipped.** Engine emits `heldTokens` + `liqEx` (CEX+LP+custody,
        via EXCLUDE_LABELS kinds) per row, bundles at **155-day** LTH. New shared `src/liquidity.js` (`spxLiquidity` + `btcIlliquid`).
        Reframed `free-float-card.mjs` (id stays `freefloat`) + `FreeFloatChart.jsx` → SPX vs BTC illiquid %, same age + BTC 24mo
        forward. Reveal: **SPX 68% illiquid vs BTC 54% at the same age.** `lthsth` relabelled to 155d (81% now). `marketcap` RETIRED
        (NO_ROTATE — thin-float premise false). Catalog title → "Liquid vs Illiquid Supply".
      - **🔲 BASE ON-CHAIN RECONSTRUCTION — follow-up (owner, "not needed immediately").** Owner saw a Base dashboard "14 whales =
        49.6% / top-100 68% / Gini 0.994". **KEY: that's UN-FILTERED — those "whales" are almost certainly INFRASTRUCTURE** (Wormhole
        bridge, LP pools, CEX hot wallets — **Coinbase is native on Base**, the Dec-2024 airdrop distributor). Same trap our ETH
        `EXCLUDE_LABELS` fixes (raw top-100 68% → 58%). Buildable identically: Base ERC-20 → BigQuery/Dune `erc20_base.evt_Transfer`
        (Base SPX `0x50dA645f…bb2C`, decimals 8) extract → SAME FIFO engine with a Base `EXCLUDE_LABELS` set. NOT urgent (Base ≈ 12%).
      - **⭐ ARTICLE — GREENLIT TOPIC (build when the conversation lands).** Long-form explainer hosted on the site: what HODL waves +
        holder age mean → why "% held" changes with the window (90d/155d/6mo/1y) → industry standards → free float + CEX/lost-coin
        nuance → how SPX measures up on the STRICT standards (no 90d crutch; 53% 1y+) → SPX vs BTC on consistent methodology. On-brand
        (honesty moat, educational). Distinct from the cards — the "explain the metrics properly" piece.
- **✅ DIAMOND-HANDS HISTORY EXTENDED TO LAUNCH via FIFO (owner asked, 2026-07-20).** HolderScan banks `sup.diamond` only since
  ~2026-06 (47 pts), but the FIFO reconstruction carries the SAME number back to launch: **diamond (held >90d) = age bands 3-6m +
  6-12m + 1y+** (age[2]+age[3]+age[4]) as a share of held supply. RECONCILED across the overlap: **mean |Δ| 0.2pp, max 0.7pp**.
  `stats.mjs` `loadSupplyHistory()` splices: **FIFO backbone (launch → HolderScan's first day) + HolderScan's own daily points
  since** — full **0%→~87% maturation** with recent trend + live "now" staying HolderScan's verifiable numbers. No rebase (0.7pp
  seam invisible; keeps launch at exactly 0%). Both `diamondtrend` card + `SupplyConviction` site chart use it.
- **✅ EXCHANGE-FLOW / CEX NETFLOW CARDS SHIPPED 2026-07-21 (owner greenlit 2026-07-20).** Coins ONTO exchanges = sell-side, OFF =
  accumulation. **Our edge vs BTC analytics: we also have LP (Uniswap) balances**, so we SPLIT liquidity depth from exchange
  sell-side. Engine emits `cexBal` (Σ kind=cex) + `lpBal` (Σ kind=lp) per row. **⭐ DUNE PATH (independent of BigQuery):** CEX/LP
  balances are just the balances of the ~13 tagged addresses — **`dune/spx6900_cex_lp_balances.sql`** (daily SIGNED net flow per
  tagged address, HARD-BOUNDED to the SPX token + those addresses = a few GB / few credits). Ran directly via the Dune MCP (query
  8053292, 3,615 rows, **5.99 credits**) → `dune/out/spx6900_cex_lp_flows.csv`. RECONCILES to the FIFO engine's liqEx to 0.14%.
  `scripts/build-cex-flow.mjs` → bundle `src/cex-flow.js` (weekly balance + **organic-vs-onboarding netflow split**: an address's
  first 21 days = one-time listing fill).
  - **⭐ THE KEY FINDING (why the split matters):** the two biggest "inflows" were **new wallets ramping zero→20-27M in days =
    exchange LISTINGS** (Kraken, Sep-2025). Strip the listings and **organic net = −11.5M (net WITHDRAWAL off exchanges)** vs +122.7M
    onboarding — the OPPOSITE of the naive "supply piling on = sell pressure" read. Self-custody leaning, not distribution.
    Cycle-timing only *suggestive* (one cycle, lumpy) → framed as behaviour, NOT a signal. Honesty caveats: known-addresses-only
    (undercount), netflow ≠ guaranteed buy/sell (OTC/internal/MM), SPX is thin → weekly smoothing + POSITION read.
  - **Two cards** (both NO_ROTATE hand-postable): **`cexsupply`** (LOOK stack) = "Where SPX6900's tradable supply sits" — stacked
    area LP/exchanges (the DEX-native→CEX-listed shift, LP 50M→13M, CEX 0→111M). **`cexflow`** (LOOK dual) = "On exchanges — flow vs
    price" — weekly organic netflow (red deposits/green withdrawals) with listing weeks greyed, price on top.
  - **✅ VENUE-TAGGING (owner sent all 13 → 27 by 2026-07-22).** `EXCLUDE_LABELS` is now the SINGLE SOURCE OF TRUTH — `build-cex-flow.mjs`
    reads `kind` from it, so re-tagging needs NO Dune re-run. **✅ CUSTODY FOLDED INTO EXCHANGES** (owner: "custody too specific") —
    both BitGo WalletSimple proxies (`0xdc154fce`, `0x73d8bd54`) → `kind:"cex"`; no more custody/other kinds.
  - **✅✅ ROOT-CAUSE BUG FIXED 2026-07-22: EXCLUDE vs EXCLUDE_LABELS DRIFT.** The engine had TWO structures: `EXCLUDE` (a hardcoded
    Set — what the FIFO engine actually excludes) and `EXCLUDE_LABELS` (names/kinds). Adding 14 wallets only to `EXCLUDE_LABELS` left
    them classified but NOT excluded → still counted as holders, their 16.56M MISSING from cexBal. FIX (commit 673c5c0): **`EXCLUDE =
    new Set(Object.keys(EXCLUDE_LABELS))`** — derived, one source of truth, can't drift again. Corrected: CEX supply 118.6M→135.1M,
    top100 58.13→59.08%.
  - **✅✅ FINAL CEX WALLET LIST + PER-VENUE CARDS & SITE CHARTS SHIPPED 2026-07-22.** Full Dune sweep: **27 CEX wallets, total 138.6M
    = 13.86% of supply**. **KEY FINDING (owner verified): Binance & Coinbase genuinely hold almost NONE** (~0.7M / 0.66M each) — NOT a
    coverage gap; the big untagged whales aren't them. So the venue split is REPRESENTATIVE → the honest story is "Kraken 43% leads,
    the two giants custody almost none." Engine emits **`row.cexVenues`** (via `cexByVenue()` + `canonVenue()` which collapses "Kraken
    245/246/3/-linked"→"Kraken"). **Two cards** (NO_ROTATE): **`cexvenues`** (`cex-venues-card.mjs`, stacked-area-by-venue) +
    **`cexvenflow`** (`cex-venflow-card.mjs`, diverging tornado of per-venue net flow). **Two site charts:** `CexVenuesChart.jsx`
    (stacked area + market-share DONUT) + `CexVenFlowChart.jsx` (tornado + 30d/90d/180d/1y selector). Both read onchain.json →
    DATA-GATED until the next Dune pipeline run populates `cexVenues`, then hands-off weekly. **⭐ Bybit is the dominant swing venue**
    (its big drops coincide ~1:1 with total exchange outflows; Aug-2025 −25.3M ≈ the whole week's −24.3M). **🔲 0x73d8bd54 ambiguity:**
    flagged "BitGo custody 2 (Dune: sushiswap?)" — if a SushiSwap pool it should be `lp` not `cex` (kept as cex, 2.6M).
  - **Owner's geography angle:** venue tags → WHERE SPX trades (Coinbase≈US · Bybit/Binance/Upbit/Indodax/MEXC/Gate≈Asia · Revolut/
    Bitpanda/Bitvavo≈Europe · CoinSpot≈AU). A "where in the world" read once coverage firms up.
  - **✅ PRICE-LINE FIX (owner caught it):** the cexflow price line used **`SPX_DAILY`** (bundled CoinGecko daily, NOISY + MIS-LEVELLED
    in the 2026 drawdown — Mar-2026 zig-zags ±90% at ~$0.50 while true price was a smooth ~$0.30). Fixed to read **`public/price-history.json`**
    (dense, CI-cleaned; SPX_DAILY fallback). **Any future price-context chart should use price-history.json, not raw SPX_DAILY.**
- **✅ DAILY PULSE + FRESHNESS (owner: "weekly too sparse", 2026-07-21).** (1) Raw daily flow for a thin token is pure noise → the
  `cexflow` card + `CexFlowChart` plot a **7-DAY ROLLING** organic net (listings as grey bands). `src/cex-flow.js` rebuilt DAILY. (2)
  Site `CexFlowChart.jsx` + `CexSupplyChart.jsx`. (3) **Freshness = keyless snapshot-forward, NO Dune:** `snapshot.mjs` banks the
  tagged addresses' balances daily via a public ETH RPC (eth_call balanceOf batch, `ETH_RPC` override, soft-fails) → `build-cex-flow.mjs`
  splices them forward (seam-rebased) → `public/cex-flow.json`. ⚠ RPC untested in-sandbox — verify the first cron's cexBal ~111M /
  lpBal ~13M. **`src/cex-flow.js` = frozen Dune baseline (regenerate with `--bundle`); public/cex-flow.json = baseline+forward.**
- **⭐ FIFO / DUNE / BIGQUERY — corrected the record (owner, 2026-07-21).** Myth: "Dune resets a wallet's balance to zero when it
  receives more." FALSE — Dune tracks balances correctly (CEX balances reconstructed FROM Dune reconcile to the BigQuery-fed FIFO
  engine within 0.14%). What was real: the old Dune MASTER QUERY's per-ADDRESS reconstruction reset holding AGE to "fresh" on any
  receive (a whale top-up flipped its whole balance to 0-1m, under-counting LTH 38% vs the true 53%) — an AGE/method limitation, NOT a
  balance bug and NOT fundamental to Dune. Fix was per-LOT FIFO (local Node), independent of source. **BigQuery is preferred for the
  raw-transfer EXTRACT on COST, not correctness** (546 GB free on BigQuery's 1 TB/mo vs Dune credits for a full-history scan); the
  FIFO math runs locally regardless — use the cheapest dump.
- **✅✅✅ ETH MIGRATED OFF DUNE → BIGQUERY, LIVE & RECONCILED 2026-08-26 (Dune goes VIEW-ONLY on the free plan 2026-09-10 — email).**
  The daily on-chain ETH refresh no longer touches Dune. `onchain-dune.yml` now has a **gate step (`id: src`)**: if the `GCP_SA_KEY`
  secret is set → **`mode=bq`** (BigQuery), else → `mode=dune` (the old path, kept as a fallback). The name stays `onchain-dune.yml`;
  only the ETH SOURCE changed. Solana (keyless RPC) + Base (Alchemy) were already off Dune, and the ENTIRE downstream (FIFO engine,
  SPX City, smart-money, exit-flow, whale-entry, cohort-*, KV push) is byte-identical either way — the BigQuery branch just produces
  the same `transfers.csv` a different way.
  - **THE MECHANISM (no 546 GB re-scan — owner insisted, rightly):** the full transfer history lives in a BigQuery table we OWN,
    **`goog-fltx.spx_onchain.eth_transfers`** (`sender STRING, receiver STRING, time TIMESTAMP, value BIGNUMERIC`). It was **SEEDED
    ONCE via `bq load`** from the EXISTING GitHub release archive (`onchain-archive` / `transfers.csv.gz`, ~2.65M rows) — `bq load` is
    an INGESTION, NOT a query, so it costs **$0 against the query cap** (the 546 GB public-dataset scan is exactly what we avoided).
    Each daily run then: reads `MAX(time)` from our table → appends ONLY `block_timestamp > <that literal>` from
    `bigquery-public-data.crypto_ethereum.token_transfers` (a few GB, partition-pruned) → exports the whole table to `transfers.csv` →
    same local FIFO via **`build-onchain-dune-refresh.mjs --archive=transfers.csv --no-pull`** (the `--no-pull` mode I added: reuse
    pricesCsv()+runFifo(), skip the Dune call). In BigQuery mode "Re-upload the grown archive" is SKIPPED — the BQ table IS the archive.
  - **⚠⚠ THE BUG THAT COST RUN #52 (and the lesson): PARTITION PRUNING NEEDS A LITERAL BOUND, NEVER A SUBQUERY.** First attempt bounded
    the incremental append with `block_timestamp > (SELECT MAX(time) FROM our_table)`. BigQuery can't evaluate a subquery at PLAN time,
    so it couldn't prune the day-partitions and tried to scan the WHOLE ~605 GB history → hit the **200 GB `--maximum_bytes_billed` cap**
    (`BQ_MAX_BYTES`) → exit 1 (the cap did its job — $0 charged for the runaway). **FIX (commit b39226b):** read `MAX(time)` FIRST into a
    shell variable (tiny scan of our own table), then inject it as a **literal `TIMESTAMP '<cutoff>'`** into the INSERT so pruning fires.
    Strip CSV header+quotes (`tail -n1 | tr -d '"'`); strict `>` (never `>=`) so a re-run can't duplicate the boundary second. **RULE for
    any incremental BigQuery append against a partitioned public table: the partition-column bound must be a CONSTANT/literal — compute
    it in a prior step, never as an inline subquery. Keep `--maximum_bytes_billed` as the backstop; it turns a pruning mistake into a
    clean fail instead of a quota blow-through.**
  - **VERIFIED (run #53, 2026-08-26):** gate → BigQuery, append pruned (archive 2.65M → **2,709,036** rows, +~59k delta, NOT 605 GB),
    FIFO sanity gate PASSED — **`rp 0.5175 · holders 49,210 · top100 57.45`** (matches the last Dune pull), SPX City 26,651 wallets /
    4,904 citizens, Solana 1,952, Base 502 all green, committed `a77ba43`. Secret confirmed named exactly **`GCP_SA_KEY`** (SA
    `spx-onchain-ci@goog-fltx`, roles BigQuery Job User + Data Editor). `BQ_MAX_BYTES=214748364800` (200 GB) is the one safety knob.
  - **✅ FRESHNESS FIX — ALCHEMY LEADING-EDGE TAIL (2026-08-28, owner: "the data is 2 days old").** Google's public
    `crypto_ethereum.token_transfers` is a BATCH export ~1–2 days behind real time, so the BigQuery archive (and everything FIFO-derived:
    onchain/whales/exit-flow/smart-money/city) only reconstructed to ~2 days ago — Solana (RPC) + Base (Alchemy) were already live. Fix:
    **`scripts/build-eth-transfers-alchemy-tail.mjs`** pulls SPX transfers from the archive's newest timestamp → latest block via
    `alchemy_getAssetTransfers` (category erc20, the SAME live source Zerion/Etherscan read; we already use it for Base + AEON) and APPENDS
    them to `transfers.csv` between the BigQuery export and the FIFO engine in `onchain-dune.yml`. So every feed reconstructs through TODAY.
    **The tail goes to the CSV ONLY, never the BigQuery table** — tomorrow the public dataset covers the same days from canonical data, so no
    duplication (the BQ append is `> literal cutoff`, the tail is `> archive max time`, no overlap). Near-zero cost (a few pages/day on the
    existing `ALCHEMY_KEY`, free tier). **SOFT-FAILS (`continue-on-error` + internal try/catch)** → a bad pull just leaves feeds at the
    ~2-day BQ edge, exactly as before. Pure helpers (archiveMaxTimeMs/normalizeEthTransfer/tailRows/appendToArchive) unit-tested
    (`test/eth-transfers-alchemy-tail.test.mjs`). **⚠ NOT affected by the Sep-30 Alchemy deprecation — that's NFT endpoints only;
    `getAssetTransfers` is a core Transfers API our own notes recommend as the go-forward live path.** value stays RAW integer (engine ÷1e8).
  - **🔲 LAST FEED STILL ON DUNE — AEON SALES.** `aeon.yml` sales (`build-aeon-dune-refresh.mjs`, sales-only) is the only remaining Dune
    dependency (AEON transfers already moved to Alchemy 2026-08-20). Drafted the BigQuery replacement **`bigquery/aeon_sales.sql`** (a
    heuristic Seaport/Blur/WETH decoder — NFT Transfer + tx ETH value / WETH-to-seller, sweep-split, marketplace by router) but marked it
    **VALIDATE-BEFORE-WIRING** (it's not Dune's audited `nft.trades`). Cutover plan: owner runs it once → export CSV → diff last ~30 days
    vs the final Dune pull → build `build-aeon-sales-bq.mjs` (fills `price_usd` from a daily ETH/USD rate) → add a gated BQ step to
    aeon.yml like the ETH one. Must be done before 2026-09-10 (or accept AEON sales freezing when Dune goes view-only).
- **⭐⭐ DUNE-INCREMENTAL IS THE PRIMARY DAILY ON-CHAIN REFRESH + SINGLE SOURCE OF TRUTH (owner, 2026-07-27; SUPERSEDED for ETH by the
  BigQuery migration above 2026-08-26 — kept for the reasoning + the Dune fallback path that still works if `GCP_SA_KEY` is removed).** Two realisations:
  (1) the FIFO engine computes the WHOLE suite in ONE pass, so refreshing slow charts costs NOTHING extra beyond the transfer-delta
  pull; daily granularity is free (a local sample-grid choice, `--daily`). (2) Dune's "result read" bills by ROWS not RUNS, so daily ≈
  weekly on the READ side. So `onchain-dune.yml` is **DAILY (`cron 23 5 * * *`)**, pulling the incremental delta over the GitHub
  release-asset archive → local FIFO `--daily` → the full suite (NRPL/SOPR/liveliness/sip/hodl/conc/URPD) refreshes daily. **ONE source
  of truth:** GitHub archive + Dune delta + local engine, self-contained, no GCP dependency. **BigQuery (`onchain-bigquery.yml`) is
  DISPATCH-ONLY** — kept for ONE-TIME reconstructions (re-seed archive, BTC/ETH free-float, Base) + emergency backup; never scheduled
  so it can't race Dune to commit onchain.json (has a Gate step that skips cleanly without `GCP_SA_KEY`).
  - **⚠ ACTUAL COST MEASURED 2026-07-28 — ~18 CREDITS/RUN, ~540/mo ≈ 22% of the 2,500 quota, NOT the ~7% first estimated.** The
    estimate under-counted **QUERY EXECUTION** (`erc20_ethereum.evt_Transfer` is partition-scanned per run regardless of how few rows
    return) while correctly reasoning about the RESULT READ (~0). **So the only lever is CADENCE, not the window** — `>= DATE
    '<yesterday>'` is the floor; every-other-day ≈ 270/mo, weekly ≈ 78/mo. **DECISION: KEEP IT DAILY.** 540/mo buys the entire on-chain
    suite with ~1,900 credits/mo still free for one-offs. **Same lesson as the AEON overspend, from the other side: measure BOTH
    charges — there the READ was the surprise, here the EXECUTION is.**
- **✅✅✅ DUNE INCREMENTAL PIPELINE BUILT + LIVE & GREEN 2026-07-22 (owner: "build dune pipeline and lets go hands off").**
  `scripts/build-onchain-dune-refresh.mjs` + `.github/workflows/onchain-dune.yml`. Mechanism: the full raw-transfer history lives in a
  **GitHub RELEASE ASSET** `transfers.csv.gz` (tag `onchain-archive`); each run (1) downloads it, (2) finds the last day → cutoff, (3)
  pulls the Dune DELTA `WHERE evt_block_time >= cutoff` (PATCHes a saved query's SQL then execute→poll→`/results/csv`; ~17k rows → no
  402, ~few credits), (4) MERGES (base rows strictly before cutoff + the whole delta → boundary day cleanly REPLACED; canonical
  `sender,receiver,time,value`), (5) re-runs the LOCAL FIFO engine → onchain.json + urpd.json, (6) re-uploads the grown archive,
  commits + deploys. Pure helpers (colIdx/cutoffDay/archiveMaxTime/mergeArchive) UNIT-TESTED (`test/onchain-dune-refresh.test.mjs`, 5
  cases). **⭐ THE REAL CONSTRAINT IS PERSISTENCE, NOT DUNE:** FIFO needs the FULL history for per-lot ages, and Dune hands only the
  delta, so WE persist the growing base — the release asset. **⭐ CREDIT SAFETY:** only the WEEKLY/DAILY DELTA touches Dune; the SEED
  (full history) NEVER runs automatically (the workflow FAILS fast if the archive asset is missing). `--seed` (chunked, split on 402)
  is EXPLICIT-ONLY. **Run #2 succeeded end-to-end:** archive 2,645,958 rows → Dune delta 7,085 rows → merged → FIFO reconciled (**rp
  $0.527 · holders 49,578 · top100 58.07% · age1y+ 54.6%**) → committed 979af43 → deployed. **⚠ GOTCHAS that cost 2 failed runs:** (1)
  execute must OMIT `performance` — `performance:"medium"` is a PAID tier → 400 "Invalid performance tier" (runs on the free/community
  engine); (2) "Re-run jobs" replays the OLD commit, so after a code fix do a fresh "Run workflow", not re-run. 🔲 OPTIONAL: set repo
  var `DUNE_INCREMENTAL_QUERY_ID=8071932` to reuse the query; delete leftover temp queries in the Dune UI if wanted.
  - **🔲 TO RE-SEED (2 one-time steps, ZERO Dune credits):** (1) re-run the FREE BigQuery extract (`bigquery/spx6900_raw_transfers.sql`,
    546 GB inside free 1 TB/mo — NOT Dune) OR reuse the CSV, then `gzip -c full_transfers.csv > transfers.csv.gz && gh release create
    onchain-archive transfers.csv.gz -t "On-chain transfer archive" -n "FIFO base"` (any header — the script aliases from_address/…
    OR sender/…). (2) ensure `DUNE_API_KEY` repo secret is set. The `--seed` Dune path (~6 credits) is the ALT.
- **✅ BIGQUERY DISPATCH-ONLY REFRESH (owner made the GCP SA) — pending secret.** `.github/workflows/onchain-bigquery.yml` (DAILY?→now
  dispatch-only): GH Actions Google auth (`GCP_SA_KEY` secret) + `bq` CLI → keeps an OWN append-only table
  **`goog-fltx.spx_onchain.eth_transfers`**, incrementally appends new transfers (`block_timestamp > MAX(time)`, partition-pruned;
  FIRST run backfills ~546 GB once inside free 1 TB/mo), exports to CSV (FREE — no 402), runs `build-onchain-local.mjs --threshold=155`
  → onchain.json + urpd.json, sanity-checks, commits + redeploys. Project GOOG-FLTX, SA `spx-onchain-ci@goog-fltx.iam.gserviceaccount.com`.
  **🔲 Owner: add `GCP_SA_KEY` repo secret (JSON `goog-fltx-82a3fd6bc648.json`); SEED the append table once via `bq load` from the
  raw-transfer CSV (FREE, no scan) so the first run doesn't backfill 546 GB from genesis; dispatch → Claude validates logs (rp ~$0.53,
  ~49.5k holders).** Claude CANNOT run BigQuery from the sandbox (egress-blocked) or dispatch Actions (GH MCP read-only). Migrate to
  Workload Identity Federation later.
- **❌ WEEKLY-FULL DUNE REFRESH — DEAD END on the free tier (2026-07-21).** Exporting the full **2.6M-row** result via `/results/csv`
  returned **402 Payment Required** (exceeds Dune's free-tier result-read/datapoints allowance; small results are free — the 3.6k-row
  CEX query worked). Pagination doesn't help (total datapoints gate). REMOVED `.github/workflows/onchain-refresh.yml`;
  `scripts/build-onchain-refresh.mjs` kept DORMANT (works on a PAID plan). **The incremental delta (~17k rows/week, ~68k datapoints)
  is fine** — that's why the incremental pipeline is the primary path.
- **🔲🔲 OWNER TODO — AUTO-UPDATE via BigQuery (designed, the incremental Dune pipeline SUPERSEDED it as primary; BigQuery stays the
  dispatch-only one-time/backup path).** Was: a scheduled GH Action running an INCREMENTAL query → append-only BQ table → export (FREE)
  → local FIFO → commit. The ONE blocker was a **GCP service-account key `GCP_SA_KEY`** repo secret. **Refresh command:**
  `node scripts/build-onchain-local.mjs --transfers=X.csv --prices=<from spx-daily.js>` → re-bundle. $0, no Dune, no key.
- **⭐ CSV VERIFICATION 2026-07-22 (owner sent 4): NONE newer/better than what's bundled; 2 problematic.** `…valuation_distribution_weekly.csv`
  = the OLD per-ADDRESS master query (age_gt12m 37.7%) — **⚠ Don't overwrite onchain.json with it (would REGRESS the age to 37.7% vs
  the FIFO 52.9%).** `…mvrv_history.csv` = same as `src/spx-mvrv.js` (already have). `…weekly_wallets_query_7991945.csv` = Solana
  current holders (matches chain-wallets.js). `…holders_query_7991945.csv` = CUMULATIVE-ever (363,052) = **❌ WRONG metric, do not use.**
- **✅ DAILY GRANULARITY — SHIPPED 2026-08.** Granularity is just the sample-grid choice, NOT a Dune cost (the incremental delta is
  identical weekly or daily). Flipped by adding **`--daily`** to the `runFifo` spawn in `build-onchain-dune-refresh.mjs` (the engine's
  `--daily` flag → `mondays()` grid becomes all-days). Cost is purely local: onchain.json ~155→~1085 rows (~150KB gzipped) + ~7×
  snapshots, $0. NRPL/SOPR/liveliness now per-day; slow metrics just get denser; urpd.json is current-state (unaffected). The
  src/spx-onchain.js bundle stays weekly (fallback only — can't regenerate in-sandbox without the archive).

## Dune credit discipline — HARD-WON, read before writing/running ANY Dune query (2026-07-16)
- **⭐⭐⭐ CORRECTED 2026-07-26 — DUNE BILLS TWO THINGS, AND WE ONLY MEASURED ONE. The AEON daily pull was ~135 credits/DAY (~4,050/mo
  — OVER quota), NOT "0.6% of quota".** Each daily run had a cheap **Query Execution** row (0.20–0.47 credits) AND a separate **API
  Result Read** row of **62 (transfers) + 73 (sales)** credits. The result-read is billed by DATAPOINTS on the RESULT DOWNLOAD — a
  wholly separate charge from execution. Re-downloading the full 25,289-transfer + 17,040-sale history every day cost the 135.
  - **THE FIX (shipped):** `build-aeon-dune-refresh.mjs` is now **INCREMENTAL** — the full history is committed in `dune/out/*.csv`, so
    it PATCHes `AND <block_time> >= <archive's last day>` into the saved query and pulls only the delta (~6 transfers + ~3 sales/day).
    The result read drops to ~0. Merge is boundary-day-replace, unit-tested in `test/aeon-dune-refresh.test.mjs`. Same pattern as the
    SPX `build-onchain-dune-refresh.mjs`.
  - **⚠⚠ THE REAL LESSON (supersedes the "never INFER cost" one — right but incomplete): when you DO measure, measure BOTH charges.**
    `executionCostCredits` is only the execution. The download is billed separately as "API Result Read" and does NOT appear in that
    field — you only see it in the account credit LOG (getUsage line-items). **A cheap query whose RESULT is large is NOT a cheap job.
    Any pipeline that downloads a big result on a schedule must go incremental, not full-pull, no matter how cheap the execution reads.**
  **Bounded single-contract queries EXECUTE for ~0.1-0.5 credits — but READING a big result is a separate, larger bill.** Budget
  killers: heavy scans (10.5 TB Solana as-of = 654; aborted runs that still charge) AND repeated full-result downloads on a schedule.
- **The 2,500/mo free tier got blown in a WEEK, ~88% on ~5 heavy debugging runs.** One Solana run scanned **10.5 TB → 654 credits**;
  an *aborted* run **966**; a *cancelled* one **441**; a *timeout* **43**. The light master query (7991307) cost **1–3 credits**.
  Steady-state is a few hundred/mo — "**never run the expensive pattern.**"
- **CANCELLED / TIMED-OUT / ABORTED QUERIES STILL CHARGE** (often the most — the CPU is already spent). You cannot debug a heavy query
  by running and killing it. Fix the DESIGN first.
- **The 2-minute free-tier timeout is a hard wall.** A query that hits it burns credits AND returns nothing. Design every execution to
  finish in SECONDS, never near 2 min.
- **The levers, in order:** (1) READ pre-computed balance tables (`tokens_<chain>.balances_daily`, `solana_utils.daily_balances`),
  never scan raw `evt_Transfer` for a count/balance. (2) CHUNK heavy one-time backfills by time (concat CSVs OFFLINE). (3) SAMPLE
  coarser (weekly `day_of_week(d)=1`, monthly for deep history). (4) FILTER token FIRST + fewer columns + partition-prune on
  block_time. (5) STAGE intermediates as saved queries (cached → free reads). (6) DEVELOP on a `LIMIT 1000` / 30-day slice; remove the
  limit only for the ONE proven full run.
- **Claude CANNOT run Dune from the SANDBOX (egress-blocked)** — draft SQL, owner runs it. Drafts must be RIGHT before running (verify
  columns in Dune's schema browser, free) — a failed run is real money.
  - **⭐ EXCEPTION — a wired DUNE MCP (Claude Code CLI session) lets Claude run Dune DIRECTLY (added 2026-07-21).** `getTableSize` /
    `searchTables` / `searchTablesByContractAddress` / `searchDocs` are FREE metadata calls; only executions cost. Discipline: SIZE-first
    + SCHEMA-first (free) → BOUNDED run on the `free` engine tier (`performance:"free"`, LIMIT/short window) → read `executionCostCredits`
    → only then the full run. A COMPILE error scans nothing (~0 credits). Big MCP results save to a tool-results file; process with `jq`.
    **NOTE: the MCP's Dune key is SEPARATE from the pipeline's `DUNE_API_KEY`.** (A full multi-stage peer study cost ~36 of 2,500.)
    - **⭐ CONNECTOR STATE IS PER-CHAT (found 2026-07-22).** The Dune connector is installed + authenticated at the claude.ai ORG level
      (persists across machines), BUT each chat has its own `enabledInChat` toggle. If `ListConnectors` shows Dune
      `connected:true, enabledInChat:false` the tools are NOT loaded until the owner **enables Dune in this chat's connector settings**.
      A per-conversation toggle, not a per-machine reinstall.
- **What's Dune-gated vs free:** free/daily (never stale) = price/rainbow/holder-counts/wallet-growth/realized-price/MVRV/floor/
  break-even (the snapshot cron + HolderScan `be`). Dune-gated (frozen between refreshes) = supply-in-profit %, concentration, gini,
  HODL waves — the SLOWEST-moving metrics; a month of staleness is cosmetically invisible and self-heals.
- **Paying for Dune = NOT worth it** (owner, 2026-07-16): steady-state fits free; paying just raises the ceiling you can accidentally
  blow through. For a big one-time backfill, use the subscribe-one-month-then-cancel trick, not a standing subscription.

## ✅ Realized Price & Floor Model — card + site bands (2026-07-16, owner "build 2")
- **`floormodel` card** (`scripts/bot/floor-model-card.mjs`, LOOK "dual", data-gated `onchain.length>=50`) — spot vs the crowd's
  realized cost basis (`stats.onchain` rp/spot, ALREADY bundled → NO new Dune) with the **0.5×/0.8× realized multiplier "floor zone"**
  beneath. Full-history log view shows price repeatedly finding support there. Hero: "$0.37 spot · $0.54 cost basis — under cost basis
  · 1.36× the 0.5× floor". Guardrail: bands are historical support, NOT a promise. **Site: floor bands added to `OnchainValueChart.jsx`
  realized mode** (0.8× green dashed, 0.5× red dashed). **NOTE the realized-price data is NOT stale** — it forward-fills daily from
  HolderScan `be` via `mvrvHistory()`, so the floor model reads live even while other Dune-gated metrics are frozen.

## ✅ LOCAL FIFO ENGINE — offload the heavy math off Dune (owner idea, BUILT 2026-07-16)
- **`scripts/build-onchain-local.mjs`** — the professional pattern: Dune does ONLY a cheap raw-transfer dump
  (`dune/spx6900_raw_transfers.sql` — plain filtered SELECT, no joins/windows → GB not TB, a few credits, NO 2-min-timeout risk), and
  the heavy per-wallet **FIFO lot** reconstruction runs LOCALLY in Node for $0. Claude WRITES AND RUNS it.
- **Pipeline:** owner runs 2 cheap Dune queries (raw transfers + tiny daily `prices.usd`) → sends CSVs →
  `node scripts/build-onchain-local.mjs --transfers=t.csv --prices=p.csv` → emits the full on-chain suite in the `SPX_ONCHAIN` shape +
  LTH/STH fields (`lthProfit/lthLoss/sthProfit/sthLoss`). Bundle it like src/spx-onchain.js. Chunk the transfer export by year if too big.
- **Method (true FIFO):** each wallet a queue of {ts,price,qty}; a send consumes the EARLIEST lots first, so every held coin keeps its
  real age + cost. Excluded 16 addresses never queued as holders; a real wallet's receive is priced at the day's USD price regardless
  of counterparty (buy-from-pool = cost basis at market — correct). Produces rp/mvrv/sip/top10/top100/gini/age[5]/holders/spot + the
  LTH/STH split (90d default threshold, `--threshold=`). Denominator = tracked (non-excluded) supply → age bands sum to ~100%.
- **Unit-tested** (`test/onchain-local.test.mjs`, 5 hand-verified synthetic cases) + end-to-end smoke on synthetic CSVs. This
  **un-gates the whole on-chain suite from Dune credits** — one cheap extract → everything computed locally.

## 🔲 FIFO LTH/STH Supply in Profit/Loss — DRAFTED, run-once (2026-07-16)
- **`dune/spx6900_lth_sth_profit.sql`** — the metric that needs LOT-LEVEL FIFO (the master query uses AVERAGE cost per wallet, losing
  per-lot age). Loop-free FIFO via **cumulative matching** (a lot is still-held = overhang of cumulative-received over cumulative-sent).
  Stage 1 = cheap current-state (validate vs `sip`~40% / age≥1y~38%); Stage 2 = heavy historical daily series = **run ONCE in yearly
  CHUNKS (each <2 min), concat offline, bundle** — never a cron. 8-decimal scaling, full 16-address exclude, gap-filled price, 30/60/90d
  LTH toggle. Do NOT run until credits reset.
- **⚠ Owner's skeleton had 2 bugs:** `value/1e18` should be `1e8` (SPX is 8-decimal); and `SUM(realized_value)/SUM(amount) GROUP BY
  day` = daily transfer VWAP, NOT realized price (realized price is a STOCK — all held coins' cost basis, not a per-day flow).

## ✅ MVRV-vs-Bitcoin chart — SPX trail REMOVED (owner, 2026-07-16)
- `MvrvContextChart.jsx` used to overlay SPX6900's OWN full MVRV history (purple trail) on Bitcoin's decade. Removed as redundant —
  SPX's MVRV now has dedicated homes (`mvrvtrend` card + `mvrv` page). KEPT the chart's purpose: the "SPX today N×" marker line + ±band
  + magenta match-dots that POSITION SPX's current MVRV on Bitcoin's map. The `mvrvbtc` bot card never had the trail (marker only).
- **v3 — PRE-COMPUTED BALANCE TABLES, no transfer scanning (owner insight 2026-07-16, now REFERENCE-only, superseded by snapshot-forward).**
  Dune MAINTAINS per-wallet balances, so the count queries read those (seconds not minutes). **Solana:** `solana_utils.daily_balances`
  is SPARSE (row only when a balance changes) → forward-fill via validity intervals (lead()→valid_to) range-joined to a Monday
  calendar. **Base:** `tokens_base.balances_daily` is DENSE → filter token + bal>0 + Mondays. **VERIFY on first run** (Dune churns
  column names): Solana cols token_balance_owner/token_balance/day; Base tokens_base.balances_daily · address · token_address ·
  balance · day (older erc20.view_* uses wallet_address/amount). Mint = OUR Wormhole mint J3NKxx…3KFr (NOT the SPX1Q8… docs
  placeholder). Saved query IDs Base 7996694, Solana 7991945.

- **⭐⭐ ON-CHAIN IS THE NEW FRONTIER — Dune-backed pipeline + eventual HolderScan cutover (owner strategy, 2026-07-15).** The moat
  (honest valuation) and on-chain data are the same thing. **ONE body of Dune work does BOTH jobs:** the per-wallet reconstruction
  that replaces HolderScan is the SAME cost-basis + holding-age engine that unlocks the new frontier metrics. Reconstructs per-wallet
  balance + cost basis + age from ERC-20 transfer history (ETH-native) → everything HolderScan gives PLUS things it never could.
  - **BUILD ORDER:** (1) ⭐ Supply in Profit % FIRST (highest-value, previously impossible from HolderScan's aggregate `be`, most
    on-brand — one plain-word number). (2) Cost-basis distribution / URPD ("where the bags are"). (3) HODL waves / age cohorts
    backfilled to LAUNCH (diamondtrend + holdergrowth were forward-only).
  - **HOLDERSCAN → DUNE CUTOVER (saves ~$200/yr; owner wants it eventually).** Dune reproduces ALL of it (break-even VALIDATED: Dune
    realized $0.564 vs HolderScan `be` $0.537, ~5%). **Migration hygiene: run BOTH in parallel ~2–3 weeks, confirm daily Dune matches
    HolderScan within tolerance, THEN cancel** — no silent discontinuity on cutover day. Age tiers with TRANSPARENT PUBLISHED
    thresholds are BETTER than HolderScan's proprietary buckets = more honesty moat.
  - **API mechanic:** reading cached results is cheap, only EXECUTIONS are rate-limited. Wire `DUNE_API_KEY` BOTH as a GH Actions
    secret (crons) AND Vercel env (any live endpoint). Guardrail: on-chain metrics stay valuation-POSITION statements, never buy signals.
  - **✅ MASTER SQL — `dune/spx6900_onchain_snapshot.sql` (Stage 1) + `dune/spx6900_onchain_history.sql` (Stage 2, weekly series).**
    Stage 2 RAN & BUNDLED 2026-07-15 (query 7991307, 152 weekly rows) → **`src/spx-onchain.js`** (`SPX_ONCHAIN = [{d,sip,top10,top100,
    gini,age[5],holders,rp,mvrv,spot}]`) → `stats.onchain`. (Later REGENERATED from the FIFO output — see the AGE-BAND SWAP.)
    **⭐ OWNER REVIEW FIXES (all applied):** decimals=8 CONFIRMED; **Price gap-fill** (cost CTE joins a forward/back-filled daily
    calendar so no receive on a price-feed-gap day is dropped from the VWAP); **Hot-potato caveat** (address-level cost basis resets at
    every intermediary hop — exclude list fights known ones); a scheduled Dune query REPLACES its cached result (the forward series
    needs OUR snapshot cron to append). **Trino gotchas:** `sequence(DATE,DATE)` must omit the explicit `interval '1' day`; convert
    tz-aware timestamps to plain `DATE`; qualify `legs.d` (ambiguous after the join).
    - **✅ STAGE 1 RAN 2026-07-15 (35s, 51 credits) — VALIDATED:** realized_price $0.4959 (vs HolderScan `be` ~$0.54), holder_count_eth
      49,598 (vs Etherscan 49,520 — 0.16% off, validates the whole balance reconstruction), gini 0.981.
    - **✅ EXCLUDE LIST REFINED (16 addresses; diagnostic `dune/spx6900_top_holders.sql`).** After the full 16-addr exclude:
      realized_price **$0.5381 — within 0.4% of HolderScan `be`** (was 8% off with 2 excludes); top100 69%→58.2%, age>12m 26%→37.8%
      (the hot-potato fix). gini 0.981→0.973 (barely moves — dust-tail-driven, so top-N share, not Gini).
    - **⭐ MULTI-CHAIN SCOPE:** the query is ETHEREUM-only, so `holder_count_eth` is the ETH slice (~49.5k), NOT the ~230k total. Column
      renamed + header warns never to present it as "total holders." **Valuation metrics (realized price/MVRV/sip/concentration/age)
      STAY ETH-native by design** — cost basis is only reconstructable on the traceable chain, and ~94% of VALUE sits on ETH.
  - **✅ SUPPLY-IN-PROFIT + CONCENTRATION + HODL-WAVES cards + site pages SHIPPED 2026-07-15/16** (all off `stats.onchain`, no new Dune):
    `supplyprofit` (green line + zones + 50% line), `concentration` (top-10 + top-100 share; **gini left OFF on purpose** — it rose
    0.85→0.97 dust-driven while top-N FELL, contradictory; top-N is the clean "whales spreading out" read), `hodlwaves` (5 age bands;
    **GOTCHA: `<`/`>` in age labels break SVG XML → use "0–1m"/"1y+" + esc()**). Site: `SupplyInProfitChart.jsx`,
    `HolderConcentrationChart.jsx`, `HodlWavesChart.jsx`.
  - **✅ AUTOMATED DUNE REFRESH — `.github/workflows/onchain.yml` (WEEKLY) — later DELETED** (would re-clobber onchain.json back to
    per-address age after the FIFO swap; kept as dormant REFERENCE). ~50 credits/run × weekly ≈ 200/mo.
- **❌ FREE-FLOAT BTC+ETH PEERS via Coin Metrics — DEAD-END on the free tier (confirmed 2026-07-17, re-confirmed 2026-07-22).** Free
  float = `SplyActive180d / SplyCur`. `SplyAct180d` → **403 "not available with supplied credentials"** (the RIGHT metric ID but active
  supply is GATED behind paid Coin Metrics); their public GitHub CSV (`coinmetrics/data`, `csv/eth.csv`) has NO active-supply column
  (carries `SplyCur`, `SplyExNtv` EXCHANGE supply, `CapMVRVCur` — but NOT `SplyAct180d`). **Takeaways:** (1) SPX-vs-peers free float
  ALREADY ships SPX-vs-BTC (BTC via our OWN free BigQuery UTXO HODL reconstruction, `src/btc-hodl-waves.js`); ETH dropped
  (account-based, needs its own reconstruction). (2) If ETH wanted, the free path is a Dune/BigQuery ETH reconstruction, NOT Coin
  Metrics. (3) `SplyExNtv` (exchange-held) is a LOCATION-based liquid proxy but a DIFFERENT definition than our AGE-based illiquid —
  **don't blend (breaks same-method honesty).** `freefloat-peers.mjs`/workflow left DORMANT + key-ready (`COINMETRICS_KEY`), renders
  SPX-only. **CM Network Data Pro is enterprise/sales-gated → NOT worth it.** ⭐ NOW THE GREENLIT PATH (owner 2026-07-17): a one-time
  Dune reconstruction of BTC/ETH active-supply-180d ÷ supply, bundled once.
- **⭐ BUILD THE FOUNDATION — collect data now, even at 3yr (owner, 2026-07-05).** Many ITC charts encode 15-year insights SPX is TOO
  YOUNG to show yet (quantile fan, Cowen corridor, cross-cycle diminishing returns). **Build the DATA-COLLECTION foundation now** so
  they mature (like the MVRV / holder-growth data-gated charts) — infrastructure + patience, not forcing a premature signal.
  - **Futures Long/Short foundation:** `scripts/build-longshort.mjs` + `longshort.yml` (daily) → `public/longshort.json`. **⚠ CEX all
    geo-block CI** (Binance 451, Bybit 403 to US GitHub runners — SPXUSDT is correct, it's purely an IP block). **Hyperliquid works**
    (coin `SPX`): the banker backfills full daily funding-rate history (`fundingHistory` hourly → daily mean) + banks today's OI (only
    current OI exposed, so OI accumulates). Chart + card `longshort` (data-gated ≥8 days). **Funding is NORMALISED to its neutral
    baseline** (median APR ≈ HL's structural ~+10%): bars show deviation FROM neutral (green above / red below), right axis absolute
    APR. Coinglass (free key, US-ok) is the fallback for Binance's crowd L/S. Override symbols via `BYBIT_LS_SYMBOL` / `HL_COIN`.
- **❌ "Diminishing returns" — I GOT IT WRONG, reverted (owner, 2026-07-05).** Diminishing returns = each CYCLE'S RALLY (bottom→top) a
  smaller multiple than the previous (cross-cycle). I drew a trendline through the 365D-ROI *peaks within one cycle* — that's the last
  bull→bear ROI rolloff, NOT diminishing returns. **SPX is too young** (≈2 cycles). The honest home is the rally chart (+16240% → +415%
  → +81%), which needs more cycles.
- **✅ BOXY LAUNCH ERA FIXED — full daily bundle (owner CSV, 2026-07-15).** Owner exported the FULL daily SPX history from CoinGecko
  ("max", 2023-08-24→2026-07-14, 1051 pts) → **`src/spx-daily.js`** (`SPX_DAILY = [[date, price]]`, close-based). Merged into the DRAWN
  line via `DENSE_BASE` (DEFAULT_RAW + SPX_DAILY). Precedence: weekly DEFAULT_RAW < SPX_DAILY < price-history.json < live candles <
  snapshot. `build-price-history.mjs` SEEDS from SPX_DAILY so price-history.json always carries the full launch era (no Graph key needed).
  - **⭐ MODEL STAYS FROZEN ON WEEKLY — daily fit VALIDATED the choice.** Re-fitting the power-law on the DAILY series gives **R² 0.694**
    vs the frozen weekly **0.742** (exponent 4.60→4.06, fair value $1.83→$1.54) — WORSE (daily carries noise + heavy autocorrelation
    weekly closes smooth out). **Do NOT re-fit on daily.** Dense daily for the drawn LINE, frozen weekly `DEFAULT_RAW` for the FIT.
- **⭐ FLOOR-MODEL "FROZEN" WAS A STALE-PRICE BUG — FIXED 2026-08-21.** Owner: the floor model looked frozen. Root cause:
  **`price-history.yml` ran WEEKLY (Mondays)**, and the FIFO engine sets each day's `onchain.json` `spot` from that dense
  series — so mid-week (esp. during the 0.32→0.37 pump since Mon 08-17) recent spots **forward-filled the Monday price**, and
  anything reading `onchain.spot` directly (the `floormodel` CARD, the terminal header spot, `onchain.mvrv`, city TVL) froze.
  **NOT frozen:** the site chart (`OnchainValueChart` realized/floor-band mode) — `mvrvHistory()` lets the LIVE `history.json`
  price win on the tail, so it already showed ~0.37 (verified). Fixes: (1) `build-onchain-dune-refresh.mjs` `pricesCsv()` now
  **`mergePriceRows(price-history, history)`** — overlays history.json's live daily `p` on the dense base so the newest days
  price at the real close (self-heals onchain.spot/mvrv on the next onchain-dune run; unit-tested). (2) `price-history.yml` cron
  flipped **weekly → daily** (04:17 UTC, before onchain-dune) so the dense base + city/smart-money/exit builders stay ≤1 day
  fresh. (3) the terminal header spot now prefers `history.json.p` (live) over `onchain.spot`. **LESSON: any daily surface that
  prices off a WEEKLY feed will look frozen mid-week — overlay the live daily price on the tail.**
  - **✅ HARDENED 2026-08-21 (owner asked "why two crons + audit?"):** (a) **CONSOLIDATED** — `build-price-history.mjs` now runs as a
    step in the DAILY `snapshot.yml` (00:17, ahead of onchain-dune), and `price-history.yml` is demoted to manual-dispatch backup. One
    daily price cron, no separate weekly feed to drift. (b) **CROSS-FEED PRICE-CONSISTENCY AUDIT** — `audit-feeds.mjs`
    `priceConsistency()` DATE-ALIGNS each FIFO-priced feed's embedded price (`onchain.json` spot, `city-history.json` row price) to the
    live `history.json` close on the SAME day; >5% gap → WARN in feed-health.json + the panel. This catches the class the file-date
    audit is blind to (fresh FILE, stale VALUE — same as the AEON "completed-but-frozen" heartbeat). Unit-tested; price-history cadence
    tightened 9→2. **Blast radius that was frozen: ~9 builders price off price-history (onchain/city-history/smart-money/exit-flow/
    cohort-roi/cohort-survival/whale-entry/cex-flow/aeon-market); the SITE charts mostly self-corrected via the live overlay in
    `mvrvHistory`/`loadPriceHistory`, so the visible casualties were the cards + USD-valued tails.**
- **Dense historical price data — SOLVED IN STAGES.** `scripts/build-price-history.mjs`: **✅ CoinGecko COIN API (`market_chart`, free)** —
  free tier caps to last 365 days (reaches the true ATH region; Jul '25 top $2.15 daily on 2025-07-28); Pro key (`COINGECKO_PRO_KEY`)
  auto-upgrades to `days=max` (Analyst ~$129/mo → a one-month backfill = ~$129 one-time). **✅ Hyperliquid perp candles** (fills the 2024
  → mid-2025 middle gap, only back to the perp listing). **✅ DROPPED Uniswap subgraph (`GRAPH_API_KEY`) — do NOT create it** (SPX_DAILY
  already gives the full launch era; subgraph code stays wired dormant). **KEY CONSTRAINT: SPX launched Aug '23 as a DEX token; every
  CEX/perp listing came LATER (2024-25), so NONE reach Aug '23→2024** — only on-chain (subgraph, or paid GeckoTerminal) does. **Binance
  NOT wired** (`api.binance.com` 451 to US runners; the free route is data.binance.vision CSV dumps, more work).
- **⭐ TRUE ATH = $2.28 intraday (2025-07-28), NOT the bundle's $1.82 (owner, 2026-07-10).** DEFAULT_RAW is thinned to ~weekly so its
  peak SAMPLE missed the intraday spike. Fixed via `ATH = {price:2.28, date:"2025-07-28"}` in `src/data.js` (intraday high-water mark,
  SEPARATE from the close-based line + frozen fit). Folded into `stats.ath`/`athDate`, threaded through drawdown
  (`buildDrawdownSeries`/`buildDrawdownCycles` take an `ath` param, floor the running peak from its date) and rally/fire-sale
  (`withAthFloor`). **Update the one constant if a higher high prints.**
- **⭐ CARD vs WEBSITE — different audiences, different defaults (owner, 2026-07-03).** **Cards are for the general public** → tight,
  cropped, single clear read at a glance. **The website is for DIGGING INTO THE DATA** → default to the FULL history + interactive
  **zoom**. First applied to `riskheat`. **Don't crop the website to match a card — that's backwards.**
- **Holder-tier "diamond" spikes are AGING, not accumulation (verified 2026-07-03).** On 2026-07-03 diamond jumped +8.0M but gold fell
  −8.9M while total classified + holder count were flat — a cohort **graduated gold→diamond by crossing the holding-age threshold**, NOT
  new buying. A diamond-share spike is **mostly mechanical** (a lagging confirmation a cohort held through, mildly positive) — NOT a
  leading signal, ~uncorrelated with the same-day price move. **Do not post a diamond spike as accumulation** (inaccurate = the honesty moat).
- **⭐ TWO diamond numbers — 61% of SUPPLY vs 86% of CLASSIFIED (owner, 2026-07-05).** `diamondtrend` headlines diamond as a share of
  TOTAL 939M supply (~61%); the `distribution` donut + HolderScan headline it as a share of CLASSIFIED holders (~86%, EXCLUDES
  exchanges/LP/contracts). Same coins, two denominators. **Decision: BRIDGE both on the card** ("61% of supply · 86% of classified").
  **When posting diamond numbers, always say WHICH denominator (or bridge them).**
- **❌ "Grade my entry" / "entry report card" — PARKED (owner, 2026-07-02).** Not exciting enough to justify the risk — **part of the
  community already dislikes the daily chart posting ("walking on eggs"), so anything cringey could create real problems. Do not revive
  without a strong pull signal from the audience.**
- **⭐ CONTENT PRINCIPLE (owner, 2026-07-02): don't force new formats for novelty.** The bar for NEW content types is high and rising.
  **Prefer insights that EMERGE from accumulating data over time** over invented engagement mechanics. When in doubt: quality of the
  existing rotation > adding to it.
- **✅ RESOLVED 2026-07-16 — band-watch daily-suppression RELAXED for extremes (owner greenlit).** Dropped `!dailyPostedToday` from
  `bandPostDecision` (the hourly EXTREME watcher = Fire Sale / Max Bubble only), keeping hysteresis + cooldown as the flap guards. So a
  once-per-excursion historic extreme now fires even if the daily rotation already posted (e.g. a Fire Sale crash on a daily-post day —
  the highest-engagement moment). BUY/SELL unaffected (daily slot, one/day). **The anti-flap hysteresis (fire once per excursion,
  re-arm only on return to a calm band) is the right guard — keep it.**
- **⭐ ENGAGEMENT ANALYSIS — FULL CSV (2026-06-24, X analytics export, ~50 posts) is the authoritative dataset.** Findings: (1) **Likes
  are a REACH game** — likes↔impressions corr = **0.94**; every chart card converts at ~4–5% like-rate, so the 25× like spread is a
  reach spread, not quality. (2) **Reach is NOT green-day driven** — impressions vs daily price return = **0.01**. (3) **Growth
  confound** — the audience grew (2–5 likes Jun 7 → 50–96 Jun 16-24) while like-RATE held ~4.5–5.3%. (4) Reach-controlled, VALUE/dip/fear
  cards resonate best per viewer (Fire Sale 5.5%, F&G dial 8.3%); aspirational targets (2.7%)/alltime (3.2%) UNDER-resonate (won on reach).
  **Verdict: "fire bullish cards on green days" is NOT supported — day-color barely moves reach. Real levers: chart cards >> text;
  honest value cards convert best per-viewer; virality is algorithm luck (unschedulable); the reliable engine is follower growth +
  consistency.** So: protect the band cards (don't over-suppress), keep chart quality high, post daily. **Measurement constraint: the
  free X API is write-only — the bot CAN'T read its own per-tweet metrics** (Grok inside X can, as a manual classifier).
- **✅ RECURRING ENGAGEMENT DASHBOARD — `/control` → 📈 Engagement tab (built 2026-08-22).** Since the free X API is write-only, the
  owner exports X Analytics CSVs (the **Content** per-post report + the **Account overview** daily report) and drops them into the tab.
  Everything is parsed + computed **in the browser** (`engRun`/`engParseCSV`/`engPearson` in `public/control.html`) — engagement data is
  NEVER uploaded or committed (private). It joins post/day dates to the committed `public/price-history.json` (via the `/api/control`
  read-proxy whitelist) and renders: KPI strip, a **price-relationship** table (impressions/likes/follows/visits vs price level · daily
  return · volatility, Pearson r), an auto verdict, **content buckets** (keyword-classified) + **post-shape features** by median
  impressions/like-rate/bookmark-rate/follows, top-by-reach / like-rate / follows lists, and a "what tracks new follows" per-post r table.
  **Persistent:** the last export you drop is saved in the browser only (`localStorage` `spx_engage_csv`, never uploaded) so the tab
  **auto-renders on reopen** — drop a new CSV (or just one of the two reports) to update; Clear wipes the saved copy. To extend: add a
  bucket rule to `ENG_BUCKETS`, or a feature row in `engAnalyze`.
  - **📍 LOCATION / VPN LOG (owner asked 2026-08-22 — "in China almost zero new followers; VPN on = stronger reach").** X's per-post CSV
    has **no per-viewer geography**, so reach-by-country can't be auto-derived. Instead the tab has a `<details>` "Location / VPN log":
    the owner types a timeline (`YYYY-MM-DD  label` per line, each label runs until the next date; `spx_engage_loc` in localStorage), and
    `engAnalyze` maps each post's date → label (`engParseLoc`/`engLocOf`) and renders a **"📍 By location / VPN"** table (posts, median
    impressions, like%, follows, follows/post, fol‰), sorted by follows/post, with a same-content-confound caveat. Owner-maintained,
    browser-only. (Separate from the site-visitor geo in `api/intel.js`, which needs the KV store connected.)
  - **⭐ 2026-08-22 REFRESH (202 posts May24–Aug21, 76 active days) CONFIRMS + SHARPENS the 2026-06-24 read.** (1) **Price is NOT related
    to engagement** — impressions/likes/follows vs price level, daily return, and volatility all **|r|<0.2**. The ONE real link:
    **profile visits track price volatility (r≈0.3–0.5)** — price moves make people LOOK, but it doesn't convert to reach or follows.
    (2) **Reach is the master variable** — **new follows track impressions at r=0.87** (far above likes 0.59). Grow reach → grow
    followers; price timing is irrelevant. (3) **What gets reach:** NEW visual/interactive product launches (🏙 SPX City intro = 9,231
    imp / 19 follows, the all-time best; whale grid; City weekly) + aspirational $-target posts; **LONG posts (>240ch) beat short**
    (935 vs 521 median imp) — the honest methodology tails help. (4) **What RESONATES per-viewer (like-rate + bookmarks):** valuation
    "are-we-cheap" reads (−1.3σ from fair value 7.8%, channel bounce 7.1%, golden cross 7.0%) — valuation posts have the top bookmark
    rate = the honesty moat is the engagement moat. **Actionable: keep shipping novel visual products, keep aspirational targets + long
    methodology tails, don't gate posting on price/green days.**
- **First follower-milestone post = 690, NOT 100 (decided 2026-06-24).** Hold for **690** (on-brand 69/6900). Build like the event
  posts: a one-off celebratory card, fired manually (`BOT_POST=`), suppressed around the daily. Tone: humble community thanks, NOT a flex.
  **Analytics aside (do NOT post as a claim): there is NO strict price↔followers relationship** — daily-return corr only ~0.36; the 0.90
  level-correlation is a one-day artifact. "Volatility drives discovery, content drives retention."
- **"Uptober" seasonal card — parked; fire it in September, NOT in rotation.** **MUST NOT** be framed as a "Sep/Oct-only strategy beats
  HODL by X×" backtest — an overfit artifact of a single year (excluding 2023, the Sep/Oct strength is driven ~entirely by 2024 (Sep
  +685% / Oct +889%); 2025 was flat-to-negative). n≈2 with one dominating outlier — an event, not an edge. Delivery: a time-gated
  seasonal post around September.
- **LLM copy + auto-replies — split by cost.** ✅ LLM-written post copy BUILT (shadow mode, the anomaly signals — see the detector
  section). **Auto-reply to repliers — parked, needs paid X API** (Basic ~$100/mo for READ access; the Free tier is write-only; owner
  won't pay; scraping violates ToS). Free alternative: human-in-the-loop draft-to-paste.
- **Holder-growth card: wait for ≥30 days of holder snapshots** before building a "holders over time" card (noted 2026-06-16).
- **Day-of-week "best day to buy" — rejected.** Same overfit trap as Uptober (~150 samples/weekday, crypto is 24/7). At best a
  myth-buster; **don't present it as a buy signal.**
- **Future card ideas — built/greenlit/skipped:**
  - ✅ **SPX6900 vs the S&P 500 (`spxvssp`)** — growth-multiple returns race, log axis (SPX ~497× vs S&P ~+68% since launch; S&P closes
    in `src/sp500-history.js`). Distinct from the `sp500` cube + `monthlyreturnssp` heatmap. **⭐ S&P LINE STALENESS FIXED (owner,
    2026-07-14):** bundled `SP500_HISTORY` froze ~3 weeks back while SPX kept going. FIX: `stats.spSeries` = `loadSpHistory()` (daily
    `rec.sp` closes from history.json) + `spMerged(s)` in posts.mjs extends SP500_HISTORY, so EVERY S&P line (spxvssp, sp500ytd/
    sp500roll12 via `spVsWindow`, monthlyreturnssp via `spxInSpSeries`) reaches today. Still worth periodically re-bundling sp500-history.js.
  - **✅ ALT-MARKET OVER/UNDER — SHIPPED 2026-07-16 (owner: NOT a rainbow, confuses with the price rainbow → an OVER/UNDER OSCILLATOR).**
    Owner exported TOTAL3ES (TradingView, ex-BTC ex-ETH ex-stables) → `src/total3es-history.js`. `src/alt-rainbow.js` `buildAltRainbow()`
    = SPX÷TOTAL3ES rebased to launch, log-linear trend + z-score; card/site plot the DETRENDED z on a flat baseline (0 = SPX's own
    trend strength vs alts, NOT parity — SPX structurally outperforms the sector). Card `altmarket` (`alt-osc-card.mjs`) + site
    `AltMarketChart.jsx`. Read: overbought at 2025 tops, deep cheap mid-2024, ~−1.2σ now · 79× the sector since launch. **✅ HANDS-OFF
    SNAPSHOT-FORWARD:** `snapshot.mjs total3es()` banks a keyless-reconstructed TOTAL3ES daily into history.json `t3es` — CoinGecko
    `/global` (total mcap + BTC/ETH dominance) minus DeFiLlama stablecoin cap → `total×(1−(btc%+eth%)/100)−stables`.
    `buildAltRainbow(history)` = bundle (PAST) + history.json forward. **SEAM REBASE:** forward t3es rebased to the bundle's level
    (`seamT3es/firstFwdT3es`) so the definitional offset never draws a jump. ⚠ CoinGecko/DeFiLlama BLOCKED in sandbox → fetch only runs
    in CI; VALIDATE the first cron's `t3es` (~$393B ± market move). A relative-valuation POSITION, not a signal. (Data source note for a
    future re-export: the free `tvdatafeed` lib pulls TOTAL3ES on a laptop; PULL TOTAL3ES ONLY, use OUR dense daily SPX for the ratio.)
  - ✅ **Power-law roadmap (`roadmap`)** — projects the fitted center line forward, stamps target-crossing dates ($6.90 Oct '27 / $69 Dec
    '30 / $690 Mar '36 — auto-computed via the inverse of `predict()`, shift if the model is re-fit). Companion to `channel`.
  - ✅ **Price colored by valuation z-score (`riskcolor`, RETOOLED to z-score 2026-06-26)** — price line recolored segment-by-segment by
    the **valuation z-score** = σ of the log-residual (log price − power-law fair value) from its full-history mean, mapped ±2.5σ →
    blue..red (`zScoreSeries(m)` + `zToUnit`) + a dashed fair-value line (`price / exp(z)`). **Distinct from the rainbow-band risk (0–1
    min-max).** **⚠ HORIZON: this is the LONG-TERM power-law deviation; the SHORT-TERM "heat vs its average" (Cowen's 20W-MA) is a
    DIFFERENT horizon = the `riskheat` card. Complementary, don't conflate.**
  - ✅ **PlanB-style RSI dots (`rsidots`)** — homage to @100trillionUSD's Bitcoin "Realized Price & Geometric MA": price as DOTS coloured
    by Wilder's RSI (blue→red, domain 35..85). **Reference line = trailing GEOMETRIC MA (`GMA_MONTHS=6`), not our fair value** (owner:
    "PlanB associates RSI with realized price"). MONTHLY closes, Wilder **RSI(6)** (`RSI_PERIOD`), left edge cropped to the first primed
    dot, r=7 dots, current month = live price. **🔭 REVISIT ~every 6 months (next ~2026-12) as history grows — lengthen `RSI_PERIOD`
    toward ~9→12→14 months and relax the crop** toward true PlanB parity + add the realized-price line once `be` is banked. (A true
    14-month RSI now leaves ~20 dots — too sparse.)
  - ✅ **Monthly returns year-vs-year grouped bars (`monthcompare`)** — same calendar month across years side by side, the **two most
    recent years** only (including 2024 would drag in the launch-pump outliers). Diverging from 0%, older=sky blue / current=gold.
    Distinct from `monthlybars` + the `monthlyreturns` heatmap.
  - **Card visual-impact pass (owner, 2026-06-26): thin price-only lines read as weak.** Recent custom-SVG cards got thicker primary
    line + a blurred same-colour **glow underlay** + a **fading area fill**. `lineCardSvg` supports a per-series `glow: true` flag (⚠
    SUPERSEDED by the 2026-07-25 Round 2 rule — `glow:true` now just thickens; NO neon underlays). The FADING AREA FILLS stay
    (`fill: 0.15`). **`riskheat` reworked** (Cowen-style): a colour BAND fills the gap between price and the 20W MA (red above / blue
    below); the bottom oscillator is **tanh-scaled** (`yE = cyc − tanh(e/maxAbs)·half`) so big extensions compress instead of clipping.
    ✅ `risklevels` (dashed line per risk level 0.1–0.7 labeled `risk:price`, y-axis anchored to the levels). ✅ `runningroi` (365D
    running ROI, dual log axes + 1× break-even line).
  - **ITC batch verdicts:** **SKIP — Average Daily Returns / day-of-week** (overfit, thin samples, 24/7). **SKIP — Supertrend** (buy/sell
    arrows off-brand — the moat is honest VALUATION, not trade signals). **SKIP — Cowen Corridor** (redundant with rainbow + channel).
    **BMSB** (20W SMA / 21W EMA band) = mild OK if any. **Meta: don't rebuild ITC's whole TA suite; favor valuation/on-chain.**
  - ✅ **PI CYCLE — built as the CONTINUOUS RATIO (owner "lets build both", 2026-07-08), NOT the binary cross.** `piCycleRatio(series)` +
    `piCycleState(ratio)` in `src/models.js` (shared by card `picycle` + site `PiCycleChart.jsx`, unit-tested). Ratio = `111DMA /
    (350DMA × 2)` (350/111 ≈ π), a descriptive extension/accumulation gauge. **The REAL FINDING (708 days):** SPX crossed above 1 in Oct
    2024, peaked **1.53 on 2025-01-09** at its ~$1.34 cycle top, entered accumulation Dec 2025, today ~0.25 (16th %ile, deep
    accumulation). **Honesty guardrails: "a Bitcoin indicator applied to SPX, for context — a rhyme, not a signal." Do NOT claim it
    "called SPX's top in 3 days"** (for SPX the cross fired ~3mo EARLY; it's the CONTINUOUS ratio that's honest).
    - **⭐ THRESHOLD CALIBRATION (owner, 2026-07-08):** ran the same math on BTC (5457 days) vs SPX (705). **0.5 accumulation FITS SPX**
      (below 0.5 30% ≈ BTC's 31% — keep it), but **1.0 is TOO LOW a "top" for SPX** (SPX above 1.0 26% of the time vs BTC 7.9%). A top
      comparable in rarity to BTC's 1.0 sits at SPX's ~p90. **DECISION: keep 0.5/0.4 fixed, TILT THE TOP ONLY to SPX's own p90
      (`zones.top = max(1.1, q0.90)` ≈ 1.49); 1.0 kept as a faint labelled "Bitcoin's top line" reference.** Shipped:
      `piCycleRatio(...).zones = {deep:0.4, accum:0.5, top:p90, btcTop:1.0}` + `piCycleState(ratio, zones)`; card + chart + copy read it.
  - **⭐ "AM I CHEAP?" DASHBOARD — greenlit for memory (owner, 2026-07-08), BUILT then SUPERSEDED by the composite.** Flags when MULTIPLE
    INDEPENDENT valuation gauges AGREE SPX is cheap/heated (corroboration is the signal). MUST read at a glance (plain words:
    "underwater", "accumulation", "Fire Sale"). Guardrail: a VALUATION-POSITION statement, never a buy/timing call.
  - **✅✅ SHIPPED 2026-07-22 — TIME-SERIES VALUATION COMPOSITE (owner: "custom valuation band based on all indicators, weight them
    clearly-labelled, remove am-i-cheap").** A proprietary valuation OSCILLATOR over history, fully reproducible.
    `scripts/bot/valuation-composite.mjs` (the engine, no Resvg so posts/tests/site all import it): 6 CLEARLY-LABELLED + WEIGHTED lenses
    (`INDICATORS`, weights sum 100). Each lens series oriented HIGHER = MORE EXPENSIVE, **percentile-ranked over its OWN full history**
    (`ranker`), forward-filled onto a weekly grid, weighted-averaged → `composite` 0..1. `ZONES` (0.20 Deeply undervalued green → 1.01
    Deeply overvalued red), `zoneOf`. VALIDATED: 86% overvalued at the Jan-2025 top, ~79% at the Jul-2025 ATH, 16-18% at the 2024
    bottom, ~19% now. Card `valband` (`valuation-band-card.mjs`, LOOK "dual") + site `ValuationComposite.jsx` (id `valuation`). Data:
    `scripts/build-valuation.mjs` → `public/valuation.json`, a step in snapshot.yml (keyless, zero cost). REMOVED: am-i-cheap-card.mjs,
    valuation-lenses.mjs, AmICheapDashboard.jsx. **To re-tune: edit the `INDICATORS` weights — the one knob.**
    - **✅✅ COMPOSITE v2 — INDEPENDENT AXES, DE-DUPLICATED, CROSS-ASSET ANCHORED (owner agreed 2026-07-26). This is the composite the
      landing redesign is built around.** MEASURED the flaw: the old flat 6-lens basket was mostly ONE factor (rainbow/MVRV/
      supply-in-profit correlate 0.69–0.85; SOPR 0.85 with MVRV) — weighting them 60% triple-counted one signal. **v2 = four INDEPENDENT
      AXES**, correlated lenses combined WITHIN an axis (each votes once) then weighted ACROSS: **Valuation 45** (rainbow · MVRV ·
      supply-in-profit, averaged) · **Trend 25** (Pi Cycle) · **Relative 20** (vs alt market) · **Sentiment 10** (F&G, LIGHT context,
      labelled crypto-wide). **Cross-asset anchor:** the unitless lenses (MVRV, Pi Cycle) blend own-history percentile 50/50 with their
      rank against BITCOIN's decade (`btcRefs` from btc-mvrv.json + BTC Pi Cycle off `BTC_HISTORY`) so SPX isn't judged on one ~3-yr
      cycle (`ANCHOR=0.5` knob). VALIDATED: 2024 bottom 2%, Jan-2025 top 90%, now 15% — and MVRV 0.71× reads 20th pct on SPX's own
      history but **2nd pct vs BTC's decade**. `valuationComposite(s)` returns `{series, cur, axes, indicators}`; valuation.json carries
      `axes`+`cur.byAxis`. **Candidate 5th axis (behaviour/flow: netflow, liveliness) admitted ONLY when CI measures |r|<~0.5 vs
      valuation** — not assumed. **Publish the correlation matrix on Methods = the moat** (turns "is this just price dressed up?" into a
      checkable answer). To retune: axis weights + `ANCHOR`.
    - **🔲 ADD MORE INDICATORS (owner flagged 2026-07-22).** Adding a lens = one `INDICATORS` entry (re-balance to 100) + one line in
      `lensSeries(s)` returning `[{ts, v}]` HIGHER = MORE EXPENSIVE. Candidates: NUPL (correlated with MVRV — weight low or fold in),
      20-week heat / z-score (faster horizon), SOPR (sparse/null), RSI. **Keep lenses INDEPENDENT (avoid double-counting MVRV/NUPL/
      realized) and each must have `arr.length>=10` to rank.** The weights are the editorial call.
  - **⭐⭐ "TECHY STATS DON'T LAND" IS RETIRED (owner, 2026-07-29: "I have enough data to prove otherwise").** The old blanket bar is
    LIFTED — techy/analytical charts (correlation, on-chain, cross-asset, lead/lag) are fair game when the finding is real and
    interesting. **Two things that STILL hold:** (1) keep the plain-language `<Explain>`/subtitle gloss on techy surfaces (clarity, not
    avoidance); (2) aspirational X-multiple cards still land great (this widens the menu, doesn't replace them). **NET: judge a new
    card/chart on "is it a real, interesting, honest finding," not "is it too techy."** (The old "WHAT LANDS" note — best-received cards
    are all price-TARGET/X-multiple — is SUPERSEDED but its aspirational half still holds.)
  - **⭐ SAME-AGE / PERFORMANCE-COMPARISON cards — owner loves these (2026-07-13).** Pairwise same-age (`btcage`/`ethage`/`solage`,
    `ageCard` factory) — SPX vs BTC/ETH/SOL as a multiple since each launch, log, x=age.
    - **✅ "What came next" (`whatnext`, `whatNextCard`)** — FORWARD-ONLY COMPOSITE: each legend's recovery forward from its own FIRST
      BEAR-CYCLE BOTTOM (`firstCycleBottom`: first ATH that HOLDS ≥365d then drops ≥55%, then the trough), on ONE chart. **⭐⭐ P0 =
      "TODAY (Jul)", NOT the bottom (owner):** anchoring at the bottom read "the low is in, here's the moonshot" — misleading. P0 =
      today's month in each coin's bottom YEAR, so the card shows the FINAL CAPITULATION still ahead (each fell ANOTHER 72–85% into the
      year-end low) THEN the climb. **⭐ REPORT THE PEAK, NOT THE +Ny ENDPOINT** (`FUTURE_DAYS` 1095→1460, use `peakMult`): peaks from
      the Jul anchor **BTC +79× (Nov 2013), ETH +11× (Nov 2021), SOL +7.4× (Nov 2024)**. **⭐ GENERIC, TIME-ADAPTIVE title** ("The
      legends at SPX6900's point in the first bear cycle") — P0 advances with real time, so don't hardcode cycle state; the copy LEADS
      with the construction method (honesty moat). Kept in rotation, copy NEUTRALISED (no bottom-call). **✅ DATA FIXED (owner gave full
      daily ETH/SOL CSVs) → `src/alt-age-history.js`** (`ETH_HISTORY`/`SOL_HISTORY`, full daily, no CryptoCompare key). SOL's peak is
      $262.56 CLOSE (Jan-18-2025; $295 was the intraday wick — our charts are close-based throughout). BTC still thinned. alt-age-history
      is BOT-ONLY (not imported by any src/*.jsx). ⚠ **v1 was PER-PEER (btcnext/ethnext/solnext)** — removed; rebasing every coin to 1×
      at the divider collapses the confusing 10,000× launch-relative y-axis. Honesty rail: "History rhymes — not a forecast."
    - **❌ "vs the legends" composite (BUILT then REMOVED)** — a repetition of the 3 pairwise cards. **Don't rebuild composites of
      existing same-age cards.** **❌ DOGE same-age (BUILT then PULLED)** — DOGE was FLAT its first ~3 years, so SPX ≈500× vs DOGE ≈1× =
      a GAP that dwarfs, doesn't RHYME. **Lesson: a same-age peer only works if its early trajectory is a similar ORDER of multiple to
      SPX's — pick by DATA, not on-brand-ness.**
    - **⭐⭐ RESEMBLANCE STUDY — CLOSED, SPX HAS NO UNIQUE TWIN; do NOT build a peer card / do NOT run `find-resemblance.mjs`.** Moved to
      Dune (Trino `corr(y,x)` on `prices.day`, keyless): `dune/spx6900_correlation.sql` (SPX DAILY % RETURNS vs every ETH token, ranked
      by Pearson r, HAVING count≥90) + `dune/spx6900_fractal_correlation.sql` (time-shifted). **RAN 2026-07-15 → no twin:** the top-50
      was dominated by wrapped BTC/ETH + LSTs = pure market beta; **WETH itself = 0.469 = SPX's market-beta FLOOR**; only BITCOIN
      (HPOS10I) 0.58 / AIXBT 0.57 poked above (mild). PEPE fractal −0.05. **SPX trades idiosyncratically — the honest, flattering
      finding.** ⭐ REFINED 2026-07-21: a MARKET-ADJUSTED (partial, ETH-beta removed) multi-chain study DID run — no 1:1 twin, but SPX
      moves with a **memecoin cohort** (BRETT/WIF/FARTCOIN/BITCOIN at partial r ~0.4 beyond the market) → the `spxcohort` card. **AIXBT
      is NOT a peer** (the old ETH-only "0.57" was a DIFFERENT ETH token; real AIXBT is on Base). **⚠ CryptoCompare now needs a key** —
      but `CRYPTOCOMPARE_KEY` was DROPPED (owner, 2026-07-16): `find-resemblance.mjs`/`build-alt-history.mjs` are dormant; `api/memekings.js`
      /`majors.js`/`btc.js` use their Coinbase FALLBACK (shallower but working). **Do NOT create `CRYPTOCOMPARE_KEY`.**
  - **Card-variety principle (owner, 2026-06-25).** The daily FEED has a LOWER bar than a site tab: a visually-fresh card keeps the
    rotation from going stale even if its data overlaps. Bot cards are DECOUPLED from site tabs. **ADD visually-distinct cards to the
    rotation liberally; promote only standouts to site tabs.** Still skip genuinely off-brand/overfit ones (supertrend, day-of-month).
  - ✅ **SITE REDESIGN — nav declutter + Charts gallery + interactive chart pages (2026-06-29).** 3 routes: **Home (`/`)** = Rainbow hero
    only; **Charts gallery (`?view=charts`)** = grid of preview tiles grouped by category; **Dedicated chart page (`?chart=<id>`)**.
    **Tile previews are LIVE, scaled-down renders of the REAL chart component** (NOT the tweet-card image). `chartEl(id)` in App.jsx is
    the single render switch. **`src/charts-catalog.js` = single source of truth** (CHART_GROUPS / CHART_META / CHART_IDS) — adding/
    removing a site chart = edit this one file (id must match the App.jsx switch + a lazy import). Deep-links `?chart=`/`?view=`; legacy
    `?tab=` still honored.
  - **⭐ KEY DECISION (owner, 2026-06-29): the website is INTERACTIVE charts only; INFOGRAPHIC cards are tweet-only and do NOT live on
    the site at all.** (a) time-series charts → interactive React pages; (b) infographic cards (targets, memecoins, milestones, hundred,
    btcgrade, dogeclock, F&G dial, sp500 cube) → stay bot/tweet cards. **Do not mirror tweet cards onto the site** (destinations must be
    genuinely interactive).
  - **❌ Volatility "how wild is it" — BUILT then REMOVED (owner, 2026-06-28)** (a bar of "120% annualized volatility" is too abstract; if
    ever revived use WEEKLY vol — SPX ~120% / BTC ~41% / S&P ~11%). **❌ Decoupling from Bitcoin — CHECKED & SHELVED (2026-06-28)** — the
    flattering 0.49→0.20→0.11 figures were MONTHLY correlations over 6–12 data points (tiny-sample artifact); a robust 26-week rolling
    correlation is RISING to ~0.49 (more correlated). A decoupling card would need cherry-picking = dishonest. **Do not build.**
  - **✅ MVRV / Realized-price / MVRV-Z SITE PAGE (`mvrv`, `src/OnchainValueChart.jsx`) — 3 modes** (Realized price vs `be`, MVRV = price
    ÷ be with a 1× line, MVRV Z-score (mcap−rcap)/std(mcap), SUPPLY=939M). **⚠ Exact "% supply in profit" is NOT computable from
    HolderScan** (`/stats/pnl` returns only {break_even_price, realized_pnl_total, unrealized_pnl_total} — NO cost-basis distribution);
    MVRV = price ÷ be is the buildable proxy. history.json banks `upnl`+`rpnl`+`be` daily.
    - **✅ HISTORICAL MVRV BACKFILL via Dune (owner, 2026-07-15) → `src/spx-mvrv.js`** (`SPX_MVRV = [["date", realizedPriceUSD]]`, 1063
      pts 2023-08-18→2026-07-15). Shared merge helper **`src/mvrv-data.js` `mvrvHistory(snapshotHistory)`** joins it with our dense daily
      price (MVRV = price/realized), live HolderScan snapshots win on the recent tail (Dune realized ~$0.564 ≈ `be` ~$0.537, seamless).
      Finding: MVRV max 5.39 (Oct-2024 euphoria, NOT the Jan-2025 price top), min 0.24 (Feb-2024), ~0.68 today. **⭐ HOW-TO: fork an
      existing Dune ERC20 MVRV / Realized Cap query** (e.g. query ID `3729687`) for `0xE0f63A424a4439cBE457d80e4f4b51ad25b2c56C`, join
      `prices.usd`, FIFO cost basis → daily Realized Cap → CSV → bundle. **⭐ SAME DUNE WORK BACKFILLS HOLDERS-OVER-TIME** (count(distinct
      address WHERE balance>0) per day, NO price join) on ETH (`erc20_ethereum.evt_Transfer`) + Base (`erc20_base.evt_Transfer`,
      `0x50dA645f…bb2C`) — EXCLUDE contract addresses for an honest headcount.
      - **✅ ROTATION CARD `mvrvtrend` (`mvrv-trend-card.mjs`, LOOK "dual", data-gated `mvrvSeries.length>=100`)** — SPX's OWN full-history
        MVRV line with zones from ITS OWN quantiles, 1× line, "today N×" marker + percentile of its own history. Sibling of `mvrvbtc` but
        vs ITS OWN history, not Bitcoin's. `stats.mvrvSeries` = `loadMvrvSeries()`. Copy = valuation-POSITION, NOT a buy signal.
  - **⭐ MULTI-CHAIN HOLDER COUNT — BUILT 2026-07-13.** By HEADCOUNT Base+Solana DWARF ETH: **ETH ~49.5k · Base ~114k · Solana ~66k →
    ~230k** (we post ~49.5k = undercount ~4.6×). **Keep supply/tiers/MVRV STRICTLY ETH-native (don't blend).** Data (`snapshot.mjs`):
    **Base = FREE via Blockscout** (`baseHolders()` also SUBTRACTS contract addresses via top-~150 `is_contract`, + `BASE_EXCLUDE`
    override; Base SPX `0x50dA645f148798F68EF2d7dB7C1CB22A6819bb2C` / `BASE_SPX`); **Solana = KEYLESS public RPC** (`solHolders()`,
    `getProgramAccounts` on the SPL Token Program filtered to the SPX mint `J3NKxxXZcnNiMjKw9hYb2K4LUxgwB6t1FtPtQVsv3KFr` / `SOL_SPX`,
    `dataSlice{offset:64,length:8}` for the u64 balance; ⚠ HEAVY call — set `SOL_RPC` to Helius/QuickNode if the public node rate-limits;
    soft-skips null). **⭐ VALUE-BY-CHAIN: holders ≠ value** — Base/Solana are ~6% of supply. `multichain` = a TWO-DONUT card (HOLDERS vs
    VALUE, ETH 20%/94% · Base 52%/3% · Solana 27%/3%). Per-chain supply banked keyless (`baseSupply()`, `solSupply()` via
    `getTokenSupply`). Brand colours: **ETH grey · Base blue · Solana purple.** `chainrace` = three-line RACE (see the chainrace fix
    note). Honesty rails in copy: "wallets across chains, not people" + "Base & Solana are bridged."
    - **⭐ SNAPSHOT NOW AUTO-DEPLOYS (fixed 2026-07-13).** og.js renders from the history.json BUNDLED at deploy time, and the daily
      snapshot commits via GITHUB_TOKEN — **GitHub's recursion guard blocks GITHUB_TOKEN-pushed commits from triggering deploy.yml**, so
      og.js's bundle was frozen at the last CODE deploy. FIX: `snapshot.yml` has a **`deploy` job** (`needs: snapshot`, gated on
      history.json changing) mirroring deploy.yml (shares its `vercel-production` concurrency group, uses VERCEL_* secrets). Each daily
      snapshot now redeploys → fresh data reaches the site + og cards automatically.
  - **⭐ MVRV OVERLAY vs BTC's MVRV — `mvrvbtc` card + `MvrvContextChart.jsx` (FOUNDATION BUILT 2026-07-08).** MVRV is UNITLESS so it's
    directly comparable across assets. Data: `scripts/build-btc-mvrv.mjs` → `public/btc-mvrv.json` (811 weekly points 2011→2026, BTC MVRV
    min 0.443 / max 7.743; Coin Metrics COMMUNITY API `CapMVRVCur`, free/no-key but BLOCKED in sandbox → owner runs the workflow monthly;
    `sampleMvrv()` unit-tested). Chart: BTC MVRV line, **zones from BTC's OWN quantiles**, a bold "SPX today N×" marker + ±12% band,
    magenta **match dots** (`similar` memo) that land on BTC's **2011/2015/2018 cycle bottoms** + an SPX MVRV trail. **⭐ THE HONEST
    FINDING: SPX's current MVRV ~0.70× is the 2nd percentile of Bitcoin's entire history** (cheaper than 98% of all BTC days; BTC only
    this cheap at generational bottoms). Card `mvrv-card.mjs` (data-gated `btcMvrv.length>=100 && supply.breakEven>0`), `stats.btcMvrv`
    via `loadBtcMvrv()`. **Honesty guardrails: SPX's MVRV history is ~weeks vs BTC's ~decade — do NOT force a numeric "SPX today = BTC
    date X" claim; frame as a VISUAL position on BTC's map (zones = REFERENCE, not target); a valuation-LEVEL statement (as cheap as
    BTC's bottoms WERE), never a path forecast.** NOTE Terminal Price (21× transferred) + Balanced Price need coin-days-destroyed data
    HolderScan doesn't provide — **don't fake them; only realized price (= `be`) is available.**

## BTC-cycle "rhyme" cards — the "why ≈ BTC Aug '22" representation (2026-06-26)
- **Problem:** the cycle cards asserted "today ≈ BTC Aug '22" but never SHOWED the relationship. The alignment maps SPX's launch to
  BTC's 2019-10 (`shift=3395` in `src/btc-cycle.js`), which lines SPX's recent **double top (Jan '25 + Jul '25)** up — within WEEKS —
  with BTC's **2021 double top (Apr & Nov)**, and lands today on BTC's post-top **Aug '22** low (SPX peaks age 522/714 vs BTC tops
  mapped to 529/737). Strong TIMING rhyme.
- **Key honesty constraint — timing rhymes, amplitude does NOT.** BTC ~3.4× off its cycle low into the top, SPX ~6× off its own low. A
  beta-SCALED overlay (×3.4) overshoots ~7× — **don't do that.** The overlay lines the two cycles up in TIME on log price.
  - **⭐ AXIS AMPLITUDE — ANCHORED, not independent-auto (owner, 2026-07-10).** `BtcCycleChart` used to auto-scale BTC's right axis
    independently, making BTC's 2021 top TOWER over SPX (false — BTC's real move was smaller). FIX: pin the BTC right axis to the SPX
    left axis at the shared "≈ BTC Aug '22" anchor on the SAME log scale (`btcDomain = spxDomain × (btcAnchor/spxAnchor)`), so BTC shows
    its TRUE relative amplitude and sits BELOW SPX's peak. The `cyclesync` CARD was already hand-scaled this way. The forward beta-scaled
    projection is UNCHANGED (owner: "future path looks ok").
- **`cyclesync` card** (`scripts/bot/cycle-card.mjs` `renderCycleSyncCard`) — SPX green (left) + BTC orange real (right), vertical
  guides at the two mapped BTC tops + a "today ≈ BTC Aug '22" NOW line + a dashed stub of BTC's ACTUAL 2022→23 recovery (honest "BTC ran
  from here", not a projection). `btcCycleProjection()` returns `histPts`/`histFwd`/`peaks`. The `cycle` post uses `cyclesync`;
  `BtcCycleChart.jsx` mirrors it. The forward beta-scaled projection (aggressive ~$85–90 top, effective beta ~1.4 fwd vs 3.4) is kept as
  the dashed path — owner-tuned, not re-calibrated.
- ✅ **`cycleclock` — "The Halving Clock" card** (`renderCycleClockCard`) — SPX's REAL history flows into a NOW marker; ahead, a
  bear→bull **CONE** (`projLo`/`projHi`) to the projected top; dashed `$1/$6.90/$69` lines + a **phase strip** with a ▼ YOU ARE HERE
  pointer. Card text minimal (the tweet describes; the DATE lives only in the copy). The ~$91/272× top is the owner-tuned aggressive
  beta (3.4) — dial down if wanted. (`cyclesync` = the rhyme overlay, separate; ROTATION-EXCLUDED cycleclock — see the audit corrections.)

## Model re-fit hygiene — IMPORTANT, recurring (noted 2026-06-23)
- The rainbow's power-law fit is **frozen on the bundled `DEFAULT_RAW`** (`buildModel` in `src/models.js`); live price only extends the
  drawn line, it does NOT re-fit. The launch-era exponent is steep (~4.6), so the fair-value **center marches up ~0.5–1¢/day even if
  price is flat** — price then drifts down through the bands and can fall **off the Fire Sale floor** (the p2 residual). The rainbow is
  the main attraction, so we must not let price escape the bands.
- **Policy = monitor monthly, act rarely (decouple the two).** Run `node scripts/rebundle-model.mjs --check` ~monthly: it pulls recent
  closes from `public/history.json`, thins to ~weekly, and prints where a re-fit WOULD move exponent/center/band — **without touching
  `src/data.js`**. Watching the drift ≠ changing the model.
- **Only APPLY** (run without `--check`, then `npm run build && node --test 'test/**/*.test.mjs'`, commit `src/data.js`) **when price has
  UNDERSHOT the lower band for a sustained stretch** — i.e. the model is genuinely failing to contain price. **Do NOT re-fit reactively
  the moment Fire Sale fires:** that's a rare, valuable signal (good content), and re-fitting it away is goal-seeking and erodes
  credibility. The dataset is still small, so each re-fit is noisy — another reason to wait. Heads-up: a re-fit moves EVERY band + can
  lengthen a band label enough to tip a post over the 290-char guard (check the length test).
- **2026-06-23: trialed a re-fit, then REVERTED it.** Adding real Jun snapshots moved exponent 4.60→4.16, center $1.69→$1.44, price
  BUY!→Accumulate (R² 0.742→0.734). But Fire Sale had just fired ~1h earlier, so per the policy we kept the original curve. **Revisit
  ~2026-07-23** (monitor with `--check`), roughly monthly after.

## Deploy hygiene — Vercel free tier = 100 deploys/day (learned 2026-06-26)
- Production deploy (`.github/workflows/deploy.yml`) fires on every push to `main` via the Vercel CLI. The free plan caps **100
  deployments/day**; over it, `vercel deploy` fails with `api-deployments-free-per-day` (rolling ~24h window).
- **Root cause (2026-06-26):** the hourly band-watch rewrote `band-state.json` every run → ~24 deploys/day + push-heavy sessions + crons
  → over 100. Fixed: (1) `deploy.yml` `paths-ignore` ALL runtime-state files (next-post/post-state/band-state/daily-band-state/
  milestone-state/post-copy/card-ar/recap-pending) — read at runtime / via raw, never from the deployed site; (2) band-watch only writes
  state on a real change, not the ts.
- **Keep it under control:** batch commits where practical (each code push = 1 deploy); only files the DEPLOYED SITE serves (src, api,
  scripts/bot via includeFiles, public assets, `history.json`) need to trigger a deploy.
- **⭐ `[skip deploy]` OPT-OUT (added 2026-08-02).** deploy.yml's deploy job is gated `if: !contains(head_commit.message, '[skip
  deploy]')`, so a WIP push with `[skip deploy]` anywhere in the message is skipped ENTIRELY — 0 runner minutes, 0 Vercel deployments.
  During a heavy burst, tag the intermediate commits and let only the final unflagged "ship it" commit deploy; a manual "Run workflow"
  always deploys. This keeps BOTH limits in check — Vercel's 100/day AND (if the repo goes private) GitHub's 2,000 Actions-min/month
  (~2 min/deploy). GitHub's native `[skip ci]` is broader (kills the whole run). **When making many commits in one session, prefer
  `[skip deploy]` on all but the last.**
- The MCP GitHub integration is READ-ONLY for Actions (can't dispatch/rerun) — to force a deploy, push a commit touching a non-ignored
  file (or hit "Run workflow" in the UI).

## Card copy style — write tweet text like this (owner rules, 2026-06-27)
- **Structure: hero / (blank) / description / (blank) / closing.** Each card's `ct``…``` template is **exactly 3 short lines** (single
  `\n` between them). `withFooter` doubles every `\n` into a blank line → 3 template lines render as 3 airy paragraphs + the branded
  footer. **Don't write 2-line or 4-line cards.**
- **Hero leads with the current number/state**, not the explanation. e.g. "🌡️ SPX6900 is -4% from its 20-week moving average." NOT the
  long-explanation-as-hero (the #1 mistake on new cards).
- **Concise. No wall text.** Aim ~180–230 chars (the `xLen` test ceiling is 290 = a hard cap, not a target). Hero = the hook + number;
  description = one tight sentence; closing = a short takeaway ("A rhyme, not a forecast.").
- **@mentions: NEVER attach a possessive `'s` or any apostrophe/punctuation directly to an @handle** — X fails to parse
  `@100trillionUSD's` and the link breaks. Keep the handle followed by a SPACE or end-of-clause punctuation; prefer putting it at the
  end ("A homage to the Bitcoin RSI chart by @100trillionUSD." ✅). Same for `@benjamincowen` (say "@benjamincowen BTC risk strategy").
- **Owner overrides win:** `public/post-copy.json` (control-panel edits) take precedence over the `ct``` template via `applyCopy`. If you
  reword a card, update BOTH the template AND any matching override key, keep them in sync. **Overrides must use single `\n`** (withFooter
  doubles them — `\n\n` → triple spacing). Token form: `{0}`,`{1}`… map to the template's interpolation order.

## How the bot picks a post
- Daily rotation is deterministic: `rota[epochDay % rota.length]` in `scripts/bot/posts.mjs` (`buildPost`). Weights apply — `valuation`
  3×, bullish posts 2×, rest 1× (`WEIGHT`/`BULLISH`) — so the post for any date is computable ahead, bullish topics recur more often.
- **⭐ OWNER-TOGGLEABLE ROTATION EXCLUDES (2026-07-17).** Two exclusion layers: the static code-level `NO_ROTATE` set PLUS a dynamic
  owner-editable one — `loadExcludes()` reads `public/rotation-excludes.json` (`{id:true}` map, `readFileSync` like the copy overrides)
  and `rotation()` drops those ids. Toggle from the control panel (each card has a **⊘ Exclude / ↺ Add to rotation** button; `api/control.js`
  `exclude-save` commits the JSON). An excluded card stays BUILDABLE + hand-postable (Queue/Post now/`--post=` all bypass rotation) — only
  muted from the AUTO feed. `rotation-excludes.json` is deploy-ignored (the real `post.mjs` reads the live committed file; the schedule
  PREVIEW lags a deploy). Added to vercel includeFiles + deploy.yml paths-ignore.
- **🫀 SPX6900 × BITCOIN experiment card (`spxbitcoin`, 2026-07-17).** For-fun render of the Dune study's top finding — the memecoin
  BITCOIN (HPOS10I) has the highest daily-returns correlation with SPX of any ETH token. Owner sent the CoinGecko "max" CSV → bundled
  `src/bitcoin-meme.js` (bot-only). `spx-bitcoin-card.mjs` overlays both paths (dual log axis) + a 30-day rolling-correlation strip
  (`spxBitcoinStats`, memoised, one source for SVG + copy): **same daily heartbeat, opposite fate** — 73% of days same direction, rolling
  corr positive 99% (r 0.53), YET since launch SPX +147× while BITCOIN −88%. "Correlation isn't destiny." Owner toggled it INTO rotation,
  edited copy (his 414 xLen broke CI's length test → trimmed to 282 in post-copy.json). Made the rolling-corr strip taller (clamped
  84–150px). Website version parked.
  - **✅✅ RESOLVED & SHIPPED 2026-07-21 — Dune MCP reconstruction → NEW `spxcohort` card (AIXBT dropped, cohort found).** ~36 of 2,500
    credits. **True from-launch prices via `dex.trades`** (bounded-first, `free` tier): AIXBT (Base `0x4f9f…a825`) first swap 2024-11-02
    (CoinGecko's anchor was ~110× too high); BITCOIN/HPOS10I (eth `0x72e4…eea9`) first swap 2023-05-10 (~49× too high). **⭐ AIXBT IS NOT A
    PEER** — the old ETH-only "0.57" was a DIFFERENT ETH token (real AIXBT is on Base). **⭐ NEW CARD `spxcohort`** (`spx-cohort-card.mjs`,
    LOOK "dual", `card-ar.json` "square") — SPX + BRETT/WIF/FARTCOIN/BITCOIN indexed to 1× on their shared start (Dec-2024 = FARTCOIN's
    launch), annotated with the MARKET-ADJUSTED r (partial, ETH removed) computed AT RENDER TIME (ETH control in `src/cohort-daily.js`,
    all from `prices.day`). Reveal: same daily heartbeat (partial r ~0.4) but SPX survived (~0.55×) while the memecoins bled 95%+.
    **`NO_ROTATE`** (a 479-char teaching post shouldn't surprise the feed). The old `spx-movers-card.mjs` is SUPERSEDED. Local check:
    `scripts/verify-peer-correlation.mjs`. **⚠ TWO lessons from the movers draft: (1) ALIGN BY DATE, NOT AGE** (same x = different
    calendar date scrambled the co-movement); **(2) CoinGecko "max" starts at CG-LISTING, not true on-chain launch** (a listing gap
    inflates the 1× anchor — reconstruct from the first `dex.trades` swap instead).
  - **⭐ NEW MECHANISM — `LONGFORM` allowlist (`posts.mjs`, exported).** Per-card opt-in past the 290 instant-read ceiling for the FEW
    teaching cards that need it (accepts X's "See more" fold); default stays 290. The post-length test reads `LONGFORM[id] ?? 290`.
    `spxcohort` is the first entry (700). **Keep the list TINY.**
- **ALTERNATING look order (owner, 2026-06-29): the feed must not spam the same green log-scale line day after day.** Every card has a
  visual `LOOK` family in two TIERS: **A** = line-on-log "chart" looks (rainbow/channel/ladder targets/race/trend) and **B** = the
  visually distinct "flavour" cards (heatmaps, bars, dial, donut, cube, scatter, dual-axis). `rotation()` (1) spreads each tier's
  families EVENLY via a deficit round-robin (`spreadByFamily` — flagship rainbow + low-count cards space out), then (2) `interleave()`s A
  and B Bresenham-style (B is ~39% of slots → runs of green ≤2). To re-tune: edit the `LOOK` map / `A_FAMILIES`.
- Override a single run with `BOT_POST=<id>` (real) or `--post=<id>` (forces dry-run).
- Scheduled post: `.github/workflows/post-tweet.yml`, targets **08:00 America/New_York (Eastern)** year-round. GitHub cron is UTC-only
  with no DST, so TWO crons (`0 12` = 08:00 EDT, `0 13` = 08:00 EST) + a "Gate to 08:00 ET (DST-aware)" step let only the matching offset
  proceed (the once-per-day guard in post.mjs is a second backstop). GitHub schedules fire late/drift by minutes — known, left as-is. To
  change the timezone, swap the two UTC hours + the `want` offsets in the gate step.
- Cards render via `renderPostCard` (shared by the bot and `api/og.js`).
