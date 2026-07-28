---
description: Where every number comes from, and how to check it yourself.
---

# Technical Details

Nothing in the city is illustrative. Every figure traces back to two committed data files and the
code that draws them.

## Where the data lives

| Element | Source |
| --- | --- |
| Residency, balances, holding age, flow | `public/whales.json`, written by the FIFO engine |
| Harbour supplies and venue split | `public/onchain.json` — `cexVenues`, `bridgeBal`, `burnBal`, `lpBal` |
| Height curve and building types | `src/city-render.js` — `heightOf`, `archetype` |
| Districts, lots, clearance, boroughs | `src/city-map.js` |
| Landmarks | `src/city-infra.js` — `SITES` |
| Notes | `src/city-messages.js`, `contracts/CityNotes.sol` |

The building distribution in [Architecture](reading-a-building/architecture.md) is a direct replay of
`heightOf` and `archetype` over `whales.json` — not a hand-maintained table.

## How the underlying data is built

Balances, holding ages and flows come from a **FIFO reconstruction** of every SPX transfer on
Ethereum. Each wallet is a queue of lots; a send consumes the earliest lots first, so every held coin
keeps its true acquisition date and cost.

That reconstruction runs locally against a transfer archive, refreshed daily from an incremental
on-chain pull. Exchange, LP, bridge and burn addresses are tagged and excluded from the holder set,
which is what makes the remaining buildings real holders rather than infrastructure.

## Rebuilding the city on a past date

The city can be rebuilt **as it stood on any date** by truncating the transfer archive at that date
and re-running the engine. The whale snapshot is taken at the end of the replay, so the output is
that date's city — every building, height, colour and beam.

This is how the October 2024 frames in [Flow](reading-a-building/flow.md) were produced. Nothing in
them is reconstructed by hand or approximated.

## Rendering

The city is three.js. Buildings are merged into shared meshes by material family, age band and flow
direction, so the entire city costs on the order of **75 draw calls** regardless of whether it is
drawing 600 buildings or 4,893.

Picking rides an invisible instanced bounding box per building — one draw call for the whole city,
returning the building under the cursor.

{% hint style="info" %}
`window.__cityStats()` reports live buildings, draw calls, triangles and camera position from the
browser console. `window.__cityCam(position, target, fov)` parks the camera anywhere and renders a
single frame.
{% endhint %}
