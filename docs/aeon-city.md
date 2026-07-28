---
description: The same engine, pointed at an NFT collection.
---

# Aeon City

Aeon City is Whale City with a different dataset. Same engine, same rules, same honesty.

Every building is one **Project AEON** holder rather than one token holder.

## What changes

| | Whale City | Aeon City |
| --- | --- | --- |
| A building is | a wallet holding SPX | a wallet holding AEON |
| Height | balance × holding duration | NFTs held × holding duration |
| Flow | net SPX over 7 or 30 days | net NFTs over 30 days |
| Everyone fits? | No — a top slice | **Yes** — 3,333 tokens |

## Holder age is cleaner here

On the coin side, working out how long someone has held requires a full FIFO reconstruction: a
balance is made of lots bought at different times, and a partial sale has to consume them in order.

An NFT has none of that. Each token is a discrete unit with exactly one owner and one last-transfer
timestamp, so holder age is simply *now minus that timestamp*. No lots, no cost basis, no
intra-block ordering problem.

## The SPX overlay

An optional toggle folds each holder's **SPX balance** into the building height, rescaled onto the
same axis.

This exists because **346 of 1,173 AEON holders (29%) also hold SPX**, and AEON's weekly returns
correlate 0.53–0.57 with SPX. The overlap is the reason the collection is worth showing to an SPX
audience at all — it is genuinely the same community, not NFT content in disguise.

Toggles also let you show AEON-only, or exclude single-NFT holders to see the collectors.
