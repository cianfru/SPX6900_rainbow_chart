import { useState, useEffect } from "react";
import { SANS, MONO } from "./chart-ui.jsx";
import { store, connectWallet, signClaim, validateMessage, hasWallet, MAX_LEN } from "./city-messages.js";

// CLAIM YOUR BUILDING — connect an EVM wallet, prove you own it, leave a note on your building.
//
// Only wallets that actually have a building can post. That's the whole gate: the city is a map of
// holders, so a message on it should mean somebody is really there. A wallet with no building gets
// told plainly rather than being given a floating sign over an empty lot.
//
// The signature is proof, not payment — `personal_sign` costs nothing and sends no transaction, and
// the text being signed says so, because a wallet popup with no explanation is how people get
// phished. See city-messages.js for the storage caveat.
const short = a => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "");

export default function CityWallet({ city, owns, messages, onChange, onFocus, accent = "#5eead4", isMobile }) {
  const [addr, setAddr] = useState(null);
  const [text, setText] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const mine = addr ? messages?.[addr] : null;
  const hasHome = addr ? !!owns?.(addr) : false;

  // Pick the message back up when the wallet reconnects, so editing is the default not a re-write.
  useEffect(() => { if (mine && !text) setText(mine.text); }, [mine]);   // eslint-disable-line react-hooks/exhaustive-deps

  const connect = async () => {
    setErr(null); setBusy(true);
    try {
      const a = await connectWallet();
      setAddr(a); setOpen(true);
      if (owns?.(a)) onFocus?.(a);            // fly them to their own building
    } catch (e) { setErr(e?.message || "Could not connect."); }
    finally { setBusy(false); }
  };

  const save = async () => {
    const bad = validateMessage(text);
    if (bad) { setErr(bad); return; }
    setErr(null); setBusy(true);
    try {
      const { statement, sig } = await signClaim(addr, city, text.trim());
      const all = await store.put(city, { address: addr, text: text.trim(), statement, sig });
      onChange?.(all);
      onFocus?.(addr);
    } catch (e) {
      setErr(e?.code === 4001 ? "Signature declined — nothing was saved." : (e?.message || "Could not save your message."));
    } finally { setBusy(false); }
  };

  const clear = async () => {
    setBusy(true);
    try { onChange?.(await store.remove(city, addr)); setText(""); }
    finally { setBusy(false); }
  };

  const btn = (primary, disabled) => ({
    padding: "6px 14px", borderRadius: 8, fontFamily: MONO, fontSize: 12,
    cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1,
    background: primary ? `${accent}22` : "transparent",
    border: `1px solid ${primary ? accent : "rgba(255,255,255,0.14)"}`,
    color: primary ? accent : "#94a3b8",
  });

  if (!addr) {
    return (
      <div style={{ textAlign: "center", marginBottom: 12 }}>
        <button onClick={connect} disabled={busy} style={btn(true, busy)}>
          {busy ? "Connecting…" : "🔑 Claim your building"}
        </button>
        <div style={{ fontFamily: SANS, fontSize: 12, color: err ? "#fb7185" : "#64748b", marginTop: 7 }}>
          {err || (hasWallet()
            ? "Connect a wallet to leave a message on your building. Signing is free and sends no transaction."
            : "Needs an EVM wallet (MetaMask, Rabby, Coinbase Wallet) — or open this page in your wallet's browser.")}
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 12, maxWidth: 560, marginInline: "auto" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
        <span style={{ fontFamily: MONO, fontSize: 12, color: accent }}>{short(addr)}</span>
        <span style={{ fontFamily: SANS, fontSize: 12, color: hasHome ? "#94a3b8" : "#fbbf24" }}>
          {hasHome ? "you own a building here" : "no building here yet"}
        </span>
        {hasHome && <button onClick={() => setOpen(o => !o)} style={btn(false, false)}>{open ? "Close" : mine ? "Edit note" : "Leave a note"}</button>}
        {hasHome && <button onClick={() => onFocus?.(addr)} style={btn(false, false)}>Go to it</button>}
      </div>

      {!hasHome && (
        <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#94a3b8", textAlign: "center", marginTop: 8, lineHeight: 1.6 }}>
          Only wallets with a building can post — the city is a map of holders, so a note on it should
          mean someone is really there.
        </div>
      )}

      {hasHome && open && (
        <div style={{ marginTop: 10, padding: 12, borderRadius: 12, background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.10)" }}>
          <textarea value={text} maxLength={MAX_LEN + 40} rows={isMobile ? 3 : 2}
            onChange={e => { setText(e.target.value); setErr(null); }}
            placeholder="Say something to the city…"
            style={{
              width: "100%", boxSizing: "border-box", padding: "8px 11px", borderRadius: 9, resize: "vertical",
              fontFamily: SANS, fontSize: 13.5, lineHeight: 1.5, background: "rgba(0,0,0,0.28)",
              border: `1px solid ${err ? "#fb7185" : "rgba(255,255,255,0.14)"}`, color: "#e2e8f0", outline: "none",
            }} />
          <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", marginTop: 8, flexWrap: "wrap" }}>
            <span style={{ fontFamily: MONO, fontSize: 11.5, color: text.trim().length > MAX_LEN ? "#fb7185" : "#64748b" }}>
              {text.trim().length}/{MAX_LEN}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              {mine && <button onClick={clear} disabled={busy} style={btn(false, busy)}>Remove</button>}
              <button onClick={save} disabled={busy} style={btn(true, busy)}>{busy ? "Waiting for wallet…" : mine ? "Update note" : "Sign & post"}</button>
            </div>
          </div>
          {err && <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#fb7185", marginTop: 8 }}>{err}</div>}
          {!store.persistent && (
            <div style={{ fontFamily: SANS, fontSize: 12, color: "#fbbf24", marginTop: 8, lineHeight: 1.55 }}>
              ⚠ Notes are saved in <b>this browser only</b> for now — nobody else can see them yet. The shared
              city noticeboard turns on when the backend lands; your signature is what will carry it over.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
