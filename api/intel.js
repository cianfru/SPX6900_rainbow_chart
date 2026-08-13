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

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const iphash = ip ? crypto.createHash("sha256").update(SALT + ip).digest("hex").slice(0, 12) : "";
  const ev = {
    t, ts: Date.now(),
    path: clip(body.path, 200), ref: host(clip(body.ref, 300) || ""),
    country: req.headers["x-vercel-ip-country"] || "",
    city: decodeURIComponent(req.headers["x-vercel-ip-city"] || "") || "",
    region: req.headers["x-vercel-ip-country-region"] || "",
    wallet: clip(body.wallet, 80), chart: clip(body.chart, 40), mode: clip(body.mode, 16),
    ip: iphash,
  };
  const json = JSON.stringify(ev);
  const cmds = [
    ["LPUSH", "intel:events", json], ["LTRIM", "intel:events", "0", String(CAP - 1)],
    ["HINCRBY", "intel:geo", ev.country || "??", "1"],
    ["HINCRBY", "intel:pages", ev.path || "/", "1"],
  ];
  if (ev.ref) cmds.push(["HINCRBY", "intel:refs", ev.ref, "1"]);
  if (t === "wallet_search" && ev.wallet) { cmds.push(["LPUSH", "intel:wallets", json], ["LTRIM", "intel:wallets", "0", String(WCAP - 1)]); }
  if (t === "chart_open" && ev.chart) cmds.push(["HINCRBY", "intel:charts", ev.chart, "1"]);

  try { await kvPipeline(cmds); } catch (e) { /* swallow — analytics must never break the page */ }
  res.status(204).end();
}

// POST {pw} — dashboard data.
async function dashboard(req, res, body) {
  // ⚠️ TEMPORARY (owner request 2026-08-13): the password gate is DISABLED for debugging, so the
  // dashboard is PUBLIC — anyone with the URL sees wallet lookups, geo and IP hashes. Flip AUTH back
  // to true (and set CONTROL_PASSWORD in Vercel) to re-lock it once access is confirmed.
  const AUTH = false;
  if (AUTH) {
    // Trim both sides: a password pasted into Vercel's env UI often carries a trailing newline,
    // which makes a correct-looking password fail a strict compare. Distinguish "not configured"
    // (env var missing) from "wrong password" so the page can say which it is.
    const expected = String(process.env.CONTROL_PASSWORD || "").trim();
    if (!expected) { res.status(503).json({ error: "Server not configured: set CONTROL_PASSWORD in Vercel." }); return; }
    if (String(body.pw || "").trim() !== expected) { res.status(401).json({ error: "bad password" }); return; }
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
    const [events, wallets, geo, pages, refs, charts] = await kvPipeline([
      ["LRANGE", "intel:events", "0", "499"],
      ["LRANGE", "intel:wallets", "0", "199"],
      ["HGETALL", "intel:geo"], ["HGETALL", "intel:pages"], ["HGETALL", "intel:refs"], ["HGETALL", "intel:charts"],
    ]);
    res.status(200).json({
      configured: true, diag,
      events: parseList(events), wallets: parseList(wallets),
      geo: hash2obj(geo), pages: hash2obj(pages), refs: hash2obj(refs), charts: hash2obj(charts),
    });
  } catch (e) {
    // Don't 500 into a blank page — return the KV error so the page can show it (e.g. "kv 401" =
    // the token is wrong/read-only for writes; a network host error = the URL is off).
    res.status(200).json({ configured: true, kvError: String(e.message || e), diag, events: [], wallets: [], geo: {}, pages: {}, refs: {}, charts: {} });
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
:root{--bg:#08090b;--panel:#0e1013;--line:#1e2128;--tx:#f4f6f9;--dim:#9aa3b2;--faint:#646b78;--live:#4ee79a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font-family:'Geist Mono',ui-monospace,Menlo,Consolas,monospace;font-size:13px}
.wrap{max-width:1100px;margin:0 auto;padding:24px 18px 60px}
h1{font-size:15px;letter-spacing:.18em;text-transform:uppercase;color:var(--dim);font-weight:600;margin:0 0 18px}
.login{display:flex;gap:8px;align-items:center}input{background:var(--panel);border:1px solid var(--line);color:var(--tx);padding:9px 12px;border-radius:8px;font:inherit}
button{background:var(--panel);border:1px solid var(--line);color:var(--tx);padding:9px 14px;border-radius:8px;cursor:pointer;font:inherit}
button:hover{border-color:var(--live);color:var(--live)}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:22px;margin-top:20px}
@media(max-width:720px){.grid{grid-template-columns:1fr}}
.card{border-top:1px solid var(--line);padding-top:12px}
.card h2{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);margin:0 0 10px}
.row{display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.03)}
.row .k{color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.row .v{color:var(--tx);font-variant-numeric:tabular-nums;flex:none}
.wal{padding:7px 0;border-bottom:1px solid rgba(255,255,255,.04)}.wal .a{color:var(--live);word-break:break-all}.wal .m{color:var(--faint);font-size:11px}
.feed{max-height:420px;overflow:auto}.ev{padding:4px 0;color:var(--dim);border-bottom:1px solid rgba(255,255,255,.03);font-size:12px}
.ev b{color:var(--tx)}.muted{color:var(--faint)}.note{color:var(--faint);margin-top:14px;line-height:1.6}
</style></head><body><div class="wrap">
<h1>Page Intel</h1>
<div class="login" id="login" style="display:none"><input id="pw" type="password" placeholder="control password"><button onclick="load()">view</button><span id="msg" class="muted"></span></div>
<div id="out"></div>
<script>
const $=s=>document.querySelector(s);
const topN=(o,n)=>Object.entries(o||{}).sort((a,b)=>b[1]-a[1]).slice(0,n); /* NOT 'top' — collides with window.top in a classic script → "already declared" parse error → blank page */
const ago=ts=>{const s=Math.floor((Date.now()-ts)/1000);if(s<60)return s+'s';const m=Math.floor(s/60);if(m<60)return m+'m';const h=Math.floor(m/60);return h<24?h+'h':Math.floor(h/24)+'d';};
const esc=s=>String(s==null?'':s).replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
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
  const nEvents=(d.events||[]).length, nWallets=(d.wallets||[]).length;
  const emptyNote=(nEvents+nWallets===0)?'<p class="note">Store is connected and reachable, but empty so far (0 events). Once the live site gets traffic, events will appear here. '+diagInner+'</p>':diagLine;
  const rows=(o,n=10)=>topN(o,n).map(([k,v])=>'<div class="row"><span class="k">'+esc(k)+'</span><span class="v">'+v+'</span></div>').join('')||'<div class="muted">—</div>';
  const wallets=(d.wallets||[]).map(w=>'<div class="wal"><div class="a">'+esc(w.wallet)+'</div><div class="m">'+esc([w.city,w.country].filter(Boolean).join(', ')||'??')+' · '+ago(w.ts)+' ago · '+esc(w.ip)+'</div></div>').join('')||'<div class="muted">no wallet searches yet</div>';
  const feed=(d.events||[]).slice(0,200).map(e=>'<div class="ev"><b>'+esc(e.t)+'</b> '+esc(e.path||'')+(e.chart?' ['+esc(e.chart)+']':'')+(e.wallet?' '+esc(e.wallet):'')+' <span class="muted">· '+esc([e.city,e.country].filter(Boolean).join(', ')||'??')+' · '+(e.ref?esc(e.ref)+' · ':'')+ago(e.ts)+'</span></div>').join('');
  $('#out').innerHTML=emptyNote+'<div class="grid">'
    +'<div class="card"><h2>Recent wallet searches (city)</h2>'+wallets+'</div>'
    +'<div class="card"><h2>Top pages</h2>'+rows(d.pages,12)+'</div>'
    +'<div class="card"><h2>Countries</h2>'+rows(d.geo,12)+'</div>'
    +'<div class="card"><h2>Referrers</h2>'+rows(d.refs,12)+'</div>'
    +'<div class="card"><h2>Charts opened</h2>'+rows(d.charts,12)+'</div>'
    +'<div class="card"><h2>Recent events</h2><div class="feed">'+feed+'</div></div>'
    +'</div>';
  $('#login').style.display='none';
}
load(); /* auth disabled → load the dashboard straight away, no password */
</script></div></body></html>`;
