import { useState, useRef, useEffect, Suspense, Fragment } from "react";
import { CHART_GROUPS, AEON_GROUPS, CITY_GROUPS, CHART_VIEWS } from "./charts-catalog.js";
import { GCOL } from "./terminal-colors.js";
import ErrorBoundary from "./ErrorBoundary.jsx";
import { themeWave } from "./theme-wave.js";
import { TERMINAL_KEY } from "./terminal-gate-key.js";
import { CITY_KEY } from "./city-gate-key.js";

// The terminal cascade nav for the sub-pages, mirrors the ?view=next landing menu
// EXACTLY: same rainbow-band group colours (GCOL), same ALL row, same group→chart
// fly-outs, the same per-row TYPEWRITER effect, and, the one thing the landing
// prototype left to "the React port", a LIVE render of the real chart in the
// preview panel (not the tweet card). Built from the real catalog so every leaf
// carries a live chart id and drives the app's own routing. Scoped under .tzone.

const LOGO = "/logo_rainbow.png";
const X_URL = "https://x.com/SPX6900Rainbow";
const KRAKEN_URL = "https://proinvite.kraken.com/9f1e/8985jw0l";

const TYPE_SPEED = 60;   // ms/char, the landing's deliberate terminal cadence
const BASE_W = 1180;     // width the real chart renders at before being scaled into the panel
const CONTENT_H = 620;   // clip height (chart header + body; caption cropped)
// three.js-heavy charts would re-initialise on every hover, too costly for a fly-out,
// so these (and the locked cities) show the isometric Scene3D placeholder, not a live mount.
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

// Character-by-character typewriter, shared by the section headers (types on hover) and the
// mobile drill-down rows (types on tap) so the sleek effect matches the landing everywhere.
function useTypewriter(text, speed = 45) {
  const [shown, setShown] = useState(text);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => { setShown(text); }, [text]);
  const type = () => { clearTimeout(timer.current); let j = 0; const step = () => { setShown(text.slice(0, j)); if (j < text.length) { j++; timer.current = setTimeout(step, speed); } }; setShown(""); step(); };
  const reset = () => { clearTimeout(timer.current); setShown(text); };
  return { shown, type, reset };
}

// A section header (label + caret) that types its label out on hover, the trigger is on the
// whole header so hovering anywhere over it fires (desktop parity with the landing).
function TypeHead({ label }) {
  const { shown, type, reset } = useTypewriter(label);
  // The tab reserves its FULL label width with an invisible ghost and overlays the streaming
  // text, so the header never resizes while typing — otherwise it grows char-by-char and shoves
  // the neighbouring tabs (the reported flicker).
  return (
    <div className="mhead" onMouseEnter={type} onMouseLeave={reset}>
      <span className="mhead-t">
        <span className="mhead-ghost" aria-hidden="true">{label}</span>
        <span className="mhead-type">{shown}</span>
      </span> <span className="car">▾</span>
    </div>
  );
}

// A LIVE, scaled-down render of the real chart — the actual look of the chart, not the tweet card,
// matching the gallery tiles so previews are consistent everywhere. The earlier flicker came from
// remounting this on EVERY leaf as you swept the menu; the fix is a hover-intent debounce in
// CascadeTop (only mount once the cursor settles on a row), not swapping in a static card.
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

// Honest fly-out placeholder for the three.js charts (the locked cities + the HEAVY 3D terrain).
// They can't cheaply live-mount on every hover, and a line sparkline misrepresents a 3D scene —
// so draw a deterministic isometric block field (towers/terrain) instead. Reads as "a 3D scene",
// never as a chart it isn't. Coloured by the group; seeded so each chart looks stable.
function Scene3D({ seed, color }) {
  let s = 2166136261;
  for (let i = 0; i < seed.length; i++) { s ^= seed.charCodeAt(i); s = Math.imul(s, 16777619); }
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const W = 300, H = 118, tw = 16, th = 8.5, cx0 = 150, cy0 = 40, GX = 5, GY = 4;
  const cells = [];
  for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) cells.push({ i, j, h: 8 + rnd() * 30 });
  cells.sort((a, b) => (a.i + a.j) - (b.i + b.j)); // back-to-front so nearer towers overlap correctly
  return (
    <svg className="spk" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ color }}>
      {cells.map((c, k) => {
        const bx = cx0 + (c.i - c.j) * tw, by = cy0 + (c.i + c.j) * th, h = c.h;
        const top = `${bx},${by - h - th} ${bx + tw},${by - h} ${bx},${by - h + th} ${bx - tw},${by - h}`;
        const left = `${bx - tw},${by - h} ${bx},${by - h + th} ${bx},${by + th} ${bx - tw},${by}`;
        const right = `${bx},${by - h + th} ${bx + tw},${by - h} ${bx + tw},${by} ${bx},${by + th}`;
        return (
          <g key={k}>
            <polygon points={left} fill="currentColor" fillOpacity="0.20" />
            <polygon points={right} fill="currentColor" fillOpacity="0.40" />
            <polygon points={top} fill="currentColor" fillOpacity="0.80" stroke="currentColor" strokeOpacity="0.25" strokeWidth="0.5" />
          </g>
        );
      })}
    </svg>
  );
}

// Dark ↔ bright theme toggle (mirrors the landing switch; shares localStorage 'spx_theme').
function ThemeToggle() {
  const [light, setLight] = useState(() => typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "light");
  const toggle = () => {
    const next = !light; setLight(next);
    // Pixelated diagonal wipe reveals the new theme; the swap runs inside (and is guaranteed
    // to run even if the effect can't) so the toggle is never blocked by the animation.
    themeWave(next, () => {
      document.documentElement.setAttribute("data-theme", next ? "light" : "");
      try { localStorage.setItem("spx_theme", next ? "bright" : "dark"); } catch { /* private mode */ }
    });
  };
  return (
    <button className="tthemebtn" onClick={toggle} aria-label="Toggle dark / bright theme" title={light ? "Switch to dark" : "Switch to bright"}>
      {light
        ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" fill="currentColor" /></svg>
        : <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="4.2" /><path d="M12 2v2.6M12 19.4V22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2 12h2.6M19.4 12H22M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" /></svg>}
    </button>
  );
}

// A cascading top: ALL + group rows (▸); hovering a group flies out its chart list, and
// hovering a chart flies out the preview panel. Groups coloured by the mockup's GCOL.
function CascadeTop({ label, groups, onSection, onLeaf, renderPreview }) {
  const [leaf, setLeaf] = useState(null); // {gi, item, color}
  const topRef = useRef(null);
  // hover-intent: only mount the live preview once the cursor SETTLES on a row (~150ms), so sweeping
  // the menu never mounts/unmounts a chart per row (the old flicker) while still showing the real chart.
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const showLeaf = p => { clearTimeout(timer.current); timer.current = setTimeout(() => setLeaf(p), 150); };
  const clearLeaf = () => { clearTimeout(timer.current); setLeaf(null); };
  const onEnter = () => {
    const el = topRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    el.classList.toggle("flip", r.left + 660 > window.innerWidth - 12);
  };
  return (
    <div className="mtop" ref={topRef} onMouseEnter={onEnter} onMouseLeave={clearLeaf}>
      <TypeHead label={label} />
      <div className="drop">
        <MenuRow text="All" color="var(--live)" cls="allrow" onClick={() => onSection()} />
        {groups.map((g, gi) => { const gc = GCOL[gi % GCOL.length];
          const leaves = g.charts.filter(c => !c.dev);
          // ONE compact column of main charts. A chart's alternate views (Bars / Heatmap / 3D …) are
          // NOT inlined here (that made the column run off-screen and forced an ugly 2-col split) —
          // they fly out as a THIRD lateral panel on hover, alongside the live preview.
          return (
          <div className="mgroup" key={g.title} style={{ "--gc": gc }} onMouseLeave={() => { clearTimeout(timer.current); setLeaf(l => (l && l.gi === gi ? null : l)); }}>
            <MenuRow text={g.title} color={gc} mark="▸" cls="grouprow" onClick={() => onSection(g.title)} />
            <div className="subdrop">
              {leaves.map(item => { const views = CHART_VIEWS[item.id]; return (
                <MenuRow key={item.id} text={item.title} color={gc} mark={views ? "▸" : "›"} cls="leafrow"
                  onEnter={() => showLeaf({ gi, item, color: gc })}
                  onClick={() => onLeaf(item.id)} />
              ); })}
              <div className={"leafprev" + (leaf && leaf.gi === gi ? " on" : "")}>
                {leaf && leaf.gi === gi && (<>
                  {CHART_VIEWS[leaf.item.id] && (
                    <div className="leafviews">
                      <div className="mprev-kick">Views</div>
                      <button className="leafview" onClick={() => onLeaf(leaf.item.id)}>All</button>
                      {CHART_VIEWS[leaf.item.id].map(vw => (
                        <button key={vw.v} className="leafview" onClick={() => onLeaf(leaf.item.id, vw.v)}>{vw.label}</button>
                      ))}
                    </div>
                  )}
                  <div className="mprev-kick">Preview</div>
                  {(leaf.item.locked || HEAVY.has(leaf.item.id))
                    ? <Scene3D seed={leaf.item.id + g.title} color={leaf.color} />
                    : <LeafPreview key={leaf.item.id} render={() => renderPreview(leaf.item.id)} />}
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
      <TypeHead label={label} />
      <div className="drop">
        {items.map((it, i) => (
          <MenuRow key={i} text={it.label} color={it.color} mark="›" cls="leafrow" onClick={it.onClick} />
        ))}
      </div>
    </div>
  );
}

// One row of the mobile drill-down, types its label on tap (the landing's sleek effect).
function MobRow({ label, chev, cls = "", onTap }) {
  const { shown, type } = useTypewriter(label);
  return (
    <button className={"tmob-row " + cls} onClick={() => { type(); onTap && onTap(); }}>
      <span className="tmob-lbl">{shown}<span className="tmob-cur">_</span></span>
      {chev != null && <span className="tmob-chev">{chev}</span>}
    </button>
  );
}

// ── MOBILE SPRINGBOARD — the app-launcher nav, ported from the landing so the whole app matches.
// Sections → groups → charts as tappable tiles; chart tiles show a live preview (or the Scene3D
// placeholder for the three.js charts). Each drill is a
// real history entry, so the iOS edge-swipe and Android back button walk back up the levels natively.
const SB_ICON = {
  rainbow: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 16a9 9 0 0 1 18 0" /><path d="M6 16a6 6 0 0 1 12 0" /><path d="M9 16a3 3 0 0 1 6 0" /></svg>,
  charts: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>,
  city: <svg viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="10" width="3.2" height="10" rx="1" /><rect x="10.4" y="5" width="3.2" height="15" rx="1" /><rect x="16.8" y="12" width="3.2" height="8" rx="1" /></svg>,
  aeon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 4 7v10l8 5 8-5V7z" /><path d="M12 22V12" /><path d="M4 7l8 5 8-5" /></svg>,
};
const sbCount = groups => groups.reduce((n, g) => n + g.charts.filter(c => !c.dev).length, 0);
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Faint per-section background motif for the fullscreen 2×2 launcher — gives each quadrant identity.
const SB_MOTIF = {
  rainbow: <svg viewBox="0 0 120 80" preserveAspectRatio="xMidYMax slice" fill="none" stroke="currentColor"><path d="M-6 78a66 66 0 0 1 132 0" strokeWidth="7" /><path d="M12 78a48 48 0 0 1 96 0" strokeWidth="7" /><path d="M30 78a30 30 0 0 1 60 0" strokeWidth="7" /><path d="M48 78a12 12 0 0 1 24 0" strokeWidth="7" /></svg>,
  charts: <svg viewBox="0 0 120 80" preserveAspectRatio="xMidYMax slice" fill="currentColor"><rect x="6" y="46" width="12" height="34" rx="2" /><rect x="26" y="30" width="12" height="50" rx="2" /><rect x="46" y="52" width="12" height="28" rx="2" /><rect x="66" y="20" width="12" height="60" rx="2" /><rect x="86" y="38" width="12" height="42" rx="2" /><rect x="106" y="10" width="12" height="70" rx="2" /></svg>,
  city: <svg viewBox="0 0 120 80" preserveAspectRatio="xMidYMax slice" fill="currentColor"><rect x="4" y="44" width="16" height="36" /><rect x="24" y="28" width="16" height="52" /><rect x="44" y="52" width="14" height="28" /><rect x="62" y="18" width="18" height="62" /><rect x="84" y="38" width="14" height="42" /><rect x="102" y="26" width="16" height="54" /></svg>,
  aeon: <svg viewBox="0 0 120 80" preserveAspectRatio="xMidYMid slice" fill="none" stroke="currentColor" strokeWidth="5" strokeLinejoin="round"><path d="M60 8 96 28v34L60 82 24 62V28z" /><path d="M60 82V44M24 28l36 16 36-16" /></svg>,
};

// A fullscreen quadrant — one section, its colour washed across the tile, a big icon + a background
// motif, the name and count. Tapping drills in (or navigates for Rainbow).
function SbQuad({ id, color, icon, name, sub, onTap }) {
  return (
    <button className="tsbcell" style={{ "--tc": color }} onClick={onTap}>
      <span className="tsbcellbg" aria-hidden="true">{SB_MOTIF[id]}</span>
      <span className="tsbcellico">{icon}</span>
      <span className="tsbcellnm">{name}</span>
      <span className="tsbcellsub">{sub}</span>
      <span className="tsbcellarrow" aria-hidden="true">→</span>
    </button>
  );
}

// A lazy LIVE mini-chart — the real chart component scaled to the tile, mounted only when it scrolls
// into view (the gallery's approach). Makes the launcher show the actual charts, not placeholders.
function SbPreview({ render, spark }) {
  const ref = useRef(null);
  const [scale, setScale] = useState(0.16);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => { if (el.clientWidth) setScale(el.clientWidth / BASE_W); });
    ro.observe(el);
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { setShow(true); io.disconnect(); } }, { rootMargin: "400px" });
    io.observe(el);
    return () => { ro.disconnect(); io.disconnect(); };
  }, []);
  return (
    <div ref={ref} className="tsbprev" style={{ height: spark ? 104 : CONTENT_H * scale }}>
      {spark ? spark : show && (
        <div style={{ position: "absolute", top: 0, left: 0, width: BASE_W, transformOrigin: "top left", transform: `scale(${scale})`, pointerEvents: "none" }}>
          <ErrorBoundary><Suspense fallback={null}><div className="chart-preview">{render()}</div></Suspense></ErrorBoundary>
        </div>
      )}
    </div>
  );
}

// Section / group launcher tile — a terminal panel: group-colour left edge, a mono micro-label
// (the path / count), the title, and a subtle chevron. The data-dense, squared look of the site.
function SbNavTile({ color, kicker, icon, name, sub, onTap }) {
  return (
    <button className="tsbtile tsbnav" style={{ "--tc": color }} onClick={onTap}>
      <span className="tsbedge" />
      <span className="tsbhd">
        {icon ? <span className="tsbico">{icon}</span> : <span className="tsbkick">{kicker}</span>}
        <span className="tsbchev">›</span>
      </span>
      <span className="tsbnm">{name}</span>
      <span className="tsbsub">{sub}</span>
    </button>
  );
}

// Chart tile — the live mini-chart, a group micro-label in the group colour, and the title, exactly
// the gallery tile so the launcher reads as the same product.
function SbChartTile({ item, color, group, render, spark, onTap }) {
  return (
    <button className="tsbtile tsbchart" style={{ "--tc": color }} onClick={onTap}>
      <SbPreview render={render} spark={spark} />
      <span className="tsbmeta">
        <span className="tsbcat">{group}</span>
        <span className="tsbnm">{item.title}</span>
      </span>
    </button>
  );
}

function MobileSpringboard({ open, onClose, openRainbow, openGallery, openAeon, openCity, goChart, renderPreview, me, onDeepField }) {
  const [stack, setStack] = useState([{ t: "sections" }]);
  const view = stack[stack.length - 1];
  const go = fn => { onClose(); fn && fn(); };
  const push = v => { setStack(s => [...s, v]); try { window.history.pushState({ tsb: true }, ""); } catch { /* */ } };
  useEffect(() => { if (open) setStack([{ t: "sections" }]); }, [open]);
  // hardware / swipe back walks up a level (or closes at the root)
  useEffect(() => {
    if (!open) return;
    const onPop = () => setStack(s => (s.length > 1 ? s.slice(0, -1) : (onClose(), s)));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [open, onClose]);
  const back = () => { if (stack.length > 1) window.history.back(); };
  // jump straight to the four-section launcher from any depth
  const home = () => { if (stack.length > 1) setStack([{ t: "sections" }]); };

  const SECS = [
    { id: "rainbow", name: "Rainbow", sub: "the foundation chart", color: "#a78bfa", onTap: () => go(openRainbow) },
    { id: "charts", name: "Charts", groups: CHART_GROUPS, color: GCOL[1], onAll: () => go(openGallery) },
    { id: "city", name: "SPX City", groups: CITY_GROUPS, single: true, color: GCOL[2], onAll: () => go(openCity) },
    { id: "aeon", name: "Project Aeon", groups: AEON_GROUPS, color: GCOL[3], onAll: () => go(openAeon) },
  ];

  let title = "Explore", cmd = "ls ./", grid = "nav", tiles = null;
  if (view.t === "sections") {
    grid = "quad";
    tiles = SECS.map(sec => {
      const onTap = sec.onTap ? sec.onTap
        : sec.single ? () => push({ t: "charts", secId: sec.id })
          : () => push({ t: "groups", secId: sec.id });
      const sub = sec.sub || (sec.single ? `${sbCount(sec.groups)} charts` : `${sec.groups.length} groups · ${sbCount(sec.groups)} charts`);
      return <SbQuad key={sec.id} id={sec.id} icon={SB_ICON[sec.id]} color={sec.color} name={sec.name} sub={sub} onTap={onTap} />;
    });
  } else if (view.t === "groups") {
    const sec = SECS.find(s => s.id === view.secId); title = sec.name; cmd = `ls ./${slug(sec.name)}`;
    tiles = sec.groups.map((g, i) => <SbNavTile key={g.title} kicker={sec.name} color={GCOL[i % GCOL.length]} name={g.title}
      sub={`${g.charts.filter(c => !c.dev).length} charts`} onTap={() => push({ t: "charts", secId: sec.id, grp: g.title })} />);
  } else if (view.t === "charts") {
    const sec = SECS.find(s => s.id === view.secId);
    const g = view.grp ? sec.groups.find(x => x.title === view.grp) : sec.groups[0];
    title = view.grp || sec.name; cmd = `ls ./${slug(sec.name)}/${slug(g.title)}`; grid = "charts";
    const gc = GCOL[sec.groups.indexOf(g) % GCOL.length];
    tiles = g.charts.filter(c => !c.dev).map(c => {
      const heavy = c.locked || HEAVY.has(c.id);
      return <SbChartTile key={c.id} item={c} color={gc} group={g.title}
        spark={heavy ? <Scene3D seed={c.id + g.title} color={gc} /> : null}
        render={() => renderPreview(c.id)} onTap={() => go(() => goChart(c.id))} />;
    });
  }

  return (
    <div className={"tsb" + (open ? " open" : "")} aria-hidden={!open}>
      <div className="tsbtop">
        <button className="tsbbtn" onClick={back} style={{ visibility: stack.length > 1 ? "visible" : "hidden" }} aria-label="Back">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>
        </button>
        <button className="tsbbtn" onClick={home} style={{ visibility: stack.length > 1 ? "visible" : "hidden" }} aria-label="All sections">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="7" height="7" rx="1.6" /><rect x="13" y="4" width="7" height="7" rx="1.6" /><rect x="4" y="13" width="7" height="7" rx="1.6" /><rect x="13" y="13" width="7" height="7" rx="1.6" /></svg>
        </button>
        <span className="tsbtitle">{title}</span>
        <button className="tsbbtn" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" /></svg>
        </button>
      </div>
      <div className={"tsbbody" + (grid === "quad" ? " tsbbody-fill" : "")}>
        <div className="tsbcmd"><span className="tsbprompt">spx6900 ~ %</span> {cmd}</div>
        <div className="tsbrule" />
        <div className={"tsbgrid tsbgrid-" + grid}>{tiles}</div>
        {/* Deep Field — the members area, surfaced as a full-width strip under the launcher so it's
            discoverable on phones too (logged in → member home; signed out → the X login). */}
        {view.t === "sections" && (
          <button className="tsbdf" onClick={() => go(onDeepField)}>
            <span className="tsbdftx"><b>Deep Field</b><span>{me && me.loggedIn ? "members home · your charts" : "log in with X to enter"}</span></span>
            <span className="tsbdfarrow" aria-hidden="true">→</span>
          </button>
        )}
      </div>
    </div>
  );
}

// (retired) the old list-style phone drill-down — replaced by MobileSpringboard above.
function MobileMenu({ open, onClose, openRainbow, openGallery, openAeon, openCity, goChart }) {
  const [sec, setSec] = useState(null);
  const [grp, setGrp] = useState(null);
  const nav = (fn) => { onClose(); if (fn) fn(); };
  const toggleSec = (k) => { setGrp(null); setSec(s => (s === k ? null : k)); };
  const Section = ({ k, label, groups, allLabel, onAll, single }) => (
    <>
      <MobRow label={label} chev={sec === k ? "▲" : "▾"} cls="tmob-sec" onTap={() => toggleSec(k)} />
      {sec === k && (
        <div className="tmob-sub">
          <MobRow label={allLabel} cls="tmob-all" onTap={() => nav(onAll)} />
          {single
            ? groups[0].charts.filter(c => !c.dev).map(c => (
                <MobRow key={c.id} label={c.title} cls="tmob-leaf" onTap={() => nav(() => goChart(c.id))} />))
            : groups.map(g => (
                <Fragment key={g.title}>
                  <MobRow label={g.title} chev={grp === g.title ? "▲" : "▾"} cls="tmob-grp" onTap={() => setGrp(x => (x === g.title ? null : g.title))} />
                  {grp === g.title && (
                    <div className="tmob-sub2">
                      {g.charts.filter(c => !c.dev).map(c => (
                        <MobRow key={c.id} label={c.title} cls="tmob-leaf" onTap={() => nav(() => goChart(c.id))} />))}
                    </div>
                  )}
                </Fragment>))}
        </div>
      )}
    </>
  );
  return (
    <div className={"tmobmenu" + (open ? " open" : "")} aria-hidden={!open}>
      <div className="tmobhead">
        <span className="tmobtitle">Menu</span>
        <button className="tmobclose" onClick={onClose} aria-label="Close menu">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" /></svg>
        </button>
      </div>
      <div className="tmobbody">
        <MobRow label="Rainbow" cls="tmob-rainbow" onTap={() => nav(openRainbow)} />
        <Section k="charts" label="Charts" groups={CHART_GROUPS} allLabel="All charts" onAll={openGallery} />
        <Section k="city" label="SPX City" groups={CITY_GROUPS} allLabel="Open the city" onAll={openCity} single />
        <Section k="aeon" label="Project Aeon" groups={AEON_GROUPS} allLabel="All Aeon charts" onAll={openAeon} />
      </div>
    </div>
  );
}

export default function TerminalNav({ onHome, openRainbow, openGallery, openAeon, openCity, goChart, renderPreview, asOf, me, onDeepField }) {
  const asOfLabel = asOf ? new Date(asOf).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;
  const cityColor = CITY_GROUPS[0]?.color || "#7dd3fc";
  const cityItems = [
    { label: "SPX City", color: cityColor, onClick: openCity },
    ...(CITY_GROUPS[0]?.charts || []).map(c => ({ label: c.title, color: cityColor, onClick: () => goChart(c.id) })),
  ];
  const [mobOpen, setMobOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const authRef = useRef(null);
  useEffect(() => {
    if (!authOpen) return;
    const away = e => { if (authRef.current && !authRef.current.contains(e.target)) setAuthOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [authOpen]);
  const logout = () => {
    try { localStorage.removeItem(TERMINAL_KEY); localStorage.removeItem(CITY_KEY); localStorage.removeItem("df-home"); } catch { /* private */ }
    fetch("/api/auth?action=logout", { cache: "no-store" }).catch(() => {}).finally(() => { window.location.href = "/"; });
  };
  return (
    <div className="twrap">
      {/* header bar */}
      <div className="tbar">
        <button className="tbrand" onClick={onHome} title="Home">
          <img className="tlogo" src={LOGO} alt="" />
          <b>SPX6900/Rainbow<span className="bcur">_</span></b>
        </button>
        <div className="tbarright">
          <ThemeToggle />
          <div className="tsocial">
            {/* Deep Field login/identity — same squared icon style, consistent with the landing. Logged
                in → the member's X avatar (→ Deep Field); signed out → an accented login icon (→ X OAuth). */}
            {me && me.loggedIn ? (
              <span className="dfmenu" ref={authRef}>
                <button type="button" className="siclink dfauth authed" onClick={() => setAuthOpen(o => !o)} title={me.username ? `@${me.username}` : "Account"} aria-label="Account menu" aria-expanded={authOpen}>
                  {me.avatar
                    ? <img src={me.avatar} alt="" referrerPolicy="no-referrer" onError={e => { e.currentTarget.style.display = "none"; }} />
                    : <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="3.2" /><path d="M5 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5" strokeLinecap="round" /></svg>}
                </button>
                {authOpen && (
                  <span className="dfdrop">
                    {me.username && <a className="dfdrop-who" href={`https://x.com/${me.username}`} target="_blank" rel="noopener">@{me.username}</a>}
                    <MenuRow text="Deep Field" color="var(--live)" mark="›" cls="dfdrop-row" onClick={() => { setAuthOpen(false); onDeepField(); }} />
                    <MenuRow text="Log out" color="var(--live)" mark="›" cls="dfdrop-row" onClick={() => { setAuthOpen(false); logout(); }} />
                  </span>
                )}
              </span>
            ) : (
              <a className="siclink dfauth" href="/api/auth?action=login" title="Log in with X — enter Deep Field" aria-label="Log in with X to enter Deep Field">
                <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /></svg>
              </a>
            )}
            <a className="siclink" href={X_URL} target="_blank" rel="noopener noreferrer" title="@SPX6900Rainbow on X" aria-label="SPX6900Rainbow on X">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
            </a>
            <a className="siclink krk" href={KRAKEN_URL} target="_blank" rel="noopener noreferrer sponsored" title="Trade on Kraken, affiliate" aria-label="Trade on Kraken (affiliate)">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 12 A8.5 8.5 0 0 1 20.5 12 L20.5 19.4 A1.3 1.3 0 0 1 17.9 19.4 L17.9 14 A1.1 1.1 0 0 0 15.7 14 L15.7 19.4 A1.3 1.3 0 0 1 13.1 19.4 L13.1 14 A1.1 1.1 0 0 0 10.9 14 L10.9 19.4 A1.3 1.3 0 0 1 8.3 19.4 L8.3 14 A1.1 1.1 0 0 0 6.1 14 L6.1 19.4 A1.3 1.3 0 0 1 3.5 19.4 Z" /></svg>
            </a>
          </div>
          <button className="tmobtog" onClick={() => setMobOpen(true)} aria-label="Open charts" aria-expanded={mobOpen}>
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
          </button>
        </div>
      </div>
      {/* cascade menu */}
      <div className="tmenu">
        {openRainbow && <div className="mtop mtop-rainbow" onClick={openRainbow} style={{ cursor: "pointer" }} title="The Rainbow, the foundation chart">
          <div className="mhead"><span className="rbword">RAINBOW</span></div>
        </div>}
        <CascadeTop label="CHARTS" groups={CHART_GROUPS} onSection={openGallery} onLeaf={goChart} renderPreview={renderPreview} />
        <FlatTop label="SPX_CITY" items={cityItems} />
        <CascadeTop label="PROJECT_AEON" groups={AEON_GROUPS} onSection={openAeon} onLeaf={goChart} renderPreview={renderPreview} />
        {/* Deep Field — the members area, surfaced as a first-class nav tab so visitors discover it.
            Routes to the Deep Field page, which self-gates: members get the charts, everyone else gets
            the branded gate + "log in with X" CTA. */}
        <div className="mtop mtop-deepfield" onClick={() => onDeepField()}
          style={{ cursor: "pointer" }} title={me && me.loggedIn ? "Deep Field — members home" : "Deep Field — log in with X to enter"}>
          <div className="mhead"><span className="dfword">DEEP FIELD</span></div>
        </div>
        {asOfLabel && <div className="tdataas">Data as of {asOfLabel}</div>}
      </div>
      <MobileSpringboard open={mobOpen} onClose={() => setMobOpen(false)} openRainbow={openRainbow} openGallery={openGallery} openAeon={openAeon} openCity={openCity} goChart={goChart} renderPreview={renderPreview} me={me} onDeepField={onDeepField} />
    </div>
  );
}
