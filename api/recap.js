// Monthly-recap preview for the hidden /control page. Builds the exact same
// thread the bot would post (recap-thread.mjs) for a month and returns it as
// JSON: each tweet's text plus its card rendered inline as a data-URI PNG, so
// the control panel's "Monthly recap" tab can show the cards for verification
// WITHOUT waiting for the 1st-of-month cron. Read-only; posts nothing.
//
//   GET /api/recap            → current (in-progress) month
//   GET /api/recap?month=YYYY-MM
import { buildRecapThread } from "../scripts/bot/recap-thread.mjs";
import { renderPostCard } from "../scripts/bot/charts.mjs";

const OWNER = "cianfru", REPO = "SPX6900_rainbow_chart", BRANCH = "main";

// The raw snapshot rows (d/p/holders/fng/…) the recap is computed from. Pulled
// from the committed history.json so the shape is guaranteed (fetchHistory()
// returns a different {date,price} shape). Kept current by the snapshot cron.
async function loadHistory() {
  const url = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/public/history.json?t=${Date.now()}`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error("history.json fetch failed (" + r.status + ")");
  return r.json();
}

export default async function handler(req, res) {
  const params = new URL(req.url, "http://x").searchParams;
  const month = params.get("month") || new Date().toISOString().slice(0, 7);
  try {
    const history = await loadHistory();
    const built = await buildRecapThread(month, history);
    if (!built) {
      res.setHeader("Content-Type", "application/json");
      res.status(200).json({ month, label: null, tweets: [], error: `Not enough data for ${month} (need ≥2 daily snapshots).` });
      return;
    }
    const { R, endStats, thread } = built;
    const tweets = thread.map(t => ({
      text: t.text,
      img: t.card ? "data:image/png;base64," + renderPostCard({ card: t.card }, endStats).toString("base64") : null,
    }));
    res.setHeader("Content-Type", "application/json");
    // Owner-only preview; let the CDN hold it briefly so repeated refreshes don't
    // re-run the CoinGecko/F&G fetches, but stay fresh enough to verify edits.
    res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=600");
    res.status(200).json({ month, label: R.label, generatedAt: new Date().toISOString(), tweets });
  } catch (e) {
    res.setHeader("Content-Type", "application/json");
    res.status(500).json({ error: String(e?.message || e) });
  }
}
