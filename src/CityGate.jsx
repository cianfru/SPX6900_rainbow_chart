import { useState, useEffect, useRef } from "react";
import { SANS, MONO } from "./chart-ui.jsx";

// DEVELOPMENT GATE + the arrival explainer for Aeon City / Whale City.
//
// ⚠ HONEST SCOPE: this is a client-side gate. It keeps the pages out of the library listing and
// behind a password prompt so they aren't stumbled upon before they're ready — but anyone
// determined can read the bundle. It is "unlisted and locked", not security. Nothing secret is
// behind it (the underlying JSON is public data), so that trade is fine; just don't treat it as
// protection for anything that actually needs protecting.
const KEY = "spx-city-dev";
// FNV-1a of the passphrase — so the literal string isn't sitting in the bundle in plain sight.
const HASH = 3343087233;
const fnv = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

// A short synthesised "pop" — a pitch-dropping blip with a fast decay. Synthesised rather than
// shipped as a file so there's no asset to load and nothing to block.
export function pop() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.28, ctx.currentTime + 0.012);   // quick attack
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.20);  // fast decay
    osc.connect(gain).connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.22);
    setTimeout(() => ctx.close(), 400);
  } catch { /* audio blocked — the popup still works */ }
}

const Row = ({ swatch, children }) => (
  <div style={{ display: "flex", alignItems: "flex-start", gap: 10, margin: "0 0 10px" }}>
    <span style={{ width: 13, height: 13, borderRadius: 3, background: swatch, flex: "0 0 auto", marginTop: 3 }} />
    <span style={{ fontSize: 13.5, color: "#c7d2e4", lineHeight: 1.55 }}>{children}</span>
  </div>
);

export default function CityGate({ title, accent = "#5eead4", unit = "holder", children }) {
  const [ok, setOk] = useState(() => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } });
  const [pw, setPw] = useState("");
  const [bad, setBad] = useState(false);
  const [intro, setIntro] = useState(false);
  const shown = useRef(false);

  // Explainer on arrival, once per browser — with the pop.
  useEffect(() => {
    if (!ok || shown.current) return;
    shown.current = true;
    let seen = false;
    try { seen = localStorage.getItem(KEY + "-intro") === "1"; } catch { /* private mode */ }
    if (!seen) { setIntro(true); pop(); }
  }, [ok]);

  const dismiss = () => {
    setIntro(false);
    try { localStorage.setItem(KEY + "-intro", "1"); } catch { /* ignore */ }
  };

  const submit = e => {
    e.preventDefault();
    if (fnv(pw.trim().toLowerCase()) === HASH) {
      setOk(true); setBad(false); pop();
      try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ }
    } else setBad(true);
  };

  if (!ok) {
    return (
      <div style={{ maxWidth: 520, margin: "60px auto", padding: "0 20px", fontFamily: SANS, textAlign: "center" }}>
        <div style={{ fontSize: 42, marginBottom: 10 }}>🏙</div>
        <h2 style={{ fontSize: 26, fontWeight: 800, color: "#f1f5f9", margin: "0 0 8px", letterSpacing: "-0.02em" }}>{title}</h2>
        <p style={{ color: "#94a3b8", fontSize: 14.5, lineHeight: 1.6, margin: "0 0 22px" }}>
          Still in development — not public yet. Enter the passphrase to take a look.
        </p>
        <form onSubmit={submit} style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <input type="password" value={pw} autoFocus onChange={e => { setPw(e.target.value); setBad(false); }}
            placeholder="passphrase"
            style={{
              width: 220, padding: "9px 13px", borderRadius: 9, fontFamily: MONO, fontSize: 13,
              background: "rgba(255,255,255,0.05)", border: `1px solid ${bad ? "#fb7185" : "rgba(255,255,255,0.16)"}`,
              color: "#e2e8f0", outline: "none",
            }} />
          <button type="submit" style={{
            padding: "9px 18px", borderRadius: 9, cursor: "pointer", fontFamily: MONO, fontSize: 13,
            background: "rgba(255,255,255,0.08)", border: `1px solid ${accent}`, color: accent,
          }}>Enter</button>
        </form>
        {bad && <div style={{ color: "#fb7185", fontSize: 13, marginTop: 12 }}>Not that one.</div>}
      </div>
    );
  }

  return (
    <>
      {children}
      {intro && (
        <div onClick={dismiss} style={{
          position: "fixed", inset: 0, zIndex: 60, background: "rgba(4,7,15,0.72)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(3px)",
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            maxWidth: 480, width: "100%", background: "#141c2e", border: `1px solid ${accent}55`,
            borderRadius: 16, padding: "22px 24px", fontFamily: SANS,
            boxShadow: "0 24px 70px rgba(0,0,0,0.6)", animation: "cityPop 220ms cubic-bezier(.2,1.3,.4,1)",
          }}>
            <style>{"@keyframes cityPop{from{opacity:0;transform:scale(.92) translateY(8px)}to{opacity:1;transform:none}}"}</style>
            <div style={{ fontSize: 30, marginBottom: 6 }}>🏙</div>
            <h3 style={{ fontSize: 21, fontWeight: 800, color: "#f1f5f9", margin: "0 0 4px", letterSpacing: "-0.02em" }}>Welcome to {title}</h3>
            <p style={{ color: "#94a3b8", fontSize: 13.5, lineHeight: 1.6, margin: "0 0 16px" }}>
              Every building is one {unit}&apos;s wallet. Here&apos;s how to read it:
            </p>
            <Row swatch="linear-gradient(90deg,#d97706,#22d3ee)">
              <b style={{ color: "#e2e8f0" }}>Colour is age.</b> Warm amber for wallets that arrived recently, cyan for the ones that have held longest.
            </Row>
            <Row swatch="#22c55e">
              <b style={{ color: "#e2e8f0" }}>Green means buying.</b> The whole building lights green when that wallet added over the window.
            </Row>
            <Row swatch="#f43f5e">
              <b style={{ color: "#e2e8f0" }}>Red means selling.</b> It lights red when the wallet reduced its position.
            </Row>
            <Row swatch="#94a3b8">
              <b style={{ color: "#e2e8f0" }}>Height is size × conviction</b> — how much it holds and how long it&apos;s held. Townhouses to skyscrapers.
            </Row>
            <p style={{ color: "#7c8a9e", fontSize: 12.5, lineHeight: 1.6, margin: "14px 0 0" }}>
              Paste any wallet into <b style={{ color: "#c7d2e4" }}>&ldquo;Where do you live?&rdquo;</b> to find its neighbourhood.
              The building is real data; the street address is a game — it comes from the wallet&apos;s own hash, not from anywhere real.
            </p>
            <button onClick={dismiss} style={{
              marginTop: 18, width: "100%", padding: "10px 0", borderRadius: 10, cursor: "pointer",
              background: accent, border: "none", color: "#08131f", fontWeight: 700, fontSize: 14, fontFamily: SANS,
            }}>Explore the city</button>
          </div>
        </div>
      )}
    </>
  );
}
