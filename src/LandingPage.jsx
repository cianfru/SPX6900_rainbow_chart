import { useMemo, lazy, Suspense } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, ReferenceLine, CartesianGrid,
} from "recharts";
import { buildModel, BAND_LABELS, TARGETS, dayN, ds, bandVal, bandIndex, whenHitsCenter } from "./models.js";
import { DEFAULT_RAW } from "./data.js";
import { SANS, MONO } from "./chart-ui.jsx";

const ValuationComposite = lazy(() => import("./ValuationComposite.jsx"));

// Dark-committed editorial landing. The RAINBOW is the anchor (owner ruling: it's the brand and
// the denominator), the valuation composite the prominent supporting read below it. Every number
// is live off the frozen model + valuation.json — no illustrative placeholders.
const MONf = (n) => (n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(0)}M` : `$${n.toLocaleString()}`);
const SUPPLY = 939_000_000;
const fMonYr = (d) => (d ? new Date(d).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "—");

export default function LandingPage({ isMobile, priceData }) {
  const m = useMemo(() => buildModel(DEFAULT_RAW), []);
  const px = priceData && priceData.length ? priceData : DEFAULT_RAW;
  const last = px[px.length - 1];
  const nowDay = dayN(new Date(last.date));
  const bIdx = bandIndex(m, last.price, nowDay);
  const band = BAND_LABELS[bIdx];
  const fair = bandVal(m, nowDay, 4);              // centre line ≈ fair value
  const vsFair = ((last.price / fair - 1) * 100);

  // ---- rainbow band series (real model bands + the price line woven through) ----
  const chart = useMemo(() => {
    const priceByDate = new Map(px.filter(p => p.price > 0).map(p => [p.date, p.price]));
    const t0 = dayN(new Date(px[0].date));
    const tEnd = nowDay + 540;                      // ~18 months of forward band fan
    const rows = [];
    for (let d = t0; d <= tEnd; d += 7) {
      const date = ds(d), ts = Date.parse(date), row = { ts };
      for (let i = 0; i < 9; i++) row[`b${i}`] = +bandVal(m, d, i).toFixed(6);
      const p = priceByDate.get(date);
      if (p != null) row.price = p;
      rows.push(row);
    }
    // carry the live price onto its exact day
    const nowTs = Date.parse(last.date);
    const nr = rows.find(r => Math.abs(r.ts - nowTs) < 4 * 864e5); if (nr) nr.price = last.price;
    let yMin = Infinity, yMax = -Infinity;
    for (const r of rows) { if (r.b0 < yMin) yMin = r.b0; if (r.b8 > yMax) yMax = r.b8; }
    for (const r of rows) if (r.price != null && r.price < yMin) yMin = r.price;
    yMin *= 0.85; yMax = Math.min(yMax, 30);
    const logT = []; for (let e = Math.floor(Math.log10(yMin)); e <= Math.ceil(Math.log10(yMax)); e++) { const v = 10 ** e; if (v >= yMin && v <= yMax) logT.push(v); }
    const yr0 = new Date(px[0].date).getUTCFullYear(), yr1 = new Date(ds(tEnd)).getUTCFullYear();
    const xT = []; for (let y = yr0; y <= yr1; y++) xT.push(Date.UTC(y, 0, 1));
    return { rows, yMin, yMax, logT, xT, nowTs };
  }, [m, px, nowDay, last]);

  // ---- real crossing-date targets (the frozen centre line reaching each meme number) ----
  const targets = useMemo(() => [6.9, 69, 690].map(price => {
    const hit = whenHitsCenter(m, price);
    return { price, mc: MONf(price * SUPPLY), when: hit?.dt ? fMonYr(hit.dt) : "beyond model" };
  }), [m]);

  const fT = (v) => (v >= 1 ? `$${v}` : `$${v.toFixed(2)}`);
  const fD = (ts) => new Date(ts).getUTCFullYear();

  return (
    <div style={{ background: "#07080b", color: "#f3f5f8", fontFamily: SANS }}>
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: isMobile ? "0 20px 60px" : "0 32px 80px" }}>

        {/* HERO */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.4fr .82fr", gap: isMobile ? 26 : 40, padding: isMobile ? "34px 0 26px" : "48px 0 30px" }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: "#727d90" }}>
              The rainbow · valuation composite
            </div>
            <h1 style={{ fontSize: isMobile ? 40 : 68, lineHeight: 0.96, letterSpacing: "-0.035em", fontWeight: 800, margin: "16px 0 18px", textWrap: "balance" }}>
              {band.l.replace(/!$/, "")}.<br /><span style={{ color: band.c }}>Band {bIdx + 1} of 9.</span>
            </h1>
            <p style={{ fontSize: isMobile ? 16 : 17, color: "#aeb7c6", maxWidth: "46ch", lineHeight: 1.6 }}>
              At <b style={{ color: "#f3f5f8" }}>${last.price.toFixed(4)}</b> SPX6900 sits in the <b style={{ color: "#f3f5f8" }}>{band.l}</b> band —
              the model's fair value is near <b style={{ color: "#f3f5f8" }}>{fT(+fair.toFixed(2))}</b>, so price is <b style={{ color: vsFair < 0 ? "#25e07d" : "#ff5470" }}>{vsFair >= 0 ? "+" : ""}{vsFair.toFixed(0)}%</b> against it. The composite below weighs everything into one honest read.
            </p>
          </div>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: "#727d90" }}>Spot</div>
            <div style={{ fontWeight: 800, fontSize: isMobile ? 46 : 56, letterSpacing: "-0.03em", lineHeight: 1, margin: "8px 0 8px", fontVariantNumeric: "tabular-nums" }}>${last.price.toFixed(4)}</div>
            <div style={{ fontFamily: MONO, fontSize: 12.5, color: "#aeb7c6" }}>mcap {MONf(last.price * SUPPLY)}</div>
            <div style={{ display: "flex", gap: 2, margin: "18px 0 8px" }}>
              {BAND_LABELS.map((b, i) => (
                <span key={i} style={{ height: 12, flex: 1, borderRadius: 1, background: b.c, opacity: i === bIdx ? 1 : 0.3, boxShadow: i === bIdx ? `0 0 10px -1px ${b.c}` : "none" }} />
              ))}
            </div>
            <div style={{ fontWeight: 800, fontSize: 18, color: band.c }}>{band.l.toUpperCase()}</div>
            <div style={{ marginTop: 14 }}>
              {[["Fair value (centre)", fT(+fair.toFixed(2))], ["Price vs fair value", `${vsFair >= 0 ? "+" : ""}${vsFair.toFixed(0)}%`]].map(([k, v], i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #1b1f29", padding: "9px 0", fontFamily: MONO, fontSize: 12.5 }}>
                  <span style={{ color: "#727d90" }}>{k}</span><span>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* THE RAINBOW — the anchor */}
        <section style={{ borderTop: "1px solid #1b1f29", paddingTop: 30 }}>
          <div style={{ fontSize: isMobile ? 22 : 26, fontWeight: 800, letterSpacing: "-0.02em" }}>
            The rainbow <span style={{ fontSize: 12, fontWeight: 400, fontFamily: MONO, letterSpacing: "0.04em", color: "#25e07d", textTransform: "uppercase", marginLeft: 10 }}>the denominator — everything is measured against this</span>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#727d90", margin: "6px 0 18px" }}>
            Frozen power-law bands · R² {m.r2.toFixed(2)} · price woven through
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 150px", gap: 18 }}>
            <div style={{ border: "1px solid #1b1f29", borderRadius: 10, background: "#050609", padding: "10px 6px 4px" }}>
              <ResponsiveContainer width="100%" height={isMobile ? 340 : 440}>
                <ComposedChart data={chart.rows} margin={{ top: 8, right: isMobile ? 44 : 60, bottom: 20, left: isMobile ? 0 : 8 }}>
                  <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="ts" type="number" scale="time" domain={["dataMin", "dataMax"]} ticks={chart.xT}
                    tickFormatter={fD} tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: MONO }} axisLine={{ stroke: "rgba(255,255,255,0.12)" }} tickLine={false} />
                  <YAxis scale="log" domain={[chart.yMin, chart.yMax]} ticks={chart.logT} tickFormatter={fT}
                    tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: MONO }} axisLine={{ stroke: "rgba(255,255,255,0.12)" }} tickLine={false} width={isMobile ? 44 : 56} allowDataOverflow />
                  {Array.from({ length: 9 }).map((_, i) => (
                    <Area key={i} dataKey={`b${i}`} fill={BAND_LABELS[i].c} fillOpacity={0.4} stroke="none" isAnimationActive={false} activeDot={false} />
                  ))}
                  {targets.map((t, i) => t.price <= chart.yMax ? (
                    <ReferenceLine key={i} y={t.price} stroke="#ffffff" strokeOpacity={0.28} strokeDasharray="3 4"
                      label={{ value: `$${t.price}`, position: "right", fill: "rgba(255,255,255,0.6)", fontSize: 11, fontFamily: MONO }} />
                  ) : null)}
                  <ReferenceLine x={chart.nowTs} stroke="rgba(255,255,255,0.4)" strokeDasharray="2 3"
                    label={{ value: "NOW", position: "top", fill: "#e2e8f0", fontSize: 11, fontFamily: SANS, fontWeight: 700 }} />
                  <Line type="monotone" dataKey="price" stroke="#ffffff" strokeWidth={2.2} dot={false} isAnimationActive={false} connectNulls={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: "flex", flexDirection: isMobile ? "row" : "column", flexWrap: "wrap", justifyContent: "center", gap: 7, fontFamily: MONO, fontSize: 11 }}>
              {[...BAND_LABELS].map((b, i) => i).reverse().map(i => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, color: i === bIdx ? "#f3f5f8" : "#aeb7c6", fontWeight: i === bIdx ? 700 : 400 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 2, background: BAND_LABELS[i].c, flex: "none" }} />{BAND_LABELS[i].l}{i === bIdx ? " ◄" : ""}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* THE COMPOSITE — the supporting read */}
        <section style={{ borderTop: "1px solid #1b1f29", paddingTop: 30, marginTop: 40 }}>
          <div style={{ fontSize: isMobile ? 22 : 26, fontWeight: 800, letterSpacing: "-0.02em" }}>Valuation composite</div>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#727d90", margin: "6px 0 18px" }}>
            Four independent axes, weighted into one · ranked over history, anchored to Bitcoin
          </div>
          <Suspense fallback={<div style={{ textAlign: "center", color: "#64748b", padding: 40, fontFamily: SANS }}>Loading composite…</div>}>
            <ValuationComposite isMobile={isMobile} />
          </Suspense>
        </section>

        {/* IF THE TREND HOLDS — real crossing dates */}
        <section style={{ borderTop: "1px solid #1b1f29", paddingTop: 30, marginTop: 40 }}>
          <div style={{ fontSize: isMobile ? 20 : 22, fontWeight: 800, letterSpacing: "-0.02em" }}>If the trend holds</div>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#727d90", margin: "6px 0 16px" }}>
            When the frozen centre line reaches each target — extrapolation, not a forecast
          </div>
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
