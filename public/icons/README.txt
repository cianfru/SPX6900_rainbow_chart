Drop full-square icon PNGs here, named <key>.png — the app screen (/ios-poc.html) auto-picks
them up in place of the placeholder SVGs (a missing file falls back to the SVG).

HOME APPS (12):
  rainbow  city  valuation  performance  holders  onchain  whales  exchanges  market  races  aeon  method

DOCK (4):
  x  youtube  kraken  search

OPTIONAL — folder charts also try /icons/<chartId>.png (else a generic chart glyph), e.g.:
  mvrv nupl sopr supplyprofit bagsprofile urpdage lthsth nrpl liveliness  (On-chain folder)
  channel roadmap risk riskcolor riskheat picycle rsidots valuation        (Valuation folder)
  ...any chart id from the catalog.

STYLE: your flat long-shadow set looks great. The tile adds a glossy 'gel' shine whose strength is
a knob (CSS var --gel, default 0.16 = subtle). Test flat vs glossy live: /ios-poc.html?gel=0 (flat)
… /ios-poc.html?gel=0.5 (full first-iPhone gloss). 1024x1024, solid per-app background, no text.
