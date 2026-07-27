import { useState } from "react";
import { lookupHome } from "./city-map.js";
import { TIMES } from "./city-render.js";
import { SANS, MONO } from "./chart-ui.jsx";

// "Where do you live?" — the game layer. Paste any wallet and the city tells you your
// neighbourhood, then flies to your building if you own one.
//
// It answers for ANY valid address, holder or not, because the neighbourhood is a property of the
// address itself (a hash), not of the holdings. When the wallet isn't in the tracked set we say so
// plainly rather than inventing a building for it — the address is play, the buildings are data.
export default function CityControls({ layout, onLayout, onFocus, has, accent = "#5eead4", isMobile, unit = "holder", time = "dusk", onTime }) {
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState(null);

  const submit = e => {
    e.preventDefault();
    const home = lookupHome(q);
    if (!home) { setMsg({ bad: true, text: "That doesn't look like a wallet address (0x…40 hex characters)." }); return; }
    const owns = has?.(home.a);
    if (layout !== "city") onLayout("city");
    onFocus(owns ? home.a : null);
    setMsg({
      text: owns
        ? `You live in ${home.hood.name}. Flying to your building…`
        : `You'd live in ${home.hood.name} — but this wallet isn't among the tracked ${unit}s, so there's no building yet.`,
      hood: home.hood.name,
    });
  };

  const btn = active => ({
    padding: "5px 13px", borderRadius: 8, cursor: "pointer", fontFamily: MONO, fontSize: 12,
    background: active ? "rgba(255,255,255,0.10)" : "transparent",
    border: `1px solid ${active ? accent : "rgba(255,255,255,0.12)"}`,
    color: active ? accent : "#94a3b8",
  });

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", alignItems: "center" }}>
        <form onSubmit={submit} style={{ display: "flex", gap: 6, flex: isMobile ? "1 1 100%" : "0 1 auto" }}>
          <input value={q} onChange={e => { setQ(e.target.value); setMsg(null); }}
            placeholder="Where do you live? Paste a wallet…"
            style={{
              width: isMobile ? "100%" : 280, padding: "6px 12px", borderRadius: 8, fontFamily: MONO, fontSize: 12.5,
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.14)", color: "#e2e8f0", outline: "none",
            }} />
          <button type="submit" style={{ ...btn(true), cursor: "pointer" }}>Find</button>
        </form>
        <div style={{ display: "flex", gap: 4 }}>
          {[["🏙 City", "city"], ["📊 Skyline", "grid"]].map(([lbl, v]) => (
            <button key={v} onClick={() => onLayout(v)} style={btn(layout === v)}>{lbl}</button>
          ))}
        </div>
        {onTime && (
          <div style={{ display: "flex", gap: 4 }}>
            {Object.entries(TIMES).map(([k, v]) => (
              <button key={k} onClick={() => onTime(k)} style={btn(time === k)}>{v.label}</button>
            ))}
          </div>
        )}
      </div>
      {msg && (
        <div style={{
          fontFamily: SANS, fontSize: 13, textAlign: "center", marginTop: 9,
          color: msg.bad ? "#fb7185" : "#cbd5e1",
        }}>{msg.text}</div>
      )}
    </div>
  );
}
