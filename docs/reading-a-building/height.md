---
description: Why some buildings tower over others.
---

# Height

**Height measures size × conviction.**

Size is how much a wallet holds. Conviction is how long it has held it — a wallet that has sat on
its position since launch stands taller than one of the same size that arrived last month.

That is the entire idea. Everything below is implementation.

![The height range, towers to low-rise](/manual/height.jpg)
*Height is size × conviction, so the tallest towers are big positions held since launch. The ordering is exact; the spacing is compressed (mostly-logarithmic) so one whale doesn't dwarf the rest into a car park.*

## The scale

Heights run from **1.0** for the smallest resident to **21.0** for the largest.

Today the median building is **2.89**, the 75th percentile is 4.20, the 95th is 7.68. In
architectural terms the median is about **3.1:1** tall-to-wide and the tallest is 22.8:1 — real
supertalls top out near 24:1, so the city sits just inside what could actually stand up.

<details>

<summary>The equation</summary>

```
score  = (balance / largest balance) × (0.45 + 0.55 × (days held / longest held))
height = 1.0 + 20 × ( 0.50 × log-normalised(score) + 0.50 × √score )
```

The floor of 1.0 is not decoration. The smallest resident cleared 5,000 tokens held for 90 days, and
nothing in Manhattan is one storey.

</details>

<details>

<summary>Why not use a linear scale?</summary>

SPX holdings span almost 3,000× between the smallest resident and the largest whale.

On a linear scale, almost every building would become a tiny block while one tower dominated the
skyline.

A logarithmic scale preserves ordering while compressing extremes into something humans can actually
compare.

Pure logarithms flatten the top too aggressively, so the final height combines logarithmic and
square-root scaling equally.

This keeps both the skyline and the underlying data honest.

</details>

## What height never does

**Height is never adjusted for neighbours.**

Capping a tower because a taller one stands nearby would be a lie about that wallet. When the tall
buildings needed room to read as tall, the fix was moving them apart — see
[Districts](../reading-the-city/districts.md) — because where a building stands is already a game,
while how tall it stands is not.

{% hint style="warning" %}
**The ordering is exact. The spacing is compressed.**

Two buildings of visibly similar height can differ substantially in tokens. The ranking between them
is always correct, and the real figure is one hover away.
{% endhint %}
