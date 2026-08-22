import { useState, useEffect } from "react";
import { recorderSupported, downloadBlob } from "./canvas-record.js";
import { MONO } from "./chart-ui.jsx";

// Owner-only in-browser orbital recorder for the 3D cities. Flow: click a building to PIN the spin
// centre (the city already flies to it + sets controls.target), pick the duration, hit Spin + Record.
// It sets OrbitControls autoRotate and captures the live WebGL canvas via MediaRecorder (window.
// __cityRecord, exposed by Skyline3D), encoded on the viewer's own GPU, downloaded as MP4/WebM.
// Revealed only behind ?rec=1 (or localStorage spx-rec=1) and where the browser supports capture
// (hidden on iOS Safari, which lacks canvas.captureStream). ⚠ Captures the 3D view only, the note/
// name SIGNS are CSS2D DOM overlays and are NOT in the exported file; screen-record for those.
const SECS = [4, 6, 8, 10, 12, 16];
// Export aspect (width/height). The on-screen city is a wide, short card; a clip at that shape wastes
// most of the frame on sky and buries the towers in a thin band. Portrait 4:5 is the default — it fills
// a phone feed and shows the buildings at full height. Square and wide kept for flexibility.
// Owner's two most-used social formats lead: 9:16 (Reels/TikTok/Shorts/X-mobile) then 1:1 (X feed).
// 4:5 and 16:9 kept for flexibility. The control panel can preselect one via ?ar=<id>.
const ARS = [
  { id: "vert", label: "9:16", aspect: 9 / 16 },
  { id: "square", label: "1:1", aspect: 1 },
  { id: "tall", label: "4:5", aspect: 4 / 5 },
  { id: "wide", label: "16:9", aspect: 16 / 9 },
];
const initialAr = () => { try { const a = new URLSearchParams(location.search).get("ar"); return ARS.some(x => x.id === a) ? a : "vert"; } catch { return "vert"; } };
// Orbit speed = fraction of a full revolution over the clip. A slower pan is far kinder to X's
// bitrate-capped re-encode (less motion per frame → sharper detail), so Slow is the default.
const SPINS = [
  { id: "slow", label: "Slow", turns: 0.35 },
  { id: "med", label: "Med", turns: 0.6 },
  { id: "full", label: "Full", turns: 1 },
];

export default function CityRecorder({ accent = "#5eead4", onRecording }) {
  // ?rec=1 is STICKY: the city is its own tab, so navigating in rewrites the URL and drops the param
  //, persist it once so the reveal survives. Clear with localStorage.removeItem("spx-rec").
  useEffect(() => {
    try { if (new URLSearchParams(location.search).get("rec") === "1") localStorage.setItem("spx-rec", "1"); } catch { /* private mode */ }
  }, []);
  const enabled = (() => {
    try {
      const q = new URLSearchParams(location.search).get("rec") === "1";
      return (q || localStorage.getItem("spx-rec") === "1") && recorderSupported();
    } catch { return false; }
  })();
  const [secs, setSecs] = useState(8);
  const [ar, setAr] = useState(initialAr);
  const [spin, setSpin] = useState("slow");
  const [rec, setRec] = useState({ state: "idle", pct: 0, err: "" });
  if (!enabled) return null;

  const go = async () => {
    if (rec.state === "recording" || !window.__cityRecord) return;
    setRec({ state: "recording", pct: 0, err: "" });
    onRecording?.(true);                       // let the page hide its chrome for a clean screen-record
    try {
      const aspect = (ARS.find(a => a.id === ar) || ARS[0]).aspect;
      const turns = (SPINS.find(s => s.id === spin) || SPINS[0]).turns;
      // 30fps, not 60: fewer frames means each gets more of X's fixed re-encode budget → sharper.
      const { blob, ext } = await window.__cityRecord({ seconds: secs, fps: 30, aspect, turns, onTick: p => setRec(r => ({ ...r, pct: p })) });
      downloadBlob(blob, `spx-city-${new Date().toISOString().slice(0, 10)}.${ext}`);
      setRec({ state: "idle", pct: 0, err: "" });
    } catch (e) { setRec({ state: "idle", pct: 0, err: e.message || "recording failed" }); }
    finally { onRecording?.(false); }
  };

  const chip = active => ({
    cursor: "pointer", padding: "3px 8px", borderRadius: 0, fontFamily: MONO, fontSize: 12,
    border: `1px solid ${active ? accent : "rgba(255,255,255,0.16)"}`,
    background: active ? `color-mix(in srgb, ${accent} 22%, transparent)` : "transparent",
    color: active ? "#eafff7" : "#94a3b8",
  });

  // While recording, the bar hides itself so a simultaneous OS screen-record (the only way to also
  // capture the DOM note signs) comes out clean, no UI in frame. It stays mounted (the capture is
  // already running) and reappears when the clip finishes.
  const recording = rec.state === "recording";
  return (
    <div style={{
      position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)", zIndex: 40,
      display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 12,
      background: "rgba(8,11,20,0.92)", border: "1px solid rgba(255,255,255,0.14)",
      fontFamily: MONO, color: "#cbd5e1", fontSize: 12.5, backdropFilter: "blur(6px)", flexWrap: "wrap", maxWidth: "94vw",
      opacity: recording ? 0 : 1, pointerEvents: recording ? "none" : "auto", transition: "opacity .18s ease",
    }}>
      <span style={{ color: "#7c8aa0" }}>🎥 click a building to pin</span>
      <span style={{ display: "flex", gap: 4 }}>
        {SECS.map(s => <button key={s} onClick={() => setSecs(s)} style={chip(s === secs)}>{s}s</button>)}
      </span>
      <span style={{ display: "flex", gap: 4 }}>
        {ARS.map(a => <button key={a.id} onClick={() => setAr(a.id)} style={chip(a.id === ar)}>{a.label}</button>)}
      </span>
      <span style={{ display: "flex", gap: 4 }}>
        {SPINS.map(s => <button key={s.id} onClick={() => setSpin(s.id)} style={chip(s.id === spin)}>{s.label}</button>)}
      </span>
      <button onClick={go} disabled={rec.state === "recording"} style={{
        cursor: rec.state === "recording" ? "default" : "pointer", padding: "5px 13px", borderRadius: 0,
        border: `1px solid ${accent}`, background: `color-mix(in srgb, ${accent} 20%, transparent)`,
        color: "#eafff7", fontFamily: MONO, fontWeight: 700, fontSize: 12.5,
      }}>{rec.state === "recording" ? `● Recording ${Math.round(rec.pct * 100)}%` : "Spin + Record"}</button>
      {rec.err && <span style={{ color: "#fb7185", maxWidth: 260 }}>{rec.err}</span>}
    </div>
  );
}
