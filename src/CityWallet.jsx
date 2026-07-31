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

// A small drawn key — replaces the emoji on "Claim your building" so it inherits the button colour.
// Module scope so it isn't re-created every render.
const KeyIcon = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6, verticalAlign: "-2px" }}>
    <circle cx="7.5" cy="15.5" r="4" /><path d="M10.3 12.7 20 3M16.5 6.5l2.5 2.5M14.5 8.5l2 2" />
  </svg>
);

// `owns` and `inView` are deliberately two different questions, because the city has one
// noticeboard and three populations. Whether you MAY leave a note is citizenship — you hold either
// asset, so you live here — while whether you can be FLOWN to is about the mode currently on
// screen, since a building that isn't drawn cannot be visited. Collapsing them, as this did while
// there was only one population, silently made your right to post depend on which toggle you were
// holding, and on how many buildings you had chosen to render.
export default function CityWallet({ city, owns, inView, notes, onNotes, onFocus, accent = "#5eead4", isMobile }) {
  const [addr, setAddr] = useState(null);
  const [chain, setChain] = useState("base");
  const [text, setText] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(null);          // null | "connecting" | "posting"
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(null);

  const mine = addr ? notes?.[addr] : null;
  const hasHome = addr ? !!owns?.(addr) : false;
  // Defaults to hasHome so a caller that only passes `owns` behaves exactly as before.
  const here = addr ? (inView ? !!inView(addr) : hasHome) : false;
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
      // Fly there only if it is actually on screen — a citizen whose building belongs to another
      // mode has nothing here to fly to, and the camera would lurch off to an empty lot.
      if (inView ? inView(a) : owns?.(a)) onFocus?.(a);
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

  // The site's shared neon toggle, matched to the rest of the city panel. `primary` reads as the
  // active/accent state; disabled dims and blocks it.
  const btn = (primary, disabled) => ({
    className: `neon-pill${primary && !disabled ? " active" : ""}`,
    style: {
      padding: "6px 14px", borderRadius: 8, fontFamily: MONO, fontSize: 12,
      cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1,
      color: primary ? "#f8fafc" : "#94a3b8", "--glow": accent,
    },
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
        <button onClick={connect} disabled={busy} {...btn(true, !!busy)}>
          {busy === "connecting" ? "Connecting…" : <><KeyIcon />Claim your building</>}
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
          {hasHome ? (here ? "you own a building here" : "you live here — not in this view") : "no building here yet"}
        </span>
        {hasHome && <button onClick={() => setOpen(o => !o)} {...btn(false, false)}>{open ? "Close" : mine ? "Edit note" : "Leave a note"}</button>}
        {here && <button onClick={() => onFocus?.(addr)} {...btn(false, false)}>Go to it</button>}
      </div>

      {!hasHome && (
        <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#94a3b8", textAlign: "center", marginTop: 8, lineHeight: 1.6 }}>
          Only wallets with a building get a sign — the city is a map of holders, so a note on it
          should mean someone is really there.
        </div>
      )}

      {hasHome && !here && (
        <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#94a3b8", textAlign: "center", marginTop: 8, lineHeight: 1.6 }}>
          Your building stands in another mode, so your sign hangs there. You can still write it from
          here — a note belongs to the wallet, not to the view.
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
            <button onClick={post} disabled={!!busy || !live} {...btn(true, !!busy || !live)}>
              {busy === "posting" ? "Waiting for wallet…" : `Post on ${chainOf(chain).label}`}
            </button>
          </div>

          {err && <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#fb7185", marginTop: 8 }}>{err}</div>}
          {sent && (
            <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#4ade80", marginTop: 8, lineHeight: 1.55 }}>
              Sent — it's on-chain now, and you can see your own sign here straight away. Everyone else
              sees it within about a day, when the city next reads the chain.{" "}
              <a href={chainOf(sent.chain).explorer + sent.tx} target="_blank" rel="noopener noreferrer"
                style={{ color: chainOf(sent.chain).colour }}>Check the transaction on {chainOf(sent.chain).label}</a>.
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
