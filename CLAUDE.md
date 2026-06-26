# SPX6900 Rainbow Chart — project notes

## Backlog / decisions
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
  - **LLM-written post copy — free, worth a shadow-mode trial.** Have a free-tier
    LLM (Gemini Flash / Groq) write each day's text from the exact computed stats
    instead of the templates. ~1 post/day, so free tiers cover it (the LLM was
    never the expensive part). MUST: pass only the real numbers (no invented
    figures), validate output before posting (length, must contain the key number,
    blocklist "guaranteed / will hit / buy now / financial advice"), and keep the
    deterministic template as the fallback so the bot never breaks. Build it in
    **shadow mode first** (log LLM-vs-template side by side, post nothing) and only
    flip live if it actually beats the current hooks. Note: templates are already
    good post-hook-rewrite, so the LLM mainly buys variety vs. accuracy/brand risk.
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
    - **Running ROI** (rolling fixed-window return over time) — buildable & on-brand
      (honest, no signal), mild add vs existing `rally`/`alltime`/`drawdown`. OK to build.
    - **Quarterly Returns** (buy Q-start / sell Q-end seasonality table) — buildable,
      minor; the monthly heatmap (`monthlyreturns`) already tells the story.
    - **Historical Monthly Average ROI** — already covered by `monthlyreturns`/`monthlybars`.
    - **SKIP — Average Daily Returns** (avg ROI per day-of-month): same overfit trap as
      the already-rejected day-of-week idea (thin samples, 24/7 asset). Don't build.
    - **SKIP — Supertrend** (ATR trend indicator w/ buy/sell arrows): off-brand — the
      moat is honest VALUATION, not trade signals; "buy/sell" arrows invite blowback.
    - **SKIP — Pi Cycle Bottom/Top** (111D vs 2×350D SMA): a BTC-halving-cycle top caller;
      borrowed/overfit for a ~2yr memecoin (same reasoning as Uptober). Not meaningful.
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
  - **Decoupling from Bitcoin.** Rolling 90-day correlation of SPX vs BTC over time;
    story = "SPX finding its own legs" IF the data is flattering (check first — if it's
    still glued to BTC, shelve it).
  - **% of supply in profit / MVRV.** price ÷ holders' realized cost (we already compute
    break-even, so current value is free). A respected, crypto-native on-chain metric.
    Full over-time chart needs ~30 days of snapshot history (same wait as holder-growth).
    **Status (2026-06-23):** now banking `upnl` (unrealized) + `rpnl` (realized) $ PnL
    daily in `history.json` alongside `be`. HolderScan's `/stats/pnl` only gives
    break-even + aggregate realized/unrealized totals — NO cost-basis distribution, so
    the *exact* "% supply in profit" isn't computable from it; **MVRV = price ÷ be** is
    the buildable proxy. **TODO before building:** (1) read the `pnl fields:` line in the
    snapshot CI log to check if HolderScan secretly returns a percent-in-profit / cost-
    basis field (then remove that debug log); (2) **revisit ~2026-07-23** once ~30 days
    of `be`/`upnl`/`rpnl` are banked, to build the MVRV-over-time card (line + zones).
    - **= the BTC "Realized Price" analog the owner asked for (2026-06-25, ref ITC
      Bitcoin Terminal Price chart).** SPX6900's realized price IS the break-even (`be`)
      = avg on-chain cost basis; the buildable card is the ITC-style **price line + the
      realized/break-even line tracking beneath it over time** (same data-gate: ~30 days
      of `be`, ~mid-July). The snapshot version already ships as the `breakeven` card
      (price vs current cost basis). **NOT buildable: Terminal Price (21× transferred
      price) and Balanced Price (transferred − realized)** — they need Value-Days-
      Destroyed / coin-days-destroyed on-chain spending data HolderScan doesn't provide;
      only realized price (= `be`) is available, so don't try to fake terminal/balanced.
  - **Day-of-week "best day to buy" — rejected.** Same overfit trap as Uptober (~150
    samples/weekday, crypto is 24/7). At best a low-impact myth-buster ("weekday barely
    matters"); don't present it as a buy signal.

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

## How the bot picks a post
- Daily rotation is deterministic: `rota[epochDay % rota.length]` in
  `scripts/bot/posts.mjs` (`buildPost`). Weighted round-robin — `valuation` 3×,
  bullish posts 2×, rest 1×. So the post for any date can be computed ahead of time.
- Override a single run with `BOT_POST=<id>` (real) or `--post=<id>` (forces dry-run).
- Scheduled post: `.github/workflows/post-tweet.yml`, cron `0 13 * * *` (GitHub
  best-effort; actually fires late/drifts — known limitation, left as-is per owner).
- Cards render via `renderPostCard` (shared by the bot and `api/og.js`).
