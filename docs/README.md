---
description: One city built entirely from on-chain data, where every building is a wallet.
---

# SPX City

**SPX City turns blockchain data into a city.**

Every building represents a single wallet.

The taller the building, the larger and longer-held the position. The colour reflects holding age.
Green and red beams show who is accumulating and who is distributing. Even the harbour has meaning:
exchanges, liquidity pools, bridges and burned tokens become physical landmarks instead of
disappearing into tables.

## Nothing is decorative

Every visible feature corresponds to a measurable property of the blockchain. If something exists
only to make the city look better, it is labelled as a game or it does not exist.

There is one city, and it has three modes — SPX holders, AEON collectors, and the wallets that
qualify on both. Each mode is its own population under its own rule, and height always measures the
asset that mode is about. See [Modes](modes.md).

## How a wallet becomes a building

```mermaid
flowchart TD
  W[Wallet] --> E{5,000 SPX<br/>held 90 days?}
  E -- no --> X[Not rendered<br/>still searchable]
  E -- yes --> P[ ]
  P --> H[Height<br/>size x conviction]
  P --> C[Colour<br/>holding age]
  P --> F[Flow<br/>buying or selling]
  P --> D[District<br/>hashed address]
  H --> B[Building]
  C --> B
  F --> B
  D --> B
```

## Start here

| If you want to know… | Read |
| --- | --- |
| How to move around, and what clicking does | [Navigating](navigating.md) |
| What a single building is telling you | [Reading a Building](reading-a-building/README.md) |
| How to replay the city from launch to today | [The Time Machine](time-machine.md) |
| Why the skyline is shaped the way it is | [Height](reading-a-building/height.md) |
| Who is buying and who is selling | [Flow](reading-a-building/flow.md) |
| What the statue, the bridge and the docks mean | [Infrastructure](infrastructure.md) |
| Why there are three cities behind one door | [Modes](modes.md) |
| What the city gets wrong, or can't say | [Limitations](limitations.md) |
| The rules the whole thing is built on | [Design Principles](design-principles.md) |

***

Figures throughout are from the live data on **29 July 2026**. Everything is reproducible — see
[Technical Details](technical-details.md).
