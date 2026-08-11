import { useState } from "react";

// The public "we're rebuilding" curtain shown while the redesign is finished IN
// production. Gating lives in main.jsx: the app only renders behind this page when a
// preview token is present (?preview=<token> once, then persisted in localStorage), so
// the owner can view and debug the real redesigned site while the public sees this.
//
// HONEST SCOPE: this is a UX curtain, not security. The app bundle still ships; a
// determined visitor could bypass it. It exists to keep the unfinished redesign out of
// the way of casual visitors, nothing more.

const LOGO = "/logo_rainbow.png";
const X_URL = "https://x.com/SPX6900Rainbow";
const RAINBOW = "linear-gradient(90deg,#7c3aed,#2563eb,#06b6d4,#10b981,#a3e635,#fde047,#fb923c,#ef4444)";

export default function Maintenance({ token }) {
  const [pw, setPw] = useState("");
  const [bad, setBad] = useState(false);
  const submit = (e) => {
    e.preventDefault();
    if (pw.trim() === token) {
      try { localStorage.setItem("spx_preview", token); } catch { /* ignore */ }
      window.location.reload();
    } else {
      setBad(true);
    }
  };
  return (
    <div style={{
      minHeight: "100vh", width: "100%", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 22, padding: "40px 22px",
      background: "radial-gradient(100% 60% at 50% -8%, rgba(78,231,154,.05), transparent 60%), #08090b",
      color: "#f4f6f9", fontFamily: "'Geist','Space Grotesk',system-ui,sans-serif", textAlign: "center",
    }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
        <img src={LOGO} alt="" style={{ height: 40, width: 40, objectFit: "contain", mixBlendMode: "screen" }} />
        <span style={{ fontFamily: "'Geist Mono',ui-monospace,monospace", fontSize: 19, letterSpacing: ".01em" }}>SPX6900/Rainbow</span>
      </div>

      <div style={{ height: 3, width: "min(560px, 78vw)", borderRadius: 2, background: RAINBOW }} />

      <h1 style={{ fontSize: "clamp(30px, 6vw, 54px)", fontWeight: 800, margin: "6px 0 0", letterSpacing: "-0.02em", lineHeight: 1.05 }}>
        We&rsquo;re rebuilding.
      </h1>
      <p style={{ fontSize: "clamp(15px, 2.4vw, 18px)", color: "#9aa3b2", maxWidth: 560, lineHeight: 1.6, margin: 0 }}>
        The SPX6900 Rainbow terminal is getting a major upgrade, deeper on-chain analytics,
        a faster interface, the same honest, reproducible numbers. Back soon.
      </p>

      <a href={X_URL} target="_blank" rel="noopener noreferrer" style={{
        marginTop: 4, display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 16px", borderRadius: 8,
        border: "1px solid #2c303a", color: "#cbd5e1", textDecoration: "none",
        fontFamily: "'Geist Mono',ui-monospace,monospace", fontSize: 13, letterSpacing: ".04em",
      }}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
        Follow @SPX6900Rainbow for updates
      </a>

      {/* subtle team-access unlock, owner enters the preview token to view the live redesign */}
      <form onSubmit={submit} style={{ marginTop: 26, display: "inline-flex", gap: 8, alignItems: "center", opacity: 0.85 }}>
        <input
          type="password" value={pw} onChange={(e) => { setPw(e.target.value); setBad(false); }}
          placeholder="team access" aria-label="Team access"
          style={{
            background: "#0e1013", border: `1px solid ${bad ? "#e5342f" : "#2c303a"}`, borderRadius: 7,
            padding: "8px 12px", color: "#f4f6f9", fontFamily: "'Geist Mono',ui-monospace,monospace",
            fontSize: 13, outline: "none", width: 160,
          }}
        />
        <button type="submit" style={{
          background: "#12161c", border: "1px solid #2c303a", borderRadius: 7, padding: "8px 14px",
          color: "#9aa3b2", fontFamily: "'Geist Mono',ui-monospace,monospace", fontSize: 13, cursor: "pointer",
        }}>enter</button>
      </form>
    </div>
  );
}
