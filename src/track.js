// First-party analytics beacon — fire-and-forget, never throws, and no-ops in dev / when the
// endpoint isn't configured. Pairs with /api/intel (server enriches with geo + a hashed IP).
export function track(t, props = {}) {
  try {
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1") return;
    // Self-exclude (the owner's own visits): load once with ?nointel=1 to set a persistent opt-out
    // on THIS device, and every visit after is silent. Precise + VPN-proof — unlike a country block,
    // it never drops a real visitor, and it works whichever country the owner's VPN exits through.
    // ?nointel=0 clears it again.
    try {
      const q = new URLSearchParams(location.search);
      if (q.has("nointel")) localStorage.setItem("intel-optout", q.get("nointel") === "0" ? "" : "1");
      if (localStorage.getItem("intel-optout") === "1") return;
    } catch (e) { /* private-mode / storage blocked → fall through and track normally */ }
    // device class (mobile vs desktop) — a rough width proxy, enough to segment; and a first-pageview-of-
    // session flag (sessionStorage) so the server can count landing/entry pages without sessionizing.
    let entry = 0;
    if (t === "pageview") { try { if (!sessionStorage.getItem("spx-seen")) { sessionStorage.setItem("spx-seen", "1"); entry = 1; } } catch (e) { /* private mode */ } }
    const dev = (typeof window !== "undefined" && (window.innerWidth || screen.width || 1024) < 700) ? "m" : "d";
    const body = JSON.stringify({ t, path: location.pathname + location.search, ref: document.referrer || "", d: dev, entry, ...props });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/intel", new Blob([body], { type: "application/json" }));
    else fetch("/api/intel", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  } catch (e) { /* analytics must never break the app */ }
}
