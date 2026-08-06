// Client-side canvas → video. Records the live three.js canvas via MediaRecorder while the caller
// drives the camera each frame, so "click → orbit → download" happens ENTIRELY in the browser — no
// server, no ffmpeg, no lambda limits. The clip is encoded on the viewer's own GPU, so quality tracks
// their machine. Prefers MP4/H.264 where the browser's MediaRecorder supports it (Safari, recent
// Chrome — the format X wants), falls back to WebM otherwise. Owner-only tool (revealed behind ?rec=1).
//
// ⚠ In a software rasteriser (headless/dev) captureStream may yield zero frames; we surface that as an
// error rather than hand back an empty file.

export function recorderSupported() {
  return typeof MediaRecorder !== "undefined"
    && typeof HTMLCanvasElement !== "undefined"
    && typeof HTMLCanvasElement.prototype.captureStream === "function";
}

// Best available container/codec, MP4 first (X-friendly), then WebM variants.
export function pickMime() {
  const cands = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  for (const m of cands) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch { /* older impls */ } }
  return "video/webm";
}

// Record `seconds` of `canvas`, calling onTick(0..1) each animation frame so the caller can drive a
// camera sweep. Resolves { blob, ext, mimeType }. Rejects if unsupported or nothing was captured.
export async function recordCanvas(canvas, { seconds = 12, fps = 60, onTick } = {}) {
  if (!recorderSupported()) throw new Error("video recording isn’t supported in this browser");
  const stream = canvas.captureStream(fps);
  const mimeType = pickMime();
  let rec;
  try { rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 12_000_000 }); }
  catch { rec = new MediaRecorder(stream); }                       // let the browser choose if the hint is rejected
  const chunks = [];
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise((res, rej) => {
    rec.onstop = res;
    rec.onerror = e => rej(e.error || new Error("recorder error"));
  });

  rec.start();
  const t0 = performance.now();
  await new Promise(res => {
    const step = () => {
      const el = Math.min(1, (performance.now() - t0) / (seconds * 1000));
      try { onTick?.(el); } catch { /* keep recording even if a tick throws */ }
      if (el >= 1) return res();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  rec.stop();
  await stopped;

  const actualMime = rec.mimeType || mimeType;
  const blob = new Blob(chunks, { type: actualMime });
  if (!blob.size) throw new Error("no frames captured (this GPU/browser may not support canvas capture)");
  return { blob, ext: actualMime.includes("mp4") ? "mp4" : "webm", mimeType: actualMime };
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.style.display = "none";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
