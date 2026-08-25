import { useEffect, useMemo, useState } from "react";
import { loadWhaleEntry } from "./history-data.js";
import { SANS, MONO, MAX_W } from "./chart-ui.jsx";
import { walletGradient } from "./WalletCard.jsx";

// ⭐ "YOUR SPX STORY" — a personal, shareable card. Paste your wallet → your bag, when you bought, how
// long you've held, the drawdown you sat through, and your building tier in SPX City, on one card with
// a Share-on-X button. The viral loop: people share their OWN identity. Honesty rail: it celebrates
// TENURE + CONVICTION (held-through, resident-since) and reports profit as a plain retrospective fact,
// never a grade or leaderboard. PROTOTYPE: covers ≥100k wallets (whale-entry.json) for now; a ≥5k
// resident tier can follow off whales.json/spx-timeline. Every number is reproducible.

const short = a => a.slice(0, 6) + "…" + a.slice(-4);
const kM = v => { const x = Math.abs(v); return x >= 1e6 ? +(v / 1e6).toFixed(x / 1e6 < 10 ? 1 : 0) + "M" : Math.round(v / 1e3) + "k"; };
const fmtDate = t => new Date(t).toLocaleDateString(undefined, { year: "numeric", month: "long" });
const fmtPrice = p => (p >= 1 ? "$" + p.toFixed(2) : "$" + p.toFixed(p < 0.01 ? 4 : 3));
const RAINBOW = "linear-gradient(90deg,#7c3aed,#2563eb,#06b6d4,#10b981,#a3e635,#fde047,#fb923c,#ef4444)";
const PMIN = 0.001, PMAX = 2.6, LG0 = Math.log10(PMIN), LG1 = Math.log10(PMAX);
// city-style building tier from bag — ties the card to SPX City
const tierOf = bag => bag >= 5e6 ? "🏙 Skyscraper" : bag >= 1e6 ? "🏢 Tower" : bag >= 25e4 ? "🏬 Mid-rise" : "🏠 Townhouse";

function priceSpark(curve, entryT, entryP, nowP, w, h) {
  if (!curve?.length) return null;
  const t0 = curve[0][0], t1 = curve[curve.length - 1][0], span = Math.max(1, t1 - t0);
  const X = t => 4 + ((t - t0) / span) * (w - 8);
  const Y = p => { const lg = Math.log10(Math.max(PMIN, Math.min(PMAX, p))); return h - 4 - ((lg - LG0) / (LG1 - LG0)) * (h - 8); };
  const d = curve.map(([t, p], i) => `${i ? "L" : "M"}${X(t).toFixed(1)},${Y(p).toFixed(1)}`).join("");
  const up = entryP < nowP;
  return { d, ex: X(entryT), ey: Y(entryP), nx: X(t1), ny: Y(nowP), up };
}

export default function StoryCard({ wallet, price, isMobile }) {
  const [data, setData] = useState(undefined);
  const [q, setQ] = useState(wallet || "");
  const [addr, setAddr] = useState((wallet || "").toLowerCase());
  const [err, setErr] = useState("");

  useEffect(() => { let off = false; loadWhaleEntry().then(d => { if (!off) setData(d ?? null); }); return () => { off = true; }; }, []);

  const livePrice = (price && price > 0) ? price : (data ? data.price : 0);
  const story = useMemo(() => {
    if (!data) return null;
    // whale-entry.json is address-stripped for the public (the data wall) — matching a pasted wallet
    // needs the addresses, which only members get from KV. If none are present, this is a member feature.
    const hasAddr = Array.isArray(data.whales) && data.whales.some(x => x && x.a);
    if (!hasAddr) return { gated: true };
    if (!addr) return null;
    const w = data.whales.find(x => x?.a && x.a.toLowerCase() === addr);
    if (!w) return { notFound: true };
    // deepest drawdown the wallet SAT THROUGH after buying — the conviction fact
    let peak = w.cost, dd = 0;
    for (const [t, p] of data.curve) if (t >= w.t) { peak = Math.max(peak, p); dd = Math.max(dd, 1 - p / peak); }
    const months = Math.max(0, Math.round((data.now - w.t) / (30.44 * 864e5)));
    const inProfit = w.cost < livePrice;
    return { w, dd: Math.round(dd * 100), months, inProfit, mult: livePrice / w.cost };
  }, [data, addr, livePrice]);

  const submit = e => { e.preventDefault(); const k = q.trim().toLowerCase(); if (!k) return; setAddr(k); setErr(""); try { const u = new URL(location.href); u.searchParams.set("view", "story"); u.searchParams.set("wallet", k); history.replaceState(null, "", u); } catch { /* */ } };
  const shareX = () => {
    if (!story?.w) return;
    const s = story, w = s.w;
    const line = `My SPX6900 story: ${kM(w.bag)} SPX, held ${s.months} months through a −${s.dd}% drawdown${s.inProfit ? `, now ${s.mult.toFixed(1)}× on my bag` : ""}. Find yours 👇`;
    const url = `${location.origin}/?view=story&wallet=${w.a}`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(line)}&url=${encodeURIComponent(url)}`, "_blank", "noopener");
  };

  const CARD_W = isMobile ? 340 : 460;
  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto", padding: isMobile ? "6px 4px 40px" : "10px 8px 60px" }}>
      <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: ".08em", color: "#5eead4", marginBottom: 8 }}><span style={{ color: "#64748b" }}>spx6900 ~ %</span> ./my-spx-story</div>
      <h2 style={{ fontFamily: SANS, fontSize: isMobile ? 28 : 40, fontWeight: 800, letterSpacing: "-.02em", textTransform: "uppercase", color: "#f1f5f9", margin: "0 0 4px", lineHeight: 1 }}>Your SPX Story</h2>
      <div style={{ height: 3, background: RAINBOW, maxWidth: 560, margin: "10px 0 12px" }} />
      <div style={{ fontFamily: SANS, fontSize: isMobile ? 13.5 : 15, color: "#c8d1de", lineHeight: 1.5, maxWidth: 620 }}>
        Paste your wallet and get your card — your bag, when you bought, how long you've held, and the drawdown you sat through. Then share it.
      </div>

      <form onSubmit={submit} style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "16px 0 20px" }}>
        <input value={q} onChange={e => { setQ(e.target.value); setErr(""); }} placeholder="paste your wallet address (0x…)" spellCheck={false} autoCapitalize="off" autoCorrect="off"
          style={{ flex: "1 1 280px", minWidth: 0, maxWidth: 480, padding: "10px 13px", borderRadius: 0, fontFamily: MONO, fontSize: 13, background: "#0a0e1c", border: "1px solid rgba(255,255,255,0.16)", color: "#e2e8f0", outline: "none" }} />
        <button type="submit" style={{ padding: "10px 20px", borderRadius: 0, fontFamily: MONO, fontSize: 13, fontWeight: 700, background: "#5eead4", color: "#04140f", border: "1px solid #5eead4", cursor: "pointer" }}>Tell my story</button>
      </form>

      {data === undefined && <div style={{ fontFamily: MONO, color: "#64748b" }}>loading…</div>}
      {story?.gated && (
        <div style={{ maxWidth: 520, padding: "18px 20px", borderRadius: 12, background: "rgba(94,234,212,0.06)", border: "1px solid rgba(94,234,212,0.25)" }}>
          <div style={{ fontFamily: SANS, fontSize: 16, fontWeight: 700, color: "#f1f5f9" }}>Your SPX Story is a members feature</div>
          <div style={{ fontFamily: SANS, fontSize: 13.5, color: "#c8d1de", lineHeight: 1.55, margin: "6px 0 14px" }}>
            Building a story matches your wallet against the on-chain holder data, which lives behind the members wall. Log in with X to unlock it.
          </div>
          <a href="/api/auth?action=login" style={{ display: "inline-block", padding: "10px 18px", borderRadius: 0, fontFamily: MONO, fontSize: 13, fontWeight: 700, background: "#5eead4", color: "#04140f", border: "1px solid #5eead4", textDecoration: "none" }}>Log in with X →</a>
        </div>
      )}
      {story?.notFound && <div style={{ fontFamily: MONO, fontSize: 13, color: "#fb7185" }}>That wallet isn't in the set yet — the prototype covers current holders of ≥100k SPX. (A ≥5k resident tier is coming.)</div>}

      {story?.w && (() => {
        const w = story.w, sp = priceSpark(data.curve, w.t, w.cost, livePrice, CARD_W - 4, 92);
        const col = story.inProfit ? "#4ade80" : "#fb7185";
        return (
          <div>
            {/* the shareable card */}
            <div id="storycard" style={{ width: CARD_W, maxWidth: "100%", background: "linear-gradient(180deg,#0c1020,#06070e)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, overflow: "hidden", position: "relative", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
              <div style={{ height: 4, background: RAINBOW }} />
              <div style={{ padding: isMobile ? "16px 16px 18px" : "20px 22px 22px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 14 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 10, background: walletGradient(w.a), flex: "0 0 auto", border: "1px solid rgba(255,255,255,0.14)" }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>{short(w.a)}</div>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: "#5eead4" }}>{tierOf(w.bag)} · SPX City</div>
                  </div>
                  <div style={{ marginLeft: "auto", textAlign: "right" }}>
                    <div style={{ fontFamily: SANS, fontSize: 26, fontWeight: 800, color: "#f8fafc", lineHeight: 1 }}>{kM(w.bag)}</div>
                    <div style={{ fontFamily: MONO, fontSize: 11, color: "#94a3b8" }}>SPX held</div>
                  </div>
                </div>

                {sp && (
                  <svg width={CARD_W - 4} height={92} viewBox={`0 0 ${CARD_W - 4} 92`} style={{ display: "block", width: "100%", margin: "2px 0 12px" }}>
                    <path d={sp.d} fill="none" stroke="rgba(219,228,255,0.45)" strokeWidth="1.3" />
                    <line x1={4} y1={sp.ny} x2={CARD_W - 8} y2={sp.ny} stroke="rgba(94,234,212,0.55)" strokeWidth="1" strokeDasharray="5 4" />
                    <circle cx={sp.ex} cy={sp.ey} r="6" fill={col} fillOpacity="0.9" />
                    <circle cx={sp.ex} cy={sp.ey} r="10" fill="none" stroke={col} strokeOpacity="0.5" />
                    <circle cx={sp.nx} cy={sp.ny} r="3.5" fill="#5eead4" />
                    <text x={sp.ex} y={sp.ey - 13} fill={col} fontSize="10" fontFamily={MONO} textAnchor="middle" fontWeight="700">you bought here</text>
                  </svg>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 14px" }}>
                  {[
                    ["Bought", fmtDate(w.t)],
                    ["Entry price", fmtPrice(w.cost)],
                    ["Held for", story.months >= 12 ? `${(story.months / 12).toFixed(1)} years` : `${story.months} months`],
                    ["Sat through", `−${story.dd}% drawdown`],
                  ].map(([l, v]) => (
                    <div key={l}>
                      <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: "#7c8a9e" }}>{l}</div>
                      <div style={{ fontFamily: SANS, fontSize: 16, fontWeight: 700, color: "#f1f5f9", marginTop: 2 }}>{v}</div>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 15, padding: "10px 12px", borderRadius: 10, background: story.inProfit ? "rgba(34,197,94,0.12)" : "rgba(251,113,133,0.1)", border: `1px solid ${story.inProfit ? "rgba(34,197,94,0.4)" : "rgba(251,113,133,0.35)"}` }}>
                  <span style={{ fontFamily: SANS, fontSize: 15, fontWeight: 800, color: col }}>{story.inProfit ? `In profit · ${story.mult.toFixed(1)}× on your bag` : `Underwater · holding at ${story.mult.toFixed(2)}× cost`}</span>
                  <div style={{ fontFamily: SANS, fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{story.inProfit ? "You held. It paid." : "Bought high, never sold — the strongest hands are forged here."}</div>
                </div>

                <div style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: "#5e6b82" }}>spx6900rainbow.xyz</span>
                  <span style={{ fontFamily: MONO, fontSize: 10.5, color: "#5e6b82" }}>reproducible · not advice</span>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              <button onClick={shareX} style={{ padding: "10px 20px", borderRadius: 0, fontFamily: MONO, fontSize: 13, fontWeight: 700, background: "#f1f5f9", color: "#0a0e1c", border: "1px solid #f1f5f9", cursor: "pointer" }}>Share on 𝕏 →</button>
              <a href={`https://app.zerion.io/${w.a}/overview`} target="_blank" rel="noopener noreferrer" style={{ padding: "10px 16px", borderRadius: 0, fontFamily: MONO, fontSize: 13, color: "#5eead4", border: "1px solid rgba(255,255,255,0.16)", textDecoration: "none" }}>open in Zerion ↗</a>
            </div>
            <p style={{ fontFamily: SANS, fontSize: 11.5, color: "#7c8a9e", lineHeight: 1.5, margin: "12px 2px 0", maxWidth: 520 }}>
              Coin-weighted entry (when your coins arrived) × your average cost, from weekly Ethereum balances. "Held through" is the deepest drawdown since you bought. Current ≥100k holders only — a retrospective read on conviction, not financial advice.
            </p>
          </div>
        );
      })()}
    </div>
  );
}
