// Read-only proxy for the deploy-ignored runtime JSON the control panel reads.
//
// The panel used to fetch these straight from raw.githubusercontent.com, which only works while the
// repo is PUBLIC. This route reads them server-side with GH_PAT (the same token api/control.js
// already uses), so the panel keeps working after the repo goes private — no token ever touches the
// browser. While the repo is still public it also works, falling back to unauthenticated raw when no
// token is set, so flipping the repo to private is a no-op for the panel.
//
// STRICTLY whitelisted to a flat public/<name>.json — nothing else — so it can never become an
// arbitrary-file reader for a private repo. These files are already world-readable today (via raw or
// the deployed site), so re-serving them read-only changes no exposure; it only removes the token.
const OWNER = "cianfru", REPO = "SPX6900_rainbow_chart", BRANCH = "main";
const OK = /^public\/[A-Za-z0-9._-]+\.json$/;   // one level under public/, .json, no traversal

export default async function handler(req, res) {
  const f = String((req.query && req.query.f) || "");
  if (!OK.test(f)) { res.status(400).json({ error: "bad file" }); return; }
  res.setHeader("Cache-Control", "no-store");

  // Try the authenticated Contents API first (works private AND public), then fall back to public
  // raw. `application/vnd.github.raw` streams the file bytes, up to 100MB — bigger than anything here.
  const attempts = [];
  if (process.env.GH_PAT) attempts.push({
    url: `https://api.github.com/repos/${OWNER}/${REPO}/contents/${f}?ref=${BRANCH}`,
    headers: { Accept: "application/vnd.github.raw", Authorization: "Bearer " + process.env.GH_PAT, "User-Agent": "spx6900-state" },
  });
  attempts.push({ url: `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${f}?t=${Date.now()}`, headers: {} });

  let last = 502;
  for (const a of attempts) {
    try {
      const r = await fetch(a.url, { headers: a.headers, cache: "no-store" });
      if (r.ok) { res.setHeader("Content-Type", "application/json; charset=utf-8"); res.status(200).send(await r.text()); return; }
      last = r.status;
    } catch { /* try the next source */ }
  }
  // 404 = the file simply isn't banked yet; the caller reads that as null ("nothing today"). Anything
  // else is an upstream problem, surfaced as 502 — still parsed as null by the caller's ok/catch guard.
  res.status(last === 404 ? 404 : 502).json(null);
}
