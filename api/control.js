// Password-gated control actions for the hidden /control page. The browser only
// ever sends a password (checked against CONTROL_PASSWORD); all GitHub work runs
// here server-side with GH_PAT, so no token ever touches the client.
//
// Required Vercel env vars:
//   CONTROL_PASSWORD  the password the page asks for
//   GH_PAT            a GitHub fine-grained token for THIS repo with
//                     Contents: read/write + Actions: read/write
import crypto from "node:crypto";
// Folded in from the former api/schedule.js (to stay under Vercel Hobby's 12-function cap): the
// read-only "cards today + next N days" feed the control gallery reads via GET ?feed=schedule.
import { DEFAULT_RAW } from "../src/data.js";
import { fetchLivePrice, fetchMajors, fetchHistory, computeStats } from "../scripts/bot/stats.mjs";
import { buildPost, allIds, OG_ONLY, editableCopy } from "../scripts/bot/posts.mjs";
import { isPortraitCard, isVideoCard } from "../scripts/bot/card-format.mjs";

const SCHED_DAY = 86400000;
// The deterministic auto-rotation schedule + per-card copy/media/orientation — no secrets, read-only.
async function serveSchedule(req, res) {
  const days = Math.min(30, Math.max(1, parseInt(new URL(req.url, "http://x").searchParams.get("days") || "10", 10)));
  let ids; const upcoming = [], texts = {}, media = {}, orient = {};
  try {
    const price = (await fetchLivePrice())?.price ?? DEFAULT_RAW.at(-1).price;
    const opts = {};
    try { opts.history = await fetchHistory(); } catch { /* bundled */ }
    try { opts.coins = await fetchMajors(); } catch { /* skip gated coin posts */ }
    const stats = computeStats(price, undefined, opts);
    ids = allIds(stats).filter(id => !OG_ONLY.has(id));
    for (const id of ids) {
      const p = buildPost(stats, new Date(), id);
      const type = p.card?.type;
      texts[id] = p.text;
      media[id] = (isVideoCard(type) || p.card?.animate) ? "video" : "image";
      orient[id] = isPortraitCard(type) ? "portrait" : "landscape";
    }
    const base = new Date(); base.setUTCHours(13, 0, 0, 0);
    for (let i = 0; i < days; i++) {
      const d = new Date(base.getTime() + i * SCHED_DAY);
      upcoming.push({ date: d.toISOString().slice(0, 10), id: buildPost(stats, d, null).id });
    }
  } catch (e) { res.status(500).json({ error: String(e?.message || e) }); return; }
  const editable = (() => { try { return editableCopy(); } catch { return {}; } })();
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  res.status(200).json({ ids, upcoming, texts, media, orient, editable, generatedAt: new Date().toISOString() });
}

// Constant-time secret compare over SHA-256 digests (no early-out on first differing byte, no
// length leak) — the password gates state-changing GitHub work, so avoid a timing side channel.
function safeEq(a, b) {
  const x = crypto.createHash("sha256").update(String(a)).digest();
  const y = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

const OWNER = "cianfru", REPO = "The_Terminal", BRANCH = "main";
const QUEUE_PATH = "public/next-post.json", WORKFLOW = "post-tweet.yml";
const WORKFLOW_RECAP = "monthly-recap.yml";
const COPY_PATH = "public/post-copy.json"; // owner-edited card-copy overrides
const AR_PATH = "public/card-ar.json";     // owner-picked aspect ratio per card
const STATE_PATH = "public/post-state.json"; // last-posted date guard (once-per-day)
const EXCLUDE_PATH = "public/rotation-excludes.json"; // cards held out of auto-rotation
const DF_RELEASE_PATH = "public/deepfield-releases.json"; // {released:[chartId,…]} — the Deep Field drip
const BIN_PATH = "public/binned-cards.json"; // cards hidden from the panel + dropped from rotation

const gh = (path, init = {}) => fetch("https://api.github.com" + path, {
  ...init,
  headers: {
    Accept: "application/vnd.github+json",
    Authorization: "Bearer " + process.env.GH_PAT,
    "User-Agent": "spx6900-control",
    ...(init.body ? { "Content-Type": "application/json" } : {}),
  },
});

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let raw = "";
  for await (const c of req) raw += c;
  try { return JSON.parse(raw || "{}"); } catch { return {}; }
}

// GET ?f=public/<name>.json — read-only proxy for the deploy-ignored runtime files the control
// panel reads (signals / post-state / post-copy / card-ar / rotation-excludes / next-post / the aeon
// + freshness JSON). Folded into THIS function rather than its own api/state.js so the deployment
// stays under the Vercel Hobby plan's 12-serverless-function cap. Served with GH_PAT server-side so
// the panel keeps working once the repo goes private — no token in the browser — and STRICTLY
// whitelisted to a flat public/<name>.json so it can never read anything else. No password: these
// files are read-only and already world-readable today (via raw / the deployed site).
const STATE_OK = /^public\/[A-Za-z0-9._-]+\.json$/;   // one level under public/, .json, no traversal
// THE DATA WALL: address-revealing feeds must NEVER come through this open (password-less) proxy — they
// are served only to logged-in members from KV via /api/auth?action=data. Blocked here as defense in
// depth so the wall holds even if some client still asks the proxy for them.
// entities.json is members-only (KV via /api/auth?action=data) and must NEVER come through this open,
// password-less proxy. (whales/spx-timeline are public — SPX City is a public showpiece; smart-money/
// whale-entry are served publicly here as their anonymized/aggregate copies, granular only via KV.)
const PRIVATE_BLOCK = new Set(["public/entities.json"]);
async function serveState(req, res) {
  const f = String((req.query && req.query.f) || "");
  if (!STATE_OK.test(f)) { res.status(400).json({ error: "bad file" }); return; }
  if (PRIVATE_BLOCK.has(f)) { res.status(403).json({ error: "members only" }); return; }
  res.setHeader("Cache-Control", "no-store");
  const attempts = [];
  if (process.env.GH_PAT) attempts.push({
    url: `https://api.github.com/repos/${OWNER}/${REPO}/contents/${f}?ref=${BRANCH}`,
    headers: { Accept: "application/vnd.github.raw", Authorization: "Bearer " + process.env.GH_PAT, "User-Agent": "spx6900-control" },
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
  res.status(last === 404 ? 404 : 502).json(null);
}

export default async function handler(req, res) {
  if (req.method === "GET" && new URL(req.url, "http://x").searchParams.get("feed") === "schedule") { await serveSchedule(req, res); return; }
  if (req.method === "GET") { await serveState(req, res); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  if (!process.env.GH_PAT || !process.env.CONTROL_PASSWORD) {
    res.status(500).json({ error: "Server not configured: set CONTROL_PASSWORD and GH_PAT in Vercel." });
    return;
  }
  const { password, action, id, month, template, ar, excluded, binned, released, format, seconds, announce, sound } = await readBody(req);
  if (!safeEq(password ?? "", process.env.CONTROL_PASSWORD)) { res.status(401).json({ error: "Wrong password." }); return; }

  // Gate unlock: password already validated above, so just acknowledge.
  if (action === "verify") { res.status(200).json({ ok: true }); return; }

  try {
    if (action === "queue" || action === "clear") {
      const newId = action === "clear" ? null : (id || null);
      const content = Buffer.from(JSON.stringify({ id: newId }, null, 2) + "\n").toString("base64");
      const message = newId ? `control: queue ${newId}` : "control: clear queue (auto)";
      // The contents API can return a stale sha (CDN cache) right after a write,
      // which makes the next PUT 409. Re-fetch the sha and retry a couple times.
      let put, body;
      for (let i = 0; i < 3; i++) {
        let sha;
        const cur = await gh(`/repos/${OWNER}/${REPO}/contents/${QUEUE_PATH}?ref=${BRANCH}`);
        if (cur.ok) sha = (await cur.json()).sha;
        put = await gh(`/repos/${OWNER}/${REPO}/contents/${QUEUE_PATH}`, {
          method: "PUT",
          body: JSON.stringify({ message, content, branch: BRANCH, ...(sha ? { sha } : {}) }),
        });
        if (put.ok) break;
        body = await put.text();
        if (put.status !== 409) break; // only sha conflicts are worth retrying
        await new Promise(r => setTimeout(r, 400 * (i + 1)));
      }
      if (!put.ok) throw new Error("queue write failed (" + put.status + ") " + body);
      res.status(200).json({ ok: true, queued: newId });
      return;
    }
    // "No post today" — stamp post-state.json's lastPostedDate with today's date so
    // post.mjs's once-per-day guard (state.lastPostedDate === today) skips the next
    // scheduled 08:00 ET run. Use when posting manually. Date is America/New_York —
    // which equals the UTC date the run computes at 12:00 UTC (08:00 ET), so it matches.
    if (action === "skip-today") {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
      let put, body;
      for (let i = 0; i < 3; i++) {
        let sha, obj = {};
        const cur = await gh(`/repos/${OWNER}/${REPO}/contents/${STATE_PATH}?ref=${BRANCH}`);
        if (cur.ok) { const j = await cur.json(); sha = j.sha; try { obj = JSON.parse(Buffer.from(j.content, "base64").toString("utf8")) || {}; } catch { obj = {}; } }
        obj.lastPostedDate = today; obj.lastId = "manual-skip";
        const content = Buffer.from(JSON.stringify(obj, null, 2) + "\n").toString("base64");
        put = await gh(`/repos/${OWNER}/${REPO}/contents/${STATE_PATH}`, {
          method: "PUT",
          body: JSON.stringify({ message: `control: skip today (${today})`, content, branch: BRANCH, ...(sha ? { sha } : {}) }),
        });
        if (put.ok) break;
        body = await put.text();
        if (put.status !== 409) break;
        await new Promise(r => setTimeout(r, 400 * (i + 1)));
      }
      if (!put.ok) throw new Error("skip write failed (" + put.status + ") " + body);
      res.status(200).json({ ok: true, skipped: today });
      return;
    }
    if (action === "postnow") {
      if (!id) { res.status(400).json({ error: "missing id" }); return; }
      const d = await gh(`/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
        method: "POST",
        body: JSON.stringify({ ref: BRANCH, inputs: { post_id: id, dry_run: false } }),
      });
      if (d.status !== 204) throw new Error("dispatch failed (" + d.status + ") " + (await d.text()));
      res.status(200).json({ ok: true, posting: id });
      return;
    }
    // Monthly recap: regenerate the committed preview (post:false) or publish the
    // thread for real (post:true). month optional (blank = the month that ended).
    if (action === "recap-preview" || action === "recap-post") {
      const inputs = { post: action === "recap-post" };
      if (month) inputs.month = month;
      const d = await gh(`/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW_RECAP}/dispatches`, {
        method: "POST",
        body: JSON.stringify({ ref: BRANCH, inputs }),
      });
      if (d.status !== 204) throw new Error("recap dispatch failed (" + d.status + ") " + (await d.text()));
      res.status(200).json({ ok: true, recap: action === "recap-post" ? "posting" : "previewing", month: month || "(last month)" });
      return;
    }
    // Rainbow Road: render the OutRun video on demand (workflow_dispatch). Renders X-optimised clips and
    // publishes them to the 'rainbow-road-latest' release; the panel then polls rainbow-road-status for the
    // download link. Nothing auto-posts.
    if (action === "rainbow-road") {
      const fmt = ["vertical", "square", "wide", "all"].includes(format) ? format : "vertical";
      const secs = String(Math.max(6, Math.min(90, parseInt(seconds, 10) || 30)));
      const d = await gh(`/repos/${OWNER}/${REPO}/actions/workflows/rainbow-road.yml/dispatches`, {
        method: "POST",
        body: JSON.stringify({ ref: BRANCH, inputs: { format: fmt, seconds: secs, announce: announce !== false, sound: sound !== false } }),
      });
      if (d.status !== 204) throw new Error("rainbow-road dispatch failed (" + d.status + ") " + (await d.text()));
      res.status(200).json({ ok: true, rendering: fmt, seconds: secs, at: new Date().toISOString() });
      return;
    }
    // Poll: the latest rainbow-road run status + the current release download links.
    if (action === "rainbow-road-status") {
      const runsR = await gh(`/repos/${OWNER}/${REPO}/actions/workflows/rainbow-road.yml/runs?per_page=1`);
      const runsJ = runsR.ok ? await runsR.json() : { workflow_runs: [] };
      const run = (runsJ.workflow_runs || [])[0] || null;
      let assets = [];
      const relR = await gh(`/repos/${OWNER}/${REPO}/releases/tags/rainbow-road-latest`);
      if (relR.ok) { const j = await relR.json(); assets = (j.assets || []).map(a => ({ name: a.name, url: a.browser_download_url, updated: a.updated_at, size: a.size })); }
      res.status(200).json({
        ok: true,
        run: run && { status: run.status, conclusion: run.conclusion, url: run.html_url, created_at: run.created_at, updated_at: run.updated_at },
        assets,
      });
      return;
    }
    // Save (or clear) an owner edit of a card's tweet copy. Persists permanently
    // to public/post-copy.json; the bot prefers it over the built-in default.
    // template null/empty → remove the override (reset to default).
    if (action === "copy-save") {
      if (!id) { res.status(400).json({ error: "missing id" }); return; }
      let put, body;
      for (let i = 0; i < 3; i++) {
        let sha, obj = {};
        const cur = await gh(`/repos/${OWNER}/${REPO}/contents/${COPY_PATH}?ref=${BRANCH}`);
        if (cur.ok) { const j = await cur.json(); sha = j.sha; try { obj = JSON.parse(Buffer.from(j.content, "base64").toString("utf8")) || {}; } catch { obj = {}; } }
        if (typeof template === "string" && template.trim()) obj[id] = template; else delete obj[id];
        const content = Buffer.from(JSON.stringify(obj, null, 2) + "\n").toString("base64");
        put = await gh(`/repos/${OWNER}/${REPO}/contents/${COPY_PATH}`, {
          method: "PUT",
          body: JSON.stringify({ message: `control: copy ${template && template.trim() ? "edit" : "reset"} ${id}`, content, branch: BRANCH, ...(sha ? { sha } : {}) }),
        });
        if (put.ok) break;
        body = await put.text();
        if (put.status !== 409) break;
        await new Promise(r => setTimeout(r, 400 * (i + 1)));
      }
      if (!put.ok) throw new Error("copy write failed (" + put.status + ") " + body);
      res.status(200).json({ ok: true, id, saved: !!(template && template.trim()) });
      return;
    }
    // Save (or clear) an owner-picked aspect ratio for a card. Persists to
    // public/card-ar.json; the bot renders that card at the chosen ratio.
    // ar empty/"default" → remove the override.
    if (action === "ar-save") {
      if (!id) { res.status(400).json({ error: "missing id" }); return; }
      const keep = ar && ar !== "default";
      let put, body;
      for (let i = 0; i < 3; i++) {
        let sha, obj = {};
        const cur = await gh(`/repos/${OWNER}/${REPO}/contents/${AR_PATH}?ref=${BRANCH}`);
        if (cur.ok) { const j = await cur.json(); sha = j.sha; try { obj = JSON.parse(Buffer.from(j.content, "base64").toString("utf8")) || {}; } catch { obj = {}; } }
        if (keep) obj[id] = ar; else delete obj[id];
        const content = Buffer.from(JSON.stringify(obj, null, 2) + "\n").toString("base64");
        put = await gh(`/repos/${OWNER}/${REPO}/contents/${AR_PATH}`, {
          method: "PUT",
          body: JSON.stringify({ message: `control: ar ${keep ? ar : "default"} ${id}`, content, branch: BRANCH, ...(sha ? { sha } : {}) }),
        });
        if (put.ok) break;
        body = await put.text();
        if (put.status !== 409) break;
        await new Promise(r => setTimeout(r, 400 * (i + 1)));
      }
      if (!put.ok) throw new Error("ar write failed (" + put.status + ") " + body);
      res.status(200).json({ ok: true, id, ar: keep ? ar : null });
      return;
    }
    // Toggle a card in/out of the organic daily rotation. Persists to
    // public/rotation-excludes.json ({id:true} = excluded). The card stays buildable
    // + hand-postable; this only mutes the AUTO rotation. excluded=false removes it.
    if (action === "exclude-save") {
      if (!id) { res.status(400).json({ error: "missing id" }); return; }
      const keep = !!excluded;
      let put, body;
      for (let i = 0; i < 3; i++) {
        let sha, obj = {};
        const cur = await gh(`/repos/${OWNER}/${REPO}/contents/${EXCLUDE_PATH}?ref=${BRANCH}`);
        if (cur.ok) { const j = await cur.json(); sha = j.sha; try { obj = JSON.parse(Buffer.from(j.content, "base64").toString("utf8")) || {}; } catch { obj = {}; } }
        if (Array.isArray(obj)) obj = Object.fromEntries(obj.map(k => [k, true])); // normalise legacy array form
        if (keep) obj[id] = true; else delete obj[id];
        const content = Buffer.from(JSON.stringify(obj, null, 2) + "\n").toString("base64");
        put = await gh(`/repos/${OWNER}/${REPO}/contents/${EXCLUDE_PATH}`, {
          method: "PUT",
          body: JSON.stringify({ message: `control: rotation ${keep ? "exclude" : "include"} ${id}`, content, branch: BRANCH, ...(sha ? { sha } : {}) }),
        });
        if (put.ok) break;
        body = await put.text();
        if (put.status !== 409) break;
        await new Promise(r => setTimeout(r, 400 * (i + 1)));
      }
      if (!put.ok) throw new Error("exclude write failed (" + put.status + ") " + body);
      res.status(200).json({ ok: true, id, excluded: keep });
      return;
    }

    // Deep Field drip: release / un-release one walled chart → public/deepfield-releases.json
    // {released:[chartId,…]}. Released = members-only; un-released = "under construction" for everyone.
    if (action === "df-release-save") {
      if (!id) { res.status(400).json({ error: "missing id" }); return; }
      const on = !!released;
      let put, body;
      for (let i = 0; i < 3; i++) {
        let sha, arr = [];
        const cur = await gh(`/repos/${OWNER}/${REPO}/contents/${DF_RELEASE_PATH}?ref=${BRANCH}`);
        if (cur.ok) { const j = await cur.json(); sha = j.sha; try { const o = JSON.parse(Buffer.from(j.content, "base64").toString("utf8")); arr = Array.isArray(o?.released) ? o.released : []; } catch { arr = []; } }
        const set = new Set(arr);
        if (on) set.add(id); else set.delete(id);
        const content = Buffer.from(JSON.stringify({ released: [...set] }, null, 2) + "\n").toString("base64");
        put = await gh(`/repos/${OWNER}/${REPO}/contents/${DF_RELEASE_PATH}`, {
          method: "PUT",
          body: JSON.stringify({ message: `control: deep field ${on ? "release" : "unrelease"} ${id}`, content, branch: BRANCH, ...(sha ? { sha } : {}) }),
        });
        if (put.ok) break;
        body = await put.text();
        if (put.status !== 409) break;
        await new Promise(r => setTimeout(r, 400 * (i + 1)));
      }
      if (!put.ok) throw new Error("df-release write failed (" + put.status + ") " + body);
      res.status(200).json({ ok: true, id, released: on });
      return;
    }

    // Bin/unbin a card → public/binned-cards.json ({id:true} = binned). Binned cards are hidden
    // from the panel grid AND dropped from the auto rotation; still buildable/hand-postable if needed.
    if (action === "bin-save") {
      if (!id) { res.status(400).json({ error: "missing id" }); return; }
      const keep = !!binned;
      let put, body;
      for (let i = 0; i < 3; i++) {
        let sha, obj = {};
        const cur = await gh(`/repos/${OWNER}/${REPO}/contents/${BIN_PATH}?ref=${BRANCH}`);
        if (cur.ok) { const j = await cur.json(); sha = j.sha; try { obj = JSON.parse(Buffer.from(j.content, "base64").toString("utf8")) || {}; } catch { obj = {}; } }
        if (Array.isArray(obj)) obj = Object.fromEntries(obj.map(k => [k, true]));
        if (keep) obj[id] = true; else delete obj[id];
        const content = Buffer.from(JSON.stringify(obj, null, 2) + "\n").toString("base64");
        put = await gh(`/repos/${OWNER}/${REPO}/contents/${BIN_PATH}`, {
          method: "PUT",
          body: JSON.stringify({ message: `control: ${keep ? "bin" : "unbin"} ${id}`, content, branch: BRANCH, ...(sha ? { sha } : {}) }),
        });
        if (put.ok) break;
        body = await put.text();
        if (put.status !== 409) break;
        await new Promise(r => setTimeout(r, 400 * (i + 1)));
      }
      if (!put.ok) throw new Error("bin write failed (" + put.status + ") " + body);
      res.status(200).json({ ok: true, id, binned: keep });
      return;
    }
    res.status(400).json({ error: "unknown action" });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}
