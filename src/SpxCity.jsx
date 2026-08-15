import { useMemo, useState, useEffect, useRef, lazy, Suspense } from "react";
import { loadWhales, loadOnchain, loadAeon, loadAeonSales, loadCityTimeline } from "./history-data.js";
import { AEON_ONCHAIN } from "./aeon-onchain.js";
import { shortAddr } from "./WalletCard.jsx";
import CityControls from "./CityControls.jsx";
import CityRecorder from "./CityRecorder.jsx";
import CityWallet from "./CityWallet.jsx";
import { loadNotes } from "./city-messages.js";
import { SANS, MONO, MAX_W, Metric, Explain, TypeTab } from "./chart-ui.jsx";

const Skyline3D = lazy(() => import("./Skyline3D.jsx"));

// SPX CITY — one city, three populations. Formerly two separate pages (Whale City and Aeon City)
// that shared an engine but duplicated a wrapper.
//
// ⭐ THE RULE THAT MADE THE MERGE POSSIBLE: ONE RESIDENCY RULE PER MODE, AND HEIGHT ALWAYS COMES
// FROM THE ASSET THE MODE IS ABOUT. The old Aeon page had an "AEON + SPX" toggle that folded a
// wallet's SPX balance into its height by rescaling it onto the NFT axis. That was a presentational
// choice, not a measurement — there is no honest exchange rate between "148 NFTs" and "14M tokens".
// It was defensible as a labelled overlay on a dedicated page; it is not defensible sitting next to
// two modes that mean something.
//
// So BOTH mode is a FILTER, never a blend: it is the SPX city, restricted to the residents who also
// collect AEON. Height means exactly what it means in SPX mode. That keeps the promise the whole
// city rests on — being in it always says the same thing about you — true inside every mode, which
// a blended axis would have quietly broken.
const MODES = [
  { id: "spx",  label: "SPX",  unit: "holder",   accent: "#c4b5fd", asset: "SPX" },
  { id: "both", label: "Both", unit: "resident", accent: "#7dd3fc", asset: "SPX + AEON" },
  { id: "aeon", label: "AEON", unit: "collector", accent: "#5eead4", asset: "AEON" },
];

const fmt = n => (Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(1) + "M" : Math.abs(n) >= 1e3 ? (n / 1e3).toFixed(0) + "k" : String(Math.round(n)));

// Each control group glows in the colour of the THING IT CONTROLS, so the panel reads as a set of
// distinct instruments rather than one monochrome strip: flow cyan (the 7/30-day beams), arcs violet
// (the trade beams are literally 0xa78bfa in the scene), time amber (the replay), and each mode its
// own accent. Nothing here is decorative — the colour is the mapping.
const GLOW = { flow: "#22d3ee", arcs: "#a78bfa", time: "#fbbf24", reset: "#94a3b8", full: "#f472b6" };

// Landmark moments on the time-machine slider, so you can pinpoint a timeframe instead of scrubbing
// blind. Dates are the real price-history extrema (see build note); the slider maps each to its week.
const TM_EVENTS = {
  SPX: [
    { d: "2023-10-25", label: "First pump" },
    { d: "2025-07-27", label: "ATH" },
    { d: "2026-02-05", label: "Capitulation" },
  ],
  AEON: [],
};

// Balance at week W from sparse change-points — the client twin of the builder's balanceAt
// (test/city-timeline.test.mjs pins the semantics: zero before the first point, hold between).
const balAt = (p, w) => { let lo = 0, hi = p.length - 1, ans = 0; while (lo <= hi) { const m = (lo + hi) >> 1; if (p[m][0] <= w) { ans = p[m][1]; lo = m + 1; } else hi = m - 1; } return ans; };

export default function SpxCity({ isMobile, preview = false, initialMode = "spx" }) {
  const [mode, setMode] = useState(initialMode);
  const [whales, setWhales] = useState(null);
  const [aeon, setAeon] = useState(AEON_ONCHAIN);
  const [win, setWin] = useState(30);
  const [sel, setSel] = useState(null);
  const [recording, setRecording] = useState(false);   // hide chrome during an orbital screen-record
  const [layout, setLayout] = useState("city");
  const [focus, setFocus] = useState(null);
  const [focusN, setFocusN] = useState(0);   // bumped so re-picking the same building still moves
  const goTo = a => { setFocus(a); setFocusN(n => n + 1); };
  const [msgs, setMsgs] = useState(null);
  const [time, setTime] = useState("dusk");
  const [infra, setInfra] = useState(null);
  const [sales, setSales] = useState(null);
  // ⭐ ARCS ARRIVE OFF, AND HAVE A MIDDLE SETTING. Drawn all at once they crowd the sky — 111 lines
  // over a city whose own signal is the buildings — so the city has to open calm and let the arcs be
  // asked for. The middle setting exists because the two halves of the set are not equally
  // readable: "traced" is only the trades connecting two standing buildings, which is the clean
  // picture you can actually follow, while "all" adds the departures whose counterparty has left.
  // A plain on/off would have forced a choice between a busy sky and hiding two thirds of the market.
  const [arcMode, setArcMode] = useState("off");
  // ⏱ the time machine: null = now (the live city), otherwise a week index into the timeline.
  // `pend` is only the label while dragging — the scene rebuild waits for the debounce, because a
  // 5,000-building rebuild per slider pixel would fight the drag itself.
  const [tmOn, setTmOn] = useState(false);
  const [tl, setTl] = useState(null);
  const [week, setWeek] = useState(null);
  const [pend, setPend] = useState(null);
  const tmTimer = useRef(null);
  // 🖥 VIEWPORT. The city used to sit in a fixed 580px letterbox, which is a small window onto a
  // two-kilometre island. It now takes a generous share of the screen by default and can go full
  // screen outright. Fullscreen is done as a fixed overlay rather than the Fullscreen API because
  // iOS Safari refuses requestFullscreen on anything that isn't a <video>; the overlay behaves the
  // same everywhere, and Esc still exits.
  const [full, setFull] = useState(false);
  const [beamAll, setBeamAll] = useState(false);   // flow-beam cutoff: false = decisive movers only
  const [winH, setWinH] = useState(() => (typeof window === "undefined" ? 800 : window.innerHeight));
  useEffect(() => {
    const onR = () => setWinH(window.innerHeight);
    window.addEventListener("resize", onR);
    return () => window.removeEventListener("resize", onR);
  }, []);
  useEffect(() => {
    if (!full) return;
    const onKey = e => { if (e.key === "Escape") setFull(false); };
    // stop the page scrolling behind the overlay
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [full]);
  // Full screen leaves room for the hint + exit button; inline is a big share of the window, floored
  // so a short laptop screen still gets a usable city.
  const viewH = full ? Math.max(320, winH - 52) : Math.max(isMobile ? 460 : 620, Math.round(winH * (isMobile ? 0.62 : 0.78)));

  const M = MODES.find(m => m.id === mode) || MODES[0];

  useEffect(() => { let off = false; loadWhales().then(d => { if (!off) setWhales(d ?? false); }); return () => { off = true; }; }, []);
  useEffect(() => { let off = false; loadAeon().then(d => { if (!off && d) setAeon(d); }); return () => { off = true; }; }, []);
  useEffect(() => { let off = false; loadOnchain().then(r => { if (!off && r?.length) setInfra(r[r.length - 1]); }); return () => { off = true; }; }, []);
  // Notes are per-city, and the city is now one — so they all live under "spx" rather than staying
  // split across the two old boards.
  useEffect(() => { let off = false; loadNotes("spx").then(m => { if (!off) setMsgs(m); }); return () => { off = true; }; }, []);
  // The time machine's data loads only when someone opens it, and per asset. BOTH mode has no
  // honest replay (it would need HISTORICAL AEON ownership joined to HISTORICAL SPX balances at
  // every week — buildable, but not yet built), so the toggle simply doesn't exist there.
  useEffect(() => {
    if (!tmOn || mode === "both") return;
    let off = false;
    loadCityTimeline(mode === "aeon" ? "aeon" : "spx").then(d => { if (!off) setTl(d); });
    return () => { off = true; };
  }, [tmOn, mode]);

  // Trades are only fetched for the mode that can draw them.
  useEffect(() => {
    if (mode !== "aeon" || sales) return;
    let off = false; loadAeonSales().then(d => { if (!off && d) setSales(d); }); return () => { off = true; };
  }, [mode, sales]);

  // AEON holdings by address, so BOTH mode can filter the SPX city and the card can show the count.
  const aeonBy = useMemo(() => {
    const m = new Map();
    for (const h of aeon?.holders || []) if (h.a && h.n > 0) m.set(h.a.toLowerCase(), h);
    return m;
  }, [aeon]);

  // ⚠ MEMOISED DELIBERATELY. Skyline3D rebuilds its entire scene when `towers` changes identity, and
  // a rebuild replays the arrival flight. Built inline these were new arrays every render, so
  // clicking a building flew you back out over the bay.
  const liveTowers = useMemo(() => {
    if (mode === "aeon") {
      const hs = (aeon?.holders || []).filter(h => h.a && h.n > 0);
      if (!hs.length) return null;
      const maxN = Math.max(1, ...hs.map(h => h.n));
      const maxDays = Math.max(1, ...hs.map(h => h.days || 0));
      return hs.map(h => ({
        ...h,
        score: (h.n / maxN) * (0.45 + 0.55 * ((h.days || 0) / maxDays)),
        ageT: (h.days || 0) / maxDays,
        flow: h.f30 || 0,
      }));
    }
    // The city is its RESIDENTS only. whales.json also carries ≥100k whales of any tenure (for the
    // Whales Watching monitor), flagged res:false — filter them out here so the city keeps its
    // 90-day residency rule. `res !== false` keeps older files (no flag) fully populated.
    const ws = (whales?.wallets || []).filter(w => w.res !== false);
    if (!ws.length) return null;
    const pool = mode === "both" ? ws.filter(w => aeonBy.has((w.a || "").toLowerCase())) : ws;
    if (!pool.length) return [];
    // Scale within the mode's own population, so a filtered city still uses its full height range
    // rather than squashing every collector against the one whale who happens to own an NFT.
    const maxDays = Math.max(...pool.map(w => w.days), 1);
    const maxBal = Math.max(...pool.map(w => w.bal), 1);
    return pool.map(w => ({
      ...w,
      aeonN: aeonBy.get((w.a || "").toLowerCase())?.n || 0,
      score: (w.bal / maxBal) * (0.45 + 0.55 * (w.days / maxDays)),
      ageT: w.days / maxDays,
      flow: w[`d${win}`] ?? 0,
    }));
  }, [mode, whales, aeon, aeonBy, win]);

  // ⏱ THE CITY AT WEEK W — replayed from net balances, under the SAME residency bar as the live
  // city (SPX: 5,000 held 90 days; AEON: own one). "Held" here means days since the wallet last
  // stood at zero — a sold-out-and-returned wallet starts its clock again. Flow is the balance
  // change vs four weeks earlier, the replay's version of the live 30-day window.
  const histTowers = useMemo(() => {
    if (week == null || !tl || mode === "both") return null;
    const W = Math.min(week, tl.n - 1);
    const rows = [];
    for (const w of tl.wallets) {
      const bal = balAt(w.p, W);
      if (bal < tl.threshold) continue;
      let runStart = null, atZero = true;
      for (const [wk, b] of w.p) {
        if (wk > W) break;
        if (b === 0) { atZero = true; runStart = null; }
        else if (atZero) { runStart = wk; atZero = false; }
      }
      const days = runStart == null ? 0 : (W - runStart) * 7;
      // ⭐ You can't be asked to hold longer than the token has existed. The live city's bar is
      // "5,000 held 90 days", but for the first ~13 weeks of the replay NOBODY can have held 90 days
      // yet (launch was week 0), so a strict bar returned an EMPTY set — and an empty rebuild makes
      // Skyline3D early-return and FREEZE on the last frame (the "First pump doesn't work" bug). So
      // before the token is 90 days old the bar is "held since it was possible" = min(90, age). This
      // also makes the launch era a real story: the pump's 849 buyers thinning to the ~129 who held.
      if (tl.asset === "SPX" && days < Math.min(90, W * 7)) continue;
      rows.push({ a: w.a, bal, n: bal, days, flow: bal - balAt(w.p, W - 4) });
    }
    const maxBal = Math.max(1, ...rows.map(r => r.bal));
    const maxDays = Math.max(1, ...rows.map(r => r.days));
    return rows.map(r => ({ ...r, score: (r.bal / maxBal) * (0.45 + 0.55 * (r.days / maxDays)), ageT: r.days / maxDays }));
  }, [week, tl, mode]);

  const towers = histTowers ?? liveTowers;

  // ⭐ CITIZENSHIP IS THE UNION OF EVERY MODE, NOT WHATEVER IS ON SCREEN. There is one city and one
  // noticeboard, so holding either asset makes you a resident — gating the right to post on the
  // toggle you happen to be holding would mean an AEON collector was a citizen on Tuesday and a
  // stranger on Wednesday for no reason they did anything about.
  //
  // It reads the FULL populations rather than `visible`, because `visible` is also cut by the
  // buildings-to-render control — which would otherwise have made a genuine holder's right to leave
  // a note depend on a performance setting.
  const citizens = useMemo(() => {
    const s = new Set();
    for (const w of whales?.wallets || []) if (w.a) s.add(w.a.toLowerCase());
    for (const h of aeon?.holders || []) if (h.a && h.n > 0) s.add(h.a.toLowerCase());
    return s;
  }, [whales, aeon]);

  const stats = useMemo(() => {
    if (!towers) return null;
    const add = towers.filter(t => t.flow > 0).length, cut = towers.filter(t => t.flow < 0).length;
    return { add, cut, net: towers.reduce((s, t) => s + t.flow, 0) };
  }, [towers]);

  // Every resident is rendered — the building-count control is gone (the city handles the full set,
  // and picking a number was clutter). Still sorted biggest-first so the crown lands on #1.
  // ⭐ RECAP RENDER CAP. The full city (~4,900 buildings) can't be rendered on a GPU-less runner, so
  // the hands-off weekly card is shot from a capped skyline: ?recap caps to the top-N by score
  // (default 500 — a real downtown of the biggest holders, and the hero building is always a top
  // wallet so it's included). Only affects the automated CI render; the live site never sets ?recap.
  const recapOpts = useMemo(() => {
    if (typeof window === "undefined") return { cap: 0, hero: null };
    const p = new URLSearchParams(window.location.search);
    if (!p.has("recap")) return { cap: 0, hero: null };
    return { cap: Math.max(50, Number(p.get("recapN") || 500) || 500), hero: (p.get("focusHero") || "").toLowerCase() || null };
  }, []);
  const visible = useMemo(() => {
    if (!towers) return null;
    const sorted = towers.slice().sort((a, b) => b.score - a.score);
    if (!recapOpts.cap) return sorted;
    const capped = sorted.slice(0, recapOpts.cap);
    // ALWAYS keep the focused hero in frame — a low cap for fast rendering must never drop the very
    // building the shot is about (the hero can rank well below the cap; e.g. a weekly riser at #335).
    if (recapOpts.hero && !capped.some(t => String(t.a || "").toLowerCase() === recapOpts.hero)) {
      const h = sorted.find(t => String(t.a || "").toLowerCase() === recapOpts.hero);
      if (h) capped.push(h);
    }
    return capped;
  }, [towers, recapOpts]);

  // ⭐ ARCS ARE AN NFT-ONLY FACT, NOT A MISSING FEATURE ELSEWHERE. An NFT sale names both wallets
  // and its price; a token transfer normally ends at an exchange, where the counterparty is a hot
  // wallet and the trade it stands for is invisible. So the coin modes have no honest equivalent
  // to draw, and the toggle only appears where the data actually supports it.
  const arcs = useMemo(() => {
    if (mode !== "aeon" || arcMode === "off" || week != null) return null;   // arcs are a last-30d fact — meaningless mid-replay
    const tr = sales?.trades;
    if (!tr?.length || !towers) return null;
    if (arcMode === "all") return tr;
    // "traced" keeps only the trades with a building at BOTH ends — the ones you can follow from
    // seller to buyer without being told where the other half went.
    const here = new Set(towers.map(t => (t.a || "").toLowerCase()));
    return tr.filter(t => here.has(t.f) && here.has(t.to));
  }, [mode, arcMode, sales, towers, week]);
  const arcStat = useMemo(() => {
    const tr = sales?.trades;
    if (!tr?.length || !towers) return null;
    const here = new Set(towers.map(t => (t.a || "").toLowerCase()));
    let both = 0, one = 0;
    for (const t of tr) {
      const f = here.has(t.f), b = here.has(t.to);
      if (f && b) both++; else if (f || b) one++;
    }
    return { total: tr.length, both, one, gone: tr.length - both - one, days: sales.arcDays ?? 30,
      eth: tr.reduce((s, t) => s + (t.eth || 0), 0) };
  }, [sales, towers]);
  // ⭐ WHO'S BUYING — the readout that makes the arcs actionable. The lines show flow; this ranks it,
  // so "one wallet scooped N" is a number you can read off the page and then click to verify (it flies
  // to their building). NET of any sales in the window, so "accumulating" is honest — a wallet that
  // bought 5 and sold 3 is +2, not +5. From the same marketplace trades the arcs draw, fully checkable.
  const accum = useMemo(() => {
    const tr = sales?.trades;
    if (!tr?.length) return null;
    const nameOf = new Map((towers || []).map(t => [(t.a || "").toLowerCase(), t.ens]));
    const inCity = new Set((towers || []).map(t => (t.a || "").toLowerCase()));
    const m = new Map();
    const row = a => { let e = m.get(a); if (!e) { e = { a, bought: 0, sold: 0, ethIn: 0, usdIn: 0, days: new Set() }; m.set(a, e); } return e; };
    for (const t of tr) {
      const b = row(t.to); b.bought++; b.ethIn += t.eth || 0; b.usdIn += t.usd || 0; if (t.d) b.days.add(t.d);
      row(t.f).sold++;
    }
    return [...m.values()]
      .map(e => ({ ...e, net: e.bought - e.sold, ens: nameOf.get(e.a), resident: inCity.has(e.a), days: e.days.size }))
      .filter(e => e.net > 0)
      .sort((x, y) => y.net - x.net || y.bought - x.bought || y.usdIn - x.usdIn)
      .slice(0, 6);
  }, [sales, towers]);

  if (whales == null && mode !== "aeon") return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading city…</div>;
  if (!towers) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Data is being reconstructed — check back after the next on-chain refresh.</div>;

  const isNft = mode === "aeon";
  const flowSub = week != null ? "vs 4 weeks earlier" : null;
  const sizeOf = t => (isNft ? `${t.n} AEON` : `${fmt(t.bal)} SPX`);
  const flowUnit = isNft ? "AEON" : "SPX";
  const flowWin = isNft ? 30 : win;

  const pinCard = t => `
      <div style="padding:9px 12px 7px">
        ${t.hood ? `<div style="color:${M.accent};font:700 10.5px 'Space Grotesk',system-ui;letter-spacing:.18em;text-transform:uppercase">${t.hood.name}</div>` : ""}
        <div style="color:#e2e8f0;font-weight:700;font-size:13px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.ens || shortAddr(t.a)}</div>
        <div style="color:#94a3b8;font-size:11.5px">${sizeOf(t)}${t.aeonN ? ` · ${t.aeonN} AEON` : ""} · held ${t.days}d</div>
      </div>
      ${t.flow ? `<div style="margin:0 12px 8px;padding:5px 8px;border-radius:7px;font-size:11px;color:${t.flow > 0 ? "#4ade80" : "#fb7185"};background:${t.flow > 0 ? "rgba(74,222,128,0.12)" : "rgba(251,113,133,0.12)"}">${t.flow > 0 ? "+" : "−"}${Math.abs(t.flow).toLocaleString(undefined, { maximumFractionDigits: 0 })} ${flowUnit} · ${flowWin}d</div>` : ""}
      <a href="https://app.zerion.io/${t.a}/overview" target="_blank" rel="noopener noreferrer" style="display:block;text-decoration:none">
        <img src="https://render.zerion.io/preview?address=${t.a}" alt="" onerror="this.style.display='none'"
             style="display:block;width:100%;border-top:1px solid rgba(255,255,255,0.08)"/>
        <div style="padding:7px 12px;color:${M.accent};font-size:11px">open in Zerion →</div>
      </a>`;

  // HOVER tooltip — deliberately LIGHT. The city is dense, so the cursor is always over a building;
  // a heavy card (esp. the remote Zerion preview image) popping on every mouseover was noise + a
  // network fetch per hover. Hover now shows a one-glance text label only; the full card with the
  // Zerion preview + link is the CLICK-pinned card (zerionCard). Fixes "hovering opens a Zerion card".
  const cardHtml = t => {
    const f = t.flow || 0;
    const col = f > 0 ? "#4ade80" : f < 0 ? "#fb7185" : "#94a3b8";
    const note = f > 0 ? `▲ added ${fmt(f)}` : f < 0 ? `▼ reduced ${fmt(Math.abs(f))}` : "unchanged";
    return `
      <div style="padding:9px 12px 8px">
        <div style="color:${M.accent};font-weight:700;font-size:13px">${t.ens || shortAddr(t.a)}</div>
        <div style="color:#94a3b8;font-size:11px;margin-top:1px">${sizeOf(t)}${t.aeonN ? ` · ${t.aeonN} AEON` : ""} · held ${t.days}d</div>
        <div style="color:${col};font-size:11px;margin-top:3px">${note}${f ? ` · ${flowWin}d` : ""}</div>
        <div style="color:#64748b;font-size:10px;margin-top:5px">click to open →</div>
      </div>`;
  };

  // The site's shared neon toggle (.neon-pill in index.css): flat at rest, backlit accent glow when
  // hovered/active, driven by --glow. Returns spread-able props so every panel button matches the
  // rest of the site rather than the old flat grey pills.
  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="Who actually holds SPX6900 — and which of them are buying or selling?" accent={M.accent}>
        Every building is one wallet. Height is <strong style={{ color: "#e2e8f0" }}>how much it holds × how long it&apos;s held</strong>, and the windows
        glow <strong style={{ color: "#4ade80" }}>green when it has been adding</strong> and <strong style={{ color: "#fb7185" }}>red when it&apos;s been shedding</strong>.
        Steady holders show no green or red — instead their windows carry their <strong style={{ color: "#e2e8f0" }}>age</strong>: <strong style={{ color: "#ffcf7a" }}>amber when new</strong>, <strong style={{ color: "#22d3ee" }}>cyan when long-held</strong>.
        Switch the city between SPX holders, AEON collectors, and the wallets that qualify on both. Exchange, LP and bridge addresses are excluded, so these are real holders.
      </Explain>

      {/* Mode is the first control because it decides which city you are looking at, not just how
          it is drawn — each mode is a different population under its own residency rule. */}
      <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 10, flexWrap: "wrap" }}>
        {MODES.map(m => (
          <TypeTab key={m.id} label={m.label} on={mode === m.id} onClick={() => { setMode(m.id); setSel(null); setWeek(null); setPend(null); }} />
        ))}
      </div>
      <div style={{ textAlign: "center", fontFamily: SANS, fontSize: 12.5, color: "#64748b", marginBottom: 14 }}>
        {mode === "spx" && "Every wallet holding 5,000 SPX for 90 days or more."}
        {mode === "both" && "Wallets that clear the SPX bar and also collect AEON. Height is the SPX position — the same measure as SPX mode, filtered."}
        {mode === "aeon" && "Every wallet holding at least one Project AEON. Height is NFTs held × holding time."}
      </div>

      <div style={{ display: "flex", gap: isMobile ? 14 : 28, justifyContent: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <Metric label={isNft ? "collectors" : "residents"} value={towers.length} color={M.accent} sub={M.asset} />
        <Metric label="adding" value={stats.add} color="#4ade80" sub={flowSub ?? `over ${flowWin} days`} />
        <Metric label="reducing" value={stats.cut} color="#fb7185" sub={flowSub ?? `over ${flowWin} days`} />
        <Metric label="net flow" value={(stats.net >= 0 ? "+" : "−") + fmt(Math.abs(stats.net))} color={stats.net >= 0 ? "#4ade80" : "#fb7185"} sub={flowUnit} />
      </div>

      {(!isNft || (sales?.trades?.length)) && (
        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 12, flexWrap: "wrap" }}>
          {!isNft && [7, 30].map(w => (
            <TypeTab key={w} label={`${w}-day flow`} on={win === w} onClick={() => setWin(w)} />
          ))}
          {isNft && sales?.trades?.length ? (
            [["off", "no arcs"], ["traced", "traced trades"], ["all", "all trades"]].map(([v, lbl]) => (
              <TypeTab key={v} label={lbl} on={arcMode === v} onClick={() => setArcMode(v)} />
            ))
          ) : null}
        </div>
      )}

      {mode !== "both" && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center", marginBottom: 12, paddingBottom: tmOn && tl ? 20 : 0, flexWrap: "wrap" }}>
          <TypeTab label="Time machine" on={tmOn} onClick={() => { setTmOn(v => !v); setWeek(null); setPend(null); }} />
          {tmOn && !tl && <span style={{ fontFamily: MONO, fontSize: 12, color: "#64748b" }}>loading the archive…</span>}
          {tmOn && tl && (
            <>
              <div style={{ position: "relative", width: isMobile ? "78%" : 380 }}>
                <input type="range" min={0} max={tl.n - 1}
                  value={pend ?? week ?? tl.n - 1}
                  aria-label="Week of the replay"
                  onChange={e => {
                    const v = +e.target.value;
                    setPend(v);
                    clearTimeout(tmTimer.current);
                    // debounce the 5,000-building rebuild; the far right edge means NOW (live data)
                    tmTimer.current = setTimeout(() => { setWeek(v >= tl.n - 1 ? null : v); setPend(null); }, 250);
                  }}
                  style={{ width: "100%", accentColor: GLOW.time, display: "block" }} />
                {(TM_EVENTS[tl.asset] || []).map(ev => {
                  const wk = Math.round((Date.parse(ev.d) - Date.parse(tl.week0)) / (7 * 864e5));
                  if (wk < 0 || wk >= tl.n) return null;
                  const pct = (wk / (tl.n - 1)) * 100;
                  return (
                    <div key={ev.d}
                      title={`${ev.label} · ${new Date(Date.parse(ev.d)).toLocaleDateString("en-US", { month: "short", year: "numeric" })} — click to jump`}
                      onClick={() => { setPend(wk); clearTimeout(tmTimer.current); tmTimer.current = setTimeout(() => { setWeek(wk >= tl.n - 1 ? null : wk); setPend(null); }, 120); }}
                      style={{ position: "absolute", left: `${pct}%`, top: "100%", transform: "translateX(-50%)", cursor: "pointer", textAlign: "center", pointerEvents: "auto", zIndex: 2 }}>
                      <div style={{ width: 2, height: 6, background: GLOW.time, opacity: 0.9, margin: "0 auto" }} />
                      <div style={{ fontFamily: MONO, fontSize: 9.5, color: "#a5a5c0", whiteSpace: "nowrap", marginTop: 1 }}>{ev.label}</div>
                    </div>
                  );
                })}
              </div>
              <span style={{ fontFamily: MONO, fontSize: 12, color: week != null || pend != null ? GLOW.time : "#94a3b8", minWidth: 96, textAlign: "left" }}>
                {(pend ?? week) != null && (pend ?? week) < tl.n - 1
                  ? new Date(Date.parse(tl.week0) + (pend ?? week) * 7 * 864e5).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                  : "now"}
              </span>
              {/* Jump to an exact date. The replay is WEEKLY, so a picked day snaps to its nearest Monday
                  grid week; min/max clamp to the archive so an out-of-range date can't be chosen. The
                  native picker renders in the viewer's locale (DD/MM/YYYY in most of the world). */}
              <input type="date" aria-label="Jump to a date"
                min={new Date(Date.parse(tl.week0)).toISOString().slice(0, 10)}
                max={new Date(Date.parse(tl.week0) + (tl.n - 1) * 7 * 864e5).toISOString().slice(0, 10)}
                value={new Date(Date.parse(tl.week0) + (pend ?? week ?? tl.n - 1) * 7 * 864e5).toISOString().slice(0, 10)}
                onChange={e => {
                  const t = Date.parse(e.target.value);
                  if (Number.isNaN(t)) return;                 // cleared field
                  const wk = Math.max(0, Math.min(tl.n - 1, Math.round((t - Date.parse(tl.week0)) / (7 * 864e5))));
                  setPend(wk);
                  clearTimeout(tmTimer.current);
                  tmTimer.current = setTimeout(() => { setWeek(wk >= tl.n - 1 ? null : wk); setPend(null); }, 120);
                }}
                style={{
                  fontFamily: MONO, fontSize: 12, color: "#e2e8f0", colorScheme: "dark",
                  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.16)",
                  borderRadius: 8, padding: "5px 9px", outline: "none",
                }} />
              {week != null && <TypeTab label="Back to now" on={false} onClick={() => { setWeek(null); setPend(null); }} />}
            </>
          )}
        </div>
      )}

      {week != null && (
        <div style={{ textAlign: "center", fontFamily: SANS, fontSize: 12.5, color: "#94a3b8", marginBottom: 12, lineHeight: 1.6, maxWidth: 760, marginInline: "auto" }}>
          Replaying the city from the on-chain transfer history — balances and residency
          ({tl?.asset === "SPX" ? "a holder, 90 days+" : "owns at least one AEON"}) recomputed at that week.
          Notes and name labels stay current-day; the buildings are the past.
        </div>
      )}

      {/* The count is stated rather than implied. Some arcs have a counterparty who has since sold
          out and left the city, and those are drawn running off the map instead of being dropped —
          so the number of trades and the number of arcs you can trace between two roofs differ. */}
      {isNft && arcMode !== "off" && arcStat && (
        <div style={{ textAlign: "center", fontFamily: SANS, fontSize: 12.5, color: "#94a3b8", marginBottom: 12, lineHeight: 1.6 }}>
          <strong style={{ color: "#c4b5fd" }}>{arcStat.total} trades</strong> over the last {arcStat.days} days
          — {arcStat.eth.toFixed(1)} ETH between wallets.{" "}
          <span style={{ color: "#64748b" }}>
            {arcMode === "traced"
              ? `Showing the ${arcStat.both} that connect two buildings. The other ${arcStat.one + arcStat.gone} have a counterparty who has since left the city — switch to all trades to see them.`
              : `${arcStat.both} connect two buildings; ${arcStat.one + arcStat.gone} have a counterparty who has since left the city, and run off the map.`}
          </span>
        </div>
      )}

      {/* ⭐ Top accumulators — the arcs made readable. Ranks who's net-buying over the window so the
          "one wallet scooped N" story is a number on the page, not something only a raw query surfaces.
          Click a row to fly to that building (or open the wallet if they've since left the city). */}
      {isNft && arcMode !== "off" && accum && accum.length > 0 && (
        <div style={{ maxWidth: 620, margin: "0 auto 14px", fontFamily: SANS }}>
          <div style={{ fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "#7c8aa0", marginBottom: 7, textAlign: "center" }}>
            Top accumulators · last {arcStat?.days ?? 30} days
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {accum.map((e, i) => {
              const label = e.ens || shortAddr(e.a);
              const go = () => { if (e.resident) { goTo(e.a); const m = visible.find(t => (t.a || "").toLowerCase() === e.a); if (m) setSel(m); } else window.open(`https://app.zerion.io/${e.a}/overview`, "_blank", "noopener"); };
              return (
                <div key={e.a} onClick={go} title={e.resident ? "Fly to their building" : "Open wallet ↗"}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                    padding: "7px 11px", borderRadius: 9,
                    background: "rgba(196,181,253,0.06)", border: "1px solid rgba(196,181,253,0.16)",
                  }}>
                  <span style={{ color: "#64748b", fontFamily: MONO, fontSize: 12, width: 16, flex: "none" }}>{i + 1}</span>
                  <span style={{ flex: 1, minWidth: 0, color: "#e2e8f0", fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {label}{e.resident ? "" : <span style={{ color: "#64748b", fontWeight: 400 }}> ↗</span>}
                    <span style={{ color: "#64748b", fontWeight: 400, fontSize: 11.5 }}>
                      {"  "}bought {e.bought}{e.sold ? `, sold ${e.sold}` : ""}{e.days > 1 ? ` · ${e.days} days` : ` · 1 day`}
                    </span>
                  </span>
                  <span style={{ flex: "none", textAlign: "right" }}>
                    <span style={{ color: "#c4b5fd", fontWeight: 700, fontFamily: MONO, fontSize: 13 }}>+{e.net} AEON</span>
                    <span style={{ display: "block", color: "#7c8aa0", fontSize: 11, fontFamily: MONO }}>{e.ethIn.toFixed(2)} ETH{e.usdIn ? ` · $${Math.round(e.usdIn).toLocaleString("en-US")}` : ""}</span>
                  </span>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 7, textAlign: "center", lineHeight: 1.5 }}>
            Net of any sales in the window — marketplace trades only, so it's checkable. Click to verify.
          </div>
        </div>
      )}

      {/* page chrome — hidden while an orbital record is running so a screen-record is clean.
          The note SIGNS live in the 3D layer (Skyline3D), not here, so they stay visible. */}
      <div style={{ opacity: recording ? 0 : 1, pointerEvents: recording ? "none" : "auto", transition: "opacity .18s ease" }}>
        <CityControls layout={layout} onLayout={setLayout} time={time} onTime={setTime} accent={M.accent} isMobile={isMobile} unit={M.unit}
          beamAll={beamAll} onBeamAll={setBeamAll}
          has={a => visible.some(t => (t.a || "").toLowerCase() === a)}
          onFocus={a => { goTo(a); const m = visible.find(t => (t.a || "").toLowerCase() === a); if (m) setSel(m); }} />

        <CityWallet city="spx" accent={M.accent} isMobile={isMobile} notes={msgs} onNotes={setMsgs}
          owns={a => citizens.has(a)}
          inView={a => visible.some(t => (t.a || "").toLowerCase() === a)}
          onFocus={a => { goTo(a); const m = visible.find(t => (t.a || "").toLowerCase() === a); if (m) setSel(m); }} />
      </div>

      <CityRecorder accent={M.accent} onRecording={setRecording} />

      <div style={full
        ? { position: "fixed", inset: 0, zIndex: 9999, background: "#05050e", display: "flex", flexDirection: "column" }
        : { position: "relative" }}>
        {/* Always-visible exit — there is no Esc on a phone, and the bottom hint can sit off-screen,
            so full screen must never be a trap. Sits clear of the notch on iOS via safe-area inset. */}
        {full && (
          <button onClick={() => setFull(false)} aria-label="Exit full screen"
            style={{
              position: "absolute", top: "calc(env(safe-area-inset-top, 0px) + 12px)",
              right: "calc(env(safe-area-inset-right, 0px) + 12px)", zIndex: 10001,
              width: 40, height: 40, borderRadius: 999, cursor: "pointer",
              display: "grid", placeItems: "center", color: "#f1f5f9",
              background: "rgba(10,12,20,0.72)", border: "1px solid rgba(255,255,255,0.22)",
              backdropFilter: "blur(6px)",
            }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        )}
        <div style={{ width: "100%", flex: full ? 1 : undefined, minHeight: 0 }}>
          <Suspense fallback={<div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading 3D…</div>}>
            <Skyline3D towers={visible} isMobile={isMobile} cardHtml={cardHtml}
              onSelect={t => { setSel(t); if (t) goTo(t.a); }}
              crownLabel={isNft ? "👑 biggest collector" : "🐋 biggest whale"} accent={`${M.accent}73`}
              bodyFrom={0xf2cf8a} bodyTo={0x22d3ee}
              layout={layout} focus={focus} focusNonce={focusN} pinned={(preview || recording) ? null : sel} pinnedHtml={pinCard}
              intro={week == null}
              messages={msgs} time={time} infra={isNft ? null : infra} arcs={arcs} viewH={viewH} beamAll={beamAll} />
          </Suspense>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
            <span style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center" }}>
              Drag to move · two-finger scroll to orbit · pinch to zoom · click a building to open it and spin around it.
            </span>
            <TypeTab label={full ? "Exit full screen" : "Full screen"} on={full} onClick={() => setFull(v => !v)} />
          </div>
        </div>
      </div>

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 18, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        <strong style={{ color: M.accent }}>SPX City</strong> — holders reconstructed per wallet from every transfer on Ethereum (FIFO, exchange/LP/bridge excluded).
        Glow = net position change over the window; building height is a mostly-logarithmic scale of size × holding time (holdings are power-law, so a linear axis would be one spike over a car park) — the ranking is exact, the spacing is compressed, and the real figure is one hover away.
        Each mode is its own population under its own residency rule, and height always measures the asset that mode is about — never a blend of the two.
        Wallets are addresses, not people: one person can hold several. A behaviour read, not a signal. Not financial advice.
      </div>
    </div>
  );
}
