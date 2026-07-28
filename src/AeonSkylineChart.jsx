import { useMemo, useState, useEffect, lazy, Suspense } from "react";
import { AEON_ONCHAIN } from "./aeon-onchain.js";
import { loadAeon } from "./history-data.js";
import { SANS, MONO, MAX_W, Metric, Explain } from "./chart-ui.jsx";
import CityControls from "./CityControls.jsx";
import CityWallet from "./CityWallet.jsx";
import CityGate from "./CityGate.jsx";
import { loadNotes } from "./city-messages.js";

const Skyline3D = lazy(() => import("./Skyline3D.jsx"));
const short = a => a.slice(0, 6) + "…" + a.slice(-4);

// Project Aeon — the Holder Skyline. A 3D city of towers, one per wallet; height combines
// how many AEON it holds with how long it's held. Hover a tower for the wallet, click to
// open it in Zerion. A top-holders bar list backs it up (and stands in for the preview).
export default function AeonSkylineChart({ isMobile, preview = false }) {
  const [data, setData] = useState(AEON_ONCHAIN);
  const [useSpx, setUseSpx] = useState(true);
  const [multiOnly, setMultiOnly] = useState(false);
  const [sel, setSel] = useState(null);
  const [layout, setLayout] = useState("city");
  const [focus, setFocus] = useState(null);
  const [focusN, setFocusN] = useState(0);   // bumped so re-picking the same building still moves
  const goTo = a => { setFocus(a); setFocusN(n => n + 1); };
  const [shownN, setShownN] = useState(Infinity);   // everyone — the city grows to fit
  const [msgs, setMsgs] = useState(null);
  const [time, setTime] = useState("dusk");
  useEffect(() => { let c = false; loadAeon().then(d => { if (!c && d) setData(d); }); return () => { c = true; }; }, []);
  useEffect(() => { let c = false; loadNotes("aeon").then(m => { if (!c) setMsgs(m); }); return () => { c = true; }; }, []);
  const all = useMemo(() => (data.holders || []).filter(h => h.a && h.n > 0), [data]);
  const holders = useMemo(() => multiOnly ? all.filter(h => h.n > 1) : all, [all, multiOnly]);
  const singleCount = useMemo(() => all.filter(h => h.n === 1).length, [all]);
  const champ = holders[0];
  const maxN = Math.max(1, ...holders.map(h => h.n));
  const hasSpx = holders.some(h => h.spx > 0);
  const both = holders.filter(h => h.spx > 0).length;
  const maxDays = Math.max(1, ...holders.map(h => h.days || 0));
  const fmtSpx = v => v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : v >= 1e3 ? (v / 1e3).toFixed(0) + "k" : "" + v;

  // Normalise for the shared 3D skyline: score = holdings (AEON, optionally + SPX rescaled onto
  // the same axis) weighted by holding duration; flow = net NFTs in/out over 30 days, which is
  // what makes a building glow green (accumulating) or red (distributing).
  const maxSpxV = Math.max(0, ...holders.map(h => h.spx || 0));
  const spxOn = useSpx && maxSpxV > 0;
  // ⚠ THESE MUST BE MEMOISED. Skyline3D rebuilds its whole scene when `towers` changes identity,
  // and a rebuild replays the arrival flight from the top. Built inline, they were new arrays on
  // every render — so clicking a building (which only sets state) tore the city down and flew you
  // back out over the bay. The array contents never changed; only their identity did.
  const towers = useMemo(() => holders.map(h => {
    const units = h.n + (spxOn ? (h.spx || 0) / maxSpxV * maxN : 0);
    return { ...h, score: units * (0.45 + 0.55 * ((h.days || 0) / maxDays)), ageT: (h.days || 0) / maxDays, flow: h.f30 || 0 };
  }), [holders, spxOn, maxSpxV, maxN, maxDays]);
  const adding = towers.filter(t => t.flow > 0).length, shedding = towers.filter(t => t.flow < 0).length;
  // render the biggest N (all holders stay searchable)
  const visible = useMemo(() => towers.slice().sort((a, b) => b.score - a.score).slice(0, shownN), [towers, shownN]);

  // Every hook above this line runs on EVERY render. The bail-out has to come after them all —
  // React counts hooks by call order, so returning early from the middle changes the count between
  // renders and throws.
  if (holders.length < 4) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Not enough holder data yet.</div>;
  const cur = sel;   // nothing pinned until you hover or click — no card on arrival
  // The card that hangs over the selected building. Leads with the NEIGHBOURHOOD, because that is
  // the part people react to — an address tells you nothing, "Upper East Side" tells you where you
  // live. The Zerion link is the only clickable thing in the 3D scene.
  const pinCard = t => `
      <div style="padding:9px 12px 7px">
        ${t.hood ? `<div style="color:#5eead4;font:700 10.5px 'Space Grotesk',system-ui;letter-spacing:.18em;text-transform:uppercase">${t.hood.name}</div>` : ""}
        <div style="color:#e2e8f0;font-weight:700;font-size:13px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.ens || short(t.a)}</div>
        <div style="color:#94a3b8;font-size:11.5px">${t.n} AEON${spxOn && t.spx ? ` · ${fmtSpx(t.spx)} SPX` : ""} · held ${t.days}d</div>
      </div>
      ${t.flow ? `<div style="margin:0 12px 8px;padding:5px 8px;border-radius:7px;font-size:11px;color:${t.flow > 0 ? "#4ade80" : "#fb7185"};background:${t.flow > 0 ? "rgba(74,222,128,0.12)" : "rgba(251,113,133,0.12)"}">${t.flow > 0 ? `+${t.flow} bought` : `${t.flow} sold`} · 30d</div>` : ""}
      <a href="https://app.zerion.io/${t.a}/overview" target="_blank" rel="noopener noreferrer" style="display:block;text-decoration:none">
        <img src="https://render.zerion.io/preview?address=${t.a}" alt="" onerror="this.style.display='none'"
             style="display:block;width:100%;border-top:1px solid rgba(255,255,255,0.08)"/>
        <div style="padding:7px 12px;color:#5eead4;font-size:11px">open in Zerion →</div>
      </a>`;

  const aeonCard = t => `
      <div style="padding:11px 13px 8px">
        <div style="color:#5eead4;font-weight:700;font-size:13.5px">${t.ens || short(t.a)}</div>
        <div style="color:#94a3b8;font-size:11.5px">${t.n} AEON${spxOn && t.spx ? ` · ${fmtSpx(t.spx)} SPX` : ""} · held ${t.days}d</div>
      </div>
      ${t.flow ? `<div style="margin:0 13px 9px;padding:6px 9px;border-radius:7px;font-size:11.5px;color:${t.flow > 0 ? "#4ade80" : "#fb7185"};background:${t.flow > 0 ? "rgba(74,222,128,0.10)" : "rgba(251,113,133,0.10)"}">${t.flow > 0 ? `+${t.flow} bought` : `${t.flow} sold`} · 30d</div>` : ""}
      <img src="https://render.zerion.io/preview?address=${t.a}" alt="" onerror="this.style.display='none'"
           style="display:block;width:100%;border-top:1px solid rgba(255,255,255,0.08)"/>
      <div style="padding:7px 13px;color:#64748b;font-size:11px">click to pin this wallet →</div>`;

  // top-holders bar list (also the preview stand-in — 3D is heavy)
  const list = (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      {holders.slice(0, preview ? 8 : 15).map((h, i) => (
        <a key={h.a} href={`https://app.zerion.io/${h.a}/overview`} target="_blank" rel="noopener noreferrer"
          style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", borderRadius: 8, textDecoration: "none",
            background: i === 0 ? "rgba(45,212,191,0.08)" : "transparent" }}>
          <span style={{ width: 22, fontFamily: MONO, fontSize: 12, color: "#64748b", textAlign: "right" }}>{i + 1}</span>
          <span style={{ fontFamily: MONO, fontSize: 13, color: i === 0 ? "#5eead4" : "#cbd5e1", width: 128 }}>{i === 0 ? "👑 " : ""}{short(h.a)}</span>
          <span style={{ flex: 1, height: 10, background: "rgba(255,255,255,0.05)", borderRadius: 5, overflow: "hidden" }}>
            <span style={{ display: "block", height: "100%", width: `${(h.n / maxN * 100).toFixed(1)}%`, background: "linear-gradient(90deg,#f59e0b,#22d3ee)", borderRadius: 5 }} />
          </span>
          <span style={{ fontFamily: MONO, fontSize: 12.5, color: "#e2e8f0", width: 66, textAlign: "right" }}>{h.n} AEON</span>
          <span style={{ fontFamily: MONO, fontSize: 12, color: h.spx > 0 ? "#a78bfa" : "#3a4152", width: 80, textAlign: "right" }}>{h.spx > 0 ? fmtSpx(h.spx) + " SPX" : "—"}</span>
          <span style={{ fontFamily: MONO, fontSize: 11.5, color: "#7c8a9e", width: 78, textAlign: "right" }}>{h.days}d held</span>
        </a>
      ))}
    </div>
  );

  // ── PREVIEW: draw the CITY, not a spreadsheet ────────────────────────────────
  // The gallery tile used to show the top-holders bar list because the real view is
  // WebGL and too heavy to mount once per tile. But a table tells a browsing user
  // nothing about what this chart IS, and the tile is the only thing deciding whether
  // they click. This is a cheap 2D silhouette of the same towers — pure SVG, no WebGL,
  // same data and the same amber→cyan age ramp, so it reads as the city at a glance.
  if (preview) {
    const N = 46;                                   // enough to read as a skyline
    const towers = holders.slice(0, N);
    const maxH = Math.max(...towers.map(h => h.n * (0.45 + 0.55 * (h.days / maxDays))));
    const bw = 100 / N;
    return (
      <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
        <svg viewBox="0 0 100 46" preserveAspectRatio="none" style={{ width: "100%", height: 680, display: "block" }}>
          <defs>
            <linearGradient id="skyPrevBg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0b1020" /><stop offset="100%" stopColor="#05070f" />
            </linearGradient>
          </defs>
          <rect width="100" height="46" fill="url(#skyPrevBg)" />
          {towers.map((h, i) => {
            const score = h.n * (0.45 + 0.55 * (h.days / maxDays));
            const ht = Math.max(1.5, (score / maxH) * 38);
            const age = Math.min(1, h.days / maxDays);          // 0 = new, 1 = since mint
            const c = age > 0.66 ? "#22d3ee" : age > 0.33 ? "#5eead4" : "#f59e0b";
            return (
              <g key={h.a}>
                <rect x={i * bw + bw * 0.16} y={42 - ht} width={bw * 0.68} height={ht} fill={c} fillOpacity={0.85} rx={0.3} />
                <rect x={i * bw + bw * 0.16} y={42 - ht} width={bw * 0.68} height={Math.min(ht, 0.8)} fill="#f8fafc" fillOpacity={0.5} />
              </g>
            );
          })}
          <rect y="42" width="100" height="0.25" fill="rgba(255,255,255,0.18)" />
        </svg>
      </div>
    );
  }

  return (
    <CityGate title="Aeon City" unit="holder" accent="#5eead4">
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="Who are the biggest, most committed holders?" accent="#2dd4bf">
        A 3D skyline — <strong style={{ color: "#e2e8f0" }}>one tower per wallet</strong>. Height combines <strong style={{ color: "#5eead4" }}>AEON held</strong>{hasSpx && <> + <strong style={{ color: "#a78bfa" }}>SPX6900 coins held</strong></>} with <strong style={{ color: "#22d3ee" }}>how long it&apos;s held</strong>, so the tallest tower is the biggest, most committed holder{hasSpx && <> across both</>}.
        Colour ramps <span style={{ color: "#f2cf8a" }}>pale gold (newer)</span> → <span style={{ color: "#22d3ee" }}>cyan (held since mint)</span>. Windows glow <span style={{ color: "#4ade80" }}>green when a wallet bought</span> and <span style={{ color: "#fb7185" }}>red when it sold</span> in the last 30 days. <strong style={{ color: "#e2e8f0" }}>Drag to orbit, hover a tower, click to pin its wallet.</strong>
      </Explain>
      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <Metric label="accumulating" value={adding} color="#4ade80" sub="bought in 30d" />
        <Metric label="distributing" value={shedding} color="#fb7185" sub="sold in 30d" />
        <Metric label="wallets shown" value={holders.length} color="#2dd4bf" />
        {hasSpx && <Metric label="hold AEON + SPX" value={both} color="#a78bfa" sub="cross-holders" />}
        <Metric label="held since mint" value={holders.filter(h => h.days > 900).length} color="#22d3ee" sub="900+ days" />
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        {hasSpx && (
          <div style={{ display: "inline-flex", borderRadius: 9, overflow: "hidden", border: "1px solid rgba(167,139,250,0.35)" }}>
            {[["AEON + SPX", true], ["AEON only", false]].map(([lbl, v]) => (
              <button key={lbl} onClick={() => setUseSpx(v)} style={{
                padding: "6px 16px", fontFamily: SANS, fontSize: 13, cursor: "pointer", border: "none",
                background: useSpx === v ? "rgba(167,139,250,0.2)" : "transparent",
                color: useSpx === v ? "#c4b5fd" : "#94a3b8",
              }}>{lbl}</button>
            ))}
          </div>
        )}
        <button onClick={() => setMultiOnly(m => !m)} title="Hide wallets that hold just one AEON" style={{
          padding: "6px 16px", borderRadius: 9, fontFamily: SANS, fontSize: 13, cursor: "pointer",
          border: "1px solid " + (multiOnly ? "rgba(45,212,191,0.5)" : "rgba(255,255,255,0.14)"),
          background: multiOnly ? "rgba(45,212,191,0.16)" : "transparent", color: multiOnly ? "#5eead4" : "#94a3b8",
        }}>{multiOnly ? "✓ " : ""}Exclude single-NFT wallets</button>
        {/* Render count. Every holder fits — the island scales with the population — so this exists
            only as an escape hatch for a device that struggles, not because the land runs out. */}
        <div style={{ display: "inline-flex", gap: 4 }}>
          {[400, 800, Infinity].map(n => (
            <button key={n} onClick={() => setShownN(n)} title="How many buildings to render" style={{
              padding: "5px 11px", borderRadius: 8, cursor: "pointer", fontFamily: MONO, fontSize: 12,
              background: shownN === n ? "rgba(45,212,191,0.16)" : "transparent",
              border: `1px solid ${shownN === n ? "#5eead4" : "rgba(255,255,255,0.12)"}`,
              color: shownN === n ? "#5eead4" : "#94a3b8",
            }}>{n === Infinity ? "all" : n}</button>
          ))}
        </div>
        <span style={{ fontFamily: MONO, fontSize: 12.5, color: "#7c8a9e" }}>{visible.length} of {holders.length} shown{!multiOnly && singleCount ? ` · ${singleCount} single-NFT` : ""}</span>
      </div>
      <CityControls layout={layout} onLayout={setLayout} time={time} onTime={setTime} accent="#5eead4" isMobile={isMobile} unit="holder"
        has={a => visible.some(t => (t.a || "").toLowerCase() === a)}
        onFocus={a => { goTo(a); const m = visible.find(t => (t.a || "").toLowerCase() === a); if (m) setSel(m); }} />

      <CityWallet city="aeon" accent="#5eead4" isMobile={isMobile} notes={msgs} onNotes={setMsgs}
        owns={a => visible.some(t => (t.a || "").toLowerCase() === a)}
        onFocus={a => { goTo(a); const m = visible.find(t => (t.a || "").toLowerCase() === a); if (m) setSel(m); }} />

      <div style={{ position: "relative" }}>
        <div style={{ width: "100%" }}>
          <Suspense fallback={<div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading 3D…</div>}>
            <Skyline3D towers={visible} isMobile={isMobile} cardHtml={aeonCard}
              onSelect={t => { setSel(t); if (t) goTo(t.a); }}
              crownLabel="👑 top holder" accent="rgba(45,212,191,0.45)" bodyFrom={0xf2cf8a} bodyTo={0x22d3ee}
              layout={layout} focus={focus} focusNonce={focusN} pinned={preview ? null : cur} pinnedHtml={pinCard} messages={msgs} time={time} />
          </Suspense>
        </div>

      </div>
      <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 8 }}>
        Drag to orbit · scroll to zoom · hover a building for the wallet · click to pin it.{layout === "city" && " Every holder has a home address in Aeon City."}
      </div>

      <div style={{ marginTop: 26 }}>
        <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 700, color: "#cbd5e1", textAlign: "center", marginBottom: 10 }}>Top holders — tap to open in Zerion</div>
        {list}
      </div>

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 18, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        Tower height = a conviction score combining AEON held{hasSpx ? ", SPX6900 coins held," : ""} and holding duration, reconstructed on-chain from every transfer{hasSpx ? " (SPX from wallet balances)" : ""}.
        {hasSpx ? " Wallets that hold both AEON and SPX — long — stand tallest." : ""}
      </div>
    </div>
    </CityGate>
  );
}
