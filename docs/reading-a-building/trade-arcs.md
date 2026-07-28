---
description: Every sale drawn from the seller's roof to the buyer's.
---

# Trade Arcs

**In [AEON mode](../modes.md), a sale is drawn as an arc from the seller's building to the buyer's.**

Violet, because age is amber→cyan and [flow](flow.md) is green/red — a trade is a third kind of fact
and needs a channel of its own. Thickness carries the price, and the three largest trades in the
window are labelled with what they went for and which token moved.

## Why only the NFT side can do this

This is the one thing the collection can show that the token cannot.

A token transfer usually ends at an exchange address. The coins go into a hot wallet, the person on
the other side is unknowable, and the trade they represent happens off-chain in an order book you
cannot see. The best the city can honestly do for SPX is glow the building that moved — which is
what [flow beams](flow.md) are.

An NFT sale has no such gap. It is one wallet to another, with the price, the token and both parties
written into the same transaction. Nothing is hidden, so nothing has to be inferred.

## Arcs that run off the map

A building only exists for a wallet that still holds. So when a seller has since sold out, there is
no roof for the arc to leave from.

Those trades are **still drawn** — as a short arc leaving the surviving building and heading off
past the shoreline. That is what actually happened: they sold and left.

{% hint style="warning" %}
Keeping only the arcs that happened to fit would hide most of the market. Over the current 30-day
window, **111 trades**: 38 connect two standing buildings, and 73 have a counterparty who has since
gone. Drawing only the 38 would make the market look a third as busy as it was.

The page states both numbers, every time.
{% endhint %}

Departures are drawn dimmer than trades between two residents. They are two different statements:
one you can trace end to end, one you can only see half of.

## Why the window exists

Arcs cover the last **30 days** by default.

That is not a rendering budget, it is churn. The share of trades with both parties still holding
falls away fast:

| Window | Trades | Both ends still standing |
| --- | --- | --- |
| 30 days | 113 | **34%** |
| 90 days | 319 | 22% |
| All time | 17,040 | 3% |

Over all time, 97% of trades would have at least one end missing. The window keeps the picture
mostly traceable.
