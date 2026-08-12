import { useState, useEffect, useRef, useMemo, Suspense } from "react";
import { CHART_GROUPS, AEON_GROUPS, METHOD_FAMILIES, METHOD_OF } from "./charts-catalog.js";
import { gcolFor } from "./terminal-colors.js";
import ErrorBoundary from "./ErrorBoundary.jsx";
import { SANS, MONO, MAX_W } from "./chart-ui.jsx";

// The browse-all "Charts" gallery, a terminal-styled grid of preview tiles. Every
// tile opens a FULLY INTERACTIVE chart page (onOpen). The preview is a LIVE,
// scaled-down render of the real chart component (not the tweet card), the
// actual look of the chart on the site, lazy-mounted as it scrolls into view.
//
// The visual language matches the ?view=next terminal landing: near-black ground,
// squared panels with thin borders that light up in the group colour on hover,
// uppercase mono micro-labels, and the rainbow hairline as the brand rule.

// terminal palette — points at the .tzone CSS vars so the gallery flips with the dark/bright theme
// (the gallery renders inside .tzone; inline var() styles resolve against its themed tokens).
const T = {
  panelA: "var(--panel)", panelB: "var(--panel2)",
  line: "var(--line)", line2: "var(--line2)",
  tx: "var(--tx)", dim: "var(--dim)", faint: "var(--faint)", live: "var(--live)",
  ground: "var(--panel2)",
};
// the brand rule, the rainbow bands as a hairline, violet → red
const RAINBOW = "linear-gradient(90deg,#7c3aed,#2563eb,#06b6d4,#10b981,#a3e635,#fde047,#fb923c,#ef4444)";

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
    <div ref={ref} style={{ position: "relative", width: "100%", height: CONTENT_H * scale, overflow: "hidden", background: T.ground, pointerEvents: "none" }}>
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

// A locked chart shows this instead of a live preview: a clean lock over a faint, generic
// silhouette. Deliberately NOT the real render, the point of `locked` is that you don't see the
// city until you're in, and it never mounts the chart, so the gallery pays no three.js cost for it.
function LockedCover({ color }) {
  return (
    <div style={{
      position: "relative", width: "100%", aspectRatio: "1180 / 700", overflow: "hidden",
      background: "radial-gradient(130% 130% at 50% 20%, #101a33 0%, #05050e 72%)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 9,
    }}>
      {/* generic skyline, not the data, just enough to say "a city" without previewing it */}
      <svg viewBox="0 0 120 34" preserveAspectRatio="none" aria-hidden="true"
        style={{ position: "absolute", left: 0, right: 0, bottom: 0, width: "100%", height: "44%", opacity: 0.16 }}>
        {[[6,14],[14,22],[22,9],[30,27],[40,17],[49,31],[60,12],[69,24],[80,19],[90,29],[101,15],[110,23]].map(([x, h], i) => (
          <rect key={i} x={x} y={34 - h} width="7" height={h} fill={color} />
        ))}
      </svg>
      <div style={{ position: "relative", fontSize: 30, lineHeight: 1 }}>🔒</div>
      <div style={{ position: "relative", fontFamily: MONO, fontSize: 11.5, letterSpacing: ".16em", textTransform: "uppercase", color }}>Password&nbsp;protected</div>
    </div>
  );
}

function Tile({ item, color, onOpen, renderPreview }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={() => onOpen(item.id)}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)} onBlur={() => setHover(false)}
      title={item.locked ? `${item.title}, password protected` : `Open the interactive ${item.title} chart`}
      style={{
        display: "flex", flexDirection: "column", textAlign: "left", padding: 0, cursor: "pointer",
        borderRadius: 10, overflow: "hidden",
        background: `linear-gradient(180deg, ${T.panelA}, ${T.panelB})`,
        border: `1px solid ${hover ? color : T.line2}`,
        boxShadow: hover ? `0 0 0 1px ${color}, 0 12px 28px rgba(0,0,0,0.55)` : "0 8px 24px rgba(0,0,0,0.35)",
        transform: hover ? "translateY(-2px)" : "none",
        transition: "transform .14s, box-shadow .14s, border-color .14s",
      }}
    >
      {item.locked
        ? <LockedCover color={color} />
        : <LivePreview render={() => renderPreview(item.id)} />}
      <div style={{ padding: "12px 14px 14px", borderTop: `1px solid ${color}2e` }}>
        <div style={{
          fontFamily: MONO, fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase",
          color: hover ? color : T.faint, marginBottom: 7, transition: "color .14s",
        }}>{item.cat || ""}</div>
        <div style={{ fontFamily: SANS, fontSize: 15.5, fontWeight: 700, color: T.tx, lineHeight: 1.15, marginBottom: 5 }}>{item.title}</div>
        <div style={{ fontFamily: SANS, fontSize: 12.5, color: T.dim, lineHeight: 1.45 }}>{item.desc}</div>
      </div>
    </button>
  );
}

// Match on everything a visitor might type: the chart's name, its description, its
// group, and the name of the method family it belongs to, so "cost basis" finds the
// fifteen charts built on the FIFO reconstruction even though only two say those words.
const haystack = (item, groupTitle) => [
  item.title, item.desc, groupTitle,
  METHOD_FAMILIES.find(f => f.id === METHOD_OF[item.id])?.name ?? "",
].join(" ").toLowerCase();

function SearchBar({ q, setQ, count, total, isMobile }) {
  const ref = useRef(null);
  const [focus, setFocus] = useState(false);
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
      display: "flex", alignItems: "center", gap: 10, maxWidth: 560, margin: "0 auto",
      border: `1px solid ${focus ? T.live : T.line2}`, borderRadius: 8,
      background: `linear-gradient(180deg, ${T.panelA}, ${T.panelB})`,
      padding: "9px 13px", transition: "border-color .14s",
    }}>
      <span style={{ fontFamily: MONO, fontSize: 13, color: T.live, flexShrink: 0 }}>&gt;</span>
      <input
        ref={ref} value={q} onChange={e => setQ(e.target.value)} type="search"
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        aria-label="Search charts by name, description or method"
        placeholder={isMobile ? "grep charts…" : "grep charts, “cost basis”, “bitcoin”, “rarity”"}
        style={{
          flex: 1, background: "transparent", border: "none", outline: "none",
          fontFamily: MONO, fontSize: 14, color: T.tx, minWidth: 0, letterSpacing: ".01em",
        }}
      />
      <span style={{ fontFamily: MONO, fontSize: 11, color: T.faint, flexShrink: 0, whiteSpace: "nowrap", letterSpacing: ".08em" }}>
        {q ? `${count}/${total}` : (isMobile ? `${total}` : "⌘K")}
      </span>
    </div>
  );
}

export default function ChartsGallery({
  isMobile, onOpen, onHome, renderPreview, onOther,
  groups = CHART_GROUPS, title = "Charts", titleGradient,
  subtitle, showFeatured = true, onlyGroup = null,
}) {
  const [q, setQ] = useState("");
  const nq = q.trim().toLowerCase();
  // When a nav group is clicked, restrict the whole page to that one section.
  const baseGroups = useMemo(() => onlyGroup ? groups.filter(g => g.title === onlyGroup) : groups, [groups, onlyGroup]);
  // Filtered view of the catalog. Groups that lose every chart drop out entirely so
  // the page never shows an empty heading. Each surviving chart carries its group as
  // `cat` so the tile can print the category micro-label.
  // `dev` charts (City Lab) are internal: reachable by direct link, password-gated there, and NEVER
  // listed here. `locked` charts (SPX City) ARE listed; the tile just wears a lock (see Tile).
  const shown = useMemo(() => baseGroups
    .map(g => ({ ...g, charts: g.charts.filter(c => !c.dev && (!nq || haystack(c, g.title).includes(nq))).map(c => ({ ...c, cat: g.title })) }))
    .filter(g => g.charts.length), [baseGroups, nq]);
  const total = baseGroups.reduce((n, g) => n + g.charts.filter(c => !c.dev).length, 0);
  const found = shown.reduce((n, g) => n + g.charts.length, 0);
  // The other catalog, Aeon when browsing SPX, SPX when browsing Aeon.
  const otherGroups = groups === CHART_GROUPS ? AEON_GROUPS : CHART_GROUPS;
  const otherName = groups === CHART_GROUPS ? "Project Aeon" : "Charts";
  const otherHits = useMemo(() => !nq ? 0 : otherGroups.reduce(
    (n, g) => n + g.charts.filter(c => haystack(c, g.title).includes(nq)).length, 0), [otherGroups, nq]);
  const sub = subtitle ?? `${total + (showFeatured ? 1 : 0)} interactive ways to look at SPX6900, tap any chart to open it.`;
  const scope = title === "Project Aeon" ? "aeon" : "charts";
  const cmd = onlyGroup ? `ls ./${scope}/${onlyGroup.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : `ls ./${scope} --all`;

  return (
    <div style={{ padding: isMobile ? "8px 4px 48px" : "16px 8px 60px" }}>
      {/* ── terminal header: command prompt · big title · rainbow hairline · search ── */}
      <div style={{ maxWidth: MAX_W, margin: "0 auto 30px" }}>
        <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: ".08em", color: T.live, marginBottom: 10 }}>
          <span style={{ color: T.faint }}>spx6900 ~ %</span> {cmd}
        </div>
        <h2 style={{
          fontFamily: SANS, fontSize: isMobile ? 30 : 46, fontWeight: 800, margin: "0 0 4px",
          letterSpacing: "-0.02em", color: T.tx, textTransform: "uppercase", lineHeight: 1,
        }}>{title}</h2>
        <div style={{ height: 3, borderRadius: 2, background: RAINBOW, margin: "12px 0 14px", maxWidth: 620 }} />
        <div style={{ fontFamily: SANS, fontSize: isMobile ? 13.5 : 15.5, color: T.dim, maxWidth: 720, lineHeight: 1.5 }}>
          {sub}
        </div>
        <div style={{ marginTop: 20 }}>
          <SearchBar q={q} setQ={setQ} count={found} total={total} isMobile={isMobile} />
        </div>
      </div>

      {/* Featured: the Rainbow hero (lives on the home page), SPX gallery only */}
      {showFeatured && !nq && (
      <div style={{ maxWidth: MAX_W, margin: "0 auto 38px" }}>
        <button
          onClick={onHome} title="Open the Rainbow chart"
          style={{
            display: "flex", width: "100%", textAlign: "left", cursor: "pointer", borderRadius: 12, overflow: "hidden",
            padding: isMobile ? "20px 22px" : "28px 34px", gap: 18, alignItems: "center", justifyContent: "space-between",
            background: `linear-gradient(180deg, ${T.panelA}, ${T.panelB})`,
            border: `1px solid ${T.line2}`, position: "relative",
            boxShadow: "0 10px 40px rgba(0,0,0,0.4)",
          }}
        >
          {/* the rainbow rule runs down the featured tile's left edge, the brand mark */}
          <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: RAINBOW }} />
          <div style={{ paddingLeft: 6 }}>
            <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, letterSpacing: ".16em", textTransform: "uppercase", color: T.faint }}>Featured · Home</span>
            <div style={{ fontFamily: SANS, fontSize: isMobile ? 24 : 32, fontWeight: 800, color: T.tx, lineHeight: 1.05, margin: "8px 0 7px", textTransform: "uppercase", letterSpacing: "-0.01em" }}>Rainbow Chart</div>
            <div style={{ fontFamily: SANS, fontSize: isMobile ? 13.5 : 15, color: T.dim, lineHeight: 1.5, maxWidth: 640 }}>
              The flagship: SPX6900's price across nine power-law valuation bands, from Fire Sale to Sell.
            </div>
          </div>
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={T.live} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M3 16a9 9 0 0 1 18 0" /><path d="M6 16a6 6 0 0 1 12 0" /><path d="M9 16a3 3 0 0 1 6 0" />
          </svg>
        </button>
      </div>
      )}

      {shown.map(group => { const gc = gcolFor(group.title); return (
        <div key={group.title} style={{ maxWidth: MAX_W, margin: "0 auto 40px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 15, flexWrap: "wrap" }}>
            <span style={{
              fontFamily: "var(--mono)", fontSize: 13, letterSpacing: ".14em", textTransform: "uppercase",
              color: T.tx, fontWeight: 600,
            }}>{group.title}<span className="tgcur" style={{ "--curc": gc }}>_</span></span>
            <span style={{ fontFamily: MONO, fontSize: 12, color: T.faint }}>[{group.charts.length}]</span>
            <span style={{ fontFamily: SANS, fontSize: isMobile ? 12.5 : 13.5, color: T.dim }}>{group.desc}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${isMobile ? 300 : 372}px), 1fr))`, gap: isMobile ? 12 : 15 }}>
            {group.charts.map(item => (
              <Tile key={item.id} item={item} color={gc} onOpen={onOpen} renderPreview={renderPreview} />
            ))}
          </div>
        </div>
      ); })}

      {nq && !found && (
        <div style={{ maxWidth: MAX_W, margin: "0 auto", textAlign: "center", padding: "40px 20px 24px", fontFamily: SANS }}>
          <div style={{ fontSize: 16, color: T.tx, marginBottom: 8 }}>
            {otherHits ? `Nothing in ${title} matches “${q}”.` : `Nothing matches “${q}”.`}
          </div>
          {!otherHits && (
            <div style={{ fontFamily: MONO, fontSize: 13, color: T.faint }}>
              try a method, <em style={{ color: T.dim, fontStyle: "normal" }}>cost basis</em>, <em style={{ color: T.dim, fontStyle: "normal" }}>power-law</em>, <em style={{ color: T.dim, fontStyle: "normal" }}>exchange</em>, <em style={{ color: T.dim, fontStyle: "normal" }}>races</em>
            </div>
          )}
        </div>
      )}

      {nq && otherHits > 0 && onOther && (
        <div style={{ maxWidth: MAX_W, margin: "0 auto 30px", textAlign: "center" }}>
          <button onClick={onOther} style={{
            fontFamily: MONO, fontSize: 12.5, color: T.tx, cursor: "pointer", letterSpacing: ".04em",
            background: `linear-gradient(180deg, ${T.panelA}, ${T.panelB})`, border: `1px solid ${T.line2}`,
            borderRadius: 8, padding: "9px 18px",
          }}>
            {otherHits} more in <strong style={{ color: T.live }}>{otherName}</strong> →
          </button>
        </div>
      )}

    </div>
  );
}
