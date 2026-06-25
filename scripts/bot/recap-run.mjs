// Monthly recap thread.
//   node scripts/bot/recap-run.mjs --month=2026-06 --dry-run   → render previews + print thread
//   node scripts/bot/recap-run.mjs --preview                   → write public/recap/<month>/*.png + recap-pending.json (cron)
//   node scripts/bot/recap-run.mjs --post                      → post the queued thread (needs X creds)
// Default month = the one that just ended, so a 1st-of-month cron recaps last month.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { computeMonthlyRecap, monthName } from "./recap.mjs";
import { renderPostCard } from "./charts.mjs";
import { computeStats } from "./stats.mjs";
import { uploadWithRetry } from "./media.mjs";
import { DEFAULT_RAW } from "../../src/data.js";

const arg = n => { const a = process.argv.find(x => x.startsWith(`--${n}=`)); return a ? a.split("=")[1] : null; };
const dryRun = process.argv.includes("--dry-run");
const previewMode = process.argv.includes("--preview");
const postMode = process.argv.includes("--post");

const lastMonth = () => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); };
const month = arg("month") || lastMonth();

// --- tiny formatters (recap is standalone of posts.mjs) ---
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fMon = d => { const [, m, day] = d.split("-"); return `${MON[+m - 1]} ${+day}`; };
const fPct = x => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(Math.abs(x) < 0.1 ? 1 : 0)}%`;
const fPrice = p => p >= 1 ? "$" + p.toFixed(2) : "$" + p.toFixed(p < 0.001 ? 5 : p < 0.01 ? 4 : p < 0.1 ? 3 : 2);
const fMult = x => Math.round(x) + "×";
const fNum = n => Math.round(n).toLocaleString("en-US");

const history = JSON.parse(readFileSync(new URL("../../public/history.json", import.meta.url), "utf8"));
const R = computeMonthlyRecap(month, history);
if (!R) { console.error(`No recap data for ${month} (need ≥2 daily snapshots).`); process.exit(0); }

// Full drawn series = bundled history + this period's daily closes (so the rainbow runs to month end).
const lastBundled = DEFAULT_RAW.at(-1).date;
const merged = [...DEFAULT_RAW, ...history.map(r => ({ date: r.d, price: r.p })).filter(p => p.date > lastBundled && p.price > 0)];
const endStats = computeStats(R.close, R.endDate, { history: merged });

const green = R.change >= 0 ? "#4ade80" : "#f87171";
const heroTiles = [
  { big: fPct(R.change), label: "price · this month", color: green },
  { big: fPrice(R.high), label: "high · " + fMon(R.highDate) },
  { big: fPrice(R.low), label: "low · " + fMon(R.lowDate) },
  { big: (R.holders ? (R.holders.delta >= 0 ? "+" : "") + fNum(R.holders.delta) : "—"), label: "new holders" },
  { big: R.diamondOfTotal != null ? Math.round(R.diamondOfTotal * 100) + "%" : "—", label: "diamond hands" },
  { big: fMult(R.allTimeReturn), label: "since launch" },
];

// --- monthly performance vs the field (majors + meme kings) -----------------
// SPX from our own history; BTC/ETH/SOL reuse the series computeStats already
// fetched; DOGE/SHIB/PEPE fetched fresh (CoinGecko). All measured over the SAME
// window as SPX (first→last snapshot of the month) so it's apples-to-apples.
const seriesReturn = (series, startDate, endDate) => {
  if (!series || !series.length) return null;
  const byDate = new Map();
  for (const [ms, p] of series) byDate.set(new Date(ms).toISOString().slice(0, 10), p);
  const near = (t, dir) => {
    for (let i = 0; i < 7; i++) {
      const d = new Date(t + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + dir * i);
      const k = d.toISOString().slice(0, 10);
      if (byDate.has(k)) return byDate.get(k);
    }
    return null;
  };
  const a = near(startDate, +1), b = near(endDate, -1);
  return a && b ? b / a - 1 : null;
};
async function coinGeckoSeries(id) {
  try {
    const r = await fetch(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=60&interval=daily`, { headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    const j = await r.json();
    return (j.prices || []).map(([ms, p]) => [ms, p]);
  } catch (e) { console.warn(`coingecko ${id}:`, e.message); return null; }
}
async function fngHistory() {
  try {
    const r = await fetch("https://api.alternative.me/fng/?limit=0&format=json", { headers: { Accept: "application/json" } });
    if (!r.ok) return new Map();
    const j = await r.json();
    const m = new Map();
    for (const e of (j.data || [])) m.set(new Date(+e.timestamp * 1000).toISOString().slice(0, 10), +e.value);
    return m;
  } catch (e) { console.warn("fng history:", e.message); return new Map(); }
}
const majorRet = name => {
  const mj = (endStats.majors || []).find(x => x.name === name);
  return mj ? seriesReturn(mj.series, R.startDate, R.endDate) : null;
};
const [dogeS, shibS, pepeS] = await Promise.all([coinGeckoSeries("dogecoin"), coinGeckoSeries("shiba-inu"), coinGeckoSeries("pepe")]);
const fieldBars = [
  { logo: "spx", ret: R.change, outline: true },
  { logo: "btc", ret: majorRet("BTC") },
  { logo: "eth", ret: majorRet("ETH") },
  { logo: "sol", ret: majorRet("SOL") },
  { logo: "doge", ret: seriesReturn(dogeS, R.startDate, R.endDate) },
  { logo: "shib", ret: seriesReturn(shibS, R.startDate, R.endDate) },
  { logo: "pepe", ret: seriesReturn(pepeS, R.startDate, R.endDate) },
].filter(b => b.ret != null).map(b => ({ value: b.ret, logo: b.logo, outline: b.outline }));

// --- sentiment vs valuation: crypto Fear & Greed (backfilled) + SPX risk -----
// Our own history only banks F&G for the last few days, so backfill the month
// from alternative.me's historical endpoint; fall back to our own points.
const fngMap = await fngHistory();
const fngBackfilled = R.priceSeries
  .map(([ms]) => { const d = new Date(ms).toISOString().slice(0, 10); return fngMap.has(d) ? [ms, fngMap.get(d)] : null; })
  .filter(Boolean);
const fngPts = fngBackfilled.length >= 2 ? fngBackfilled : R.fngSeries;
const fngLabel = v => v < 25 ? "extreme fear" : v < 45 ? "fear" : v < 55 ? "neutral" : v < 75 ? "greed" : "extreme greed";
const riskNow = Math.round(R.riskSeries.at(-1)[1]);
const riskLabel = riskNow < 33 ? "low / value zone" : riskNow < 66 ? "mid-band" : "stretched";

// --- the thread (combined to stay tight): hero, rainbow, path, field, mood, wrap
const thread = [
  {
    text:
`📊 SPX6900 — ${R.label} in review.

${fPct(R.change)} on the month, closed in the ${R.endBand.l} band. The month in one card 👇

🌈 $SPX #spx6900`,
    card: { type: "statgrid", spec: { title: `SPX6900 — ${R.label} in review`, headline: `${fPct(R.change)} · ${R.endBand.l}`, accent: "#38bdf8", tiles: heroTiles } },
  },
  {
    text:
`🌈 Where ${R.label} left SPX6900 on the rainbow: ${R.endBand.l} — ${fPct(R.vsCenter)} vs the model's fair value (${fPrice(R.center)}).

$SPX #spx6900`,
    card: { type: "rainbow" },
  },
  {
    text:
`📈 ${R.label}'s path: opened ${fPrice(R.open)}, ran to ${fPrice(R.high)} (${fMon(R.highDate)}), closed ${fPrice(R.close)}.

Best day ${fPct(R.bestDay.ret)}, worst ${fPct(R.worstDay.ret)}.`,
    card: { type: "line", spec: {
      title: `SPX6900 — ${R.label} price path`, headline: `${fPct(R.change)} on the month`, accent: green,
      series: [{ pts: R.priceSeries, color: green, width: 3.5, fill: 0.14 }],
      marker: { x: R.priceSeries.at(-1)[0], y: R.priceSeries.at(-1)[1], color: green },
    } },
  },
];

// vs-the-field: majors + meme kings in one card (only if we got ≥2 returns)
if (fieldBars.length >= 2) thread.push({
  text:
`🏁 ${R.label}: SPX6900 vs the field.

SPX ${fPct(R.change)} on the month — raced against BTC/ETH/SOL and the meme kings 🐕🐸 (DOGE/SHIB/PEPE) 👇

$SPX #spx6900`,
  card: { type: "vsfield", spec: { title: `SPX6900 vs the field — ${R.label}`, headline: `${fPct(R.change)} on the month`, accent: "#38bdf8", bars: fieldBars } },
});

// sentiment vs valuation: Fear & Greed + SPX risk level (only if F&G available)
if (fngPts.length >= 2) thread.push({
  text:
`🧭 ${R.label}: sentiment vs valuation.

Crypto Fear & Greed closed ${fngPts.at(-1)[1]} (${fngLabel(fngPts.at(-1)[1])}) while SPX's model risk sat ${riskNow}/100 (${riskLabel}).

$SPX #spx6900`,
  card: { type: "line", spec: {
    title: `Sentiment vs valuation — ${R.label}`, headline: `Fear & Greed vs SPX risk level`, accent: "#38bdf8",
    yMin: 0, yMax: 100, yTicks: [0, 25, 50, 75, 100].map(v => ({ v, label: String(v) })),
    series: [
      { pts: fngPts, color: "#f59e0b", width: 3.5 },
      { pts: R.riskSeries, color: "#38bdf8", width: 3.5 },
    ],
    legend: [{ label: "Crypto Fear & Greed", color: "#f59e0b" }, { label: "SPX risk (bands)", color: "#38bdf8" }],
  } },
});

// closing wrap
thread.push({
  text:
`That's ${R.label}.${R.holders ? ` Holders ${fNum(R.holders.start)} → ${fNum(R.holders.end)} (${R.holders.delta >= 0 ? "+" : ""}${fNum(R.holders.delta)}),` : ""} avg holder ${R.avgHolderPnl != null ? fPct(R.avgHolderPnl) : "—"}.

Live rainbow + tools: spx6900rainbow.xyz

🌈 $SPX #spx6900 · NFA`,
  card: null,
});

// length guard (X visible-weight is ~1/char here; emoji count 2 but we stay well under)
thread.forEach((t, i) => { if (t.text.length > 280) console.warn(`⚠ tweet ${i + 1} is ${t.text.length} chars (>280)`); });

const renderItem = t => t.card ? renderPostCard({ card: t.card }, endStats) : null;

if (dryRun || previewMode) {
  const outDir = previewMode ? new URL(`../../public/recap/${month}/`, import.meta.url) : null;
  if (outDir) mkdirSync(outDir, { recursive: true });
  const manifest = { month, label: R.label, generatedAt: new Date().toISOString(), tweets: [] };
  thread.forEach((t, i) => {
    const png = renderItem(t);
    let imgPath = null;
    if (png) {
      imgPath = previewMode ? `recap/${month}/${i + 1}.png` : `recap-preview-${i + 1}.png`;
      writeFileSync(previewMode ? new URL(`../../public/${imgPath}`, import.meta.url) : imgPath, png);
    }
    manifest.tweets.push({ text: t.text, image: imgPath });
    console.log(`\n── tweet ${i + 1} (${t.text.length} chars)${png ? " + image" : ""} ──\n${t.text}`);
  });
  if (previewMode) writeFileSync(new URL("../../public/recap-pending.json", import.meta.url), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`\n[${previewMode ? "PREVIEW — queued, not posted" : "DRY RUN"}] ${R.label}: ${thread.length} tweets.`);
  process.exit(0);
}

if (postMode) {
  const creds = {
    appKey: (process.env.X_API_KEY || "").trim(), appSecret: (process.env.X_API_SECRET || "").trim(),
    accessToken: (process.env.X_ACCESS_TOKEN || "").trim(), accessSecret: (process.env.X_ACCESS_SECRET || "").trim(),
  };
  if (!Object.values(creds).every(Boolean)) { console.error("✗ X creds missing — cannot post."); process.exit(1); }
  // Don't double-post: if the queue says this month already shipped, stop.
  try {
    const pend = JSON.parse(readFileSync(new URL("../../public/recap-pending.json", import.meta.url), "utf8"));
    if (pend.posted && pend.month === month) { console.log(`${R.label} recap already posted (${pend.postedAt}). Nothing to do.`); process.exit(0); }
  } catch { /* no pending file — fine */ }
  const { TwitterApi } = await import("twitter-api-v2");
  const client = new TwitterApi(creds);
  let replyTo = null;
  const ids = [];
  for (let i = 0; i < thread.length; i++) {
    const t = thread[i];
    const png = renderItem(t);
    const payload = { text: t.text };
    if (png) payload.media = { media_ids: [await uploadWithRetry(client, png, "image/png", { tries: 3 })] };
    if (replyTo) payload.reply = { in_reply_to_tweet_id: replyTo };
    const res = await client.v2.tweet(payload);
    replyTo = res?.data?.id;
    ids.push(replyTo);
    console.log(`posted tweet ${i + 1}/${thread.length} → ${replyTo}`);
  }
  // Mark the queue consumed so it can't double-post and the control page shows it shipped.
  writeFileSync(new URL("../../public/recap-pending.json", import.meta.url),
    JSON.stringify({ month, label: R.label, posted: true, postedAt: new Date().toISOString(), tweetIds: ids }, null, 2) + "\n");
  console.log(`✓ ${R.label} recap thread posted (${thread.length} tweets).`);
  process.exit(0);
}

console.log("Pick a mode: --dry-run | --preview | --post");
