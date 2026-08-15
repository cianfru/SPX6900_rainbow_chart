import { useEffect, useMemo, useRef, useState } from "react";
import { renderSkyline } from "./skyline-scene.js";
import { buildClusterGroups } from "./whale-cohorts.js";
import { loadEntities } from "./history-data.js";
import WalletCard from "./WalletCard.jsx";
import CityGate from "./CityGate.jsx";
import { SANS, MONO } from "./chart-ui.jsx";

// CLUSTER CITY — the 3D companion to the "Wallet Clusters" bubble map. Every OWNER (one entity =
// the wallets our on-chain clustering links to a single controller) is a DISTRICT on the ground:
// their member wallets are cubes (height = balance, colour = holding age warm→cyan), a beam over a
// cube = its 30-day flow (green buying / red selling), and each district's rim + label read the
// owner's overall net flow. So at a glance: which real owners are accumulating vs distributing, and
// how their wallets are split. Same engine as Whales Watching (renderSkyline), grouped by owner
// instead of by size. Reads the per-member walletFlow/walletAge the engine emits.
//
// ⚠ GPU render is unverified in the dev sandbox (software rasteriser); check window.__clusterStats()
// on real hardware. Flow data is data-gated — before the on-chain refresh emits it, the page says so.

const kM = v => v >= 1e6 ? (v / 1e6 % 1 ? (v / 1e6).toFixed(1) : v / 1e6) + "M" : Math.round(v / 1e3) + "k";
const ACCENT = 0xa78bfa;

const GUIDE = [
  { swatch: "linear-gradient(90deg,#d97706,#22d3ee)", title: "Colour is age", text: "warm amber for wallets that arrived recently, cyan for the ones held longest." },
  { swatch: "#94a3b8", title: "Height is size", text: "each cube is one wallet on a log SPX axis; a district is all the wallets one owner controls." },
  { swatch: "#22c55e", title: "Green beam = buying", text: "that wallet added over the last 30 days. A green district rim = the owner is accumulating overall." },
  { swatch: "#f43f5e", title: "Red beam = selling", text: "the wallet reduced. A red rim = the owner is distributing across their wallets." },
];

function Inner({ isMobile }) {
  const host = useRef(null);
  const [data, setData] = useState(null);        // null loading · false failed · object ok
  const [sel, setSel] = useState(null);

  useEffect(() => { let off = false; loadEntities().then(d => { if (!off) setData(d ?? false); }); return () => { off = true; }; }, []);

  const model = useMemo(() => data && data.entities ? buildClusterGroups(data.entities) : null, [data]);
  const hasFlow = !!(data && data.entities && data.entities.some(e => typeof e.d30 === "number"));
  const placed = model ? model.cohorts.length : 0;

  useEffect(() => {
    if (!model || !placed || !host.current) return;
    setSel(null);
    let cleanup = () => {};
    try {
      cleanup = renderSkyline(host.current, model, {
        isMobile, onPick: setSel, winLbl: "30d", axisLabel: "owners →", countNoun: "wallets",
        accent: ACCENT, statsName: "__clusterStats", recordName: "__clusterRecord",
      });
    } catch (e) { console.error("ClusterCity:", e); }
    return () => cleanup();
  }, [model, placed, isMobile]);

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 14px", fontFamily: SANS }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between", margin: "6px 0 12px" }}>
        <div style={{ fontFamily: SANS, fontSize: 13.5, color: "#a7b3c6" }}>
          Every district is <b style={{ color: "#e2e8f0" }}>one owner</b> — the wallets our clustering links together. Cube = wallet · beam = 30-day flow.
        </div>
        {placed > 0 && <div style={{ fontFamily: MONO, fontSize: 12, color: "#64748b" }}>{placed} owners · drag to orbit · {data.updated}</div>}
      </div>

      {(data === false || (data && !placed)) && (
        <div style={{ padding: "56px 20px", textAlign: "center", color: "#94a3b8", fontFamily: SANS, fontSize: 14, lineHeight: 1.6 }}>
          {data === false
            ? "Cluster data is being rebuilt — check back after the next on-chain refresh."
            : hasFlow
              ? "No multi-wallet owners to place yet."
              : <>The 3D flow view lights up once the on-chain refresh emits per-wallet buy/sell flow.<br />Until then, the <b style={{ color: "#c7d2e4" }}>Wallet Clusters</b> bubble map already shows each owner’s holdings.</>}
        </div>
      )}

      {placed > 0 && (
        <div ref={host} style={{ position: "relative", width: "100%", height: isMobile ? "min(56vh, 480px)" : "min(80vh, 900px)", minHeight: isMobile ? 340 : 460, borderRadius: 12, overflow: "hidden", background: "#0a0e1c", cursor: "grab" }} />
      )}

      {sel && (
        <div style={{ margin: "12px 0 2px" }}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
            <button onClick={() => setSel(null)} style={{ fontFamily: MONO, fontSize: 11.5, cursor: "pointer", padding: "3px 9px", borderRadius: 6, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.14)", color: "#94a3b8" }}>× close</button>
          </div>
          <WalletCard w={sel} isMobile={isMobile} accent="#a78bfa" flow={sel.net || 0} flowUnit=" SPX"
            lines={[
              `${kM(sel.bal)} SPX · held ${Math.round((sel.days || 0) / 30)} mo${sel.cohort ? ` · owner ${sel.cohort}` : ""}`,
              sel.net ? "net over 30d" : "no move in this window",
            ]} />
        </div>
      )}

      {placed > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,1fr)", gap: 12, margin: "14px 0 6px" }}>
          {GUIDE.map((g, i) => (
            <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
              <span style={{ width: 13, height: 13, borderRadius: 3, background: g.swatch, flex: "0 0 auto", marginTop: 3 }} />
              <div style={{ fontSize: 12.5, color: "#a7b3c6", lineHeight: 1.45 }}>
                <b style={{ color: "#e2e8f0" }}>{g.title}.</b> {g.text}
              </div>
            </div>
          ))}
        </div>
      )}
      <p style={{ fontSize: 12.5, color: "#7c8a9e", lineHeight: 1.6, margin: "6px 2px 0" }}>
        Owners are reconstructed from on-chain SPX drain/fund flows (a wallet emptied into, or a fresh wallet funded by, another).
        Exchanges, pools and contracts are exits, never links; flagged / over-merged clusters are left out. Buy/sell is the net over 30 days,
        summed across an owner’s wallets. A behaviour snapshot of who’s accumulating vs distributing — not a signal, not financial advice.
      </p>
    </div>
  );
}

export default function ClusterCity({ isMobile }) {
  return (
    <CityGate title="Cluster City" accent="#a78bfa" unit="owner" locked guide={GUIDE_INTRO}>
      <Inner isMobile={isMobile} />
    </CityGate>
  );
}

const GUIDE_INTRO = {
  emoji: "🧩",
  lead: "Every district is one OWNER — the wallets our on-chain clustering links to a single controller. Here's how to read it:",
  rows: GUIDE,
  footer: "Cube = one wallet, height = balance, colour = age. A beam = that wallet's 30-day flow; the district rim reads the owner's overall buy/sell. Real self-custody wallets only; flagged clusters excluded.",
};
