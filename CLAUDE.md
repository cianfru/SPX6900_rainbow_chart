# SPX6900 Rainbow Chart — project notes

## Backlog / decisions
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

## How the bot picks a post
- Daily rotation is deterministic: `rota[epochDay % rota.length]` in
  `scripts/bot/posts.mjs` (`buildPost`). Weighted round-robin — `valuation` 3×,
  bullish posts 2×, rest 1×. So the post for any date can be computed ahead of time.
- Override a single run with `BOT_POST=<id>` (real) or `--post=<id>` (forces dry-run).
- Scheduled post: `.github/workflows/post-tweet.yml`, cron `0 13 * * *` (GitHub
  best-effort; actually fires late/drifts — known limitation, left as-is per owner).
- Cards render via `renderPostCard` (shared by the bot and `api/og.js`).
