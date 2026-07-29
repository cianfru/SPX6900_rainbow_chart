// Dynamic resolution scaling for the city — one quality level, adapted by RESOLUTION (owner call,
// 2026-07-29): full pixel ratio where the GPU keeps up, stepping the render buffer down where it
// doesn't, creeping back up when there's headroom. MEASURED, not sniffed — a user-agent list of
// "low-tier phones" rots, a frame-time meter is true on hardware that doesn't exist yet.
//
// Pure and unit-tested (test/city-drs.test.mjs) because the dev sandbox CANNOT exercise it live:
// headless Chromium fires requestAnimationFrame on demand (~0.7Hz measured) and a SwiftShader city
// frame takes seconds — slower than the tab-switch cutoff below, i.e. slower than any real device.
// Two earlier in-page versions "worked" silently and did nothing; only feeding synthetic frame
// sequences through the logic proves it.
//
// Tuning, and why:
//   • down on ~0.8s of SUSTAINED jank, measured in TIME not frames — a frame-count gate makes the
//     worst devices wait longest (20 × 600ms = 12s of slideshow before help arrives; time-based
//     fires on the 2nd catastrophic frame).
//   • up only after ~240 consecutive at-vsync frames (~4s) — quick down, slow up, so a borderline
//     device settles instead of oscillating. Net drift of a full down+up cycle is ×0.96, downward.
//   • dt > 2s = a tab switch, not a frame — skipped entirely. Accepted samples clamp to 600ms so
//     one outlier can't poison the average. On real hardware even terrible phones frame in
//     100–300ms; a device genuinely slower than 2s/frame is beyond what resolution can save.
export function makeDrs({ maxRatio, minRatio, apply }) {
  let ratio = maxRatio, ema = 16, lastT = 0, slowMs = 0, fastN = 0;
  const step = (r) => { ratio = r; apply?.(r); };
  return {
    tick(now) {
      if (lastT) {
        const dt = now - lastT;
        if (dt < 2000) {
          // Clamp BOTH the average and the jank budget: an unclamped single hitch (GC pause, tab
          // paint) once blew straight past the 800ms budget and dropped resolution for one frame's
          // sin — the unit test caught it.
          const c = Math.min(dt, 500);
          ema = ema * 0.9 + c * 0.1;
          if (ema > 40) {                                 // sustained under ~25fps
            fastN = 0; slowMs += c;
            if (slowMs > 800 && ratio > minRatio) {
              step(Math.max(minRatio, ratio * 0.8));
              // Forgive the past: without this reset the EMA keeps remembering the OLD
              // resolution's jank and double-steps before the new one has rendered a single
              // frame — the recovery test caught it stepping DOWN during clear headroom.
              slowMs = 0; ema = 30;
            }
          } else if (ema < 17) {                          // at/near 60Hz vsync = headroom
            slowMs = 0;
            if (++fastN > 240 && ratio < maxRatio) { step(Math.min(maxRatio, ratio * 1.2)); fastN = 0; }
          } else { slowMs = 0; fastN = Math.max(0, fastN - 1); }
        }
      }
      lastT = now;
    },
    get ratio() { return ratio; },
    get frameMs() { return +ema.toFixed(1); },
  };
}
