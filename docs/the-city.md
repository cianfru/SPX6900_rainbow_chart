# The City

**Whale City** and **Aeon City** are the same engine pointed at two datasets. Every building is one
wallet. Nothing in either city is decorative: height, colour, glow and district all carry a number
you can check, and the few things that are a game are labelled as a game on this page.

This document is the reference for what each element means. Figures are from the live data on
**29 July 2026** — re-run the checks at the bottom to confirm them for yourself.

---

## 1. Who gets a building

A wallet earns a building by holding **5,000 SPX for 90 days**. That is the whole rule.

It is deliberately *not* a top-N leaderboard, for two reasons. A rank cutoff makes the city churn
every time the ordering shuffles, so buildings would appear and vanish without anyone doing
anything. And a rank cutoff silently changes meaning as the holder base grows — "top 1,500" meant
something different last year. A fixed bar means being in the city always says exactly the same
thing about you.

The bar is **denominated in tokens, never dollars.** A dollar threshold would evict a chunk of the
city in a week when nobody sold anything — the price moved, that's all. Token balances change only
when someone actually acts, which is what the city is a map of.

**Hysteresis:** once you're a resident you keep your building until you fall below **0.8×** the bar
(4,000 SPX). Without it, every wallet sitting near 5,000 would blink in and out week to week, which
reads as a rendering fault rather than as anything true.

Today: **4,893 residents**, from exactly 5,000 SPX up to 14,000,009 SPX, held between 90 and 1,077
days. Exchange, LP, bridge and burn addresses are excluded throughout — those are infrastructure,
not people, and they live in the harbour instead (§8).

---

## 2. How tall a building is

Height encodes **size × conviction**: how much a wallet holds, weighted by how long it has held it.

```
score  = (balance / largest balance) × (0.45 + 0.55 × (days held / longest held))
height = 1.0 + 20 × ( 0.50 × log-normalised(score) + 0.50 × √(score) )
```

so the scale runs from **1.0** (the smallest resident) to **21.0** (the largest).

**Why mostly logarithmic.** Holdings are a power law spanning about 2,800× between the smallest
resident and the biggest whale. A linear axis gives you one needle over a car park. A pure square
root isn't enough either — it left the median resident at 0.62 units against a 0.92-wide footprint,
i.e. a building wider than it was tall, with 78% of the city under two units. Log is the right scale
for a power law and it is what every price chart in this project already uses. The square root is
mixed back in at half weight because pure log flattens the top until a 14M-token wallet is barely
twice the median.

**The ordering is exact. The spacing is compressed.** That is the honest trade and the caption on
the page says so. The real figure is always one hover away.

Today's spread: median **2.89**, 75th percentile 4.20, 95th 7.68, max 21.0. In architectural terms
the median building is about **3.1:1** tall-to-wide and the tallest is 22.8:1 — real supertalls top
out near 24:1, so the city sits just inside what can actually stand up.

> **Height is never adjusted for neighbours.** Capping a tower because a taller one stands nearby
> would be a lie about that wallet. When towers needed room, the fix was placement (§7), not height.

---

## 3. The four building types

Silhouette carries scale, so a townhouse is never mistaken for a skyscraper. Type follows directly
from height — there is no separate rule:

| Height | Type | Material | Share of the city today |
|---|---|---|---|
| **≥ 11** | Glass tower, setback top, spire on some | glass | **86** (1.8%) |
| **6 – 11** | Concrete mid-rise with a capped roof | concrete | **406** (8.3%) |
| **3.5 – 6** | Masonry block with a parapet | brick | **1,308** (26.7%) |
| **< 3.5** | Low-rise, wider than deep | brick | **3,093** (63.2%) |

The warm brick mass is load-bearing, not decoration — it's what gives the eye somewhere to rest and
what makes the towers read as tall. A city where everything is glass has no skyline.

Roofs carry water towers, HVAC plant and parapets. That's the detail that says New York, and it's
nearly free once the geometry is merged.

> These thresholds are calibrated to the height curve in §2 and must be retuned **with** it, never
> alone. Left unchanged when the curve moved, every building in the city became glass.

---

## 4. Colour: how long they've held

Building colour runs **warm amber → cyan** across holding age. Amber is a recent arrival, cyan has
held longest.

The rule the whole look follows is **stone and light**: realism goes into form, material and
lighting, while the *data* goes into the light. Facades keep only about 12% age tint, so brick still
looks like brick; age and flow live at full strength in the **emissive windows and street glow**.
That's how a real city reads at dusk — the building is stone, the windows are light — so
believability and legibility stop competing.

Window rows are per-building: a 20-storey tower gets 20 rows and a brownstone gets 3, because the
pattern is a UV scale rather than a per-building texture.

---

## 5. The green and red beams — who is buying and who is selling

**This is the signal the city exists for.** A rich list tells you who is big. This tells you who is
*acting*.

- **Green beam — the wallet added** over the window.
- **Red beam — the wallet reduced.**
- **No beam** — the position didn't move meaningfully.

The window is switchable between **7 days and 30 days**. A beam appears once net flow passes ~12% of
the wallet's own scale, so ordinary noise stays dark and only real movement lights up. Beam height
and thickness both grow with the size of the move, and the building's windows shift toward the flow
colour as well, so a strong mover reads from any distance.

They are **shafts of light, not rings on the pavement**. A ground halo only reads from above, and
the city is mostly looked at from street level where the pavement is hidden behind whatever is in
front of it. A beam clears the roofline, so the signal survives every camera angle and zoom.

**Reading them at scale:** on 29 October 2024, 428 of 827 residents were red — 51.8%, the highest
ever — while $195M of profit was realised that month. Today it's 158 red out of 4,893 (3.2%), with
more green than red. The same view, two years apart, is the clearest thing the city does.

> Beams read best at **night**, where a dark sky lets the colour stay colour. In daylight the
> additive glow of hundreds of overlapping beams stacks toward white.

---

## 6. The crown

A small marker floats over the single largest holder — **"biggest whale"** in Whale City, the top
collector in Aeon City. It moves when the ranking does.

---

## 7. Districts — where a building stands

Manhattan is divided into **ten districts**, each a band along the island, weighted by how much
buildable land it actually has:

| District | Notes |
|---|---|
| Financial District | tower district |
| Tribeca & SoHo | |
| Greenwich Village | |
| Chelsea & Flatiron | |
| Midtown | tower district |
| Upper East Side | Central Park frontage — tower-eligible |
| Upper West Side | Central Park frontage — tower-eligible |
| Harlem | |
| Washington Heights | |
| Inwood | |

**⚠ The street address is a game, and the page says so.** Which district a wallet lands in comes from
a hash of its own address, not from anything real. It's stable — you'll always find yourself in the
same place — but it means nothing. The *building* is data; the *address* is not.

The one exception is deliberate: the very largest holders (top ~10% by score) are drawn into the
**tower districts**, which is what actually puts the skyscrapers downtown and in Midtown rather than
scattering them randomly through Inwood.

**Towers claim room.** Districts fill from the core outward in conviction order, which meant ranks
1, 2, 3… were neighbours by construction — the tallest buildings in the city fused into one dark
slab over Midtown. The fix was a clearance radius, since placement is already declared a game while
height cannot be touched:

| Rank | Clearance |
|---|---|
| Top 8 | 5.2 units — a block of sky each |
| To rank 40 | 3.6 |
| To rank 120 | 2.6 — roughly the glass cohort |
| To rank 320 | 1.8 |
| Everyone else | packs normally — the mass *is* the city |

Blocks, avenues and streets come from one grid, so the corridors you see are the corridors the
buildings left. Central Park is not buildable, and neither is the ground the bridge lands on.

---

## 8. The harbour — everything that isn't a holder

About a quarter of the supply belongs to no person at all. Rather than hide it, it gets built:

| Landmark | What it is | Today |
|---|---|---|
| **The Statue of Liberty**, on Liberty Island | **The burn.** `0x…dead` is receive-only, so these coins can never move again. The one statue on earth everybody recognises from its outline happens to be holding up a flame. | **69.0M** |
| **Governors Island** | **The Uniswap pool.** SPX launched as a DEX token, so the LP is the oldest thing here — putting it on its own island says that. | **13.7M** |
| **The Brooklyn Bridge** | **The Wormhole bridge**, which is what actually backs the supply on Base and Solana. It runs the real bridge's line, Manhattan to Brooklyn. | **111.3M** |
| **The docks off Red Hook** | **The exchanges**, one warehouse per venue, footprint sized by that venue's share. Red Hook is New York's real container port. | **162.9M** across 16 venues |

The warehouses are deliberately squat and wide: nothing in the harbour should be mistaken for a
holder's building, because none of those coins belong to a person. Kraken's berth dwarfs the rest at
36% of exchange-held supply — that's the finding, not a rendering accident.

Held by actual residents, for comparison: **643.1M**.

---

## 9. The outer boroughs

Manhattan holds **1,693 lots**. When there are more residents than that, the overflow builds in
**Brooklyn, Queens, the Bronx and Jersey City** — another 4,582 lots, on the same street bearing.

**The newest wallets are the ones who move.** Picking by tenure means nobody is displaced by a price
move or a partial sale — only by having arrived later than the people already on the island.

The boroughs are currently overflow housing. Turning them into the *other chains* — Brooklyn as Base,
Queens as Solana — is designed but **not built**, because there is no per-wallet data for Base or
Solana yet, only headcounts. Inventing buildings for them would be exactly the kind of thing this
project doesn't do.

---

## 10. Controls

- **City / Skyline** — the map, or a plain ranked skyline with no geography.
- **Day / Dusk / Night** — dusk by default. Night is prettiest and best for beams; day is the most
  realistic and the least informative, because sunlight washes the emissive windows out.
- **7-day / 30-day flow** — the window the beams measure.
- **Building count** — how many to render, for weaker devices.
- **"Where do you live?"** — paste any address to fly to its building. Every wallet has a home,
  whether or not it's currently rendered.
- **Hover** for the wallet, **click** to pin it, and open it in Zerion from the card.

---

## 11. Claim your building

Connect a wallet, sign a short message, and a note hangs over your building.

Notes are **on-chain** — a transaction to a one-function contract with no storage, no owner, no
admin and no payable path. We keep no database, no endpoint and no key; anyone can read the same
logs and rebuild the board. Both **Ethereum** (grey border) and **Base** (blue border) are
supported, each labelled in writing as well as by colour, because the Ethereum grey is near-neutral
by design and colour alone isn't a distinction every reader can make.

Rules, all deliberate: **only wallets that own a building can post** — the city is a map of holders,
so a note on it should mean somebody is really there. **One message per wallet, replaceable** — no
flood, no thread to moderate. Messages are capped at **140 characters**, links are refused so the
city can't be used to shill, and control and bidi-override characters are stripped.

**What permanence costs:** nobody can delete a note, us included. So the filter is applied when
*rendering*, not only when posting — anyone can write a link on-chain, the city just won't draw it.
Ownership is checked at render time too, since the contract can't know who holds what.

> **Not live yet.** The contract has not been deployed, so this surface says so rather than
> half-working.

---

## 12. What the city cannot tell you

- **Wallets are addresses, not people.** One person can hold several; an exchange holds many
  people's. Never read the resident count as a headcount.
- **The city is a top slice, not everyone.** ETH, Base and Solana together hold roughly 230,000
  wallets against 6,275 lots. Whale City is inherently a view of the largest holders and says so.
  Aeon City, at 3,333 tokens, genuinely fits everyone.
- **Street addresses are hash-derived.** Districts, neighbours and lot positions mean nothing.
- **Flow is not intent.** A red beam means coins left the wallet. It cannot tell a sale from a
  transfer between someone's own wallets, and a move to an exchange is not yet a sale.
- **Only Ethereum is reconstructed.** Base and Solana holdings are not in the buildings.
- **It is a behaviour read, not a signal.** Not financial advice.

---

## 13. Aeon City — what differs

Same engine, NFT data. Height is **tokens held × holding duration**, and holder age is cleaner than
on the coin side: each token is a discrete unit with one owner and one last-transfer timestamp, so
there's no FIFO cost-basis reconstruction involved. Flow is net NFTs in or out over 30 days.

An optional toggle folds each holder's **SPX balance** into the height, rescaled onto the same axis —
346 of 1,173 AEON holders (29%) also hold SPX, which is what makes the crossover worth showing.

---

## 14. Reproducing any of it

Everything above comes from two committed files and the code that draws them:

| Element | Source |
|---|---|
| Residency, balances, holding age, flow | `public/whales.json`, written by the FIFO engine |
| Harbour supplies and venue split | `public/onchain.json` (`cexVenues`, `bridgeBal`, `burnBal`, `lpBal`) |
| Height curve and building types | `src/city-render.js` — `heightOf`, `archetype` |
| Districts, lots, clearance, boroughs | `src/city-map.js` |
| Landmarks | `src/city-infra.js` — `SITES` |
| Notes | `src/city-messages.js`, `contracts/CityNotes.sol` |

The building distribution in §3 is a direct replay of `heightOf` and `archetype` over
`public/whales.json`. The city can also be rebuilt **as it stood on any past date** by truncating the
transfer archive at that date and re-running the engine — which is how the October 2024 frames in §5
were produced. Nothing in them is illustrative.
