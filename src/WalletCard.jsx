import { SANS, MONO } from "./chart-ui.jsx";

// The persistent wallet card that sits beside the skyline — the same information the hover
// tooltip shows, but pinned, so a wallet can be read and clicked through without holding the
// cursor still on a rotating 3D scene. Selecting a building swaps the card.
//
// Zerion publishes render.zerion.io/preview as the og:image for a wallet page, so this is the
// same card any link unfurl already shows — public by their design. It carries a portfolio
// value, so it loads only for the one wallet being displayed, never for the whole set.
export const shortAddr = a => a.slice(0, 6) + "…" + a.slice(-4);

export default function WalletCard({ w, lines = [], flow, flowUnit = "", accent = "#5eead4", isMobile }) {
  if (!w) return null;
  const name = w.ens || shortAddr(w.a);
  const f = flow ?? 0;
  const col = f > 0 ? "#4ade80" : f < 0 ? "#fb7185" : "#94a3b8";
  const note = f > 0 ? "position added" : f < 0 ? "position reduced" : "unchanged";
  const amount = f === 0 ? "" : `${f > 0 ? "+" : "−"}${Math.abs(f).toLocaleString(undefined, { maximumFractionDigits: 0 })}${flowUnit}`;

  return (
    <div style={{
      background: "rgba(8,11,20,0.9)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 12,
      overflow: "hidden", width: isMobile ? "100%" : 268, flex: "0 0 auto", fontFamily: SANS,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "11px 13px 9px" }}>
        {w.ens && (
          <img src={`https://metadata.ens.domains/mainnet/avatar/${encodeURIComponent(w.ens)}`} alt=""
            onError={e => { e.currentTarget.style.display = "none"; }}
            style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover", flex: "0 0 auto", background: "#131a2c" }} />
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ color: accent, fontWeight: 700, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
          {lines[0] && <div style={{ color: "#94a3b8", fontSize: 11.5, whiteSpace: "nowrap" }}>{lines[0]}</div>}
        </div>
      </div>
      {lines[1] && <div style={{ padding: "0 13px 9px", color: "#7c8a9e", fontSize: 11.5 }}>{lines[1]}</div>}

      {/* the flow verdict — the thing the skyline's green/red glow is encoding */}
      <div style={{
        display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8,
        margin: "0 13px 10px", padding: "7px 10px", borderRadius: 8,
        background: f > 0 ? "rgba(74,222,128,0.10)" : f < 0 ? "rgba(251,113,133,0.10)" : "rgba(255,255,255,0.04)",
        border: `1px solid ${f > 0 ? "rgba(74,222,128,0.28)" : f < 0 ? "rgba(251,113,133,0.28)" : "rgba(255,255,255,0.08)"}`,
      }}>
        <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: col }}>{note}</span>
        {amount && <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: col }}>{amount}</span>}
      </div>

      <img src={`https://render.zerion.io/preview?address=${w.a}`} alt=""
        onError={e => { e.currentTarget.style.display = "none"; }}
        style={{ display: "block", width: "100%", borderTop: "1px solid rgba(255,255,255,0.08)" }} />
      <a href={`https://app.zerion.io/${w.a}/overview`} target="_blank" rel="noopener noreferrer"
        style={{ display: "block", padding: "8px 13px", color: "#64748b", fontSize: 11, letterSpacing: "0.04em", textDecoration: "none" }}>
        open in Zerion →
      </a>
    </div>
  );
}
