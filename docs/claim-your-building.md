---
description: Hang a note over your building, stored on-chain and nowhere else.
---

# Claim Your Building

Connect a wallet, sign a short message, and a note hangs over your building.

{% hint style="warning" %}
**Not live yet.** The contract has not been deployed, so this surface says so rather than
half-working.
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

## What permanence costs

Nobody can delete a note. Us included.

So the filter is applied when **rendering**, not only when posting. Anyone can write a link
on-chain; the city simply won't draw it. Ownership is checked at render time too, since the contract
cannot know who holds what.
