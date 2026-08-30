// Single source of truth for how each card type posts: 4:5 portrait vs landscape,
// and animated video vs static image. Kept dependency-free (no resvg/renderer) so
// the lightweight schedule endpoint and the control console can import the SAME
// decisions the renderer uses — no more drifting hardcoded copies.

// Posted-media portrait canvas (4:5) for mobile feeds. OG/link images stay landscape.
export const PORTRAIT = { W: 1080, H: 1350 };

// Owner-pickable aspect-ratio presets (control panel → AR override per card). The
// renderers scale to any {W,H}; these are the tested ratios. Static image cards
// only — video/portrait-native cards keep their own format.
export const AR_PRESETS = {
  landscape: { label: "Landscape 3:2", W: 1200, H: 800 },
  wide: { label: "Wide 1.91:1", W: 1200, H: 628 },
  square: { label: "Square 1:1", W: 1200, H: 1200 },
  portrait: { label: "Portrait 4:5", W: 1080, H: 1350 },
};
export const dimsForAR = key => (AR_PRESETS[key] ? { W: AR_PRESETS[key].W, H: AR_PRESETS[key].H } : null);

// Which cards post at 4:5 portrait vs landscape. The rainbow fills mobile feeds
// nicely at 4:5, and the animated `scale` zoom-out was built for the 4:5 video.
// The other static chart cards are landscape (their AR is being tuned).
const PORTRAIT_TYPES = new Set(["scale", "rainbow", "costbasis"]);
export const isPortraitCard = type => PORTRAIT_TYPES.has(type);

// Which cards post as an animated video vs a static image. We animate only where
// motion IS the message — the S&P scale zoom-out and the cube stack. Charts
// (rainbow/line) read fully at a glance, so they post as static images (a video's
// near-blank draw-in first frame makes a weak autoplay thumbnail in-feed).
// costbasis is a time-lapse — the cost-basis ladder builds launch→today, so motion IS the message.
const VIDEO_TYPES = new Set(["scale", "cube", "costbasis"]);
export const isVideoCard = type => VIDEO_TYPES.has(type);

// Cards that ARE a finished static image (posted as-is, no chart render). Maps the
// card type to its public asset path, so the web layer (OG endpoint / control
// console) can serve the file directly at its native aspect ratio instead of
// rasterizing it in a serverless function. The bot still reads the bytes itself.
const STATIC_IMAGE = { kraken: "/rainbow-kraken.png" };
export const staticImageFor = type => STATIC_IMAGE[type] || null;
