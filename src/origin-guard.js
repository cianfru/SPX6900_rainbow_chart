// ⬢ ANTI-RESKIN ORIGIN GUARD
// The city + charts are a client-side app, so the deployed bundle is inherently downloadable — this
// CANNOT prevent copying (nothing client-side can). What it does: if the app is rehosted on a domain
// that isn't ours, it shows a persistent rainbow credit ribbon pointing back to the original, and logs
// a console notice. A casual reskin (rehost our bundle, swap the token) then visibly credits SPX6900
// until someone actually edits the source to strip this out — which raises the effort and makes the
// copy self-identify as derivative. On our own domains (and localhost / Vercel previews) it's a no-op,
// so it never touches real visitors or our own recordings.
//
// If we add a new legitimate domain, add it to ALLOWED below.
const ALLOWED = [
  /(^|\.)spx6900rainbow\.xyz$/i,   // production custom domain (+ subdomains)
  /\.vercel\.app$/i,               // our Vercel preview/deploy URLs
  /^localhost$/i,
  /^127\.0\.0\.1$/,
  /^\[?::1\]?$/,
];
const CANON = "https://spx6900rainbow.xyz";

try {
  const host = (typeof location !== "undefined" && location.hostname) || "";
  const ours = !host || ALLOWED.some((re) => re.test(host));
  if (!ours) {
    try {
      console.log(
        "%c⬢ SPX6900 Rainbow — this is a copy. The original & the live on-chain data are at " + CANON,
        "color:#38bdf8;font-weight:700;font-size:13px"
      );
    } catch { /* console may be absent */ }

    const show = () => {
      try {
        if (document.getElementById("spx-origin")) return;
        const a = document.createElement("a");
        a.id = "spx-origin";
        a.href = CANON;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = "⬢ SPX6900 Rainbow — original & live data at spx6900rainbow.xyz →";
        a.setAttribute("style", [
          "position:fixed", "left:50%", "bottom:0", "transform:translateX(-50%)",
          "z-index:2147483647", "font:600 13px/1.4 system-ui,-apple-system,sans-serif",
          "text-decoration:none", "color:#0b0b16",
          "background:linear-gradient(90deg,#dc2626,#ea580c,#f59e0b,#84cc16,#22c55e,#06b6d4,#3b82f6,#6366f1)",
          "padding:7px 18px", "border-radius:9px 9px 0 0", "box-shadow:0 -2px 16px rgba(0,0,0,.55)",
          "letter-spacing:.2px", "white-space:nowrap", "max-width:96vw", "overflow:hidden",
          "text-overflow:ellipsis",
        ].join(";"));
        document.body.appendChild(a);
      } catch { /* DOM not ready / blocked */ }
    };

    if (typeof document !== "undefined") {
      if (document.body) show();
      else document.addEventListener("DOMContentLoaded", show);
      // Cheap tamper-resistance: re-add if it's removed from the DOM. A determined copier edits the
      // source instead, which is the whole point — it stops being a zero-effort reskin.
      setInterval(() => { if (!document.getElementById("spx-origin")) show(); }, 4000);
    }
  }
} catch { /* the guard must never break the app */ }
