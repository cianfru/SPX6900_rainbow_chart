import { useState, useEffect, useRef } from "react";
import { lookupHome } from "./city-map.js";
import { TIMES } from "./city-render.js";
import { SANS, MONO } from "./chart-ui.jsx";

// Where the "how to read the city" instructions live — the manual, hosted on this site. The pages
// are authored as markdown in docs/ and pre-rendered into the bundle at build time, so the book
// can't drift from what shipped and carries no third-party branding, author name or repo metadata.
const DOCS_URL = "?view=docs";

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

// One labelled row inside the settings popover: a small caps label (+ optional hint) over its control.
function SettingRow({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontFamily: SANS, fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "#8894a8", marginBottom: 6 }}>{label}</div>
      {children}
      {hint && <div style={{ fontFamily: SANS, fontSize: 11, color: "#64748b", marginTop: 5, lineHeight: 1.4 }}>{hint}</div>}
    </div>
  );
}

// "Where do you live?" — the game layer. Paste any wallet and the city tells you your
// neighbourhood, then flies to your building if you own one.
//
// It answers for ANY valid address, holder or not, because the neighbourhood is a property of the
// address itself (a hash), not of the holdings. When the wallet isn't in the tracked set we say so
// plainly rather than inventing a building for it — the address is play, the buildings are data.
export default function CityControls({ layout, onLayout, onFocus, has, accent = "#5eead4", isMobile, unit = "holder", time = "dusk", onTime, beamAll = false, onBeamAll }) {
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState(null);
  const [open, setOpen] = useState(false);   // the settings popover
  const gearRef = useRef(null);
  // close the popover on an outside click or Escape — standard menu behaviour
  useEffect(() => {
    if (!open) return;
    const onDoc = e => { if (gearRef.current && !gearRef.current.contains(e.target)) setOpen(false); };
    const onKey = e => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); window.removeEventListener("keydown", onKey); };
  }, [open]);

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
        {/* ⚙ SETTINGS — the display toggles that aren't the primary controls (which stay visible:
            mode, flow window, time machine). The panel was growing a new pill per option; a wheel
            keeps the row clean and gives them room to grow. */}
        <div style={{ position: "relative" }} ref={gearRef}>
          <button onClick={() => setOpen(v => !v)} title="Display settings" aria-expanded={open}
            {...neon(open)} style={{ ...neon(open).style, display: "inline-flex", alignItems: "center", gap: 7 }}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Settings
          </button>
          {open && (
            <div role="menu" style={{
              zIndex: 40, textAlign: "left",
              padding: "12px 14px", borderRadius: 12, background: "rgba(10,12,20,0.96)",
              border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
              backdropFilter: "blur(8px)",
              // On mobile the panel is wider than the room to the left of the gear, so an absolute
              // dropdown anchored to its right edge runs off the screen. Pin it to the viewport as a
              // bottom sheet instead — always fully on-screen and reachable. Desktop keeps the dropdown.
              ...(isMobile
                ? { position: "fixed", left: 12, right: 12, bottom: 16, width: "auto", maxHeight: "70vh", overflowY: "auto" }
                : { position: "absolute", top: "calc(100% + 8px)", right: 0, width: 236 }),
            }}>
              <SettingRow label="View">
                <div style={{ display: "flex", gap: 4 }}>
                  {[["City", "city"], ["Skyline", "grid"]].map(([lbl, v]) => (
                    <button key={v} onClick={() => onLayout(v)} {...neon(layout === v)}>{lbl}</button>
                  ))}
                </div>
              </SettingRow>
              {onTime && (
                <SettingRow label="Time of day">
                  <TimeToggle time={time} onTime={onTime} accent={accent} />
                </SettingRow>
              )}
              {onBeamAll && (
                <SettingRow label="Flow beams" hint="Which movers get a green/red beam.">
                  <div style={{ display: "flex", gap: 4 }}>
                    {[["Decisive", false], ["All movers", true]].map(([lbl, v]) => (
                      <button key={lbl} onClick={() => onBeamAll(v)} {...neon(beamAll === v, "#22d3ee")}>{lbl}</button>
                    ))}
                  </div>
                </SettingRow>
              )}
            </div>
          )}
        </div>
        {/* The manual, on this site. An open-book mark rather than a vendor logo — it is our own
            page now. Opens in a new tab so it never navigates away from the city. */}
        <a href={DOCS_URL} target="_blank" rel="noopener noreferrer" title="How to read the city — the manual"
          className="neon-pill" style={{
            display: "inline-flex", alignItems: "center", gap: 7, textDecoration: "none",
            padding: "6px 13px", borderRadius: 8, fontFamily: MONO, fontSize: 12, color: "#94a3b8", "--glow": accent,
          }}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 20V8l5-3 4 2.5L16 5l5 2.5V19l-5-2.5-4 2.5-4-2.5z" /><path d="M8 5v12" /><path d="M16 6.5v12" />
          </svg>
          Manual
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
