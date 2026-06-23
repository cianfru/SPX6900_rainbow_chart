# SPX6900 Rainbow Chart — project notes

## Backlog / decisions
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
  - **SPX6900 vs the real S&P 500** ⭐ (highest impact). The memecoin raced against
    the actual index it's named after, since launch: "SPX6900 +X× vs S&P 500 +Y%".
    Perfect on-brand flex, fully honest (two returns). Needs S&P 500 daily closes
    bundled as immutable history (like `src/btc-history.js` / `alt-age-history.js`) —
    owner provides a CSV or fetch in CI. A returns race, NOT the existing cap-scale
    cube card.
  - **Power-law price roadmap.** Project the model's center (fair-value) line forward
    and stamp the dates it crosses round numbers ($1, $10, $100). Forward-looking but
    grounded in the fitted trend, not a vibes target. Frame as "the trend, extrapolated".
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
  - **Day-of-week "best day to buy" — rejected.** Same overfit trap as Uptober (~150
    samples/weekday, crypto is 24/7). At best a low-impact myth-buster ("weekday barely
    matters"); don't present it as a buy signal.

## How the bot picks a post
- Daily rotation is deterministic: `rota[epochDay % rota.length]` in
  `scripts/bot/posts.mjs` (`buildPost`). Weighted round-robin — `valuation` 3×,
  bullish posts 2×, rest 1×. So the post for any date can be computed ahead of time.
- Override a single run with `BOT_POST=<id>` (real) or `--post=<id>` (forces dry-run).
- Scheduled post: `.github/workflows/post-tweet.yml`, cron `0 13 * * *` (GitHub
  best-effort; actually fires late/drifts — known limitation, left as-is per owner).
- Cards render via `renderPostCard` (shared by the bot and `api/og.js`).
