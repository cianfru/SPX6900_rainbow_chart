// Render the FULL 3D city for the weekly/monthly recap and (with --card) composite the finished card
// in one command. Frames the recap's "hero" building via window.__cityFocus — the shot that says
// "this wallet's tower rose a tier" — falling back to the tallest tower if the named hero has left
// the live set. Defaults to the LIVE site, so no local server is needed.
//
// THE ONE COMMAND (real GPU on your Mac; keep the window frontmost while it renders):
//   node tools/render-city-recap.mjs --headed --card --period=monthly
//   → writes ~/spx-city-monthly-card.png (and ~/spx-city-weekly-card.png for --period=weekly)
//
// The full ~4,900-building skyline needs a real GPU (a GPU-less runner renders it sparse/slow), which
// is why this runs on your machine rather than CI. --port=NNNN / --url=… point at a local build.
//
// Flags: --period=weekly|monthly · --card [--cardOut=PATH] · --wallet=0x… (override hero) ·
//        --time=dusk|day|night · --out=PATH (raw shot) · --url=… / --port=NNNN (default: live site) ·
//        --w/--h (viewport) · --angle/--dist/--fov (framing) · --headed (real GPU) · --soft (software).
import { chromium } from "playwright";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const arg = (k, d) => {
  const hit = process.argv.find(s => s === `--${k}` || s.startsWith(`--${k}=`));
  if (!hit) return d;
  return hit.includes("=") ? hit.split("=").slice(1).join("=") : true;
};
const num = (k, d) => { const v = arg(k, undefined); return v === undefined ? d : Number(v); };

const PORT = num("port", 5173), W = num("w", 1200), H = num("h", 750);
const PERIOD = arg("period", "monthly"), TIME = arg("time", "dusk");
const OUT = arg("out", "/tmp/city-recap.png");
const SOFT = arg("soft", false), HEADED = arg("headed", false);
// --recap caps the scene to the top-N buildings so it renders on a GPU-less runner (CI). Omit it on
// a real GPU (your Mac) to shoot the full skyline. Hero is always a top wallet, so it survives the cap.
const RECAP = arg("recap", false), RECAPN = num("recapN", 500);
// Default to the LIVE site (full city, real GPU on your Mac) so no local server is needed — one
// command and you're done. Pass --port=NNNN (or --url=…) to point at a local dev/preview build.
const URL_BASE = arg("url", null) || (process.argv.some(s => s.startsWith("--port")) ? `http://localhost:${PORT}` : "https://spx6900rainbow.xyz");
// --card also composites the recap card (screenshot + stats overlay) right after the render, so a
// single command yields the finished card.
const CARD = arg("card", false), CARD_OUT = arg("cardOut", `${process.env.HOME || "."}/spx-city-${PERIOD}-card.png`);

// Pick the hero wallet: explicit --wallet wins, else the recap's chosen hero for the period.
let wallet = arg("wallet", null), heroNote = "";
if (!wallet) {
  const recap = JSON.parse(readFileSync("public/city-recap.json", "utf8"));
  const r = recap[PERIOD];
  const hero = r?.hero || r?.topUpgrades?.[0] || r?.topArrivals?.[0];
  if (!hero) { console.error(`No hero in city-recap.json[${PERIOD}] — run build-city-recap.mjs first.`); process.exit(1); }
  wallet = hero.a;
  heroNote = `${hero.short || hero.a} · rank #${hero.rank} · ${hero.family}${hero.fromFamily ? ` (was ${hero.fromFamily})` : ""}`;
}
console.log(`hero (${PERIOD}): ${wallet}${heroNote ? " — " + heroNote : ""}`);

const exe = existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined;
const browser = await chromium.launch({
  executablePath: exe, headless: !HEADED,
  args: SOFT ? ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] : ["--use-gl=angle", "--use-angle=default", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.addInitScript(() => { try { localStorage.setItem("spx-city-dev2", "1"); localStorage.setItem("spx-city-dev2-intro", "1"); } catch {} });
const recapQ = RECAP ? `&recap=1&recapN=${RECAPN}&focusHero=${encodeURIComponent(wallet)}` : "";
console.log(`loading ${URL_BASE} (full city)…`);
await page.goto(`${URL_BASE}/?chart=whalewatch&cinema=1${recapQ}`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(() => window.__cityReady === true, { timeout: 180000 });
await page.waitForTimeout(1500);

// time of day (default dusk is already set)
if (TIME !== "dusk") {
  try {
    await page.getByRole("button", { name: /Settings/ }).click(); await page.waitForTimeout(300);
    await page.getByRole("radio", { name: new RegExp(TIME, "i") }).click(); await page.waitForTimeout(2500);
  } catch { /* controls hidden in cinema — dusk stands */ }
}

const framed = await page.evaluate(({ w, o }) => (window.__cityFocus ? window.__cityFocus(w, o) : null),
  { w: wallet, o: { angle: num("angle", undefined), dist: num("dist", undefined), fov: num("fov", undefined) } });
if (framed === null) { console.error("✗ __cityFocus missing — is this the city page build with the focus hook?"); await browser.close(); process.exit(1); }
if (framed === false) {
  // The named hero comes from the weekly timeline and may no longer be a live resident — don't fail
  // the render, just frame the tallest current tower so the card still ships (the text tells the story).
  console.warn(`⚠ ${wallet} is not a current resident — framing the tallest tower instead`);
  await page.evaluate(() => window.__cityFocusBest && window.__cityFocusBest());
}

await page.waitForTimeout(1200);            // let materials/shadows settle
await page.screenshot({ path: OUT });
console.log(`✓ render → ${OUT}`);
await browser.close();

// One command → finished card: composite the overlay right after the render.
if (CARD) {
  const r = spawnSync(process.execPath, ["tools/city-recap-card.mjs", `--image=${OUT}`, `--period=${PERIOD}`, `--out=${CARD_OUT}`], { stdio: "inherit" });
  if (r.status !== 0) { console.error("✗ card compositor failed"); process.exit(r.status || 1); }
  console.log(`✓ card → ${CARD_OUT}`);
}
