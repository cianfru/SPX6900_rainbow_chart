import { useMemo, useState, useEffect, useRef } from "react";
import { ResponsiveContainer, ComposedChart, Scatter, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { loadAeonListings, loadAeonMarket } from "./history-data.js";
import { recentLadder, percentileOf, ordinal, WINDOW_DAYS } from "./aeon-spx-value.js";
import { SANS, MONO, MAX_W, Explain } from "./chart-ui.jsx";

const fEth = v => (v < 0.1 ? v.toFixed(3) : v.toFixed(2)) + "Ξ";

// Project Aeon, asking prices vs what pieces actually SELL for.
//
// Fair value comes from realized sales (aeon-market.json `fairModel`), NOT from the asks
// on this chart. Fitting the asks was circular, it only measured "cheap versus what other
// sellers are hoping for", which flagged #1011 as "61% off" at 1.22Ξ when no AEON had
// fetched above 1.10Ξ in 90 days. The sales model is: market level now × rarity factor.
export default function AeonValueChart({ isMobile }) {
  const [data, setData] = useState(null);
  const [market, setMarket] = useState(null);
  const [hover, setHover] = useState(null);   // {d, cx, cy}, the NFT under the crosshair
  const [cross, setCross] = useState(null);   // {x, y}, the floating pointer
  const ptsRef = useRef(new Map());           // token id → its plotted pixel {cx, cy, payload}
  const wrapRef = useRef(null);
  useEffect(() => { let c = false; loadAeonListings().then(d => { if (!c) setData(d || { empty: true }); }); return () => { c = true; }; }, []);
  useEffect(() => { let c = false; loadAeonMarket().then(d => { if (!c) setMarket(d || { empty: true }); }); return () => { c = true; }; }, []);

  const model = useMemo(() => {
    if (!data || data.empty || !market) return null;
    const fm = market.empty ? null : market.fairModel;
    const level = fm?.level || market.levelNow || 0;
    const rows = data.listings.filter(l => l.rank > 0 && l.price > 0);
    // fair(rank) = current market level × the rarity factor measured on realized sales
    const expected = rank => (fm && level > 0 ? level * Math.exp(fm.a + fm.b * Math.log(rank)) : null);
    const scored = rows.map(l => {
      const exp = expected(l.rank);
      return { ...l, exp: exp ?? l.price, disc: exp ? (exp - l.price) / exp : 0, mult: exp ? l.price / exp : null };
    });
    const deals = [...scored].filter(l => l.disc > 0.1).sort((a, b) => b.disc - a.disc).slice(0, 12);
    const dealIds = new Set(deals.map(d => d.id));
    // closest-to-market listings, what to show when nothing is genuinely below fair value
    const closest = [...scored].filter(l => l.mult != null).sort((a, b) => a.mult - b.mult).slice(0, 8);
    const line = expected(1) ? Array.from({ length: 48 }, (_, i) => {
      const r = Math.exp(Math.log(1) + (Math.log(data.total) - Math.log(1)) * i / 47);
      return { rank: r, fair: +expected(r).toFixed(4) };
    }) : [];
    // AEON priced in SPX, the denominator that actually explains its price (see builder).
    // Lets an ask be placed on AEON's own valuation history instead of only against a
    // trailing ETH median, which on its own reads far harsher than the data warrants.
    const sv = market.empty ? null : market.spxValue;
    const inSpx = sv?.ethUsd && sv?.spxNow ? eth => (eth * sv.ethUsd) / sv.spxNow : null;
    // TRAILING window, matching AeonVsSpxChart. Full history would compare today against the
    // 2023-24 regime (ratio ~45,800 SPX vs ~2,100 now, because SPX itself ran ~130x) and badly
    // flatter, that read the floor ask at the 59th percentile when against the last year it is
    // the 98th.
    const ladder = sv?.saleSeries ? recentLadder(sv.saleSeries) : [];
    if (inSpx && ladder.length) for (const l of scored) { l.spx = inSpx(l.price); l.spxPct = percentileOf(ladder, l.spx); }
    const cheapest = scored.reduce((m, l) => (m && m.price <= l.price ? m : l), null);
    return {
      scored, deals, dealIds, closest, line, level, r2: fm?.r2 ?? null, nFit: fm?.n ?? 0,
      sv, cheapestPct: cheapest?.spxPct ?? null, nWindow: ladder.length,
      total: data.total, count: data.count, updated: data.updated, parked: data.parked || 0, cap: data.cap || 0,
    };
  }, [data, market]);

  // preload every listing's art so the crosshair reveal is instant (no per-hover fetch flicker)
  useEffect(() => {
    for (const l of model?.scored || []) if (l.img) { const im = new Image(); im.src = l.img; }
  }, [model]);

  if (!data || !market) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading listings…</div>;
  if (data.empty) return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <div style={{ textAlign: "center", fontFamily: SANS, color: "#94a3b8", padding: "80px 20px" }}>
        <div style={{ fontSize: 40, marginBottom: 14 }}>🚧</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#cbd5e1" }}>Under construction</div>
      </div>
    </div>
  );

  const { scored, deals, dealIds, closest, line, level, r2, nFit, sv, cheapestPct, nWindow, total, count, updated, parked, cap } = model;
  const ord = ordinal;
  // No priced listings → bail before Math.min(...[]) yields Infinity and the log axis blows up.
  if (!scored.length) return (
    <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>No active listings right now.</div>
  );
  const nonDeals = scored.filter(l => !dealIds.has(l.id));
  const dealPts = scored.filter(l => dealIds.has(l.id));
  // Domain must span the listings AND the fair-value line: for common ranks the line dips well
  // below the cheapest ask, so a floor set to the listings alone clipped it (and the lowest asks)
  // off the bottom of the chart, invisible.
  const lineVals = line.map(p => p.fair).filter(v => v > 0);
  let priceMin = Math.min(...scored.map(l => l.price), ...lineVals);
  let priceMax = Math.max(...scored.map(l => l.price), ...lineVals);
  if (!(priceMin > 0)) priceMin = 0.001;                       // log scale cannot start at 0
  if (!(priceMax > priceMin)) priceMax = priceMin * 2;         // single listing → give the axis room

  const osUrl = id => `https://opensea.io/assets/ethereum/${data.contract}/${id}`;
  const openPiece = id => { if (data.contract && id != null) window.open(osUrl(id), "_blank", "noopener"); };
  // ⭐ A FLOATING CROSSHAIR drives the reveal (like the rainbow chart), not recharts' axis Tooltip -
  // the latter fires unreliably on scattered points and re-mounts its content on every mouse move, so
  // the thumbnail never settles. Each shape RECORDS its plotted pixel into ptsRef; a container-level
  // mousemove drops the pointer and reveals the NEAREST piece within reach. Click opens it on OpenSea.
  const recordPt = (cx, cy, payload) => { if (cx != null && payload?.id != null) ptsRef.current.set(payload.id, { cx, cy, payload }); };
  const Dot = ({ cx, cy, payload }) => { if (cx == null) return null; recordPt(cx, cy, payload); return (
    <circle cx={cx} cy={cy} r={isMobile ? 6 : 5} fill="#64748b" fillOpacity={0.6} stroke="#0a0e1c" style={{ cursor: "pointer" }} onClick={() => openPiece(payload.id)} />
  ); };
  const DealDot = ({ cx, cy, payload }) => {
    if (cx == null) return null; recordPt(cx, cy, payload);
    const s = isMobile ? 22 : 30;
    return (
      <g style={{ cursor: "pointer" }} onClick={() => openPiece(payload.id)}>
        {payload.img && <image href={payload.img} x={cx - s / 2} y={cy - s / 2} width={s} height={s} preserveAspectRatio="xMidYMid slice" clipPath="inset(0 round 5px)" />}
        <rect x={cx - s / 2} y={cy - s / 2} width={s} height={s} rx={5} fill="none" stroke="#34d399" strokeWidth={2} />
      </g>
    );
  };
  const onMove = e => {
    const r = wrapRef.current?.getBoundingClientRect(); if (!r) return;
    const x = e.clientX - r.left, y = e.clientY - r.top;
    setCross({ x, y });
    let best = null, bd = Infinity;
    for (const p of ptsRef.current.values()) { const dd = Math.hypot(p.cx - x, p.cy - y); if (dd < bd) { bd = dd; best = p; } }
    setHover(best && bd <= 26 ? { d: best.payload, cx: best.cx, cy: best.cy } : null);
  };
  const onLeaveChart = () => { setCross(null); setHover(null); };
  const onClickChart = () => { if (hover) openPiece(hover.d.id); };
  // The tooltip, big art, positioned at the dot, flipped left/down near the edges so it never clips.
  const imgS = isMobile ? 104 : 132;
  const Tip = () => {
    if (!hover) return null;
    const d = hover.d;
    const flipX = hover.cx > 0.62 * (MAX_W || 900), flipY = hover.cy < 180;
    return (
      <div style={{
        position: "absolute", left: hover.cx, top: hover.cy, pointerEvents: "none", zIndex: 6,
        transform: `translate(${flipX ? "-100%" : "0"}, ${flipY ? "14px" : "calc(-100% - 14px)"})`,
        background: "#0a0e1c", border: "1px solid #2b3a52", borderRadius: 12, padding: 10, display: "flex", gap: 11, alignItems: "center",
        boxShadow: "0 12px 34px rgba(0,0,0,0.6)", fontFamily: SANS,
      }}>
        <img src={d.img} alt={"AEON #" + d.id} width={imgS} height={imgS}
          style={{ width: imgS, height: imgS, borderRadius: 9, objectFit: "cover", display: "block", background: "#05050e", flexShrink: 0, border: "1px solid rgba(255,255,255,0.12)" }} />
        <div style={{ minWidth: 0, fontSize: 13 }}>
          <div style={{ color: "#e2e8f0", fontWeight: 800, fontSize: 15 }}>AEON #{d.id}</div>
          <div style={{ color: "#94a3b8", marginTop: 1 }}>rank {d.rank} of {total}</div>
          <div style={{ fontFamily: MONO, marginTop: 4 }}><span style={{ color: "#f59e0b", fontWeight: 700 }}>{fEth(d.price)}</span> · fair {fEth(d.exp)}</div>
          {d.disc > 0.1 && <div style={{ color: "#34d399", fontWeight: 700, marginTop: 2 }}>{(d.disc * 100).toFixed(0)}% below fair value</div>}
          {d.spx != null && <div style={{ color: "#c084fc", fontFamily: MONO, marginTop: 2 }}>{Math.round(d.spx).toLocaleString()} SPX · {ord(d.spxPct)} pct</div>}
          <div style={{ color: "#5b6675", fontSize: 11, marginTop: 4 }}>click → OpenSea</div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="Is anything on the board actually cheap?" accent="#34d399">
        Every <strong style={{ color: "#e2e8f0" }}>active listing</strong> plotted by <strong style={{ color: "#f59e0b" }}>rarity</strong> (rarer → left) vs its <strong style={{ color: "#e2e8f0" }}>ask</strong>.
        The dashed line is what pieces of that rarity <strong style={{ color: "#94a3b8" }}>actually sell for</strong>, measured from realized sales, not from the asks themselves.
        Listings <strong style={{ color: "#34d399" }}>below the line are cheap</strong>; above it you are paying over market.
        {updated === "MOCK" && <em style={{ color: "#f472b6" }}> (Preview data, connect the live OpenSea feed.)</em>}
      </Explain>

      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 12, flexWrap: "wrap", fontFamily: SANS }}>
        <div style={{ textAlign: "center" }}><div style={{ fontSize: 22, fontWeight: 800, color: "#e2e8f0", fontFamily: MONO }}>{count}</div><div style={{ fontSize: 12, color: "#7c8a9e" }}>active listings</div></div>
        <div style={{ textAlign: "center" }}><div style={{ fontSize: 22, fontWeight: 800, color: deals.length ? "#34d399" : "#7c8a9e", fontFamily: MONO }}>{deals.length}</div><div style={{ fontSize: 12, color: "#7c8a9e" }}>below market</div></div>
        <div style={{ textAlign: "center" }}><div style={{ fontSize: 22, fontWeight: 800, color: "#f59e0b", fontFamily: MONO }}>{fEth(priceMin)}</div><div style={{ fontSize: 12, color: "#7c8a9e" }}>cheapest ask</div></div>
        <div style={{ textAlign: "center" }}><div style={{ fontSize: 22, fontWeight: 800, color: "#38bdf8", fontFamily: MONO }}>{fEth(level)}</div><div style={{ fontSize: 12, color: "#7c8a9e" }}>recent market</div></div>
        {cheapestPct != null && <div style={{ textAlign: "center" }}><div style={{ fontSize: 22, fontWeight: 800, color: "#c084fc", fontFamily: MONO }}>{ord(cheapestPct)}</div><div style={{ fontSize: 12, color: "#7c8a9e" }}>floor ask vs SPX history</div></div>}
      </div>

      <div ref={wrapRef} onMouseMove={onMove} onMouseLeave={onLeaveChart} onClick={onClickChart}
        style={{ position: "relative", cursor: hover ? "pointer" : "crosshair" }}>
        <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
          <ComposedChart margin={{ top: 10, right: 20, bottom: 26, left: 6 }}>
            <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="rank" type="number" scale="log" domain={[1, total]} allowDataOverflow
              ticks={isMobile ? [1, 100, total] : [1, 10, 100, 1000, total]} tickFormatter={v => v === 1 ? "rarest" : v >= 1000 ? (v / 1000).toFixed(v === total ? 1 : 0) + "k" : v}
              tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 11, fontFamily: MONO }} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false}
              label={{ value: isMobile ? "← rarer          more common →" : "← rarer      rarity rank      more common →", position: "insideBottom", offset: -14, fill: "#64748b", fontSize: isMobile ? 10.5 : 12, fontFamily: SANS }} />
            <YAxis dataKey="price" type="number" scale="log" domain={[priceMin * 0.7, priceMax * 1.2]} allowDataOverflow
              tickFormatter={fEth} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 11, fontFamily: MONO }} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 44 : 54} />
            <Line data={line} dataKey="fair" stroke="#94a3b8" strokeWidth={2} strokeDasharray="6 5" dot={false} isAnimationActive={false} type="monotone" />
            <Scatter data={nonDeals} shape={<Dot />} isAnimationActive={false} />
            <Scatter data={dealPts} shape={<DealDot />} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
        {cross && (<>
          <div style={{ position: "absolute", left: cross.x, top: 4, bottom: 26, borderLeft: "1px dashed rgba(148,163,184,0.55)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", top: cross.y, left: 4, right: 4, borderTop: "1px dashed rgba(148,163,184,0.32)", pointerEvents: "none" }} />
        </>)}
        <Tip />
      </div>

      {deals.length === 0 && closest.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontFamily: SANS, fontSize: 14.5, fontWeight: 700, color: "#f59e0b", textAlign: "center", marginBottom: 4 }}>
            Nothing is currently listed below market
          </div>
          <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#94a3b8", textAlign: "center", marginBottom: 12, maxWidth: 660, marginInline: "auto", lineHeight: 1.6 }}>
            Every live ask sits above what comparable pieces have been selling for in ETH. That is a normal
            spread for a thinly traded collection, sellers ask high and wait.
            {sv && cheapestPct != null && <>
              {" "}<strong style={{ color: "#cbd5e1" }}>But measured in SPX, the denominator that actually tracks AEON, that is
              less damning than it sounds:</strong> the floor ask sits at the {ord(cheapestPct)} percentile of AEON&rsquo;s own
              valuation history, measured against the last {Math.round(WINDOW_DAYS / 30)} months of trading. Judged against all history it would
              look far cheaper, but the 2023-24 ratios came from an era when SPX cost a fraction of a cent, a regime that cannot recur.
            </>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 130 : 150}px, 1fr))`, gap: 12 }}>
            {closest.map(d => (
              <a key={d.id} href={`https://opensea.io/assets/ethereum/${data.contract}/${d.id}`} target="_blank" rel="noopener noreferrer"
                style={{ textDecoration: "none", background: "rgba(13,15,28,0.6)", border: "1px solid rgba(245,158,11,0.35)", borderRadius: 12, overflow: "hidden" }}>
                {d.img && <img src={d.img} alt={"AEON #" + d.id} loading="lazy" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block", background: "#05050e" }} />}
                <div style={{ padding: "8px 10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontFamily: SANS, fontSize: 13 }}>
                    <span style={{ color: "#e2e8f0", fontWeight: 700 }}>#{d.id}</span>
                    <span style={{ color: "#f59e0b", fontWeight: 700 }}>{d.mult.toFixed(1)}× market</span>
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 12.5, color: "#94a3b8", marginTop: 2 }}>{fEth(d.price)} · rank {d.rank}</div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {deals.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 700, color: "#34d399", textAlign: "center", marginBottom: 10 }}>Listed below what comparable pieces sell for</div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 130 : 150}px, 1fr))`, gap: 12 }}>
            {deals.slice(0, 8).map(d => (
              <a key={d.id} href={`https://opensea.io/assets/ethereum/${data.contract}/${d.id}`} target="_blank" rel="noopener noreferrer"
                style={{ textDecoration: "none", background: "rgba(13,15,28,0.6)", border: "1px solid rgba(52,211,153,0.4)", borderRadius: 12, overflow: "hidden" }}>
                {d.img && <img src={d.img} alt={"AEON #" + d.id} loading="lazy" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block", background: "#05050e" }} />}
                <div style={{ padding: "8px 10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontFamily: SANS, fontSize: 13 }}><span style={{ color: "#e2e8f0", fontWeight: 700 }}>#{d.id}</span><span style={{ color: "#34d399", fontWeight: 700 }}>{(d.disc * 100).toFixed(0)}% off</span></div>
                  <div style={{ fontFamily: MONO, fontSize: 12.5, color: "#94a3b8", marginTop: 2 }}>{fEth(d.price)} · rank {d.rank}</div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 18, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        Fair value = the recent market level ({fEth(level)}, the rolling median sale) × a rarity factor fitted on
        {nFit ? " " + nFit.toLocaleString() : " all "} realized sales. It is measured from what pieces actually
        <em> sold</em> for, never from the asking prices on this chart, fitting the asks would just measure what sellers hope for.
        {r2 != null && <> <strong style={{ color: "#94a3b8" }}>Rarity is a weak price driver here: it explains only {(r2 * 100).toFixed(0)}% of the variation in sale prices</strong>, so treat the line as a rough centre of gravity, not a valuation.</>}
        {sv && <> {" "}The <strong style={{ color: "#c084fc" }}>SPX percentile</strong> prices each ask in SPX6900 ({sv.ethUsd ? "ETH ≈ $" + sv.ethUsd.toLocaleString() + ", " : ""}SPX ${sv.spxNow}) and places it on the last {nWindow} weeks
        of AEON&rsquo;s own trading, AEON tracks SPX far more closely than it tracks ETH, so that is the more honest
        yardstick for expensive-versus-cheap. See <em>AEON Floor vs SPX</em> for the full series.</>}
        {" "}Click or tap any point to open the piece on OpenSea. Listings from OpenSea, sales from on-chain marketplace trades, rarity from on-chain metadata.
        {parked > 0 && <> {parked} listing{parked === 1 ? " was" : "s were"} parked above {cap ? cap.toFixed(0) : "the cap"}Ξ (asks like 69 or 6900Ξ that exist so a piece shows as listed but can never sell) and are excluded, they aren&rsquo;t real offers and would flatten the whole scale.</>}
      </div>
    </div>
  );
}
