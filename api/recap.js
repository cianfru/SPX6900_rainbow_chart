// Monthly-recap preview for the hidden /control page. Builds the exact same
// single post the bot would publish (recap-thread.mjs) for a month and returns
// it as JSON: the long-form post text plus its (≤4) image cards rendered inline
// as data-URI PNGs, so the control panel's "Monthly recap" tab can verify it
// WITHOUT waiting for the 1st-of-month cron. Read-only; posts nothing.
//
//   GET /api/recap            → current (in-progress) month
//   GET /api/recap?month=YYYY-MM
import { buildRecapPost } from "../scripts/bot/recap-thread.mjs";
import { renderPostCard } from "../scripts/bot/charts.mjs";

const OWNER = "cianfru", REPO = "The_Terminal", BRANCH = "main";

// Read a committed file with GH_PAT (so it still works once the repo is private) and fall back to
// public raw while the repo is public / no token is set. Returns the fetch Response; caller checks ok.
async function ghGet(path) {
  const pat = process.env.GH_PAT;
  const tries = [];
  if (pat) tries.push([`https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`,
    { Accept: "application/vnd.github.raw", Authorization: "Bearer " + pat, "User-Agent": "spx6900-recap" }]);
  tries.push([`https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${path}?t=${Date.now()}`, {}]);
  let last = null;
  for (const [url, headers] of tries) {
    try { const r = await fetch(url, { headers, cache: "no-store" }); if (r.ok) return r; last = r; } catch { /* next */ }
  }
  return last;
}

// The raw snapshot rows (d/p/holders/fng/…) the recap is computed from. Pulled
// from the committed history.json so the shape is guaranteed (fetchHistory()
// returns a different {date,price} shape). Kept current by the snapshot cron.
async function loadHistory() {
  const r = await ghGet("public/history.json");
  if (!r || !r.ok) throw new Error("history.json fetch failed (" + (r ? r.status : "no response") + ")");
  return r.json();
}

export default async function handler(req, res) {
  const params = new URL(req.url, "http://x").searchParams;
  const month = params.get("month") || new Date().toISOString().slice(0, 7);
  try {
    const history = await loadHistory();
    const built = await buildRecapPost(month, history);
    if (!built) {
      res.setHeader("Content-Type", "application/json");
      res.status(200).json({ month, label: null, text: "", images: [], error: `Not enough data for ${month} (need ≥2 daily snapshots).` });
      return;
    }
    const { R, endStats, text, cards } = built;
    const images = cards.map(c => "data:image/png;base64," + renderPostCard({ card: c }, endStats, { dims: { W: 1080, H: 1080 } }).toString("base64"));
    res.setHeader("Content-Type", "application/json");
    // Owner-only preview; let the CDN hold it briefly so repeated refreshes don't
    // re-run the CoinGecko/F&G fetches, but stay fresh enough to verify edits.
    res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=600");
    res.status(200).json({ month, label: R.label, generatedAt: new Date().toISOString(), text, images });
  } catch (e) {
    res.setHeader("Content-Type", "application/json");
    res.status(500).json({ error: String(e?.message || e) });
  }
}
