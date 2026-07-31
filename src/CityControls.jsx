import { useState } from "react";
import { lookupHome } from "./city-map.js";
import { TIMES } from "./city-render.js";
import { SANS, MONO } from "./chart-ui.jsx";

// Where the "how to read the city" instructions live — the published manual. The pages are authored
// in docs/ in this repo and mirrored to GitBook by Git Sync, so the book can never drift from what
// shipped. Pointing at the published site rather than the repo folder also means the link survives
// the repo's visibility changing.
const DOCS_URL = "https://andrea-cianfruglia.gitbook.io/spx6900-rainbow-charts/";

// Line icons for the time-of-day toggle — drawn, not emoji, so they inherit the button colour and
// sit cleanly with the rest of the site. Ordered dark → light (moon · sunrise · sun) so the control
// reads like a little brightness slider.
const svg = children => props => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>{children}</svg>
);
const Moon = svg(<path d="M20 14.5A7.5 7.5 0 1 1 9.5 4 6 6 0 0 0 20 14.5z" />);
const Sunrise = svg(<><path d="M3 19h18" /><path d="M8 19a4 4 0 0 1 8 0" /><path d="M12 3.5V7M5 9.5l1.7 1.7M19 9.5l-1.7 1.7" /></>);
const Sun = svg(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2.5M12 19.5V22M3.5 12H6M18 12h2.5M5.2 5.2l1.8 1.8M17 17l1.8 1.8M18.8 5.2 17 7M7 17l-1.8 1.8" /></>);
const TIME_ORDER = [
  { k: "night", Icon: Moon },
  { k: "dusk",  Icon: Sunrise },
  { k: "day",   Icon: Sun },
];

// An Apple-style segmented toggle: a track with one sliding thumb that backlights the active
// segment in the page accent, segments showing only their icon. Replaces three flat text pills.
function TimeToggle({ time, onTime, accent }) {
  const i = Math.max(0, TIME_ORDER.findIndex(t => t.k === time));
  const W = 42;
  return (
    <div role="radiogroup" aria-label="Time of day" style={{
      position: "relative", display: "inline-flex", padding: 3, borderRadius: 999,
      background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
    }}>
      <div aria-hidden="true" style={{
        position: "absolute", top: 3, bottom: 3, left: 3, width: W, borderRadius: 999,
        background: `color-mix(in srgb, ${accent} 20%, transparent)`,
        border: `1px solid color-mix(in srgb, ${accent} 70%, transparent)`,
        boxShadow: `0 0 14px color-mix(in srgb, ${accent} 45%, transparent)`,
        transform: `translateX(${i * W}px)`, transition: "transform .24s cubic-bezier(.34,1.3,.5,1)",
      }} />
      {TIME_ORDER.map(({ k, Icon }) => (
        <button key={k} role="radio" aria-checked={time === k} onClick={() => onTime(k)}
          title={TIMES[k].label} aria-label={TIMES[k].label}
          style={{
            position: "relative", width: W, height: 28, border: "none", background: "transparent",
            cursor: "pointer", padding: 0, display: "grid", placeItems: "center",
            color: time === k ? "#f8fafc" : "#8894a8", transition: "color .18s ease",
          }}><Icon /></button>
      ))}
    </div>
  );
}

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

  // The site's shared neon toggle (.neon-pill in index.css) — flat at rest, accent glow when active.
  const neon = (active, glow = accent) => ({
    className: `neon-pill${active ? " active" : ""}`,
    style: {
      padding: "6px 14px", borderRadius: 8, fontFamily: MONO, fontSize: 12,
      color: active ? "#f8fafc" : "#94a3b8", "--glow": glow,
    },
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
          <button type="submit" {...neon(true)}>Find</button>
        </form>
        <div style={{ display: "flex", gap: 4 }}>
          {[["City", "city"], ["Skyline", "grid"]].map(([lbl, v]) => (
            <button key={v} onClick={() => onLayout(v)} {...neon(layout === v)}>{lbl}</button>
          ))}
        </div>
        {onTime && <TimeToggle time={time} onTime={onTime} accent={accent} />}
        {/* The instructions live in the repo's docs book — a GitHub-marked link rather than a wall of
            in-page help. Opens in a new tab so it never navigates away from the city. */}
        <a href={DOCS_URL} target="_blank" rel="noopener noreferrer" title="How to read the city — documentation"
          className="neon-pill" style={{
            display: "inline-flex", alignItems: "center", gap: 7, textDecoration: "none",
            padding: "6px 13px", borderRadius: 8, fontFamily: MONO, fontSize: 12, color: "#94a3b8", "--glow": accent,
          }}>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
          </svg>
          Docs
        </a>
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
