import { MONO } from "./chart-ui.jsx";

// The pinned wallet strip beside the whale board, terminal style: monospace, sharp, high contrast,
// no pills. The Zerion preview (render.zerion.io, the wallet's own og:image, public by their design)
// sits on the right and is the click target; the whole card reads like a readout, not a button.
export const shortAddr = a => a.slice(0, 6) + "…" + a.slice(-4);
// Deterministic Zerion-style gradient from the address (no network). The remote portfolio preview
// (render.zerion.io) can be unreachable — when it is, this gradient is what keeps a wallet identity
// visible instead of the preview simply vanishing. Shared by the city card + the flow/sankey tooltips.
export const walletGradient = a => {
  const h = String(a || "").replace(/^0x/i, "").padEnd(18, "8");
  const c = i => "#" + h.slice(i, i + 6);
  return `linear-gradient(135deg, ${c(0)} 0%, ${c(6)} 55%, ${c(12)} 100%)`;
};
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
      {/* The Zerion portfolio preview loads on top of a deterministic gradient. If Zerion is
          unreachable (dead endpoint, or geo-blocked — e.g. China), the img simply removes itself and
          the gradient + "Zerion ↗" affordance remain, so the card never looks broken or empty. */}
      <a href={explorer} target="_blank" rel="noopener noreferrer" title="open in Zerion"
        style={{ position: "relative", display: "block", overflow: "hidden", cursor: "pointer",
          flex: isMobile ? "1 1 100%" : "0 0 160px", minHeight: isMobile ? 88 : "auto",
          borderLeft: isMobile ? "none" : "1px solid rgba(255,255,255,0.09)", background: walletGradient(w.a) }}>
        <img src={`https://render.zerion.io/preview?address=${w.a}`} alt="" loading="lazy"
          onError={e => { e.currentTarget.remove(); }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        <span style={{ position: "absolute", right: 7, bottom: 6, fontSize: 10, fontWeight: 700, color: "#fff", fontFamily: MONO, letterSpacing: 0.3, textShadow: "0 1px 4px rgba(0,0,0,0.75)", pointerEvents: "none" }}>Zerion ↗</span>
      </a>
    </div>
  );
}
