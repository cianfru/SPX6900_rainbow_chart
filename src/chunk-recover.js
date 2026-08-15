// Auto-recover from a STALE LAZY CHUNK after a deploy. Every deploy re-hashes the code-split chunks;
// a tab left open still references the OLD hashes, so the next lazy import() 404s and the chart's
// ErrorBoundary shows "This chart couldn't be displayed." Reloading fetches the fresh index.html +
// chunk manifest, which is why a manual reload always fixes it. This makes that reload automatic —
// once, guarded so a GENUINE render bug can't spin the page in a reload loop.

// Does this error look like a failed dynamic-import / chunk load (vs a real render bug)?
export function isChunkError(err) {
  const m = String(err?.message || err?.reason?.message || err?.reason || err || "");
  return /dynamically imported module|Importing a module script failed|module script failed|ChunkLoadError|Loading chunk [\w-]+ failed|Failed to fetch dynamically|error loading dynamically imported module/i.test(m);
}

// Reload once. sessionStorage timestamp guard: if we reloaded in the last 12s and STILL hit a chunk
// error, don't loop — let the message surface so a real bug is visible instead of a refresh cycle.
export function recoverStaleChunk(reason) {
  try {
    const now = Date.now();
    const last = Number(sessionStorage.getItem("spx-chunk-reload") || 0);
    if (now - last < 12000) return false;
    sessionStorage.setItem("spx-chunk-reload", String(now));
    // eslint-disable-next-line no-console
    console.warn("[spx] stale chunk — reloading to fetch the fresh build:", reason);
    window.location.reload();
    return true;
  } catch { return false; }
}
