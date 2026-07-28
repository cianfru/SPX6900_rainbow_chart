import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 560, height: 400 } });
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0,200)));
await p.addInitScript(() => { localStorage.setItem('spx-city-dev','1'); localStorage.setItem('spx-city-dev-intro','1'); });
await p.route('**/aeon-onchain.json', async route => {
  const holders = Array.from({ length: 3333 }, (_, i) => ({
    a: '0x' + ((i + 1) * 2654435761 >>> 0).toString(16).padStart(40, '0'),
    n: 1, days: 40 + (i * 37) % 960, spx: 0, f30: i % 13 === 0 ? 1 : i % 19 === 0 ? -1 : 0,
  }));
  await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ updated: '2026-07-28', holders }) });
});
await p.goto('http://127.0.0.1:4180/?chart=aeonskyline&cinema=1', { waitUntil: 'domcontentloaded' });
const t0 = Date.now();
await p.waitForFunction(() => window.__cityStats && window.__cityStats().buildings > 3000, null, { timeout: 260000, polling: 3000 });
console.log('ready in', ((Date.now()-t0)/1000).toFixed(0) + 's · stats:', JSON.stringify(await p.evaluate(() => window.__cityStats())));
await p.evaluate(() => window.__citySeek(1));
await p.waitForTimeout(20000);
await p.screenshot({ path: '/tmp/claude-0/-home-user-SPX6900-rainbow-chart/f17f8ae0-6458-56fd-8f2b-c1dd4f01ec67/scratchpad/boro.png' });
console.log('errors:', errs.length ? errs : 'none');
await b.close();
