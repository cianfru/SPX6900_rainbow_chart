// A pixelated diagonal wipe for the dark ↔ bright theme toggle. A wavefront of chunky
// "pixel" cells sweeps from the top-left corner to the bottom-right, painting the NEW
// theme's background over the page with a brand-green crest riding the leading edge; the
// real theme swaps once the screen is covered, then the overlay fades out.
//
// SAFETY FIRST — the effect can NEVER block the actual theme change: if the canvas can't
// be created, motion is reduced, or anything throws, we call swap() synchronously and bail.
// A backstop timeout also guarantees swap() runs even if rAF is throttled in a hidden tab.

const BG = { dark: "#08090b", light: "#f7f8fa" };     // matches the terminal palette --bg
const CREST = { dark: "#4ee79a", light: "#12b981" };  // brand green crest at the wavefront

export function themeWave(toLight, swap) {
  const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || typeof document === "undefined" || typeof requestAnimationFrame === "undefined") { swap(); return; }

  let canvas, ctx;
  try {
    canvas = document.createElement("canvas");
    ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
  } catch { swap(); return; }

  const target = toLight ? "light" : "dark";
  const bg = BG[target], crest = CREST[target];
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.max(1, window.innerWidth), H = Math.max(1, window.innerHeight);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  Object.assign(canvas.style, {
    position: "fixed", left: "0", top: "0", width: "100%", height: "100%",
    zIndex: "2147483646", pointerEvents: "none", willChange: "opacity",
  });
  ctx.scale(dpr, dpr);
  document.body.appendChild(canvas);

  const cell = Math.max(12, Math.round(Math.min(W, H) / 42)); // pixel cells (kept chunky, a touch finer)
  const cols = Math.ceil(W / cell), rows = Math.ceil(H / cell);
  const maxD = Math.max(1, (cols - 1) + (rows - 1));
  // A little per-cell jitter so the diagonal edge dithers instead of drawing a hard line.
  const jitter = new Float32Array(cols * rows);
  for (let i = 0; i < jitter.length; i++) {
    const s = Math.sin((i + 1) * 12.9898) * 43758.5453;
    jitter[i] = s - Math.floor(s);
  }

  const DUR = 320;        // ms sweep — quick, so it doesn't dominate a frequently-used toggle
  const CREST_W = 0.09;   // thin crest band width in normalized-diagonal units
  let start = null, swapped = false, done = false;

  const doSwap = () => { if (!swapped) { swapped = true; try { swap(); } catch { /* swap is the caller's */ } } };

  function frame(t) {
    if (start === null) start = t;
    const p = Math.min(1, (t - start) / DUR);
    const front = p * (1 + CREST_W); // run a touch past 1 so the crest clears the far corner
    ctx.clearRect(0, 0, W, H);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const d = (c + r) / maxD + (jitter[r * cols + c] - 0.5) * 0.05;
        if (d > front) continue;
        const behind = front - d;
        if (behind < CREST_W) {
          ctx.fillStyle = crest;
          ctx.globalAlpha = 0.26 + 0.30 * (1 - behind / CREST_W); // dim — a subtle shimmer, not a bright band
        } else {
          ctx.fillStyle = bg;
          ctx.globalAlpha = 1;
        }
        ctx.fillRect(c * cell, r * cell, cell - 1, cell - 1); // 1px gap = the pixel grid
      }
    }
    ctx.globalAlpha = 1;
    // Swap the real theme once the front has covered the screen but before the crest
    // finishes clearing — so anything revealed in the 1px grid gaps is already new-theme.
    if (p >= 0.6) doSwap();
    if (p < 1) requestAnimationFrame(frame);
    else if (!done) {
      done = true;
      canvas.style.transition = "opacity .22s ease";
      canvas.style.opacity = "0";
      setTimeout(() => { try { canvas.remove(); } catch { /* already gone */ } }, 260);
    }
  }
  requestAnimationFrame(frame);
  setTimeout(doSwap, DUR + 220); // backstop: theme changes even if the animation stalls
}
