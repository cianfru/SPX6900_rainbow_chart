// Render a CLOSE-UP of the city's "hero" building for the weekly/monthly recap — the shot that says
// "this wallet's tower just rose a tier". Reads public/city-recap.json for the hero wallet, flies the
// real 3D city's camera onto that building via window.__cityFocus, and screenshots it.
//
// The full skyline needs a real GPU (a GPU-less renderer chokes on ~4,800 buildings), so run this on
// your Mac HEADED — that's what gives the true materials/lighting. The sandbox / CI can only do the
// software renderer (--soft), which is flatter; a reduced-scene variant for hands-off CI comes next.
//
//   1) npm run dev        (serves the site on :5173)
//   2) node tools/render-city-recap.mjs --headed --period=monthly --out=/tmp/city-recap.png
//
// Flags: --period=weekly|monthly (default monthly) · --wallet=0x… (override the hero) ·
//        --time=dusk|day|night · --out=PATH · --port=5173 · --w/--h (viewport) ·
//        --angle/--dist/--fov (camera framing) · --headed (real GPU) · --soft (software, sandbox only).
import { chromium } from "playwright";
import { existsSync, readFileSync } from "node:fs";

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
const recapQ = RECAP ? `&recap=1&recapN=${RECAPN}` : "";
await page.goto(`http://localhost:${PORT}/?chart=whalewatch&cinema=1${recapQ}`, { waitUntil: "domcontentloaded", timeout: 60000 });
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
if (framed === false) { console.error(`✗ ${wallet} owns no building in this view — is it a current resident?`); await browser.close(); process.exit(1); }
if (framed === null) { console.error("✗ __cityFocus missing — is this the city page build with the focus hook?"); await browser.close(); process.exit(1); }

await page.waitForTimeout(1200);            // let materials/shadows settle
await page.screenshot({ path: OUT });
console.log(`✓ close-up → ${OUT}`);
await browser.close();
