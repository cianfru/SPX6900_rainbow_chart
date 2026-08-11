import { useState, useRef, useEffect, Suspense } from "react";
import { CHART_GROUPS, AEON_GROUPS, CITY_GROUPS, CHART_VIEWS } from "./charts-catalog.js";
import { GCOL } from "./terminal-colors.js";
import ErrorBoundary from "./ErrorBoundary.jsx";

// The terminal cascade nav for the sub-pages — mirrors the ?view=next landing menu
// EXACTLY: same rainbow-band group colours (GCOL), same ALL row, same group→chart
// fly-outs, the same per-row TYPEWRITER effect, and — the one thing the landing
// prototype left to "the React port" — a LIVE render of the real chart in the
// preview panel (not the tweet card). Built from the real catalog so every leaf
// carries a live chart id and drives the app's own routing. Scoped under .tzone.

const LOGO = "/logo_rainbow.png";
const X_URL = "https://x.com/SPX6900Rainbow";
const KRAKEN_URL = "https://proinvite.kraken.com/9f1e/8985jw0l";

const TYPE_SPEED = 60;   // ms/char — the landing's deliberate terminal cadence
const BASE_W = 1180;     // width the real chart renders at before being scaled into the panel
const CONTENT_H = 620;   // clip height (chart header + body; caption cropped)
// three.js-heavy charts would re-initialise on every hover — too costly for a fly-out,
// so these fall back to the deterministic sparkline instead of a live mount.
const HEAVY = new Set(["urpdterrain"]);

// A menu row whose label TYPES itself out on hover (cursor rides the writing head),
// exactly like the landing prototype's typeLbl. The label wrapper locks its min-width
// on first hover so the row can't reflow while the characters stream in.
function MenuRow({ text, color, mark, cls = "", onEnter, onLeave, onClick }) {
  const [shown, setShown] = useState(text);
  const wrapRef = useRef(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const type = () => {
    const lw = wrapRef.current;
    if (lw && !lw.style.minWidth) { const w = lw.getBoundingClientRect().width; if (w) lw.style.minWidth = w + "px"; }
    clearTimeout(timer.current);
    let j = 0;
    const step = () => { setShown(text.slice(0, j)); if (j < text.length) { j++; timer.current = setTimeout(step, TYPE_SPEED); } };
    setShown(""); step();
  };
  const reset = () => { clearTimeout(timer.current); setShown(text); };
  return (
    <div className={"mitem " + cls}
      onMouseEnter={() => { type(); onEnter && onEnter(); }}
      onMouseLeave={() => { reset(); onLeave && onLeave(); }}
      onClick={onClick}>
      <span className="lw" ref={wrapRef}>
        <span className="lbl">{shown}</span>
        <span className="cur" style={{ "--curc": color }}>_</span>
      </span>
      {mark && <span className="mk">{mark}</span>}
    </div>
  );
}

// A LIVE, scaled-down render of the real chart component (same approach as the gallery's
// LivePreview) — this is the "actual look of the chart", not the tweet card.
function LeafPreview({ render }) {
  const ref = useRef(null);
  const [scale, setScale] = useState(0.19);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => { if (el.clientWidth) setScale(el.clientWidth / BASE_W); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="lprevbox" style={{ height: CONTENT_H * scale }}>
      <div style={{ position: "absolute", top: 0, left: 0, width: BASE_W, transformOrigin: "top left", transform: `scale(${scale})`, pointerEvents: "none" }}>
        <ErrorBoundary>
          <Suspense fallback={<div className="lprevload">loading…</div>}>
            <div className="chart-preview">{render()}</div>
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
}

// deterministic sparkline — fallback for locked/heavy charts (same as the landing's mspark)
function Spark({ seed, color }) {
  let s = 2166136261;
  for (let i = 0; i < seed.length; i++) { s ^= seed.charCodeAt(i); s = Math.imul(s, 16777619); }
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const N = 28, W = 300, H = 118, pad = 9; let y = 0.28 + rnd() * 0.2; const ys = [];
  for (let i = 0; i < N; i++) { const drift = (i / N) * 0.5; y += (rnd() - 0.42) * 0.22; y = Math.max(0.06, Math.min(0.94, y * 0.86 + drift * 0.14 + (rnd() - 0.5) * 0.04)); ys.push(y); }
  const pts = ys.map((v, i) => [pad + (W - 2 * pad) * i / (N - 1), pad + (H - 2 * pad) * (1 - v)]);
  const d = "M" + pts.map(p => p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" L");
  const area = d + ` L${pts[N - 1][0].toFixed(1)} ${H - pad} L${pad} ${H - pad} Z`;
  const gid = "tsp" + (s % 99991);
  return (
    <svg className="spk" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ color }}>
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".55" /><stop offset="1" stopColor="currentColor" stopOpacity=".02" /></linearGradient></defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={pts[N - 1][0].toFixed(1)} cy={pts[N - 1][1].toFixed(1)} r="3.4" fill="currentColor" />
    </svg>
  );
}

// A cascading top: ALL + group rows (▸); hovering a group flies out its chart list, and
// hovering a chart flies out the preview panel. Groups coloured by the mockup's GCOL.
function CascadeTop({ label, groups, onSection, onLeaf, renderPreview }) {
  const [leaf, setLeaf] = useState(null); // {gi, item, color}
  const topRef = useRef(null);
  const onEnter = () => {
    const el = topRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    el.classList.toggle("flip", r.left + 660 > window.innerWidth - 12);
  };
  return (
    <div className="mtop" ref={topRef} onMouseEnter={onEnter} onMouseLeave={() => setLeaf(null)}>
      <div className="mhead">{label} <span className="car">▾</span></div>
      <div className="drop">
        <MenuRow text="All" color="var(--live)" cls="allrow" onClick={() => onSection()} />
        {groups.map((g, gi) => { const gc = GCOL[gi % GCOL.length]; return (
          <div className="mgroup" key={g.title} style={{ "--gc": gc }} onMouseLeave={() => setLeaf(l => (l && l.gi === gi ? null : l))}>
            <MenuRow text={g.title} color={gc} mark="▸" cls="grouprow" onClick={() => onSection(g.title)} />
            <div className="subdrop">
              {g.charts.filter(c => !c.dev).map(item => { const views = CHART_VIEWS[item.id]; return (
                <div className="leafwrap" key={item.id}>
                  <MenuRow text={item.title} color={gc} mark={views ? "▾" : "›"} cls="leafrow"
                    onEnter={() => setLeaf({ gi, item, color: gc })}
                    onClick={() => onLeaf(item.id)} />
                  {views && views.map(vw => (
                    <MenuRow key={vw.v} text={vw.label} color={gc} cls="subview"
                      onEnter={() => setLeaf({ gi, item, color: gc })}
                      onClick={() => onLeaf(item.id, vw.v)} />
                  ))}
                </div>
              ); })}
              <div className={"leafprev" + (leaf && leaf.gi === gi ? " on" : "")}>
                {leaf && leaf.gi === gi && (<>
                  <div className="mprev-kick">Preview</div>
                  {(renderPreview && !leaf.item.locked && !HEAVY.has(leaf.item.id))
                    ? <LeafPreview key={leaf.item.id} render={() => renderPreview(leaf.item.id)} />
                    : <Spark seed={leaf.item.id + g.title} color={leaf.color} />}
                  <div className="mprev-title">{leaf.item.title}</div>
                  <div className="mprev-desc">{leaf.item.desc}</div>
                  <div className="mprev-go">→ open chart</div>
                </>)}
              </div>
            </div>
          </div>
        ); })}
      </div>
    </div>
  );
}

// A flat top: a single dropdown of leaf rows (no group fly-out). Used for SPX_CITY,
// which is one page + a couple of charts rather than a multi-group section.
function FlatTop({ label, items }) {
  return (
    <div className="mtop">
      <div className="mhead">{label} <span className="car">▾</span></div>
      <div className="drop">
        {items.map((it, i) => (
          <MenuRow key={i} text={it.label} color={it.color} mark="›" cls="leafrow" onClick={it.onClick} />
        ))}
      </div>
    </div>
  );
}

export default function TerminalNav({ onHome, openGallery, openAeon, openCity, goChart, renderPreview, asOf }) {
  const asOfLabel = asOf ? new Date(asOf).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;
  const cityColor = CITY_GROUPS[0]?.color || "#7dd3fc";
  const cityItems = [
    { label: "SPX City", color: cityColor, onClick: openCity },
    ...(CITY_GROUPS[0]?.charts || []).map(c => ({ label: c.title, color: cityColor, onClick: () => goChart(c.id) })),
  ];
  return (
    <div className="twrap">
      {/* header bar */}
      <div className="tbar">
        <button className="tbrand" onClick={onHome} title="Home">
          <img className="tlogo" src={LOGO} alt="" />
          <b>SPX6900/Rainbow<span className="bcur">_</span></b>
        </button>
        <div className="tbarright">
          <div className="tsocial">
            <a className="siclink" href={X_URL} target="_blank" rel="noopener noreferrer" title="@SPX6900Rainbow on X" aria-label="SPX6900Rainbow on X">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
            </a>
            <a className="siclink krk" href={KRAKEN_URL} target="_blank" rel="noopener noreferrer sponsored" title="Trade on Kraken — affiliate" aria-label="Trade on Kraken (affiliate)">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 12 A8.5 8.5 0 0 1 20.5 12 L20.5 19.4 A1.3 1.3 0 0 1 17.9 19.4 L17.9 14 A1.1 1.1 0 0 0 15.7 14 L15.7 19.4 A1.3 1.3 0 0 1 13.1 19.4 L13.1 14 A1.1 1.1 0 0 0 10.9 14 L10.9 19.4 A1.3 1.3 0 0 1 8.3 19.4 L8.3 14 A1.1 1.1 0 0 0 6.1 14 L6.1 19.4 A1.3 1.3 0 0 1 3.5 19.4 Z" /></svg>
            </a>
          </div>
        </div>
      </div>
      {/* cascade menu */}
      <div className="tmenu">
        <CascadeTop label="CHARTS" groups={CHART_GROUPS} onSection={openGallery} onLeaf={goChart} renderPreview={renderPreview} />
        <FlatTop label="SPX_CITY" items={cityItems} />
        <CascadeTop label="PROJECT_AEON" groups={AEON_GROUPS} onSection={openAeon} onLeaf={goChart} renderPreview={renderPreview} />
        {asOfLabel && <div className="tdataas">Data as of {asOfLabel}</div>}
      </div>
    </div>
  );
}
