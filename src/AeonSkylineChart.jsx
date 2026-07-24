import { useMemo, useState, useEffect, lazy, Suspense } from "react";
import { AEON_ONCHAIN } from "./aeon-onchain.js";
import { loadAeon } from "./history-data.js";
import { SANS, MONO, MAX_W, Metric, Explain } from "./chart-ui.jsx";

const AeonSkyline3D = lazy(() => import("./AeonSkyline3D.jsx"));
const short = a => a.slice(0, 6) + "…" + a.slice(-4);

// Project Aeon — the Holder Skyline. A 3D city of towers, one per wallet; height combines
// how many AEON it holds with how long it's held. Hover a tower for the wallet, click to
// open it in Zerion. A top-holders bar list backs it up (and stands in for the preview).
export default function AeonSkylineChart({ isMobile, preview = false }) {
  const [data, setData] = useState(AEON_ONCHAIN);
  const [useSpx, setUseSpx] = useState(true);
  const [multiOnly, setMultiOnly] = useState(false);
  useEffect(() => { let c = false; loadAeon().then(d => { if (!c && d) setData(d); }); return () => { c = true; }; }, []);
  const all = useMemo(() => (data.holders || []).filter(h => h.a && h.n > 0), [data]);
  const holders = useMemo(() => multiOnly ? all.filter(h => h.n > 1) : all, [all, multiOnly]);
  const singleCount = useMemo(() => all.filter(h => h.n === 1).length, [all]);
  if (holders.length < 4) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Not enough holder data yet.</div>;

  const champ = holders[0];
  const maxN = Math.max(...holders.map(h => h.n));
  const hasSpx = holders.some(h => h.spx > 0);
  const both = holders.filter(h => h.spx > 0).length;
  const fmtSpx = v => v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : v >= 1e3 ? (v / 1e3).toFixed(0) + "k" : "" + v;

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

  if (preview) return <div style={{ maxWidth: MAX_W, margin: "0 auto", paddingTop: 20 }}>{list}</div>;

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="Who are the biggest, most committed holders?" accent="#2dd4bf">
        A 3D skyline — <strong style={{ color: "#e2e8f0" }}>one tower per wallet</strong>. Height combines <strong style={{ color: "#5eead4" }}>AEON held</strong>{hasSpx && <> + <strong style={{ color: "#a78bfa" }}>SPX6900 coins held</strong></>} with <strong style={{ color: "#22d3ee" }}>how long it&apos;s held</strong>, so the tallest tower is the biggest, most committed holder{hasSpx && <> across both</>}.
        Colour ramps <span style={{ color: "#f59e0b" }}>amber (newer)</span> → <span style={{ color: "#22d3ee" }}>cyan (held since mint)</span>. <strong style={{ color: "#e2e8f0" }}>Drag to orbit, hover a tower, click it to open the wallet in Zerion.</strong>
      </Explain>
      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <Metric label="top holder" value={champ.n + " AEON"} color="#5eead4" sub={champ.spx > 0 ? fmtSpx(champ.spx) + " SPX" : `held ${champ.days}d`} />
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
        <span style={{ fontFamily: MONO, fontSize: 12.5, color: "#7c8a9e" }}>{holders.length} towers{!multiOnly && singleCount ? ` · ${singleCount} single-NFT` : ""}</span>
      </div>
      <Suspense fallback={<div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading 3D…</div>}>
        <AeonSkyline3D holders={holders} isMobile={isMobile} useSpx={useSpx} />
      </Suspense>
      <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 8 }}>
        Drag to orbit · scroll to zoom · hover for the wallet · click a tower to inspect it in Zerion. {hasSpx && (useSpx ? "Height = AEON + SPX × time held." : "Height = AEON × time held.")}
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
  );
}
