---
description: How long a wallet has held, read from across the water.
---

# Colour

**Buildings are made from stone.**

**The data lives in the light.**

Older holders glow **cyan**. Newer holders glow **amber**.

Rather than tinting the entire building, most of the colour appears in windows and street lighting.
Real cities are defined by illuminated windows at dusk, so placing information in the light keeps
the city believable while making holding age readable from a distance.

## Why not just colour the buildings

An earlier version tinted whole facades by holding age. It looked worse *and* said less: brick
stopped looking like brick, and the age signal was diluted across a large dull surface instead of
concentrated in the brightest thing on screen.

Facades now keep only about **12%** age tint — enough to warm or cool the stone, not enough to stop
it reading as stone. Age and [flow](flow.md) live at full strength in the emissive windows and the
glow they throw onto the street.

Window rows are per-building: a 20-storey tower gets 20 rows and a brownstone gets 3, because the
pattern is a UV scale rather than a texture baked per building.

{% hint style="warning" %}
If a future change starts tinting facades by data again, it will look worse and say less. That
trade has already been made once.
{% endhint %}

## Time of day

Colour reads differently depending on the light:

* **Dusk** — the default, and the balance point. Windows are lit, the sky still has colour.
* **Night** — the most legible for [flow beams](flow.md), because a dark sky lets colour stay colour.
* **Day** — the most realistic and the least informative. Sunlight washes the emissive windows out,
  which is exactly where the data lives.
