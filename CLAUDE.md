# SPX6900 Rainbow Chart — project notes

## Backlog / decisions
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
