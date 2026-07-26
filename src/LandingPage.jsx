import { useMemo, useState, useEffect } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, ReferenceLine, ReferenceArea, CartesianGrid,
} from "recharts";
import { buildModel, BAND_LABELS, dayN, ds, bandVal, bandIndex, whenHitsCenter } from "./models.js";
import { DEFAULT_RAW } from "./data.js";
import { INDICATORS, ZONES } from "../scripts/bot/valuation-composite.mjs";
import { loadValuation } from "./history-data.js";
import { SANS, MONO } from "./chart-ui.jsx";

// Dark-committed editorial landing. Flow (owner, in steps): composite is the hero (six-measures
// strip), price sits top-right, the rainbow is the anchor, and the composite-over-time
// ("valuation band history") is its own chart underneath. Every number live off the model + valuation.json.
const MONf = (n) => (n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(0)}M` : `$${n.toLocaleString()}`);
const SUPPLY = 939_000_000;
const fMonYr = (d) => (d ? new Date(d).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "—");
const zoneOf = (v) => ZONES.find(z => v < z.max) || ZONES.at(-1);
const LENS_LABEL = Object.fromEntries(INDICATORS.map(i => [i.key, i.label.replace(/ ·.*/, "")]));
const LENS_ORDER = ["rainbow", "mvrv", "sip", "picycle", "alt", "fng"];

// ── the "six measures, one scale" strip plot ─────────────────────────────────────────────────
function StripPlot({ byLens, composite, isMobile }) {
  const rows = LENS_ORDER.filter(k => byLens?.[k] != null).map(k => ({ key: k, label: LENS_LABEL[k] || k, pct: byLens[k] }));
  const comp = Math.round(composite * 100);
  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "108px 1fr" : "168px 1fr", gap: isMobile ? "0 14px" : "0 24px" }}>
      <div style={{ gridColumn: 2, position: "relative", height: 0 }}>
        <div style={{ position: "absolute", left: `${comp}%`, top: -2, transform: "translateX(-50%)", fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "#25e07d", whiteSpace: "nowrap" }}>◆ composite {comp}</div>
      </div>
      {rows.map(r => {
        const z = zoneOf(r.pct), x = r.pct * 100, annLeft = x > 60;
        return (
          <div key={r.key} style={{ display: "contents" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "13px 0", borderTop: "1px solid #14161c" }}>
              <span style={{ fontSize: isMobile ? 13 : 14.5, color: "#aeb7c6" }}>{r.label}</span>
              <span style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, color: z.color, fontVariantNumeric: "tabular-nums" }}>{Math.round(r.pct * 100)}</span>
            </div>
            <div style={{ position: "relative", borderTop: "1px solid #14161c", display: "flex", alignItems: "center", minHeight: 48 }}>
              <div style={{ position: "absolute", left: 0, right: 0, height: 1, background: "#2a303d" }} />
              <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.05)" }} />
              <div style={{ position: "absolute", left: `${x}%`, top: "50%", transform: "translate(-50%,-50%)", width: 13, height: 13, borderRadius: "50%", background: z.color, boxShadow: `0 0 0 3px #07080b, 0 0 12px -1px ${z.color}`, zIndex: 2 }} />
              <div style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", fontFamily: MONO, fontSize: 11.5, color: "#aeb7c6", whiteSpace: "nowrap", [annLeft ? "right" : "left"]: `calc(${annLeft ? 100 - x : x}% + 20px)` }}>{z.label.toLowerCase()}</div>
            </div>
          </div>
        );
      })}
      <div style={{ gridColumn: 2, position: "relative", height: 22, marginTop: 6, fontFamily: MONO, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4b5567" }}>
        <span style={{ position: "absolute", left: 0 }}>00 cheapest ever</span>
        <span style={{ position: "absolute", left: "50%", transform: "translateX(-50%)" }}>50</span>
        <span style={{ position: "absolute", right: 0 }}>100 most expensive</span>
      </div>
    </div>
  );
}

// ── valuation band history — the composite over time (its own chart) ─────────────────────────
function BandHistory({ series, zones, isMobile }) {
  const data = useMemo(() => (series || []).map(([ts, v]) => ({ ts, v })).filter(r => Number.isFinite(r.ts) && Number.isFinite(r.v)), [series]);
  if (data.length < 2) return <div style={{ color: "#64748b", fontFamily: MONO, fontSize: 13, padding: "20px 0" }}>Loading history…</div>;
  const yr = (ts) => new Date(ts).getUTCFullYear();
  const xT = []; for (let y = yr(data[0].ts); y <= yr(data.at(-1).ts); y++) xT.push(Date.UTC(y, 0, 1));
  let prev = 0;
  return (
    <ResponsiveContainer width="100%" height={isMobile ? 260 : 320}>
      <ComposedChart data={data} margin={{ top: 6, right: isMobile ? 8 : 16, bottom: 18, left: isMobile ? 0 : 8 }}>
        <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.05)" vertical={false} />
        {(zones || ZONES).map((z, i) => { const a = <ReferenceArea key={i} y1={prev} y2={z.max} fill={z.color} fillOpacity={0.12} stroke="none" />; prev = z.max; return a; })}
        <XAxis dataKey="ts" type="number" scale="time" domain={["dataMin", "dataMax"]} ticks={xT}
          tickFormatter={yr} tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: MONO }} axisLine={{ stroke: "rgba(255,255,255,0.12)" }} tickLine={false} />
        <YAxis type="number" domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} tickFormatter={v => `${v * 100}`}
          tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: MONO }} axisLine={{ stroke: "rgba(255,255,255,0.12)" }} tickLine={false} width={isMobile ? 30 : 40} />
        <Line type="monotone" dataKey="v" stroke="#ffffff" strokeWidth={2.2} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export default function LandingPage({ isMobile, priceData }) {
  const m = useMemo(() => buildModel(DEFAULT_RAW), []);
  const px = priceData && priceData.length ? priceData : DEFAULT_RAW;
  const last = px[px.length - 1];
  const nowDay = dayN(new Date(last.date));
  const bIdx = bandIndex(m, last.price, nowDay);
  const band = BAND_LABELS[bIdx];
  const fair = bandVal(m, nowDay, 4);
  const vsFair = (last.price / fair - 1) * 100;

  const [val, setVal] = useState(null);
  useEffect(() => { let off = false; loadValuation().then(d => { if (!off) setVal(d || false); }); return () => { off = true; }; }, []);
  const [fwd, setFwd] = useState(540);
  const cur = val && val.cur;

  const heads = useMemo(() => {
    if (!cur) return null;
    const z = zoneOf(cur.composite), pctl = Math.round(cur.composite * 100);
    const vals = LENS_ORDER.map(k => cur.byLens?.[k]).filter(v => v != null);
    const cheap = vals.filter(v => v < 0.4).length, rich = vals.filter(v => v >= 0.6).length;
    const tail = cheap === vals.length ? "every measure agrees" : `${cheap} of ${vals.length} measures read cheap${rich ? `, ${rich} ${rich > 1 ? "have" : "has"} turned` : ""}`;
    return { z, pctl, cheap, total: vals.length, line2: cheap >= vals.length - 1 ? "and nearly everything agrees" : `${cheap} of ${vals.length} read cheap`, tail };
  }, [cur]);

  const chart = useMemo(() => {
    const priceByDate = new Map(px.filter(p => p.price > 0).map(p => [p.date, p.price]));
    const t0 = dayN(new Date(px[0].date)), tEnd = nowDay + fwd;
    const rows = [];
    for (let d = t0; d <= tEnd; d += 7) {
      const date = ds(d), row = { ts: Date.parse(date) };
      for (let i = 0; i < 9; i++) row[`b${i}`] = [bandVal(m, d, i), bandVal(m, d, i + 1)];
      const p = priceByDate.get(date); if (p != null) row.price = p;
      rows.push(row);
    }
    const nowTs = Date.parse(last.date);
    const nr = rows.find(r => Math.abs(r.ts - nowTs) < 4 * 864e5); if (nr) nr.price = last.price;
    let yMin = Infinity, yMax = -Infinity;
    for (const r of rows) { if (r.b0[0] < yMin) yMin = r.b0[0]; if (r.b8[1] > yMax) yMax = r.b8[1]; }
    yMin *= 0.85;
    const logT = []; for (let e = Math.floor(Math.log10(yMin)); e <= Math.ceil(Math.log10(yMax)); e++) { const v = 10 ** e; if (v >= yMin && v <= yMax) logT.push(v); }
    const xT = []; for (let y = new Date(px[0].date).getUTCFullYear(); y <= new Date(ds(tEnd)).getUTCFullYear(); y++) xT.push(Date.UTC(y, 0, 1));
    return { rows, yMin, yMax, logT, xT, nowTs };
  }, [m, px, nowDay, last, fwd]);

  const targets = useMemo(() => [6.9, 69, 690].map(price => {
    const hit = whenHitsCenter(m, price);
    return { price, mc: MONf(price * SUPPLY), when: hit?.dt ? fMonYr(hit.dt) : "beyond model" };
  }), [m]);

  const fT = (v) => (v >= 1 ? `$${v}` : `$${v.toFixed(2)}`);
  const kicker = { fontFamily: MONO, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#727d90" };
  const h2 = { fontSize: isMobile ? 22 : 26, fontWeight: 800, letterSpacing: "-0.02em" };
  const sub = { ...kicker, margin: "6px 0 16px" };

  return (
    <div style={{ background: "#07080b", color: "#f3f5f8", fontFamily: SANS }}>
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: isMobile ? "0 20px 60px" : "0 32px 80px" }}>

        {/* TOP ROW — kicker left, price ticker right */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: isMobile ? "26px 0 20px" : "40px 0 26px", flexWrap: "wrap", gap: 10 }}>
          <div style={kicker}>Valuation composite · six measures</div>
          <div style={{ fontFamily: MONO, fontSize: 14, color: "#aeb7c6", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: "#f3f5f8", fontWeight: 700, fontSize: 16, fontVariantNumeric: "tabular-nums" }}>${last.price.toFixed(4)}</span>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: band.c, display: "inline-block" }} />
            <span style={{ color: band.c, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", fontSize: 12 }}>{band.l}</span>
          </div>
        </div>

        {/* HERO — the composite is the card */}
        <section>
          <h1 style={{ fontSize: isMobile ? 38 : 62, lineHeight: 0.98, letterSpacing: "-0.035em", fontWeight: 800, margin: "0 0 18px", textWrap: "balance" }}>
            {heads ? <>{heads.z.label}.<br /><span style={{ color: heads.z.color }}>{heads.line2}.</span></> : <>Loading the composite<span style={{ color: "#25e07d" }}>…</span></>}
          </h1>
          {heads && (
            <p style={{ fontSize: isMobile ? 15.5 : 17, color: "#aeb7c6", maxWidth: "52ch", lineHeight: 1.6, margin: "0 0 26px" }}>
              SPX6900 sits in the <b style={{ color: "#f3f5f8" }}>{heads.pctl}th percentile</b> of its own history — cheaper than <b style={{ color: "#f3f5f8" }}>{100 - heads.pctl}%</b> of the days it has ever traded. {heads.tail[0].toUpperCase() + heads.tail.slice(1)}.
            </p>
          )}
          {cur ? <StripPlot byLens={cur.byLens} composite={cur.composite} isMobile={isMobile} />
            : <div style={{ color: "#64748b", fontFamily: MONO, fontSize: 13, padding: "20px 0" }}>Loading composite…</div>}
        </section>

        {/* THE RAINBOW — the anchor (unchanged) */}
        <section style={{ borderTop: "1px solid #1b1f29", paddingTop: 30, marginTop: 44 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <div style={h2}>The rainbow</div>
            <div style={{ display: "flex", gap: 4 }}>
              {[["History", 90], ["+5Y", 1825], ["+10Y", 3650], ["Max", 4600]].map(([lbl, d]) => (
                <button key={lbl} onClick={() => setFwd(d)} style={{ background: "none", border: "none", cursor: "pointer", padding: "3px 6px", color: fwd === d ? "#f3f5f8" : "#727d90", borderBottom: fwd === d ? "1px solid #25e07d" : "1px solid transparent", fontFamily: MONO, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase" }}>{lbl}</button>
              ))}
            </div>
          </div>
          <div style={sub}>The denominator — everything is measured against this · frozen power-law · R² {m.r2.toFixed(2)}</div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 150px", gap: 18 }}>
            <div>
              <ResponsiveContainer width="100%" height={isMobile ? 340 : 460}>
                <ComposedChart data={chart.rows} margin={{ top: 8, right: isMobile ? 44 : 60, bottom: 20, left: isMobile ? 0 : 8 }}>
                  <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="ts" type="number" scale="time" domain={["dataMin", "dataMax"]} ticks={chart.xT}
                    tickFormatter={ts => new Date(ts).getUTCFullYear()} tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: MONO }} axisLine={{ stroke: "rgba(255,255,255,0.12)" }} tickLine={false} />
                  <YAxis scale="log" domain={[chart.yMin, chart.yMax]} ticks={chart.logT} tickFormatter={fT}
                    tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: MONO }} axisLine={{ stroke: "rgba(255,255,255,0.12)" }} tickLine={false} width={isMobile ? 44 : 56} allowDataOverflow />
                  {Array.from({ length: 9 }).map((_, i) => (
                    <Area key={i} dataKey={`b${i}`} fill={BAND_LABELS[i].c} fillOpacity={0.62} stroke="none" isAnimationActive={false} activeDot={false} />
                  ))}
                  {targets.map((t, i) => t.price <= chart.yMax ? (
                    <ReferenceLine key={i} y={t.price} stroke="#ffffff" strokeOpacity={0.3} strokeDasharray="3 4"
                      label={{ value: `$${t.price}`, position: "right", fill: "rgba(255,255,255,0.65)", fontSize: 11, fontFamily: MONO }} />
                  ) : null)}
                  <ReferenceLine x={chart.nowTs} stroke="rgba(255,255,255,0.45)" strokeDasharray="2 3"
                    label={{ value: "NOW", position: "top", fill: "#e2e8f0", fontSize: 11, fontFamily: SANS, fontWeight: 700 }} />
                  <Line type="monotone" dataKey="price" stroke="#ffffff" strokeWidth={2.2} dot={false} isAnimationActive={false} connectNulls={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: "flex", flexDirection: isMobile ? "row" : "column", flexWrap: "wrap", justifyContent: "center", gap: 7, fontFamily: MONO, fontSize: 11 }}>
              {BAND_LABELS.map((_, i) => i).reverse().map(i => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, color: i === bIdx ? "#f3f5f8" : "#aeb7c6", fontWeight: i === bIdx ? 700 : 400 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 2, background: BAND_LABELS[i].c, flex: "none" }} />{BAND_LABELS[i].l}{i === bIdx ? " ◄" : ""}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* VALUATION BAND HISTORY — the composite over time */}
        <section style={{ borderTop: "1px solid #1b1f29", paddingTop: 30, marginTop: 44 }}>
          <div style={h2}>Valuation band history</div>
          <div style={sub}>The composite over time — 0 = the cheapest it's been, 100 = the dearest · green low, red high</div>
          {val && val.series ? <BandHistory series={val.series} zones={val.zones} isMobile={isMobile} />
            : <div style={{ color: "#64748b", fontFamily: MONO, fontSize: 13, padding: "20px 0" }}>Loading history…</div>}
        </section>

        {/* IF THE TREND HOLDS — real crossing dates */}
        <section style={{ borderTop: "1px solid #1b1f29", paddingTop: 30, marginTop: 44 }}>
          <div style={{ fontSize: isMobile ? 20 : 22, fontWeight: 800, letterSpacing: "-0.02em" }}>If the trend holds</div>
          <div style={sub}>When the frozen centre line reaches each target — extrapolation, not a forecast</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: MONO, fontSize: 14, maxWidth: 520 }}>
            <thead><tr>{["Target", "Market cap", "Centre line"].map((h, i) => (
              <th key={i} style={{ textAlign: i ? "right" : "left", fontWeight: 400, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "#727d90", padding: "0 0 10px", borderBottom: "1px solid #1b1f29" }}>{h}</th>
            ))}</tr></thead>
            <tbody>{targets.map((t, i) => (
              <tr key={i}>
                <td style={{ padding: "11px 0", borderBottom: "1px solid #1b1f29", color: "#f3f5f8", fontSize: 15 }}>${t.price.toFixed(2)}</td>
                <td style={{ padding: "11px 0", borderBottom: "1px solid #1b1f29", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{t.mc}</td>
                <td style={{ padding: "11px 0", borderBottom: "1px solid #1b1f29", textAlign: "right", color: "#aeb7c6" }}>{t.when}</td>
              </tr>
            ))}</tbody>
          </table>
        </section>

        <div style={{ marginTop: 34, fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "#4b5567", lineHeight: 1.7 }}>
          Single-cycle fit on a memecoin · model frozen on curated history · R² {m.r2.toFixed(2)} · supply ~939M · nothing here is financial advice
        </div>
      </div>
    </div>
  );
}
