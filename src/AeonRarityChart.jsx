import { useMemo, useState, useEffect } from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceDot } from "recharts";
import { loadAeonRarity } from "./history-data.js";
import { SANS, MONO, MAX_W, Explain } from "./chart-ui.jsx";

// Rarity tiers by rank percentile (rank 1 = rarest).
const TIERS = [
  { name: "Legendary", max: 0.01, c: "#f59e0b" },
  { name: "Epic", max: 0.05, c: "#a855f7" },
  { name: "Rare", max: 0.15, c: "#3b82f6" },
  { name: "Uncommon", max: 0.40, c: "#22d3ee" },
  { name: "Common", max: 1.01, c: "#64748b" },
];
const tierOf = (rank, total) => TIERS.find(t => rank / total <= t.max) || TIERS.at(-1);

// Project Aeon — trait rarity. "Where does this NFT sit?" Look up any token → its rank,
// tier, traits (each with how rare it is), and where it lands on the collection's rarity curve.
export default function AeonRarityChart({ isMobile }) {
  const [data, setData] = useState(null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);       // selected token id
  const [imgBroken, setImgBroken] = useState(false);
  useEffect(() => { let c = false; loadAeonRarity().then(d => { if (!c && d) { setData(d); setSel(d.tokens[0].id); } }); return () => { c = true; }; }, []);
  useEffect(() => { setImgBroken(false); }, [sel]);

  const byId = useMemo(() => { const m = new Map(); (data?.tokens || []).forEach(t => m.set(t.id, t)); return m; }, [data]);
  // rarity curve: score vs rank, downsampled for the line
  const curve = useMemo(() => {
    if (!data) return [];
    const toks = data.tokens; const step = Math.max(1, Math.floor(toks.length / 240));
    const out = toks.filter((_, i) => i % step === 0 || i === toks.length - 1).map(t => ({ rank: t.rank, score: t.score }));
    return out;
  }, [data]);

  if (!data) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading rarity…</div>;

  const total = data.total;
  const token = byId.get(sel) || data.tokens[0];
  const tier = tierOf(token.rank, total);
  const pctile = (100 * (1 - (token.rank - 1) / total));
  const submit = () => { const id = parseInt(q, 10); if (byId.has(id)) setSel(id); };
  const random = () => setSel(data.tokens[Math.floor(Math.random() * data.tokens.length)].id);

  // trait rows for the selected token, rarest first
  const traits = token.traits.map(a => {
    const info = data.traits[a.t]?.[a.v];
    return { t: a.t, v: a.v, pct: info?.pct ?? null, count: info?.count ?? null };
  }).sort((x, y) => (x.pct ?? 100) - (y.pct ?? 100));

  const input = { padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "#0b0f1c", color: "#e2e8f0", fontFamily: MONO, fontSize: 15, width: 130 };
  const btn = (c) => ({ padding: "8px 16px", borderRadius: 8, border: "1px solid " + c + "66", background: c + "22", color: c, fontFamily: SANS, fontSize: 14, cursor: "pointer" });

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="Where does this AEON sit?" accent="#f59e0b">
        Every token scored by <strong style={{ color: "#e2e8f0" }}>how rare its traits are</strong> (rarer trait → higher score), then ranked 1&nbsp;(rarest) to {total.toLocaleString()}.
        Look up any token to see its <strong style={{ color: "#f59e0b" }}>rank, tier and traits</strong> — and where it lands on the collection&apos;s rarity curve. Fully reproducible from on-chain metadata.
      </Explain>

      <div style={{ display: "flex", gap: 10, justifyContent: "center", alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <span style={{ fontFamily: SANS, color: "#94a3b8", fontSize: 14 }}>Token #</span>
        <input style={input} value={q} placeholder={"" + token.id} onChange={e => setQ(e.target.value.replace(/[^0-9]/g, ""))}
          onKeyDown={e => e.key === "Enter" && submit()} inputMode="numeric" />
        <button style={btn("#f59e0b")} onClick={submit}>Look up</button>
        <button style={btn("#64748b")} onClick={random}>🎲 Random</button>
      </div>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", justifyContent: "center", alignItems: "flex-start", marginBottom: 18 }}>
        {/* token card */}
        <div style={{ width: isMobile ? "100%" : 300, background: "rgba(13,15,28,0.6)", border: "1px solid " + tier.c + "55", borderRadius: 14, overflow: "hidden" }}>
          {token.img && !imgBroken
            ? <img src={token.img} alt={"AEON #" + token.id} onError={() => setImgBroken(true)} style={{ width: "100%", display: "block", aspectRatio: "1", objectFit: "cover", background: "#05050e" }} loading="lazy" />
            : <div style={{ aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center", color: "#475569", fontFamily: MONO, fontSize: 14, background: "#0a0e1c" }}>AEON #{token.id}</div>}
          <div style={{ padding: "12px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 20, color: "#f1f5f9" }}>AEON #{token.id}</span>
              <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 13, color: tier.c, border: "1px solid " + tier.c + "66", borderRadius: 6, padding: "2px 8px" }}>{tier.name}</span>
            </div>
            <div style={{ display: "flex", gap: 18, marginTop: 10 }}>
              <div><div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800, color: "#f1f5f9" }}>#{token.rank}</div><div style={{ fontFamily: SANS, fontSize: 11.5, color: "#7c8a9e" }}>rank of {total.toLocaleString()}</div></div>
              <div><div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800, color: tier.c }}>{pctile >= 99 ? pctile.toFixed(1) : Math.round(pctile)}%</div><div style={{ fontFamily: SANS, fontSize: 11.5, color: "#7c8a9e" }}>rarer than</div></div>
            </div>
          </div>
        </div>

        {/* trait breakdown */}
        <div style={{ flex: 1, minWidth: isMobile ? "100%" : 320 }}>
          <div style={{ fontFamily: SANS, fontSize: 13, color: "#94a3b8", marginBottom: 8 }}>Traits — rarest first ({traits.length})</div>
          {traits.map((tr, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <span style={{ width: 120, fontFamily: SANS, fontSize: 12, color: "#7c8a9e", flexShrink: 0 }}>{tr.t}</span>
              <span style={{ flex: 1, fontFamily: SANS, fontSize: 14, color: "#e2e8f0" }}>{tr.v}</span>
              <span style={{ width: 78, textAlign: "right", fontFamily: MONO, fontSize: 12.5, color: tr.pct != null && tr.pct <= 1 ? "#f59e0b" : "#94a3b8" }}>{tr.pct != null ? tr.pct + "%" : "—"}</span>
            </div>
          ))}
        </div>
      </div>

      {/* rarity curve with the token marked */}
      <div style={{ fontFamily: SANS, fontSize: 13, color: "#94a3b8", textAlign: "center", marginBottom: 4 }}>The collection&apos;s rarity curve — #{token.id} marked</div>
      <ResponsiveContainer width="100%" height={isMobile ? 240 : 300}>
        <AreaChart data={curve} margin={{ top: 8, right: 16, bottom: 20, left: 6 }}>
          <defs><linearGradient id="rarG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f59e0b" stopOpacity={0.45} /><stop offset="100%" stopColor="#f59e0b" stopOpacity={0.03} /></linearGradient></defs>
          <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="rank" type="number" domain={[1, total]} tick={{ fill: "#cbd5e1", fontSize: 11, fontFamily: MONO }}
            tickFormatter={v => v === 1 ? "rarest" : v.toLocaleString()} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
          <YAxis type="number" tick={{ fill: "#cbd5e1", fontSize: 11, fontFamily: MONO }} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={46} />
          <Tooltip contentStyle={{ background: "#0a0e1c", border: "1px solid #234", borderRadius: 8, fontFamily: MONO, fontSize: 12 }}
            labelFormatter={v => "rank " + v.toLocaleString()} formatter={v => [v.toFixed(0), "score"]} />
          <Area type="monotone" dataKey="score" stroke="#f59e0b" strokeWidth={2} fill="url(#rarG)" dot={false} isAnimationActive={false} />
          <ReferenceDot x={token.rank} y={token.score} r={6} fill={tier.c} stroke="#05050e" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        <strong style={{ color: "#f59e0b" }}>Rarity</strong> = the sum, over each of a token&apos;s traits, of how uncommon that trait is (statistical rarity + a trait-count factor). Higher score = rarer. Computed from on-chain metadata across all {total.toLocaleString()} tokens — reproducible, no black box.
      </div>
    </div>
  );
}
