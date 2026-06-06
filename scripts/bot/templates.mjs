// Deterministic post templates filled with exact stats — no LLM, no hallucination.
const BAND_EMOJI = ["🟣", "🔵", "🟦", "🟢", "🟩", "🟡", "🟠", "🔴", "🟥"];

const fPrice = p => (p >= 1 ? "$" + p.toFixed(2) : "$" + p.toFixed(4));
const fPct = x => (x >= 0 ? "+" : "") + Math.round(x * 100).toLocaleString() + "%";

// Daily snapshot — the default post.
function daily(s) {
  return [
    `📊 SPX6900 ${fPrice(s.price)}`,
    `${BAND_EMOJI[s.bandIndex]} ${s.band.l} band — ${fPct(s.vsCenter)} vs trend (${fPrice(s.center)})`,
    `Risk ${s.risk.toFixed(2)}/1 · next: ${s.nextUp.l} ${fPrice(s.nextUpPrice)}`,
    `🌈 spx6900rainbow.xyz`,
    `Not financial advice`,
  ].join("\n");
}

// Weekly recap — used on Mondays.
function weekly(s) {
  const fs = s.lastFireSale;
  const lines = [
    `SPX6900 weekly 🌈`,
    `${fPrice(s.price)} · ${BAND_EMOJI[s.bandIndex]} ${s.band.l} band, ${fPct(s.vsCenter)} vs trend`,
  ];
  if (fs) lines.push(`Since last Fire Sale (${fMon(fs.date)}): ${fPct(fs.sinceGain)} (peak ${fPct(fs.peakGain)})`);
  lines.push(`spx6900rainbow.xyz · NFA`);
  return lines.join("\n");
}

const fMon = d => new Date(d).toLocaleDateString("en-US", { month: "short", year: "2-digit" });

// Pick a template by day of week (UTC). Returns { kind, text }.
export function buildPost(stats, now = new Date()) {
  const isMonday = now.getUTCDay() === 1;
  return isMonday
    ? { kind: "weekly", text: weekly(stats) }
    : { kind: "daily", text: daily(stats) };
}
