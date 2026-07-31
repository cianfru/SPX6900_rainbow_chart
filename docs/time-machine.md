---
description: Replay the city from launch to today, and watch the population turn over.
---

# The Time Machine

The **Time machine** button opens a slider that rebuilds the entire city at any week since launch.
Drag it and buildings appear, grow, shrink and vanish as the wallets behind them actually did.

It is a replay of recorded balances, not a simulation. Every frame is the city as it stood that
week, under the same residency rule the live city uses.

## What you are looking at

| | |
| --- | --- |
| **SPX** | 26,490 wallets that ever cleared 5,000 SPX · 155 weekly frames from August 2023 |
| **AEON** | 3,743 wallets that ever held a piece · 142 weekly frames from November 2023 |

Each frame applies the mode's normal rule — the SPX bar is still 5,000 held 90 days, AEON is still
one piece — recomputed at that week. A building only stands in a given week if the wallet genuinely
qualified then.

Flow beams still work during the replay, but they measure the change **against four weeks earlier**
rather than the live 30-day window. Green and red mean the same thing they always do: accumulating,
or reducing.

## Landmarks on the slider

Three moments are marked underneath the track, so you can jump to a period instead of scrubbing for
it:

| Marker | When | What it is |
| --- | --- | --- |
| **First pump** | October 2023 | the first serious move off launch prices |
| **ATH** | July 2025 | the highest price SPX has traded |
| **Capitulation** | February 2026 | the deepest point of the drawdown that followed |

Click a marker to jump straight to that week. The dates are the actual extrema in the price history,
not chosen by eye.

## The thing the replay makes obvious

Scrub from launch to today and the city does not simply grow. It **turns over**.

Whole blocks of buildings rise through 2024, stand through the run, and are gone by the end — while
the city today is nearly as populated as it has ever been. Different people, similar skyline.

The figure that makes it concrete: of the 9,000 largest wallets the city has *ever* had, **7,397
have since sold out entirely**. Today's residents are mostly wallets that never had a large peak at
all. This is the same finding the [Who's Still Here](https://spx6900rainbow.xyz/?chart=survivorship)
chart measures — the city is where you can watch it happen.

## Two honest notes

**The far right of the slider is not the same data as the live city.** The replay is built from
weekly net balances; the live city counts holding age day by day from the full transfer history,
which is finer. The two disagree slightly on who has cleared the 90-day bar in the most recent week.
Rather than show a number that quietly contradicts the live city, the slider hands back to the live
data at its right-hand end.

**Both mode has no time machine.** Reconstructing a combined SPX-and-AEON population week by week
means joining two different assets' histories, and there is no honest way to do that yet. The toggle
simply does not appear in that mode rather than showing a version that only looks right.

## Loading

The replay data is about 3 MB and is fetched **only when you open the toggle** — the city itself
never pays for it. Opening it the first time takes a moment, and each drag rebuilds several thousand
buildings, so the slider updates a fraction of a second after you release it rather than during the
drag. On a slower machine that pause is longer; nothing is being skipped.
