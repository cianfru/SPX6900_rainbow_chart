// Password-gated control actions for the hidden /control page. The browser only
// ever sends a password (checked against CONTROL_PASSWORD); all GitHub work runs
// here server-side with GH_PAT, so no token ever touches the client.
//
// Required Vercel env vars:
//   CONTROL_PASSWORD  the password the page asks for
//   GH_PAT            a GitHub fine-grained token for THIS repo with
//                     Contents: read/write + Actions: read/write
const OWNER = "cianfru", REPO = "SPX6900_rainbow_chart", BRANCH = "main";
const QUEUE_PATH = "public/next-post.json", WORKFLOW = "post-tweet.yml";

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

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  if (!process.env.GH_PAT || !process.env.CONTROL_PASSWORD) {
    res.status(500).json({ error: "Server not configured: set CONTROL_PASSWORD and GH_PAT in Vercel." });
    return;
  }
  const { password, action, id } = await readBody(req);
  if (password !== process.env.CONTROL_PASSWORD) { res.status(401).json({ error: "Wrong password." }); return; }

  // Gate unlock: password already validated above, so just acknowledge.
  if (action === "verify") { res.status(200).json({ ok: true }); return; }

  try {
    if (action === "queue" || action === "clear") {
      const newId = action === "clear" ? null : (id || null);
      let sha;
      const cur = await gh(`/repos/${OWNER}/${REPO}/contents/${QUEUE_PATH}?ref=${BRANCH}`);
      if (cur.ok) sha = (await cur.json()).sha;
      const content = Buffer.from(JSON.stringify({ id: newId }, null, 2) + "\n").toString("base64");
      const put = await gh(`/repos/${OWNER}/${REPO}/contents/${QUEUE_PATH}`, {
        method: "PUT",
        body: JSON.stringify({
          message: newId ? `control: queue ${newId}` : "control: clear queue (auto)",
          content, branch: BRANCH, ...(sha ? { sha } : {}),
        }),
      });
      if (!put.ok) throw new Error("queue write failed (" + put.status + ") " + (await put.text()));
      res.status(200).json({ ok: true, queued: newId });
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
    res.status(400).json({ error: "unknown action" });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}
