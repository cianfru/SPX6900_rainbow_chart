// First-party page intel — one function does BOTH ingest and the dashboard (kept to one serverless
// function to stay under Vercel Hobby's 12-function cap). Writes/reads events to Redis (Vercel KV /
// Upstash) via the REST API — no dependency, no third party.
//   • POST {t:...}   → INGEST an event (from the client beacon in src/track.js). Enriched with Vercel's
//                      edge geo headers (country/city, free) + a SALTED IP HASH (raw IP never stored).
//   • POST {pw:...}  → DASHBOARD data as JSON, gated by CONTROL_PASSWORD (same secret as /control).
//   • GET            → the dashboard HTML page.
// Degrades to a silent no-op when no store is connected, so it's safe to ship before the KV store exists.
//
// Setup to activate: connect a Vercel KV / Upstash Redis store to the project (Vercel → Storage). That
// injects KV_REST_API_URL + KV_REST_API_TOKEN (or the UPSTASH_* equivalents). Optional INTEL_SALT to
// rotate the IP-hash salt. View the data at /api/intel (enter CONTROL_PASSWORD).
import crypto from "node:crypto";

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const SALT = process.env.INTEL_SALT || "spx6900-intel";
const TYPES = new Set(["pageview", "wallet_search", "city_open", "chart_open", "click"]);
const CAP = 50000, WCAP = 20000;
// DoS guards on the UNAUTHENTICATED ingest beacon: a per-source rate cap (bounds how fast any one
// IP can write) + a cardinality cap on the free-form hashes (path/ref/chart are attacker-controlled,
// so without a bound a flood of distinct keys grows Redis without limit and can evict real rows).
const RATE_MAX = 120, RATE_WIN = 60;   // events per source IP-hash per minute
const FIELD_CAP = 20000;               // max distinct keys per free-form hash before it stops growing

// Constant-time secret compare over SHA-256 digests (equal-length, no early-out on the first
// differing byte, no length leak). Used by the password-gated dashboard.
function safeEq(a, b) {
  const x = crypto.createHash("sha256").update(String(a)).digest();
  const y = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}
// Countries whose traffic is the owner's own (Qatar) — never recorded, and filtered from the
// dashboard so existing rows drop out too. Override via INTEL_EXCLUDE_COUNTRIES="QA,AE".
const EXCLUDE_COUNTRIES = new Set((process.env.INTEL_EXCLUDE_COUNTRIES || "QA").split(",").map(s => s.trim().toUpperCase()).filter(Boolean));

async function kvPipeline(commands) {
  const r = await fetch(KV_URL.replace(/\/$/, "") + "/pipeline", {
    method: "POST",
    headers: { Authorization: "Bearer " + KV_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error("kv " + r.status);
  return (await r.json()).map((x) => x.result);
}
const clip = (s, n) => (typeof s === "string" && s ? s.slice(0, n) : undefined);
const host = (u) => { try { return new URL(u).host.replace(/^www\./, ""); } catch { return ""; } };
const hash2obj = (arr) => { const o = {}; for (let i = 0; i < (arr || []).length; i += 2) o[arr[i]] = Number(arr[i + 1]); return o; };
const parseList = (arr) => (arr || []).map((s) => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);

// Robust body read — Vercel doesn't always pre-parse req.body (esp. sendBeacon Blobs), so fall
// back to reading the raw stream. Mirrors api/control.js so the password check can't false-401.
async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body || "{}"); } catch { return {}; } }
  let raw = "";
  try { for await (const c of req) raw += c; } catch { return {}; }
  try { return JSON.parse(raw || "{}"); } catch { return {}; }
}

// POST {t} — ingest one analytics event.
async function ingest(req, res, body) {
  const t = body.t;
  if (!TYPES.has(t)) { res.status(204).end(); return; }
  if (!KV_URL || !KV_TOKEN) { res.status(204).end(); return; } // store not connected yet → no-op
  // Don't record the owner's own traffic (Qatar) — keeps the analytics clean at the source.
  if (EXCLUDE_COUNTRIES.has(String(req.headers["x-vercel-ip-country"] || "").toUpperCase())) { res.status(204).end(); return; }

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const iphash = ip ? crypto.createHash("sha256").update(SALT + ip).digest("hex").slice(0, 12) : "";

  // Rate-limit this source + read the free-form hash sizes in one pipeline BEFORE writing. If the
  // source is over its per-minute budget, drop the event silently (analytics, not an error surface).
  let hpages, hrefs, hcharts; // hash sizes, assigned below before any use (the catch returns)
  try {
    const rk = "intel:rate:" + (iphash || "anon");
    const r = await kvPipeline([
      ["INCR", rk], ["EXPIRE", rk, String(RATE_WIN)],
      ["HLEN", "intel:pages"], ["HLEN", "intel:refs"], ["HLEN", "intel:charts"],
    ]);
    if ((Number(r[0]) || 0) > RATE_MAX) { res.status(204).end(); return; }
    hpages = Number(r[2]) || 0; hrefs = Number(r[3]) || 0; hcharts = Number(r[4]) || 0;
  } catch { res.status(204).end(); return; } // store hiccup → drop, never break the page

  const ev = {
    t, ts: Date.now(),
    path: clip(body.path, 200), ref: host(clip(body.ref, 300) || ""),
    country: req.headers["x-vercel-ip-country"] || "",
    city: decodeURIComponent(req.headers["x-vercel-ip-city"] || "") || "",
    region: req.headers["x-vercel-ip-country-region"] || "",
    wallet: clip(body.wallet, 80), chart: clip(body.chart, 40), mode: clip(body.mode, 16),
    source: clip(body.source, 24),   // WHERE a wallet_search came from (city · whaleentry · …)
    ip: iphash,
  };
  const json = JSON.stringify(ev);
  // geo/daily are bounded key-spaces (country codes, UTC dates); the free-form hashes (pages/refs/
  // charts) stop growing once past FIELD_CAP so a flood of distinct keys can't exhaust the store.
  const cmds = [
    ["LPUSH", "intel:events", json], ["LTRIM", "intel:events", "0", String(CAP - 1)],
    ["HINCRBY", "intel:geo", ev.country || "??", "1"],
  ];
  if (hpages < FIELD_CAP) cmds.push(["HINCRBY", "intel:pages", ev.path || "/", "1"]);
  if (ev.ref && hrefs < FIELD_CAP) cmds.push(["HINCRBY", "intel:refs", ev.ref, "1"]);
  // visits-per-day series (UTC date bucket) — one increment per pageview, so the dashboard can plot the trend
  if (t === "pageview") cmds.push(["HINCRBY", "intel:daily", new Date(ev.ts).toISOString().slice(0, 10), "1"]);
  if (t === "wallet_search" && ev.wallet) { cmds.push(["LPUSH", "intel:wallets", json], ["LTRIM", "intel:wallets", "0", String(WCAP - 1)]); }
  if (t === "chart_open" && ev.chart && hcharts < FIELD_CAP) cmds.push(["HINCRBY", "intel:charts", ev.chart, "1"]);

  try { await kvPipeline(cmds); } catch { /* swallow — analytics must never break the page */ }
  res.status(204).end();
}

// POST {pw} — dashboard data.
async function dashboard(req, res, body) {
  // Password gate: re-locked now that the blank-page bug (a JS parse error, not auth) is fixed. The
  // dashboard shows wallet lookups / geo / IP hashes, so it must stay gated. Needs CONTROL_PASSWORD
  // set in Vercel; if it isn't, the page says "Server not configured" (not a silent lockout).
  const AUTH = true;
  if (AUTH) {
    // Trim both sides: a password pasted into Vercel's env UI often carries a trailing newline,
    // which makes a correct-looking password fail a strict compare. Distinguish "not configured"
    // (env var missing) from "wrong password" so the page can say which it is.
    const expected = String(process.env.CONTROL_PASSWORD || "").trim();
    if (!expected) { res.status(503).json({ error: "Server not configured: set CONTROL_PASSWORD in Vercel." }); return; }
    if (!safeEq(String(body.pw || "").trim(), expected)) { res.status(401).json({ error: "bad password" }); return; }
  }
  // Self-diagnosis: report (booleans only, never the secret values) whether the function actually
  // sees the KV vars at runtime, and which var name provided each — so "vars are set in Vercel but
  // the page is empty" can be told apart from "the function can't see them" or "the token is wrong".
  const diag = {
    kvUrlPresent: !!KV_URL, kvTokenPresent: !!KV_TOKEN,
    urlVar: process.env.KV_REST_API_URL ? "KV_REST_API_URL" : (process.env.UPSTASH_REDIS_REST_URL ? "UPSTASH_REDIS_REST_URL" : null),
    tokenVar: process.env.KV_REST_API_TOKEN ? "KV_REST_API_TOKEN" : (process.env.UPSTASH_REDIS_REST_TOKEN ? "UPSTASH_REDIS_REST_TOKEN" : null),
  };
  if (!KV_URL || !KV_TOKEN) { res.status(200).json({ configured: false, diag }); return; }
  try {
    const [events, wallets, geo, pages, refs, charts, daily] = await kvPipeline([
      ["LRANGE", "intel:events", "0", "499"],
      ["LRANGE", "intel:wallets", "0", "199"],
      ["HGETALL", "intel:geo"], ["HGETALL", "intel:pages"], ["HGETALL", "intel:refs"], ["HGETALL", "intel:charts"],
      ["HGETALL", "intel:daily"],
    ]);
    // Filter the owner's own country out of the display too, so pre-existing rows drop out (the
    // ingest guard only stops NEW ones). Geo drops the excluded countries entirely.
    const notExcluded = x => !EXCLUDE_COUNTRIES.has(String(x && x.country || "").toUpperCase());
    const geoObj = hash2obj(geo); for (const c of EXCLUDE_COUNTRIES) delete geoObj[c];
    res.status(200).json({
      configured: true, diag,
      events: parseList(events).filter(notExcluded), wallets: parseList(wallets).filter(notExcluded),
      geo: geoObj, pages: hash2obj(pages), refs: hash2obj(refs), charts: hash2obj(charts), daily: hash2obj(daily),
    });
  } catch (e) {
    // Don't 500 into a blank page — return the KV error so the page can show it (e.g. "kv 401" =
    // the token is wrong/read-only for writes; a network host error = the URL is off).
    res.status(200).json({ configured: true, kvError: String(e.message || e), diag, events: [], wallets: [], geo: {}, pages: {}, refs: {}, charts: {}, daily: {} });
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "GET") { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.status(200).send(PAGE); return; }
    if (req.method !== "POST") { res.status(405).json({ error: "method not allowed" }); return; }

    const body = await readBody(req);
    // Branch: a tracking beacon carries {t}; a dashboard request carries {pw}.
    if (body.t !== undefined) { await ingest(req, res, body); return; }
    await dashboard(req, res, body);
  } catch {
    // Never spill a stack / internals into the response — a generic message only.
    if (!res.headersSent) res.status(500).json({ error: "internal error" });
  }
}

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Page Intel</title><style>
:root{--bg:#08090b;--panel:#0e1013;--line:#ffffff;--sep:rgba(255,255,255,.5);--tx:#f4f6f9;--dim:#9aa3b2;--faint:#646b78;--live:#4ee79a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font-family:'Geist Mono',ui-monospace,Menlo,Consolas,monospace;font-size:13px}
.wrap{max-width:1100px;margin:0 auto;padding:24px 18px 60px}
h1{font-size:15px;letter-spacing:.18em;text-transform:uppercase;color:var(--dim);font-weight:600;margin:0 0 18px}
.login{display:flex;gap:8px;align-items:center}input{background:var(--panel);border:1px solid var(--line);color:var(--tx);padding:9px 12px;border-radius:8px;font:inherit}
button{background:var(--panel);border:1px solid var(--line);color:var(--tx);padding:9px 14px;border-radius:8px;cursor:pointer;font:inherit}
button:hover{border-color:var(--live);color:var(--live)}
.stats{display:flex;flex-wrap:wrap;gap:12px;margin:16px 0 4px}
.stat{flex:1;min-width:128px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:13px 15px}
.stat .n{font-size:26px;font-weight:700;letter-spacing:-.01em;font-variant-numeric:tabular-nums;color:var(--tx)}
.stat .l{font-size:10px;letter-spacing:.13em;text-transform:uppercase;color:var(--faint);margin-top:3px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:18px}
@media(max-width:820px){.grid{grid-template-columns:1fr}}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:15px 17px}
.card h2{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);margin:0 0 12px;display:flex;justify-content:space-between;align-items:baseline}
.card h2 .c{color:var(--dim);font-size:10px;letter-spacing:.06em}
.row{display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid var(--sep)}
.row:last-child{border-bottom:0}
.row .k{color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.row .v{color:var(--tx);font-variant-numeric:tabular-nums;flex:none;font-weight:600}
.wg{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--sep)}.wg:last-child{border-bottom:0}
.wg .col{min-width:0;flex:1}.wg .a{color:var(--live);font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.wg .m{color:var(--faint);font-size:11px;margin-top:2px}
.wg .cnt{flex:none;background:rgba(78,231,154,.13);color:var(--live);border-radius:999px;padding:3px 11px;font-weight:700;font-size:12px;font-variant-numeric:tabular-nums}
.srcrow{display:flex;flex-wrap:wrap;gap:7px;margin:0 0 12px}.srcrow .src{background:rgba(251,191,36,.13);color:#fbbf24;border-radius:999px;padding:3px 11px;font-size:11.5px}.srcrow .src b{font-weight:700}
details.cty{border-bottom:1px solid var(--sep)}details.cty[open]{background:rgba(255,255,255,.015)}
.cty>summary{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 2px 8px 0;cursor:pointer;list-style:none}
.cty>summary::-webkit-details-marker{display:none}
.cty .nm{display:flex;align-items:center;min-width:0}.cty .flag{font-size:16px;margin-right:9px;flex:none}.cty .nm .t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--tx)}
.cty .v{flex:none;font-weight:600;font-variant-numeric:tabular-nums}
.cty .sub{padding:0 0 9px 25px;color:var(--dim);font-size:11.5px;line-height:1.75}.cty .sub b{color:var(--faint);font-weight:400}
.feed{max-height:440px;overflow:auto;margin:0 -4px;padding:0 4px}.ev{padding:5px 0;color:var(--dim);border-bottom:1px solid var(--sep);font-size:12px}
.dchart{width:100%;height:auto;display:block;margin-top:10px}
.dchart .bars rect{fill:var(--live);opacity:.8}
.dchart .bars rect:hover{opacity:1}
.ev b{color:var(--tx)}.muted{color:var(--faint)}.note{color:var(--faint);margin-top:14px;line-height:1.6}
</style></head><body><div class="wrap">
<h1>Page Intel</h1>
<div class="login" id="login"><input id="pw" type="password" placeholder="control password" autofocus onkeydown="if(event.key==='Enter')load()"><button onclick="load()">view</button><span id="msg" class="muted"></span></div>
<div id="out"></div>
<script>
const $=s=>document.querySelector(s);
const topN=(o,n)=>Object.entries(o||{}).sort((a,b)=>b[1]-a[1]).slice(0,n); /* NOT 'top' — collides with window.top in a classic script → "already declared" parse error → blank page */
const ago=ts=>{const s=Math.floor((Date.now()-ts)/1000);if(s<60)return s+'s';const m=Math.floor(s/60);if(m<60)return m+'m';const h=Math.floor(m/60);return h<24?h+'h':Math.floor(h/24)+'d';};
const esc=s=>String(s==null?'':s).replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
const flag=c=>{ c=String(c||'').toUpperCase(); return /^[A-Z]{2}$/.test(c)?c.replace(/./g,x=>String.fromCodePoint(127397+x.charCodeAt(0))):'🏳'; };
let _RN; try{ _RN=new Intl.DisplayNames(['en'],{type:'region'}); }catch(e){}
const cname=c=>{ c=String(c||'').toUpperCase(); if(!c) return '??'; try{ return (_RN&&_RN.of(c))||c; }catch(e){ return c; } };
// Group repeated searches of the SAME wallet into one row with a count (one person searching 12×
// shouldn't fill the list). Newest location wins; multiple IPs are flagged.
function groupWallets(ws){ const m={}; (ws||[]).forEach(w=>{ const k=w.wallet; if(!k) return; if(!m[k]) m[k]={wallet:k,n:0,last:0,city:w.city,country:w.country,ips:new Set(),src:new Set()};
  const g=m[k]; g.n++; if((w.ts||0)>g.last){ g.last=w.ts; g.city=w.city; g.country=w.country; } if(w.ip) g.ips.add(w.ip); if(w.source) g.src.add(w.source); });
  return Object.values(m).sort((a,b)=>b.n-a.n||b.last-a.last); }
// How many searches came from each surface (city vs whaleentry vs …) — answers "is the new search used?"
function bySource(ws){ const m={}; (ws||[]).forEach(w=>{ const s=w.source||'other'; m[s]=(m[s]||0)+1; }); return Object.entries(m).sort((a,b)=>b[1]-a[1]); }
// Country → cities: totals from the all-time geo counter, city breakdown from recent events.
function countryTree(events,geo){ const cities={}; (events||[]).forEach(e=>{ const c=String(e.country||'').toUpperCase(); if(!c) return; (cities[c]=cities[c]||{}); const ci=e.city||'—'; cities[c][ci]=(cities[c][ci]||0)+1; });
  return Object.entries(geo||{}).map(([c,n])=>[String(c).toUpperCase(),+n||0]).sort((a,b)=>b[1]-a[1])
    .map(([c,n])=>({code:c,n,cities:Object.entries(cities[c]||{}).sort((a,b)=>b[1]-a[1])})); }
/* visits-per-day trend: one bar per day (last 90d), gaps filled with 0 so the shape is honest. */
function dailyChart(daily){
  const ent=Object.entries(daily||{}).filter(function(e){return typeof e[0]==='string'&&e[0].length===10&&e[0].charAt(4)==='-'&&e[0].charAt(7)==='-';}).sort();
  if(!ent.length) return '';
  const DAY=864e5, dp=function(d){return Date.parse(d+'T00:00:00Z');};
  const map={}; ent.forEach(function(e){map[e[0]]=+e[1]||0;});
  const first=dp(ent[0][0]), last=dp(ent[ent.length-1][0]), days=[];
  for(let t=first;t<=last;t+=DAY){ const ds=new Date(t).toISOString().slice(0,10); days.push([ds,map[ds]||0]); }
  const show=days.slice(-90), max=Math.max(1,...show.map(function(x){return x[1];}));
  const W=960,H=170,pB=24,pT=8,bw=W/show.length, MON=['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  let bars='',ticks='',lastMon=-1;
  show.forEach(function(d,i){ const h=(d[1]/max)*(H-pB-pT), x=i*bw, y=H-pB-h;
    bars+='<rect x="'+(x+0.6).toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+Math.max(1,bw-1.2).toFixed(1)+'" height="'+h.toFixed(1)+'" rx="1"><title>'+d[0]+' — '+d[1]+' visits</title></rect>';
    const mo=+d[0].slice(5,7); if(mo!==lastMon){ lastMon=mo; ticks+='<text x="'+x.toFixed(1)+'" y="'+(H-7)+'" font-size="10" fill="var(--faint)">'+MON[mo]+'</text>'; } });
  const total=show.reduce(function(a,b){return a+b[1];},0), avg=Math.round(total/show.length);
  const peak=show.reduce(function(m,x){return x[1]>m[1]?x:m;},show[0]);
  return '<div class="card"><h2>Visits per day <span class="c">last '+show.length+'d · avg '+avg+'/day · peak '+peak[1]+' ('+peak[0]+')</span></h2>'
    +'<svg viewBox="0 0 '+W+' '+H+'" class="dchart">'
    +'<line x1="0" y1="'+(H-pB)+'" x2="'+W+'" y2="'+(H-pB)+'" stroke="var(--sep)"/>'
    +'<g class="bars">'+bars+'</g>'+ticks+'</svg></div>';
}
async function load(){ const pw=$('#pw')?$('#pw').value:''; $('#out').innerHTML='<p class="muted">loading…</p>';
  let r;
  try{ r=await fetch('/api/intel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pw})}); }
  catch(e){ $('#out').innerHTML='<p class="note">Network error reaching /api/intel: '+esc(String(e))+'</p>'; return; }
  if(!r.ok){ const j=await r.json().catch(()=>({})); $('#out').innerHTML='<p class="note">'+(r.status===401?'wrong password':(esc(j.error||'')||('error '+r.status)))+'</p>'; return; }
  const d=await r.json().catch(()=>null);
  if(!d){ $('#out').innerHTML='<p class="note">Empty / unparseable response from /api/intel.</p>'; return; }
  const dg=d.diag||{};
  const diagInner='Diagnostics — sees URL var: <b>'+esc(dg.urlVar||'NO')+'</b> · sees token var: <b>'+esc(dg.tokenVar||'NO')+'</b>'+(d.kvError?' · <b style="color:#fb7185">KV error: '+esc(d.kvError)+'</b>':'');
  const diagLine='<p class="note">'+diagInner+'</p>';
  if(!d.configured){ $('#out').innerHTML='<p class="note">Reached the dashboard, but the function does not see the KV vars at runtime.</p>'+diagLine; return; }
  if(d.kvError){ $('#out').innerHTML='<p class="note">The function sees the KV vars but the store rejected the request — likely a wrong or read-only token, or a URL mismatch.</p>'+diagLine; return; }
  try{ sessionStorage.setItem('intelpw',pw); }catch(e){} /* password worked → remember it for this session */
  const nEvents=(d.events||[]).length, nWallets=(d.wallets||[]).length;
  const emptyNote=(nEvents+nWallets===0)?'<p class="note">Store is connected and reachable, but empty so far (0 events). Once the live site gets traffic, events will appear here. '+diagInner+'</p>':'';
  const rows=(o,n=10)=>topN(o,n).map(([k,v])=>'<div class="row"><span class="k">'+esc(k)+'</span><span class="v">'+v+'</span></div>').join('')||'<div class="muted">—</div>';
  // at-a-glance summary
  const geoSum=Object.values(d.geo||{}).reduce((a,b)=>a+(+b||0),0);
  const uniqIP=new Set((d.events||[]).map(e=>e.ip).filter(Boolean)).size;
  const wg=groupWallets(d.wallets), ctree=countryTree(d.events,d.geo), wsrc=bySource(d.wallets);
  const stat=(n,l)=>'<div class="stat"><div class="n">'+n+'</div><div class="l">'+l+'</div></div>';
  const stats='<div class="stats">'+stat(geoSum.toLocaleString(),'events (all-time)')+stat(ctree.length,'countries')+stat(wg.length,'wallets searched')+stat(Object.keys(d.charts||{}).length,'charts opened')+stat(uniqIP,'recent visitors')+'</div>';
  // wallet searches, grouped by address with a count
  const wallets=wg.slice(0,40).map(g=>'<div class="wg"><div class="col"><div class="a">'+esc(g.wallet)+'</div><div class="m">'+esc([g.city,cname(g.country)].filter(Boolean).join(', ')||'??')+' · last '+ago(g.last)+' ago'+(g.ips.size>1?' · '+g.ips.size+' IPs':'')+(g.src.size?' · via '+esc([...g.src].join(', ')):'')+'</div></div><div class="cnt">'+g.n+'×</div></div>').join('')||'<div class="muted">no wallet searches yet</div>';
  // searches-by-surface, so it's obvious at a glance whether the whale-chart search gets any use
  const srcLine=wsrc.length?'<div class="srcrow">'+wsrc.map(([s,n])=>'<span class="src">'+esc(s)+' <b>'+n+'</b></span>').join('')+'</div>':'';
  // countries, grouped, expandable to their cities
  const countries=ctree.slice(0,20).map(c=>'<details class="cty"><summary><span class="nm"><span class="flag">'+flag(c.code)+'</span><span class="t">'+esc(cname(c.code))+'</span></span><span class="v">'+c.n+'</span></summary>'+(c.cities.length?'<div class="sub">'+c.cities.slice(0,10).map(([ci,n])=>esc(ci)+' <b>'+n+'</b>').join(' · ')+'</div>':'')+'</details>').join('')||'<div class="muted">—</div>';
  const feed=(d.events||[]).slice(0,200).map(e=>'<div class="ev"><b>'+esc(e.t)+'</b> '+esc(e.path||'')+(e.chart?' ['+esc(e.chart)+']':'')+(e.wallet?' '+esc(e.wallet):'')+' <span class="muted">· '+flag(e.country)+' '+esc([e.city,cname(e.country)].filter(Boolean).join(', ')||'??')+' · '+(e.ref?esc(e.ref)+' · ':'')+ago(e.ts)+'</span></div>').join('');
  $('#out').innerHTML=emptyNote+stats+dailyChart(d.daily)+'<div class="grid">'
    +'<div class="card"><h2>Wallet searches <span class="c">'+wg.length+' unique · '+(d.wallets||[]).length+' total</span></h2>'+srcLine+wallets+'</div>'
    +'<div class="card"><h2>Countries <span class="c">tap to expand</span></h2>'+countries+'</div>'
    +'<div class="card"><h2>Top pages</h2>'+rows(d.pages,12)+'</div>'
    +'<div class="card"><h2>Charts opened</h2>'+rows(d.charts,12)+'</div>'
    +'<div class="card"><h2>Referrers</h2>'+rows(d.refs,12)+'</div>'
    +'<div class="card"><h2>Recent events</h2><div class="feed">'+feed+'</div></div>'
    +'</div>';
  $('#login').style.display='none';
}
try{ const s=sessionStorage.getItem('intelpw'); if(s){ $('#pw').value=s; load(); } }catch(e){} /* remembers a valid session so you don't retype the password each visit */
</script></div></body></html>`;
