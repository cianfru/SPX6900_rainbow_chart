import { useState, useEffect, useRef, useMemo, Suspense } from "react";
import { CHART_GROUPS, AEON_GROUPS, METHOD_FAMILIES, METHOD_OF } from "./charts-catalog.js";
import ErrorBoundary from "./ErrorBoundary.jsx";
import { SANS, MONO, MAX_W } from "./chart-ui.jsx";

// The browse-all "Charts" gallery — an ITC-style grid of preview tiles. Every
// tile opens a FULLY INTERACTIVE chart page (onOpen). The preview is a LIVE,
// scaled-down render of the real chart component (not the tweet card) — the
// actual look of the chart on the site — lazy-mounted as it scrolls into view.

const BASE_W = 1180;   // width the real chart renders at before being scaled to fit
const CONTENT_H = 700; // clip region (chart's header + body, caption cropped off)

// A live mini-preview: mounts the real chart at BASE_W, scales it to the tile
// width and clips it. Non-interactive (pointer-events off → the tile click wins).
function LivePreview({ render }) {
  const ref = useRef(null);
  const [scale, setScale] = useState(0.3);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { if (el.clientWidth) setScale(el.clientWidth / BASE_W); });
    ro.observe(el);
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { setShow(true); io.disconnect(); } }, { rootMargin: "500px" });
    io.observe(el);
    return () => { ro.disconnect(); io.disconnect(); };
  }, []);
  return (
    <div ref={ref} style={{ position: "relative", width: "100%", height: CONTENT_H * scale, overflow: "hidden", background: "#05050e", pointerEvents: "none" }}>
      {!show && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontSize: 12, color: "#475569" }}>loading…</div>}
      {show && (
        <div style={{ position: "absolute", top: 0, left: 0, width: BASE_W, transformOrigin: "top left", transform: `scale(${scale})` }}>
          <ErrorBoundary>
            <Suspense fallback={<div style={{ height: CONTENT_H, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontSize: 26, color: "#475569" }}>loading…</div>}>
              {/* .chart-preview hides the Explain description + zoom hint so the tile shows the
                  actual chart, consistent across every preview (see index.css). */}
              <div className="chart-preview">{render()}</div>
            </Suspense>
          </ErrorBoundary>
        </div>
      )}
    </div>
  );
}

function Tile({ item, color, onOpen, renderPreview }) {
  return (
    <button
      className="pill" onClick={() => onOpen(item.id)} title={`Open the interactive ${item.title} chart`}
      style={{
        display: "flex", flexDirection: "column", textAlign: "left", padding: 0, cursor: "pointer",
        borderRadius: 14, overflow: "hidden", background: "rgba(13,15,28,0.55)",
        border: "1px solid rgba(255,255,255,0.10)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 8px 30px rgba(0,0,0,0.35)",
        "--glow": color,
      }}
    >
      <LivePreview render={() => renderPreview(item.id)} />
      <div style={{ padding: "13px 15px 15px", borderTop: `1px solid ${color}26` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0, boxShadow: `0 0 8px ${color}` }} />
          <span style={{ fontFamily: SANS, fontSize: 16, fontWeight: 700, color: "#f1f5f9", lineHeight: 1.15 }}>{item.title}</span>
        </div>
        <div style={{ fontFamily: SANS, fontSize: 13, color: "#94a3b8", lineHeight: 1.45 }}>{item.desc}</div>
      </div>
    </button>
  );
}

// Match on everything a visitor might type: the chart's name, its description, its
// group, and the name of the method family it belongs to — so "cost basis" finds the
// fifteen charts built on the FIFO reconstruction even though only two say those words.
const haystack = (item, groupTitle) => [
  item.title, item.desc, groupTitle,
  METHOD_FAMILIES.find(f => f.id === METHOD_OF[item.id])?.name ?? "",
].join(" ").toLowerCase();

function SearchBar({ q, setQ, count, total, isMobile }) {
  const ref = useRef(null);
  // ⌘K / Ctrl-K focuses the field from anywhere on the page.
  useEffect(() => {
    const onKey = e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); ref.current?.focus(); ref.current?.select(); }
      if (e.key === "Escape" && document.activeElement === ref.current) { setQ(""); ref.current?.blur(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setQ]);
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 11, maxWidth: 560, margin: "0 auto",
      borderBottom: "1px solid rgba(255,255,255,0.14)", padding: "8px 2px",
    }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7c8a9e" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
        <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
      </svg>
      <input
        ref={ref} value={q} onChange={e => setQ(e.target.value)} type="search"
        aria-label="Search charts by name, description or method"
        placeholder={isMobile ? "Search charts…" : "Search charts — try “cost basis”, “bitcoin”, “rarity”"}
        style={{
          flex: 1, background: "transparent", border: "none", outline: "none",
          fontFamily: SANS, fontSize: 15, color: "#f1f5f9", minWidth: 0,
        }}
      />
      <span style={{ fontFamily: MONO, fontSize: 12, color: "#7c8a9e", flexShrink: 0, whiteSpace: "nowrap" }}>
        {q ? `${count}/${total}` : (isMobile ? `${total}` : "⌘K")}
      </span>
    </div>
  );
}

export default function ChartsGallery({
  isMobile, onOpen, onHome, renderPreview, onOther,
  groups = CHART_GROUPS, title = "Charts", titleGradient = "linear-gradient(90deg,#a78bfa,#22d3ee,#4ade80,#fbbf24,#f7931a)",
  subtitle, showFeatured = true,
}) {
  const [q, setQ] = useState("");
  const nq = q.trim().toLowerCase();
  // Filtered view of the catalog. Groups that lose every chart drop out entirely so
  // the page never shows an empty heading.
  // `dev` charts are in-development. They're hidden from the library for everyone EXCEPT someone
  // who has already unlocked them with the passphrase — otherwise the only way back in is to
  // remember the URL, which is a silly thing to ask of the person building them.
  const unlocked = (() => { try { return localStorage.getItem("spx-city-dev") === "1"; } catch { return false; } })();
  const shown = useMemo(() => groups
    .map(g => ({ ...g, charts: g.charts.filter(c => (unlocked || !c.dev) && (!nq || haystack(c, g.title).includes(nq))) }))
    .filter(g => g.charts.length), [groups, nq, unlocked]);
  // `dev` charts are in-development: routable by direct link (and password-gated there) but
  // deliberately absent from the library so they aren't stumbled on before they're ready.
  const total = groups.reduce((n, g) => n + g.charts.filter(c => unlocked || !c.dev).length, 0);
  const found = shown.reduce((n, g) => n + g.charts.length, 0);
  // The other catalog — Aeon when browsing SPX, SPX when browsing Aeon.
  const otherGroups = groups === CHART_GROUPS ? AEON_GROUPS : CHART_GROUPS;
  const otherName = groups === CHART_GROUPS ? "Project Aeon" : "Charts";
  const otherHits = useMemo(() => !nq ? 0 : otherGroups.reduce(
    (n, g) => n + g.charts.filter(c => haystack(c, g.title).includes(nq)).length, 0), [otherGroups, nq]);
  const sub = subtitle ?? `${total + (showFeatured ? 1 : 0)} interactive ways to look at SPX6900 — tap any chart to open it.`;

  return (
    <div style={{ padding: isMobile ? "8px 4px 48px" : "16px 8px 60px" }}>
      <div style={{ maxWidth: MAX_W, margin: "0 auto 26px", textAlign: "center" }}>
        <h2 style={{
          fontFamily: SANS, fontSize: isMobile ? 26 : 36, fontWeight: 800, margin: "0 0 8px", letterSpacing: "-0.02em",
          background: titleGradient,
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>{title}</h2>
        <div style={{ fontFamily: SANS, fontSize: isMobile ? 14 : 16, color: "#94a3b8" }}>
          {sub}
        </div>
        <div style={{ marginTop: 18 }}>
          <SearchBar q={q} setQ={setQ} count={found} total={total} isMobile={isMobile} />
        </div>
      </div>

      {/* Featured: the Rainbow hero (lives on the home page) — SPX gallery only */}
      {showFeatured && !nq && (
      <div style={{ maxWidth: MAX_W, margin: "0 auto 38px" }}>
        <button
          className="pill" onClick={onHome} title="Open the Rainbow chart"
          style={{
            display: "flex", width: "100%", textAlign: "left", cursor: "pointer", borderRadius: 16, overflow: "hidden",
            padding: isMobile ? "20px 22px" : "30px 36px", gap: 18, alignItems: "center", justifyContent: "space-between",
            background: "linear-gradient(110deg, rgba(167,139,250,0.16), rgba(34,211,238,0.10) 45%, rgba(34,197,94,0.10) 75%, rgba(247,147,26,0.12))",
            border: "1px solid rgba(167,139,250,0.45)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 10px 40px rgba(0,0,0,0.4)", "--glow": "#a78bfa",
          }}
        >
          <div>
            <span style={{ fontFamily: SANS, fontSize: 11, fontWeight: 800, letterSpacing: 1.4, textTransform: "uppercase", color: "#c4b5fd" }}>Featured · Home</span>
            <div style={{ fontFamily: SANS, fontSize: isMobile ? 24 : 32, fontWeight: 800, color: "#f8fafc", lineHeight: 1.1, margin: "6px 0" }}>Rainbow Chart</div>
            <div style={{ fontFamily: SANS, fontSize: isMobile ? 14 : 15.5, color: "#cbd5e1", lineHeight: 1.5, maxWidth: 640 }}>
              The flagship: SPX6900's price across nine power-law valuation bands, from Fire Sale to Sell.
            </div>
          </div>
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M3 16a9 9 0 0 1 18 0" /><path d="M6 16a6 6 0 0 1 12 0" /><path d="M9 16a3 3 0 0 1 6 0" />
          </svg>
        </button>
      </div>
      )}

      {shown.map(group => (
        <div key={group.title} style={{ maxWidth: MAX_W, margin: "0 auto 38px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: group.color, boxShadow: `0 0 10px ${group.color}` }} />
            <h3 style={{ fontFamily: SANS, fontSize: isMobile ? 18 : 22, fontWeight: 800, color: "#f1f5f9", margin: 0, letterSpacing: "-0.01em" }}>{group.title}</h3>
            <span style={{ fontFamily: SANS, fontSize: isMobile ? 12.5 : 14, color: "#7c8a9e" }}>{group.desc}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${isMobile ? 300 : 380}px), 1fr))`, gap: isMobile ? 12 : 16 }}>
            {group.charts.map(item => (
              <Tile key={item.id} item={item} color={group.color} onOpen={onOpen} renderPreview={renderPreview} />
            ))}
          </div>
        </div>
      ))}

      {nq && !found && (
        <div style={{ maxWidth: MAX_W, margin: "0 auto", textAlign: "center", padding: "40px 20px 24px", fontFamily: SANS }}>
          <div style={{ fontSize: 17, color: "#cbd5e1", marginBottom: 8 }}>
            {otherHits ? `Nothing in ${title} matches “${q}”.` : `Nothing matches “${q}”.`}
          </div>
          {!otherHits && (
            <div style={{ fontSize: 14, color: "#7c8a9e" }}>
              Try a method instead — <em>cost basis</em>, <em>power-law</em>, <em>exchange</em>, <em>races</em>.
            </div>
          )}
        </div>
      )}

      {nq && otherHits > 0 && onOther && (
        <div style={{ maxWidth: MAX_W, margin: "0 auto 30px", textAlign: "center" }}>
          <button className="pill" onClick={onOther} style={{
            fontFamily: SANS, fontSize: 14, color: "#cbd5e1", cursor: "pointer",
            background: "rgba(45,212,191,0.08)", border: "1px solid rgba(45,212,191,0.35)",
            borderRadius: 999, padding: "8px 18px", "--glow": "#2dd4bf",
          }}>
            {otherHits} more match{otherHits === 1 ? "" : "es"} in <strong style={{ color: "#f1f5f9" }}>{otherName}</strong> →
          </button>
        </div>
      )}

    </div>
  );
}
