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
  useEffect(() => { let c = false; loadAeon().then(d => { if (!c && d) setData(d); }); return () => { c = true; }; }, []);
  const holders = useMemo(() => (data.holders || []).filter(h => h.a && h.n > 0), [data]);
  if (holders.length < 4) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Not enough holder data yet.</div>;

  const champ = holders[0];
  const maxN = Math.max(...holders.map(h => h.n));

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
          <span style={{ fontFamily: MONO, fontSize: 12.5, color: "#e2e8f0", width: 70, textAlign: "right" }}>{h.n} AEON</span>
          <span style={{ fontFamily: MONO, fontSize: 11.5, color: "#7c8a9e", width: 92, textAlign: "right" }}>{h.days}d held</span>
        </a>
      ))}
    </div>
  );

  if (preview) return <div style={{ maxWidth: MAX_W, margin: "0 auto", paddingTop: 20 }}>{list}</div>;

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="Who are the biggest, longest-term holders?" accent="#2dd4bf">
        A 3D skyline — <strong style={{ color: "#e2e8f0" }}>one tower per wallet</strong>. Height combines <strong style={{ color: "#5eead4" }}>how many AEON it holds</strong> with <strong style={{ color: "#22d3ee" }}>how long it&apos;s held</strong>, so the tallest tower is the biggest, most committed holder.
        Colour ramps <span style={{ color: "#f59e0b" }}>amber (newer)</span> → <span style={{ color: "#22d3ee" }}>cyan (held since mint)</span>. <strong style={{ color: "#e2e8f0" }}>Drag to orbit, hover a tower, click it to open the wallet in Zerion.</strong>
      </Explain>
      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <Metric label="top holder" value={champ.n + " AEON"} color="#5eead4" sub={`held ${champ.days}d`} />
        <Metric label="wallets shown" value={holders.length} color="#2dd4bf" />
        <Metric label="held since mint" value={holders.filter(h => h.days > 900).length} color="#22d3ee" sub="900+ days" />
      </div>

      <Suspense fallback={<div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading 3D…</div>}>
        <AeonSkyline3D holders={holders} isMobile={isMobile} />
      </Suspense>
      <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 8 }}>
        Drag to orbit · scroll to zoom · hover for the wallet · click a tower to inspect it in Zerion.
      </div>

      <div style={{ marginTop: 26 }}>
        <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 700, color: "#cbd5e1", textAlign: "center", marginBottom: 10 }}>Top holders — tap to open in Zerion</div>
        {list}
      </div>

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 18, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        Tower height = a conviction score combining tokens held and holding duration, reconstructed on-chain from every transfer.
        The SPX6900-coin holdings axis joins this once per-wallet coin balances are pulled — then the tallest tower is the biggest AEON <em>and</em> SPX holder, longest.
      </div>
    </div>
  );
}
