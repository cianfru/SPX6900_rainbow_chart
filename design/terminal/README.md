# SPX6900//RAINBOW — "Reserve Terminal" redesign (POC)

Design exploration for a new landing/site look: an **80s cathode-ray-tube data terminal**.
These are self-contained HTML mockups (open any of them directly in a browser). Nothing here is
wired into the app — it's a design intermediary, kept in-repo so the work is durable and any
session/machine can pick it up. The folder is **deploy-ignored** (see `.github/workflows/deploy.yml`
`paths-ignore`), so committing here never spends a Vercel deploy and it's never bundled into the site.

## Files

- **`terminal-crisp.html` — THE FRONT-RUNNER.** One-colour green phosphor on pure black, the crisp
  IBM-VGA look (see "crispness" below). Full nav structure. Start here.
- `terminal-amber-spectrum.html` — amber-phosphor variant + the reconciliation of the wordmark
  (`SPX6900` phosphor + `RAINBOW` in the actual 9-band spectrum + rainbow hairline rule) + a
  CRT⇄READ toggle. Reference for the amber direction and the spectrum wordmark treatment.
- `terminal-multiview.html` — a walkable multi-view: nav commands actually switch the main screen
  (rainbow / valuation / on-chain / whales). Demonstrates the interaction model.
- `fonts/` — the two embedded pixel fonts (OFL / CC-BY-SA), so nothing depends on a CDN:
  - `Px437_IBM_VGA_8x16.ttf` — the crisp DOS/mainframe face (front-runner).
  - `VT323-Regular.ttf` — a softer DEC-terminal face (the amber/hd mockup uses this).

  The HTML files inline their font as a base64 data URI (CSP-safe). To rebuild an inline copy:
  `base64 -w0 fonts/Px437_IBM_VGA_8x16.ttf` → paste into the `@font-face src:url(data:font/ttf;base64,…)`.

## Design decisions (settled with the owner)

1. **Retro housing, modern instruments.** The 80s treatment is CHROME only — frame, pixel type,
   scanlines, phosphor. The **charts stay hi-def**: full-resolution, anti-aliased, real colour,
   crisp data labels, lifted above the scanline layer (`z-index:6`) so the curve never gets
   pixelated. Never degrade the data — that's the honesty moat.
2. **One-colour chrome; colour lives only in the charts.** True monochrome phosphor (a real P1/P3
   tube is single-colour by physics). The wordmark `SPX6900//RAINBOW` is one colour — because the
   RAINBOW *chart* is the actual rainbow. Colour appears ~twice on screen: the rainbow hairline and
   the charts. Scarcity makes the brand pop. (The `amber-spectrum` file shows the alternative where
   the word RAINBOW itself is the spectrum — owner leaning to the pure one-colour version instead.)
3. **Crispness = the professional look, not the movie-CRT haze.** Bank/finance terminals (IBM 3270,
   DEC VT320, Reuters) were engineered for legibility: tight beam, sharp characters. So: IBM-VGA
   pixel font, bloom killed (a tight 2px halo, not a fat 3-layer glow), fine light scanlines,
   font-smoothing off. NOT the soft glowy hobbyist green-screen.
4. **Nav mirrors today's site division:** `CHARTS` (opens all chart pills, grouped Valuation /
   Performance / On-Chain / Markets like the gallery) · `SPX_CITY` · `PROJECT_AEON` · `METHODS`.
5. **Black background, green phosphor** is the current default (amber is a one-tap alt).
6. A **READ mode** toggle strips the tube + swaps the pixel font back to clean mono for sustained
   reading (in the amber/hd + multiview files).

## Phase 2 — the actual build (not started)

Port the shell into the React app behind a **hidden, unlisted route** (`?view=terminal`). The live
homepage is untouched; the current site keeps working exactly as now. Mechanics:

- The CRT treatment is a CSS + font layer on a new layout shell.
- Each "module" is an **existing chart component** (`RainbowChart`, `ValuationComposite`,
  `WhaleMosaic`, the On-Chain charts, etc.) dropped into the frame, rendered at full fidelity.
- Every dev commit carries `[skip deploy]` so we push real code to `main` without spending Vercel
  deploys; flip the route to default in ONE commit when ready to ship.

Open items to decide: amber vs green default · do `city.3d` / `aeon` open inside the tube (WebGL in
frame) or break out full-screen · optional boot-sequence power-on animation · favicon/OG adopting
the pixel `SPX6900` + spectrum `RAINBOW`.

## Live artifact previews (claude.ai)

- Crisp front-runner: https://claude.ai/code/artifact/e60dcb1f-1941-4f11-ba00-d14034767275
- Amber + spectrum wordmark: https://claude.ai/code/artifact/1ff088e4-1c2d-44fc-aa33-e67ded63e196
- Multi-view walkthrough: https://claude.ai/code/artifact/ef9993a3-86c8-49f9-ab90-1eb1577471a2
- Mono green (pre-crisp): https://claude.ai/code/artifact/4ed83477-b19d-4f9b-8a5f-3b79a4b65b75
