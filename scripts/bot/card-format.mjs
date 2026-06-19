// Single source of truth for how each card type posts: 4:5 portrait vs landscape,
// and animated video vs static image. Kept dependency-free (no resvg/renderer) so
// the lightweight schedule endpoint and the control console can import the SAME
// decisions the renderer uses — no more drifting hardcoded copies.

// Posted-media portrait canvas (4:5) for mobile feeds. OG/link images stay landscape.
export const PORTRAIT = { W: 1080, H: 1350 };

// Which cards post at 4:5 portrait vs landscape. The rainbow fills mobile feeds
// nicely at 4:5, and the animated `scale` zoom-out was built for the 4:5 video.
// The other static chart cards are landscape (their AR is being tuned).
const PORTRAIT_TYPES = new Set(["scale", "rainbow"]);
export const isPortraitCard = type => PORTRAIT_TYPES.has(type);

// Which cards post as an animated video vs a static image. We animate only where
// motion IS the message — the S&P scale zoom-out and the cube stack. Charts
// (rainbow/line) read fully at a glance, so they post as static images (a video's
// near-blank draw-in first frame makes a weak autoplay thumbnail in-feed).
const VIDEO_TYPES = new Set(["scale", "cube"]);
export const isVideoCard = type => VIDEO_TYPES.has(type);
