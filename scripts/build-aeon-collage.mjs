// ============================================================================
// PROJECT AEON — collage builder
// ============================================================================
// Tiles the collection's art into one image, for announcement posts.
//
//   node scripts/build-aeon-collage.mjs [--pick=sold|spread|rare] [--cols=] [--rows=]
//                                       [--cell=] [--out=] [--title=] [--sub=]
//
// WHY IT RUNS IN CI, NOT LOCALLY: the art lives on `nft2-cdn.alchemy.com`, which is
// not in the dev sandbox's egress allowlist (403 "Host not in allowlist"). GitHub
// Actions has open egress and already talks to Alchemy for the rarity build, so this
// runs there. Locally, `--mock` composes the same layout from flat colour tiles so
// the geometry can be checked without the network.
//
// The art is embedded as data URIs because resvg does not resolve remote hrefs — the
// same constraint the sale card hit. Fetches are sniffed by magic bytes rather than
// trusting content-type, and WEBP is rejected because resvg cannot decode it; a token
// whose art fails is replaced from the spare pool so the grid never renders a hole.
import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { brandStripe } from "./bot/chrome.mjs";
import { FONT } from "./bot/font.mjs";
import { esc } from "./bot/svg-util.mjs";

const arg = (k, d) => {
  const hit = process.argv.find(a => a.startsWith(`--${k}=`));
  return hit ? hit.split("=").slice(1).join("=") : d;
};
const flag = k => process.argv.includes(`--${k}`);
const num = (k, d) => { const v = +arg(k, NaN); return Number.isFinite(v) ? v : d; };
const readJson = p => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };

// ── selection ───────────────────────────────────────────────────────────────
// `sold` is the default for a watcher announcement: these are the pieces that have
// actually changed hands, which is exactly what the watcher reports on. The others
// are there for a general collection post.
function pickTokens(kind, want) {
  const rarity = readJson("public/aeon-rarity.json");
  if (!rarity?.tokens?.length) throw new Error("public/aeon-rarity.json missing or empty");
  const byId = new Map(rarity.tokens.map(t => [t.id, t]));
  const withArt = id => byId.get(id)?.img ? byId.get(id) : null;

  if (kind === "rare") return rarity.tokens.slice().sort((a, b) => a.rank - b.rank).slice(0, want);

  if (kind === "spread") {
    const sorted = rarity.tokens.slice().sort((a, b) => a.rank - b.rank);
    const step = sorted.length / want;
    return Array.from({ length: want }, (_, i) => sorted[Math.floor(i * step)]);
  }

  // sold — every token we have a trade for, rarest first so the eye lands well
  const mk = readJson("public/aeon-market.json") || {};
  const ids = new Set();
  for (const s of mk.recentSales || []) ids.add(s.id);
  for (const s of mk.biggest || []) if (s.id != null) ids.add(s.id);
  for (const s of mk.salesScatter || []) if (s.id != null) ids.add(s.id);
  for (const k of Object.keys(mk.scatterImgs || {})) ids.add(+k);
  const sold = [...ids].map(withArt).filter(Boolean).sort((a, b) => a.rank - b.rank);
  if (sold.length >= want) return sold.slice(0, want);
  // top up from a rarity spread so the grid still fills
  const have = new Set(sold.map(t => t.id));
  const rest = pickTokens("spread", want * 3).filter(t => !have.has(t.id));
  return sold.concat(rest).slice(0, want);
}

// ── art ─────────────────────────────────────────────────────────────────────
const MAGIC = [
  ["image/png", b => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47],
  ["image/jpeg", b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ["image/gif", b => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46],
];
const sniff = buf => {
  if (buf.length < 64) return null;
  for (const [type, test] of MAGIC) if (test(buf)) return type;
  // RIFF….WEBP — resvg cannot decode it, so treat as a miss
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return null;
  const head = buf.slice(0, 200).toString("utf8").trimStart();
  return head.startsWith("<svg") || head.startsWith("<?xml") ? "image/svg+xml" : null;
};

async function fetchArt(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    if (i) await new Promise(r => setTimeout(r, 500 * 2 ** (i - 1)));
    try {
      const res = await fetch(url, { headers: { accept: "image/*" } });
      if (!res.ok) { if (res.status === 404 || res.status === 410 || res.status === 403) return null; continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      const type = sniff(buf);
      if (!type) return null;
      return `data:${type};base64,${buf.toString("base64")}`;
    } catch { /* retry */ }
  }
  return null;
}

// Fetch with a small concurrency cap, filling `need` cells and drawing replacements
// from the tail of the pool whenever one fails.
async function gather(pool, need, { mock = false, conc = 8 } = {}) {
  if (mock) {
    // flat tiles from the rainbow palette, purely to check the geometry offline
    const C = ["#dc2626", "#ea580c", "#f59e0b", "#84cc16", "#22c55e", "#06b6d4", "#3b82f6", "#6366f1", "#a855f7"];
    return pool.slice(0, need).map((t, i) => ({ t, art: null, mock: C[i % C.length] }));
  }
  const out = [];
  let next = 0, misses = 0;
  const take = () => (next < pool.length ? pool[next++] : null);
  const worker = async () => {
    while (out.length < need) {
      const t = take();
      if (!t) return;
      const art = await fetchArt(t.img);
      if (art) out.push({ t, art });
      else misses++;
    }
  };
  await Promise.all(Array.from({ length: conc }, worker));
  if (misses) console.log(`  ${misses} art fetch${misses === 1 ? "" : "es"} missed — backfilled from the pool`);
  return out.slice(0, need);
}

// ── compose ─────────────────────────────────────────────────────────────────
function collageSvg(cells, { cols, rows, cell, gap, title, sub }) {
  const gridW = cols * cell + (cols - 1) * gap;
  const gridH = rows * cell + (rows - 1) * gap;
  const pad = Math.round(cell * 0.22);
  const band = title ? Math.round(cell * 0.9) : 0;
  const W = gridW + pad * 2, H = gridH + pad * 2 + band;

  let tiles = "", defs = "";
  cells.forEach((c, i) => {
    const cx = pad + (i % cols) * (cell + gap);
    const cy = pad + Math.floor(i / cols) * (cell + gap);
    if (c.art) {
      defs += `<clipPath id="c${i}"><rect x="${cx}" y="${cy}" width="${cell}" height="${cell}"/></clipPath>`;
      tiles += `<image href="${c.art}" x="${cx}" y="${cy}" width="${cell}" height="${cell}" preserveAspectRatio="xMidYMid slice" clip-path="url(#c${i})"/>`;
    } else {
      tiles += `<rect x="${cx}" y="${cy}" width="${cell}" height="${cell}" fill="${c.mock || "#12121a"}" fill-opacity="0.85"/>`;
    }
  });

  const cap = title
    ? `<text x="${pad}" y="${H - pad - (sub ? Math.round(cell * 0.34) : 4)}" fill="#f8fafc" font-size="${Math.round(cell * 0.34)}" font-weight="700" font-family="sans-serif" letter-spacing="1">${esc(title)}</text>`
      + (sub ? `<text x="${pad}" y="${H - pad + Math.round(cell * 0.04)}" fill="#94a3b8" font-size="${Math.round(cell * 0.19)}" font-family="sans-serif">${esc(sub)}</text>` : "")
    : "";

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>${defs}</defs>
<rect width="${W}" height="${H}" fill="#05050b"/>
${brandStripe(H, { w: Math.max(6, Math.round(cell * 0.05)) })}
${tiles}
${cap}
</svg>`;
}

async function main() {
  const cols = num("cols", 12), rows = num("rows", 7), cell = num("cell", 180), gap = num("gap", 6);
  const kind = arg("pick", "sold");
  const out = arg("out", "public/aeon-collage.png");
  const title = arg("title", "");
  const sub = arg("sub", "");
  const need = cols * rows;

  console.log(`aeon-collage: ${cols}×${rows} = ${need} tiles · pick=${kind}${flag("mock") ? " · MOCK" : ""}`);
  // Ask for more than we need so failed fetches have replacements.
  const pool = pickTokens(kind, Math.min(need * 3, 3333));
  const cells = await gather(pool, need, { mock: flag("mock") });
  if (cells.length < need) console.log(`  only ${cells.length}/${need} tiles resolved — grid will be short`);

  const svg = collageSvg(cells, { cols, rows, cell, gap, title, sub });
  const png = new Resvg(svg, { font: FONT }).render().asPng();
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, png);
  console.log(`  wrote ${out} · ${(png.length / 1024 / 1024).toFixed(2)} MB`);
}

main().catch(e => { console.error("aeon-collage failed —", e.message); process.exit(1); });
