---
description: Three populations, one city, one rule each.
---

# Modes

There is one city. The toggle at the top decides **which population it is built from**.

| Mode | Buildings | Who qualifies | Height measures |
| --- | --- | --- | --- |
| **SPX** | 4,893 | 5,000 SPX held 90 days | SPX balance × holding time |
| **Both** | 224 | clears the SPX bar **and** owns AEON | SPX balance × holding time |
| **AEON** | 1,176 | owns at least one Project AEON | NFTs held × holding time |

Switching mode does not restyle the city. It rebuilds it from a different set of wallets.

## Why the modes can't be blended

An earlier version offered "AEON + SPX" as a single blended view, folding a wallet's SPX balance
into its height by rescaling it onto the NFT axis.

That was a presentational choice, not a measurement. There is no honest exchange rate between "148
NFTs" and "14M tokens" — the rescale simply picked one, and the resulting height meant nothing you
could check.

So **Both is a filter, never a blend.** It is the SPX city restricted to the residents who also
collect AEON. A building in Both mode means exactly what it means in SPX mode, so the promise the
whole city rests on — being in it always says the same thing about you — stays true inside every
mode.

{% hint style="info" %}
**Only 224 of 1,176 AEON collectors clear the SPX bar**, and another 124 hold SPX below the
threshold. The overlap is genuinely small, which is why Both is its own mode rather than a default.
{% endhint %}

## What each mode is good for

**SPX** is the whole holder base and the default. It is where [flow](reading-a-building/flow.md)
reads loudest, because it has the most buildings and the deepest history.

**Both** is the crossover cohort — the wallets invested in the token *and* the collection. Small
enough to read individually.

**AEON** is the collection on its own, and the only mode where **everyone fits**: 3,333 tokens
across 1,176 wallets against 6,275 lots. No slicing, no top-N.

## Holder age is cleaner on the NFT side

On the coin side, working out how long someone has held requires a full FIFO reconstruction: a
balance is made of lots bought at different times, and a partial sale has to consume them in order.

An NFT has none of that. Each token is a discrete unit with exactly one owner and one last-transfer
timestamp, so holder age is simply *now minus that timestamp*. No lots, no cost basis, no
intra-block ordering problem.

## Why AEON belongs in an SPX city at all

**346 of 1,176 AEON holders (29%) also hold SPX**, and AEON's weekly returns correlate 0.53–0.57
with SPX.

The overlap is the reason the collection is worth showing to an SPX audience — it is genuinely the
same community, not NFT content in disguise.
