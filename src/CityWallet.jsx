import { useState, useEffect } from "react";
import { SANS, MONO } from "./chart-ui.jsx";
import {
  connectWallet, postNote, echoNote, loadNotes, validateMessage, hasWallet,
  currentChain, CHAINS, CHAIN_IDS, chainOf, isLive, anyLive, MAX_LEN,
} from "./city-messages.js";

// CLAIM YOUR BUILDING — connect an EVM wallet and write a note onto your building.
//
// The note is a transaction, not a record we keep. Nothing is stored here and nothing is stored on
// our servers: the chain has it, we read it back. So there's no signature to verify, no account, and
// no way for us to alter what somebody wrote.
//
// Two rules that are ours rather than the chain's, and are applied when DRAWING the city:
//   • only wallets with a building get a sign — the city is a map of holders, so a note on it should
//     mean somebody is really there. Anyone may write to the contract; the city shows its residents.
//   • links are never rendered, so the noticeboard can't become a billboard.
//
// The chain is a real choice with a real cost, so it's presented as one rather than hidden.
const short = a => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "");

export default function CityWallet({ city, owns, notes, onNotes, onFocus, accent = "#5eead4", isMobile }) {
  const [addr, setAddr] = useState(null);
  const [chain, setChain] = useState("base");
  const [text, setText] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(null);          // null | "connecting" | "posting"
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(null);

  const mine = addr ? notes?.[addr] : null;
  const hasHome = addr ? !!owns?.(addr) : false;
  const live = isLive(chain);

  // Pick the existing note back up, so editing is the default rather than a blank box.
  useEffect(() => { if (mine && !text) setText(mine.text); }, [mine]);   // eslint-disable-line react-hooks/exhaustive-deps

  const connect = async () => {
    setErr(null); setBusy("connecting");
    try {
      const a = await connectWallet();
      setAddr(a); setOpen(true);
      const c = await currentChain();
      if (c) setChain(c);                          // meet them where their wallet already is
      if (owns?.(a)) onFocus?.(a);
    } catch (e) { setErr(e?.message || "Could not connect."); }
    finally { setBusy(null); }
  };

  const post = async () => {
    const bad = validateMessage(text);
    if (bad) { setErr(bad); return; }
    setErr(null); setBusy("posting");
    try {
      const tx = await postNote({ address: addr, chain, city, text });
      // Show it straight away rather than after tomorrow's read of the chain.
      echoNote({ address: addr, chain, city, text, tx });
      onNotes?.(await loadNotes(city));
      setSent({ tx, chain });
      onFocus?.(addr);
    } catch (e) {
      setErr(e?.code === 4001 || /reject|denied/i.test(e?.message || "")
        ? "Transaction rejected — nothing was sent and nothing was spent."
        : (e?.message || "Could not post your note."));
    } finally { setBusy(null); }
  };

  const btn = (primary, disabled) => ({
    padding: "6px 14px", borderRadius: 8, fontFamily: MONO, fontSize: 12,
    cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1,
    background: primary ? `${accent}22` : "transparent",
    border: `1px solid ${primary ? accent : "rgba(255,255,255,0.14)"}`,
    color: primary ? accent : "#94a3b8",
  });

  // Not deployed anywhere yet — say so plainly instead of offering a button that can't work.
  if (!anyLive()) {
    return (
      <div style={{ textAlign: "center", marginBottom: 12, fontFamily: SANS, fontSize: 12.5, color: "#64748b" }}>
        🏗 The city noticeboard is built but not deployed yet — notes will be written straight to the
        chain, so nothing is stored here and nobody can edit or delete them, us included.
      </div>
    );
  }

  if (!addr) {
    return (
      <div style={{ textAlign: "center", marginBottom: 12 }}>
        <button onClick={connect} disabled={busy} style={btn(true, !!busy)}>
          {busy === "connecting" ? "Connecting…" : "🔑 Claim your building"}
        </button>
        <div style={{ fontFamily: SANS, fontSize: 12, color: err ? "#fb7185" : "#64748b", marginTop: 7 }}>
          {err || (hasWallet()
            ? "Connect a wallet to write a note onto your building. It goes on-chain — we store nothing."
            : "Needs an EVM wallet (MetaMask, Rabby, Coinbase Wallet) — or open this page in your wallet's browser.")}
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 12, maxWidth: 580, marginInline: "auto" }}>
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
          Only wallets with a building get a sign — the city is a map of holders, so a note on it
          should mean someone is really there.
        </div>
      )}

      {hasHome && open && (
        <div style={{ marginTop: 10, padding: 12, borderRadius: 12, background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.10)" }}>
          {/* Chain picker. Each option carries its own colour AND its name, matching the sign that
              will hang over the building, so you can see before posting how it will read. */}
          <div style={{ display: "flex", gap: 6, marginBottom: 9, flexWrap: "wrap" }}>
            {CHAIN_IDS.map(id => {
              const c = CHAINS[id], on = chain === id, dead = !isLive(id);
              return (
                <button key={id} onClick={() => { setChain(id); setErr(null); }} disabled={dead}
                  title={dead ? "Not deployed on this chain yet" : c.blurb}
                  style={{
                    display: "flex", alignItems: "center", gap: 7, padding: "5px 11px", borderRadius: 8,
                    cursor: dead ? "not-allowed" : "pointer", opacity: dead ? 0.4 : 1,
                    fontFamily: MONO, fontSize: 11.5,
                    background: on ? c.tint : "transparent",
                    border: `1px solid ${on ? c.colour : "rgba(255,255,255,0.12)"}`,
                    color: on ? "#e2e8f0" : "#94a3b8",
                  }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: c.colour, flex: "0 0 auto" }} />
                  {c.label}
                </button>
              );
            })}
            <span style={{ fontFamily: SANS, fontSize: 11.5, color: "#7c8a9e", alignSelf: "center" }}>{chainOf(chain).blurb}</span>
          </div>

          <textarea value={text} maxLength={MAX_LEN + 40} rows={isMobile ? 3 : 2}
            onChange={e => { setText(e.target.value); setErr(null); setSent(null); }}
            placeholder="Say something to the city…"
            style={{
              width: "100%", boxSizing: "border-box", padding: "8px 11px", borderRadius: 9, resize: "vertical",
              fontFamily: SANS, fontSize: 13.5, lineHeight: 1.5, background: "rgba(0,0,0,0.28)",
              border: `1px solid ${err ? "#fb7185" : chainOf(chain).colour + "66"}`, color: "#e2e8f0", outline: "none",
            }} />
          <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", marginTop: 8, flexWrap: "wrap" }}>
            <span style={{ fontFamily: MONO, fontSize: 11.5, color: text.trim().length > MAX_LEN ? "#fb7185" : "#64748b" }}>
              {text.trim().length}/{MAX_LEN}
            </span>
            <button onClick={post} disabled={!!busy || !live} style={btn(true, !!busy || !live)}>
              {busy === "posting" ? "Waiting for wallet…" : `Post on ${chainOf(chain).label}`}
            </button>
          </div>

          {err && <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#fb7185", marginTop: 8 }}>{err}</div>}
          {sent && (
            <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#4ade80", marginTop: 8, lineHeight: 1.55 }}>
              Sent. Your sign is up as soon as the transaction confirms —{" "}
              <a href={chainOf(sent.chain).explorer + sent.tx} target="_blank" rel="noopener noreferrer"
                style={{ color: chainOf(sent.chain).colour }}>check it on {chainOf(sent.chain).label}</a>.
            </div>
          )}
          <div style={{ fontFamily: SANS, fontSize: 11.5, color: "#7c8a9e", marginTop: 9, lineHeight: 1.55 }}>
            This writes to the chain, so it is permanent: posting again replaces what the city shows,
            but the old note stays on-chain forever and nobody can delete it — including us.
          </div>
        </div>
      )}
    </div>
  );
}
