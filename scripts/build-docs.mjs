// ============================================================================
// DOCS → SITE. Pre-render the manual at BUILD time into a bundled module.
// ============================================================================
//   node scripts/build-docs.mjs        (runs automatically as part of `npm run build`)
//
// The manual is authored as markdown in docs/ — one source. SUMMARY.md is the table of contents.
// (It keeps the GitBook markdown shape — SUMMARY.md / `{% hint %}` — from when the book was mirrored
// there, but the GitBook mirror is retired; the site at ?view=docs is the canonical home now.)
// This converts it to HTML once, at build time, so the site hosts the book itself:
//
//   • no runtime markdown dependency — `marked` is a devDependency and never reaches the browser
//   • the generated module is code-split, so the docs cost the main bundle nothing
//   • hosting it ourselves means the manual carries no third-party branding, no author name in a
//     URL, and no Git-sync metadata naming the repo — the reasons we stopped linking out for it
//
// Structure comes from SUMMARY.md so the sidebar can never drift from the book's own contents.
// ============================================================================
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { marked } from "marked";

const ROOT = resolve(process.cwd(), "docs");
const OUT = resolve(process.cwd(), "src/docs-content.js");

// ---- front matter ----------------------------------------------------------
// GitBook puts a one-line `description:` at the top of most pages; we lift it out and show it as
// the page subtitle rather than letting it render as a stray horizontal rule + text.
function frontMatter(src) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src);
  if (!m) return { body: src, description: "" };
  const d = /description:\s*(?:>-?\s*)?([\s\S]*?)$/m.exec(m[1]);
  const description = d ? d[1].split("\n").map(s => s.trim()).filter(Boolean).join(" ").replace(/^["']|["']$/g, "") : "";
  return { body: src.slice(m[0].length), description };
}

// ---- mermaid ---------------------------------------------------------------
// GitBook renders ```mermaid fences as diagrams; the site has no mermaid runtime and pulling one in
// (~500 KB) for the single flowchart in the book is a bad trade. The fence is dropped here and kept
// in the source, so GitBook still draws it and the site shows the prose + table that say the same
// thing directly beneath it. If the book ever leans on diagrams, render them properly instead.
const dropMermaid = (src) => src.replace(/```mermaid[\s\S]*?```/g, "");

// ---- GitBook hint blocks ---------------------------------------------------
// {% hint style="info" %} … {% endhint %} → a callout div the page styles. Rendered through marked
// so the markdown INSIDE a hint (bold, links) still works.
function hints(src) {
  return src.replace(/\{%\s*hint\s+style="(\w+)"\s*%\}([\s\S]*?)\{%\s*endhint\s*%\}/g,
    (_, style, inner) => `\n<div class="doc-hint doc-hint-${style}">\n\n${inner.trim()}\n\n</div>\n`);
}

// ---- link rewriting --------------------------------------------------------
// In-book links are relative .md paths (../navigating.md, reading-a-building/height.md). On the site
// every page is a query param, so they become ?view=docs&p=<slug>. External links are left alone and
// get target=_blank added later.
const slugOf = (p) => p.replace(/\.md$/, "").replace(/\/README$/, "").replace(/^README$/, "index") || "index";
function rewriteLinks(html, fromDir) {
  return html.replace(/href="([^"]+)"/g, (whole, href) => {
    if (/^(https?:|mailto:|#)/.test(href)) return whole;
    const [path, hash = ""] = href.split("#");
    if (!path.endsWith(".md")) return whole;
    const abs = join(fromDir, path).replace(/\\/g, "/");
    const slug = slugOf(abs.replace(/^\.\//, ""));
    return `href="?view=docs&p=${encodeURIComponent(slug)}${hash ? "#" + hash : ""}"`;
  });
}

// ---- SUMMARY.md → ordered, sectioned nav ----------------------------------
function parseSummary(src) {
  const items = [];
  let section = "";
  for (const line of src.split("\n")) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) { section = h[1]; continue; }
    const l = /^\s*\*\s+\[([^\]]+)\]\(([^)]+)\)/.exec(line);
    if (l) items.push({ title: l[1], file: l[2], section });
  }
  return items;
}

function main() {
  const summary = readFileSync(join(ROOT, "SUMMARY.md"), "utf8");
  const nav = parseSummary(summary);
  const pages = [];

  for (const item of nav) {
    const abs = join(ROOT, item.file);
    if (!existsSync(abs)) { console.warn(`build-docs: missing ${item.file} (in SUMMARY, not on disk)`); continue; }
    const raw = readFileSync(abs, "utf8");
    const { body, description } = frontMatter(raw);
    let html = marked.parse(hints(dropMermaid(body)), { mangle: false, headerIds: true });
    html = rewriteLinks(html, dirname(item.file));
    // The page renders its own title from SUMMARY, so drop the markdown's leading <h1> — otherwise
    // every page shows its name twice. Only the FIRST one, and only if it leads the document.
    html = html.replace(/^\s*<h1[^>]*>[\s\S]*?<\/h1>\s*/, "");
    // Defensive: if a block was stripped (e.g. a diagram) and left a heading with nothing under it,
    // drop the orphaned heading rather than render an empty section.
    html = html.replace(/<h([23])[^>]*>[\s\S]*?<\/h\1>\s*(?=<h[23]|$)/g, "");
    // external links open in a new tab; internal (?view=) stay in place
    html = html.replace(/<a href="(https?:[^"]+)"/g, '<a target="_blank" rel="noopener noreferrer" href="$1"');
    pages.push({ slug: slugOf(item.file), title: item.title, section: item.section, description, html });
  }

  const body = `// GENERATED by scripts/build-docs.mjs — do not edit.\n` +
    `// Source of truth: docs/*.md (hosted on-site at ?view=docs). Run \`npm run build\` to regenerate.\n` +
    `export const DOCS = ${JSON.stringify(pages)};\n`;
  writeFileSync(OUT, body);
  const kb = (Buffer.byteLength(body) / 1024).toFixed(0);
  console.log(`build-docs: ${pages.length} pages → src/docs-content.js (${kb} KB)`);
}

main();
