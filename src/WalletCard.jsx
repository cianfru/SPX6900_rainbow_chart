import { MONO } from "./chart-ui.jsx";

// The pinned wallet strip beside the whale board, terminal style: monospace, sharp, high contrast,
// no pills. The Zerion preview (render.zerion.io, the wallet's own og:image, public by their design)
// sits on the right and is the click target; the whole card reads like a readout, not a button.
export const shortAddr = a => a.slice(0, 6) + "…" + a.slice(-4);
const fmt = v => Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 });

export default function WalletCard({ w, lines = [], flow, flowUnit = "", accent = "#5eead4", isMobile, chain = "eth" }) {
  if (!w) return null;
  const name = w.ens || shortAddr(w.a);
  const f = flow ?? 0;
  const col = f > 0 ? "#4ade80" : f < 0 ? "#fb7185" : "#94a3b8";
  const tri = f > 0 ? "▲" : f < 0 ? "▼" : "•";
  const amt = f === 0 ? "flat" : `${f > 0 ? "+" : "−"}${fmt(f)}${flowUnit}`;
  // Zerion covers Solana too, so one interface for every chain, the address goes in the path and
  // the same render.zerion.io preview works. onError hides the preview if a given wallet has none.
  const explorer = `https://app.zerion.io/${w.a}/overview`;

  return (
    <div style={{
      display: "flex", alignItems: "stretch", width: "100%", fontFamily: MONO,
      background: "#080b14", border: "1px solid rgba(255,255,255,0.11)", borderRadius: 6, overflow: "hidden",
      flexWrap: isMobile ? "wrap" : "nowrap",
    }}>
      <div style={{ flex: "1 1 auto", minWidth: 0, padding: isMobile ? "11px 13px" : "13px 16px", display: "flex", flexDirection: "column", gap: 6, justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          {w.ens && (
            <img src={`https://metadata.ens.domains/mainnet/avatar/${encodeURIComponent(w.ens)}`} alt=""
              onError={e => { e.currentTarget.style.display = "none"; }}
              style={{ width: 22, height: 22, borderRadius: "50%", objectFit: "cover", flex: "0 0 auto", background: "#131a2c" }} />
          )}
          <span style={{ color: accent, fontWeight: 700, fontSize: 15, letterSpacing: 0.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
        </div>
        {lines[0] && <div style={{ color: "#8b98ad", fontSize: 12.5 }}>{lines[0]}</div>}
        <div style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap" }}>
          <span style={{ color: col, fontWeight: 800, fontSize: 17, letterSpacing: 0.3 }}>{tri} {amt}</span>
          {lines[1] && <span style={{ color: "#64748b", fontSize: 12.5 }}>{lines[1]}</span>}
        </div>
      </div>
      <a href={explorer} target="_blank" rel="noopener noreferrer" title="open in Zerion"
        style={{ display: "block", flex: "0 0 auto", borderLeft: isMobile ? "none" : "1px solid rgba(255,255,255,0.09)" }}>
        <img src={`https://render.zerion.io/preview?address=${w.a}`} alt=""
          onError={e => { e.currentTarget.parentElement.style.display = "none"; }}
          style={{ display: "block", height: isMobile ? "auto" : 100, width: isMobile ? "100%" : "auto", maxWidth: isMobile ? "100%" : 340, objectFit: "cover", cursor: "pointer" }} />
      </a>
    </div>
  );
}
