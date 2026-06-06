# X (Twitter) bot — design & cost plan

Status: **planning** (no bot code committed yet). This documents how a bot that
posts about the SPX6900 rainbow data on X would be built, what it would cost,
and the trade-offs. Numbers in the samples are from a snapshot of the repo data
(spot ~$0.3331); a live bot recomputes them each run.

## 1. Sample posts

**Daily snapshot** (+ rainbow card image):
> 📊 SPX6900 — $0.3331
> Band: 🔵 **BUY!**
> 79% below the log-trend center ($1.56)
> Risk: **0.14 / 1.00** (historically cheap)
> Next band up (Accumulate) starts at $0.373.
> Not financial advice. 🌈 spx6900rainbow.xyz

**Weekly recap** (+ rally card):
> SPX6900 weekly 🌈
> Spot $0.33, parked in the **BUY!** band — 79% under trend.
> Since the last Fire Sale (Sep '24 @ $0.0089) it's **+3,623%** (peaked +20,214%).
> Timing each dip beat HODL ~38× in this model. Hindsight only.

**Targets / educational** (+ targets card):
> Where's SPX6900 vs the meme targets, from $0.33 today?
> • $1 → **3.0×**
> • $6.90 → **20.7×**
> • $69 → **207×**
> A log-trend extrapolation, not a promise. Not financial advice.

**Event-driven alert** (only when the band actually changes):
> ⚠️ Band change — SPX6900 moved **BUY! → Accumulate** at $0.37.
> Risk now 0.2/1. Bands shift as the trend refits.

## 2. Image cards ("cards now, shots later")

Extend `api/og.js` into a small set of branded PNG cards, reusing the existing
`@vercel/og` (Satori) setup — no browser, runs in CI.

| Card | Endpoint (proposed) | Shows |
|---|---|---|
| Rainbow | `/api/card?type=rainbow` | price, band, % vs center |
| Risk | `/api/card?type=risk` | risk gauge 0–1 |
| Rally | `/api/card?type=rally` | last Fire-Sale low → now, peak |
| Targets | `/api/card?type=targets` | $1/$6.90/$69 multiples |

**Phase 2 (later):** Playwright in CI screenshots the literal interactive charts
via a `/?shot=rainbow` print route.

## 3. Architecture (fits the existing stack)

```
GitHub Actions cron (a daily snapshot cron already exists)
  └─ scripts/post-tweet.js
       ├─ src/stats.js   ← refactor price-fetch + model calc out of api/og.js (shared)
       ├─ fetch /api/card?type=…  → PNG bytes
       └─ twitter-api-v2: upload media → post tweet
```

- One shared `stats.js` so the bot, the OG card, and the site never disagree.
- Dedupe/state (e.g. last band posted) in a small committed JSON or the Actions
  cache, so alerts don't repeat.

## 4. X API tier & cost

| Need | Tier | Cost |
|---|---|---|
| Posting daily/weekly + images | Free (~500 posts/mo) | $0 |
| Reply-to-mentions (reads/search) | Basic | ~$100/mo |
| High volume / streaming | Pro | $5k/mo (overkill) |

The scheduled poster starts **free**. ⚠️ Verify at build time that **media
upload** is enabled for the bot account on the Free tier (X has been migrating
media endpoints); historically works via OAuth 1.0a user context, otherwise
Basic covers it.

## 5. What the operator provides

- An X developer app on the bot handle → 4 credentials (API key/secret, access
  token/secret) as GitHub secrets.
- Template posts need nothing else. Claude-phrased posts would add
  `ANTHROPIC_API_KEY`.

## 6. Compliance & safety

- **X automation policy:** disclose it's an automated account (bio + note).
- **Financial-advice risk:** the "BUY!/SELL!" labels are the spiciest part. Keep
  a standing "not financial advice" line; consider softening labels in bot copy
  (e.g. "BUY! band (cheap vs trend)").
- **Data honesty:** carry the model caveats (single-cycle in-sample fit; bands
  drift). Don't post target ETAs as forecasts.

## 7. Limitations

- Bands/risk **re-scale** as the model refits, so an alert can fire from a fit
  shift, not a price move — alert logic should compare price vs fixed levels or
  say so.
- Live price depends on GeckoTerminal/Coinbase being reachable from the runner;
  needs a fallback + "skip post if no price" guard.
- Free-tier rate limits → keep to ≤ a couple posts/day.

## 8. Roadmap

1. **Phase 1:** `stats.js` refactor → 4 cards → daily + weekly scheduled poster
   via GitHub Actions. Free.
2. **Phase 2:** band-change event alerts; Playwright real-chart screenshots.
3. **Phase 3 (optional, paid):** reply-to-mentions, optionally Claude-phrased.
