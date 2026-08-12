// First-party analytics beacon — fire-and-forget, never throws, and no-ops in dev / when the
// endpoint isn't configured. Pairs with /api/intel (server enriches with geo + a hashed IP).
export function track(t, props = {}) {
  try {
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1") return;
    const body = JSON.stringify({ t, path: location.pathname + location.search, ref: document.referrer || "", ...props });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/intel", new Blob([body], { type: "application/json" }));
    else fetch("/api/intel", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  } catch (e) { /* analytics must never break the app */ }
}
