---
description: Hang a note over your building, stored on-chain and nowhere else.
---

# Claim Your Building

Connect a wallet, sign a short message, and a note hangs over your building.

{% hint style="success" %}
**Live on Base.** The `CityNotes` contract is deployed at
`0xa167867B9E2117dce603A929dc1322864C282262` and verified on Basescan and Sourcify — no owner, no
admin, no pause, no upgrade path. Read the source and check every claim on this page for yourself.
{% endhint %}

## There is no database

A note is a transaction to a one-function contract — no storage, no owner, no admin, no payable
path. Nothing to seize, nothing to hold value.

We keep no database, no endpoint and no key. Anyone can read the same logs and rebuild the board
themselves.

This also removed the weakest part of the original design. When notes were signed messages held on a
server, something had to re-verify what the browser claimed. On-chain, `msg.sender` cannot be forged,
so that problem disappears rather than being deferred.

## Two chains, clearly marked

| Chain | Border | Why you'd use it |
| --- | --- | --- |
| **Ethereum** | grey | Where the holdings are. Real gas, so a note is a statement |
| **Base** | blue | Fractions of a cent — the default, and why people will actually post |

The written chain label is not optional. The Ethereum grey is near-neutral by design, and colour
alone is not a distinction every reader can make.

## The rules

* **Only wallets that own a building can post.** The city is a map of holders, so a note on it
  should mean somebody is really there.
* **One message per wallet, replaceable.** No flood, no thread to moderate.
* **140 characters.**
* **No links.** The city stays unshillable.
* **No control or bidi-override characters** — an override can render a harmless string as something
  else entirely.

## What it looks like, and when

Your note hangs in a small bubble tied to your building by a thin gold tether and a gold ring — so
it reads as *planted on that building*, never floating over the district. The tether is a quiet gold
on purpose, so it can't be mistaken for the green/red flow beams that mean buying and selling.

You see your own note the instant the transaction is signed. **Everyone else sees it within about a
day** — the city reads the chain once daily and redraws the board, rather than watching it live.

## What permanence costs

Nobody can delete a note. Us included.

So the filter is applied when **rendering**, not only when posting. Anyone can write a link
on-chain; the city simply won't draw it. Ownership is checked at render time too, since the contract
cannot know who holds what.

## Who counts as a resident

The city has [three modes](modes.md) and **one noticeboard**. Citizenship is the **union**: hold
either asset and you live here, so you can write a note from whichever mode you happen to be looking
at.

Gating it on the current toggle would have meant an AEON collector was a citizen on one screen and a
stranger on the next, having done nothing. It also ignores the buildings-to-render control — a real
holder outside the top 600 is still a resident.

Your note hangs on **your building**, so it appears in the modes where you have one. A wallet that
holds AEON but not enough SPX writes its note from anywhere and sees it in AEON mode.
