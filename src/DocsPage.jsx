// The city manual, hosted here rather than linked out.
//
// Pages are authored as markdown in docs/ and pre-rendered to HTML at build time by
// scripts/build-docs.mjs — so there is no markdown parser in the browser, and the content can't
// drift from the book. Hosting it on-site also keeps the manual free of third-party branding, an
// author's name in the URL, and Git-sync metadata naming the repo.
//
// Styling follows MethodsPage: one column, rules instead of boxes, no pills or gradients.
import { useEffect, useMemo } from "react";
import { DOCS } from "./docs-content.js";
import { SANS, MONO } from "./chart-ui.jsx";

const DIM = "#7c8a9e", BODY = "#9aa7bb", NEAR = "#cbd5e1", TEXT = "#f1f5f9";
const RULE = "#1c1c21", HEADRULE = "#2a2a31", ACCENT = "#5eead4";

// Prose styling for the generated HTML. Scoped to .doc-body so it can't leak into the rest of the
// site, and written once here rather than inlined per element by the generator.
const CSS = `
.doc-body { font-family: ${SANS}; color: ${BODY}; font-size: 15px; line-height: 1.68; }
.doc-body h1 { font-size: 26px; color: ${TEXT}; font-weight: 700; margin: 0 0 6px; letter-spacing: -0.01em; }
.doc-body h2 { font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: ${DIM};
  border-top: 1px solid ${HEADRULE}; padding-top: 14px; margin: 40px 0 14px; font-weight: 600; }
.doc-body h3 { font-size: 15px; color: ${NEAR}; font-weight: 600; margin: 26px 0 8px; }
.doc-body p { margin: 0 0 14px; }
.doc-body strong { color: ${NEAR}; font-weight: 600; }
.doc-body em { color: ${NEAR}; font-style: italic; }
.doc-body a { color: ${ACCENT}; text-decoration: none; border-bottom: 1px solid rgba(94,234,212,0.3); }
.doc-body a:hover { border-bottom-color: ${ACCENT}; }
.doc-body ul, .doc-body ol { margin: 0 0 16px; padding-left: 20px; }
.doc-body li { margin: 0 0 7px; }
.doc-body code { font-family: ${MONO}; font-size: 12.5px; color: ${NEAR};
  background: rgba(255,255,255,0.05); padding: 1px 5px; border-radius: 4px; }
.doc-body pre { background: rgba(255,255,255,0.03); border: 1px solid ${RULE}; border-radius: 8px;
  padding: 12px 14px; overflow-x: auto; margin: 0 0 16px; }
.doc-body pre code { background: none; padding: 0; font-size: 12px; line-height: 1.6; }
.doc-body table { width: 100%; border-collapse: collapse; margin: 0 0 18px; font-size: 14px; display: block; overflow-x: auto; }
.doc-body th { text-align: left; font-family: ${SANS}; font-size: 11px; letter-spacing: 0.14em;
  text-transform: uppercase; color: ${DIM}; font-weight: 600; padding: 0 14px 8px 0; border-bottom: 1px solid ${HEADRULE}; }
.doc-body td { padding: 9px 14px 9px 0; border-bottom: 1px solid ${RULE}; color: ${BODY}; vertical-align: top; }
.doc-body td strong { color: ${NEAR}; }
.doc-body blockquote { margin: 0 0 16px; padding-left: 14px; border-left: 2px solid ${HEADRULE}; color: ${DIM}; }
.doc-body hr { border: 0; border-top: 1px solid ${RULE}; margin: 30px 0; }
.doc-body .doc-hint { border-left: 2px solid ${ACCENT}; background: rgba(94,234,212,0.05);
  padding: 12px 14px; border-radius: 0 8px 8px 0; margin: 0 0 18px; font-size: 14.5px; }
.doc-body .doc-hint p:last-child { margin-bottom: 0; }
.doc-body .doc-hint-warning { border-left-color: #fbbf24; background: rgba(251,191,36,0.05); }
.doc-body .doc-hint-danger { border-left-color: #f43f5e; background: rgba(244,63,94,0.05); }
.doc-body .doc-hint-success { border-left-color: #4ade80; background: rgba(74,222,128,0.05); }
.doc-nav a { display: block; padding: 5px 0; font-size: 13.5px; color: ${BODY}; text-decoration: none; line-height: 1.45; }
.doc-nav a:hover { color: ${NEAR}; }
.doc-nav a.on { color: ${ACCENT}; font-weight: 600; }
`;

export default function DocsPage({ isMobile, slug, onNavigate }) {
  const page = useMemo(() => DOCS.find(d => d.slug === slug) || DOCS[0], [slug]);

  // Deep links land mid-book; start at the top of the page rather than wherever the reader was.
  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, [slug]);

  // The generated HTML uses ordinary ?view=docs&p=… hrefs so it degrades to real links; intercept
  // them so in-book navigation is client-side and doesn't reload the app.
  const onClick = (e) => {
    const a = e.target.closest?.("a");
    if (!a || a.target === "_blank") return;
    const href = a.getAttribute("href") || "";
    const m = /^\?view=docs&p=([^#]+)/.exec(href);
    if (!m) return;
    e.preventDefault();
    onNavigate?.(decodeURIComponent(m[1]));
  };

  // Sidebar, grouped exactly as SUMMARY.md orders it.
  const groups = useMemo(() => {
    const out = [];
    for (const d of DOCS) {
      const last = out[out.length - 1];
      if (last && last.section === d.section) last.items.push(d);
      else out.push({ section: d.section, items: [d] });
    }
    return out;
  }, []);

  const Nav = (
    <nav className="doc-nav" style={{ fontFamily: SANS }}>
      {groups.map((g, i) => (
        <div key={i} style={{ marginBottom: 18 }}>
          {g.section && (
            <div style={{ fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: DIM, marginBottom: 6, marginTop: i ? 6 : 0 }}>
              {g.section}
            </div>
          )}
          {g.items.map(d => (
            <a key={d.slug} href={`?view=docs&p=${d.slug}`} className={d.slug === page.slug ? "on" : ""}
              onClick={e => { e.preventDefault(); onNavigate?.(d.slug); }}>{d.title}</a>
          ))}
        </div>
      ))}
    </nav>
  );

  const idx = DOCS.findIndex(d => d.slug === page.slug);
  const prev = idx > 0 ? DOCS[idx - 1] : null, next = idx < DOCS.length - 1 ? DOCS[idx + 1] : null;

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: isMobile ? "0 16px 60px" : "0 24px 80px" }}>
      <style>{CSS}</style>

      <div style={{ display: isMobile ? "block" : "grid", gridTemplateColumns: "216px 1fr", gap: 44, alignItems: "start" }}>
        {!isMobile && (
          <aside style={{ position: "sticky", top: 24, maxHeight: "calc(100vh - 48px)", overflowY: "auto", paddingRight: 8 }}>
            <div style={{ fontFamily: SANS, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: DIM, marginBottom: 14 }}>
              The manual
            </div>
            {Nav}
          </aside>
        )}

        <main style={{ minWidth: 0 }}>
          <div style={{ marginBottom: 26 }}>
            <h1 style={{ fontFamily: SANS, fontSize: isMobile ? 24 : 30, color: TEXT, fontWeight: 700, margin: "0 0 6px", letterSpacing: "-0.01em" }}>
              {page.title}
            </h1>
            {page.description && (
              <p style={{ fontFamily: SANS, fontSize: 15, color: DIM, margin: 0, lineHeight: 1.6 }}>{page.description}</p>
            )}
          </div>

          <div className="doc-body" onClick={onClick} dangerouslySetInnerHTML={{ __html: page.html }} />

          <div style={{ display: "flex", justifyContent: "space-between", gap: 14, marginTop: 44, paddingTop: 18, borderTop: `1px solid ${HEADRULE}`, fontFamily: SANS, fontSize: 13.5 }}>
            <span>{prev && <a href={`?view=docs&p=${prev.slug}`} onClick={e => { e.preventDefault(); onNavigate?.(prev.slug); }}
              style={{ color: BODY, textDecoration: "none" }}>← {prev.title}</a>}</span>
            <span>{next && <a href={`?view=docs&p=${next.slug}`} onClick={e => { e.preventDefault(); onNavigate?.(next.slug); }}
              style={{ color: BODY, textDecoration: "none" }}>{next.title} →</a>}</span>
          </div>

          {isMobile && (
            <div style={{ marginTop: 40, paddingTop: 18, borderTop: `1px solid ${HEADRULE}` }}>
              <div style={{ fontFamily: SANS, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: DIM, marginBottom: 12 }}>
                All pages
              </div>
              {Nav}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
