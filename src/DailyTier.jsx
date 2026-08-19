import { useState } from "react";
import { SANS, MONO } from "./chart-ui.jsx";
import { pop } from "./CityGate.jsx";

// ── Members tier for the high-granularity (DAILY) view of the premium charts ──────────────────────
//
// ⚠ HONEST SCOPE (same as CityGate): this is a CLIENT-SIDE gate. The passphrase is written down in a
// PUBLIC repo and the underlying JSON is served publicly, so this adds FRICTION and a "members" feel,
// NOT real privacy, anyone determined can read the daily data anyway. The point is to keep the daily
// feed a small perk while the transparency moat stays intact: the COARSE (monthly) read is always
// free and public, so the honest number is never hidden, only the resolution is behind the word.
// If anything ever genuinely needs to be private it cannot live here; it would need the daily JSON
// held back from the public build behind a real auth'd endpoint.
//
// Same passphrase as the city (one word for the owner to share), but its OWN localStorage key so the
// two unlock independently, bump the suffix to re-lock every browser at once.
const HASH = 3343087233;                 // FNV-1a of the shared passphrase
const KEY = "spx-data-tier1";
const fnv = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
export const passOk = pw => fnv(String(pw).trim().toLowerCase()) === HASH;
export const dataUnlocked = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };
export const unlockData = () => { try { localStorage.setItem(KEY, "1"); } catch { /* private mode */ } };

// Hook: returns `daily` (whether to show the daily series) + `controls` (a Monthly / Daily segmented
// toggle with an inline passphrase prompt on the locked Daily option). Drop `controls` above a chart
// and switch its data on `daily`. `coarseLabel` names the free resolution (default "Monthly").
export function useDailyTier(accent = "#5eead4", coarseLabel = "Monthly") {
  const [unlocked, setUnlocked] = useState(dataUnlocked);
  const [daily, setDaily] = useState(false);          // default = the free, coarse view
  const [ask, setAsk] = useState(false);
  const [pw, setPw] = useState("");
  const [bad, setBad] = useState(false);

  const pickCoarse = () => { setDaily(false); setAsk(false); };
  const pickDaily = () => { if (unlocked) { setDaily(true); setAsk(false); } else setAsk(true); };
  const submit = e => {
    e.preventDefault();
    if (passOk(pw)) { unlockData(); setUnlocked(true); setDaily(true); setAsk(false); setBad(false); pop(); }
    else setBad(true);
  };

  const seg = (on, label, onClick, extra) => (
    <button onClick={onClick} style={{
      padding: "5px 13px", cursor: "pointer", fontFamily: MONO, fontSize: 12, border: "none",
      background: on ? "rgba(94,234,212,0.16)" : "transparent", color: on ? accent : "#94a3b8",
    }}>{label}{extra}</button>
  );

  const controls = (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontFamily: MONO, fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>resolution</span>
        <div style={{ display: "inline-flex", borderRadius: 0, overflow: "hidden", border: "1px solid rgba(255,255,255,0.14)" }}>
          {seg(!daily, coarseLabel, pickCoarse)}
          <span style={{ width: 1, background: "rgba(255,255,255,0.12)" }} />
          {seg(daily, "Daily", pickDaily, !unlocked && <span style={{ marginLeft: 5, opacity: 0.8 }}>🔒</span>)}
        </div>
      </div>
      {ask && !unlocked && (
        <form onSubmit={submit} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="password" value={pw} autoFocus onChange={e => { setPw(e.target.value); setBad(false); }}
            placeholder="members passphrase"
            style={{
              width: 190, padding: "7px 11px", borderRadius: 0, fontFamily: MONO, fontSize: 12.5,
              background: "rgba(255,255,255,0.05)", border: `1px solid ${bad ? "#fb7185" : "rgba(255,255,255,0.16)"}`,
              color: "#e2e8f0", outline: "none",
            }} />
          <button type="submit" style={{
            padding: "7px 15px", borderRadius: 0, cursor: "pointer", fontFamily: MONO, fontSize: 12.5,
            background: "rgba(255,255,255,0.08)", border: `1px solid ${accent}`, color: accent,
          }}>Unlock</button>
          {bad && <span style={{ color: "#fb7185", fontSize: 12 }}>Not that one.</span>}
        </form>
      )}
      {ask && !unlocked && (
        <div style={{ fontFamily: SANS, fontSize: 11.5, color: "#64748b", maxWidth: 420, textAlign: "center", lineHeight: 1.5 }}>
          Daily resolution is a members perk. The <strong style={{ color: "#94a3b8" }}>{coarseLabel.toLowerCase()}</strong> view is always free, same numbers, coarser cadence.
        </div>
      )}
    </div>
  );

  return { daily, controls };
}
