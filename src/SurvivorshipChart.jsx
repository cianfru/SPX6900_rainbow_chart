import { useMemo, useState, useEffect } from "react";
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, ComposedChart, Line, Scatter, XAxis, YAxis, Tooltip, CartesianGrid, Cell, ReferenceLine, ReferenceArea } from "recharts";
import { loadCohortSurvival, loadPriceHistory, loadExitFlow } from "./history-data.js";
import { SANS, MONO, MAX_W, Metric, TipBox, Explain } from "./chart-ui.jsx";

// SPX6900 SURVIVORSHIP, who is still holding, by when they first bought. Three reads off one file:
//   "Who's here", the living holder base over time, stacked by arrival vintage (each cohort rises,
//                  then thins as it leaves). The launch band balloons in 2023 and shrinks to a sliver.
//   "Survival"  , the plain retention bar per cohort: 4% of the launch crowd remain, ~64% of the
//                  newest. Recent cohorts read high partly because they haven't had time to leave.
//   "Cost basis", survivorship coupled with PRICE: each surviving cohort placed on the real price
//                  curve at the price it first paid, bubble = SPX still held, ring green=in profit /
//                  red=underwater. ~40%+ of the float bought above today's price and never sold.
// The honest twist: enormous churn AND extreme survivor conviction at once.

const hx = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const mix = (a, b, t) => { const A = hx(a), B = hx(b); return `#${[0, 1, 2].map(i => Math.round(A[i] + (B[i] - A[i]) * t).toString(16).padStart(2, "0")).join("")}`; };
const vintage = (i, n) => mix("#22d3ee", "#f6a23c", n <= 1 ? 0 : i / (n - 1));   // old cyan → fresh amber
const shortLab = l => l.replace(" H1", " H1").replace("20", "'");
const fmtN = n => (n >= 1000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + "k" : String(n));
const fmtM = v => v >= 1 ? v.toFixed(0) + "M" : (v * 1000).toFixed(0) + "k";
const fmtP = p => p == null ? "" : p < 0.01 ? "$" + p.toFixed(4) : "$" + p.toFixed(2);
const plLabel = (med, now) => { const r = now / med; return r >= 2 ? "+" + (r >= 10 ? r.toFixed(0) : r.toFixed(1)) + "×" : r >= 1 ? "+" + Math.round((r - 1) * 100) + "%" : "−" + Math.round((1 - r) * 100) + "%"; };
const DAY = 864e5;

export default function SurvivorshipChart({ isMobile, initialView }) {
  const [data, setData] = useState(null);
  const [px, setPx] = useState(null);
  const [flow, setFlow] = useState(null);
  const [view, setView] = useState(() => ["who", "survival", "supply", "exits"].includes(initialView) ? initialView : "who");   // "who" | "survival" | "supply" | "exits"
  useEffect(() => { let off = false; loadCohortSurvival().then(d => { if (!off) setData(d || { empty: true }); }); loadPriceHistory().then(p => { if (!off) setPx(Array.isArray(p) ? p : []); }); loadExitFlow().then(f => { if (!off) setFlow(f); }); return () => { off = true; }; }, []);

  const model = useMemo(() => {
    if (!data || data.empty) return null;
    const cohorts = data.cohorts.filter(c => c.arrived > 0);
    const nC = cohorts.length;
    const colOf = c => data.cohorts.indexOf(c);
    const week0 = Date.parse(data.week0);
    const rows = data.weekly.map((wk, i) => {
      const o = { ts: week0 + i * 7 * DAY };
      cohorts.forEach((c, k) => { o[`v${k}`] = wk[colOf(c)]; });
      return o;
    });
    const totalSupply = cohorts.reduce((s, c) => s + c.supplyNow, 0);
    const bars = cohorts.map((c, k) => ({ label: shortLab(c.label), survivalPct: c.survivalPct, arrived: c.arrived, holdNow: c.holdNow, supplyM: c.supplyNow / 1e6, supplyPct: Math.round(100 * c.supplyNow / totalSupply), medPrice: c.medPrice, colour: vintage(k, nC) }));
    const launchPct = Math.round(100 * cohorts.slice(0, 2).reduce((s, c) => s + c.supplyNow, 0) / totalSupply);

    // COST-BASIS (price-coupled) view, real price line + a bubble per cohort at its entry
    const line = (px || []).map(r => ({ t: Date.parse(r.date), p: +r.price })).filter(r => Number.isFinite(r.t) && r.p > 0).sort((a, b) => a.t - b.t);
    const now = line.length ? line.at(-1).p : null;
    let bubbles = [], pMin = 0.004, pMax = 2, t0 = week0, t1 = week0, underPct = 0, maxSupM = 1;
    if (line.length && now) {
      const priced = cohorts.filter(c => c.supplyNow > 0 && c.medPrice > 0);
      t1 = Math.max(line.at(-1).t, week0 + data.n * 7 * DAY);
      maxSupM = Math.max(...priced.map(c => c.supplyNow / 1e6));
      bubbles = priced.map((c) => {
        const k = colOf(c), ni = data.cohorts.indexOf(c);
        const endWk = ni + 1 < data.cohorts.length ? data.cohorts[ni + 1].startWk : data.n;
        return { t: week0 + ((c.startWk + endWk) / 2) * 7 * DAY, p: c.medPrice, supplyM: c.supplyNow / 1e6, supplyPct: Math.round(100 * c.supplyNow / totalSupply), label: shortLab(c.label), colour: vintage(k, nC), prof: c.medPrice <= now, pl: plLabel(c.medPrice, now) };
      });
      const uw = priced.filter(c => c.medPrice > now).reduce((s, c) => s + c.supplyNow, 0);
      underPct = Math.round(100 * uw / totalSupply);
      // floor just under the true launch low so the sub-cent dip stays in frame (never off the bottom)
      const pFloor = Math.min(...line.map(r => r.p), ...priced.map(c => c.medPrice));
      pMin = Math.max(0.0005, pFloor * 0.85);
      pMax = Math.max(...line.map(r => r.p), ...priced.map(c => c.medPrice), now) * 1.18;
    }
    // WHO LEFT, raw per-day (or per-week) departures split profit/loss, each a stacked bar; price joined per row
    let flowRows = [], flowRes = null, flowOverall = null;
    if (flow?.days?.length && line.length) {
      flowRes = flow.res; flowOverall = flow.overall;
      const priceAt = (t) => { let best = line[0].p; for (const r of line) { if (r.t <= t) best = r.p; else break; } return best; };
      flowRows = flow.days.map(([d, pr, ls]) => ({ d, t: Date.parse(d), profit: pr, loss: ls, price: priceAt(Date.parse(d)) })).filter(r => Number.isFinite(r.t)).sort((a, b) => a.t - b.t);
    }
    return { cohorts, nC, rows, bars, totalSupply, launchPct, line, bubbles, now, pMin, pMax, t0, t1, underPct, maxSupM, flowRows, flowRes, flowOverall };
  }, [data, px, flow]);

  if (!data) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading…</div>;
  if (!model) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Being reconstructed, check back after the next on-chain refresh.</div>;
  const { cohorts, nC, rows, bars, launchPct, line, bubbles, now, pMin, pMax, t0, t1, underPct, maxSupM, flowRows, flowRes, flowOverall } = model;
  const fDay = ts => new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
  const yearTicks = (() => { const seen = new Set(), out = []; for (const r of flowRows) { const y = r.d.slice(0, 4); if (!seen.has(y)) { seen.add(y); out.push(r.d); } } return out; })();
  const O = data.overall, launch = cohorts[0];
  const fDate = ts => new Date(ts).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  const fYear = ts => new Date(ts).getUTCFullYear();

  const btn = (active) => ({
    className: `neon-pill${active ? " active" : ""}`,
    style: { padding: "6px 14px", borderRadius: 8, fontFamily: MONO, fontSize: 12, color: active ? "#f8fafc" : "#94a3b8", "--glow": "#22d3ee" },
  });

  // custom bubble for the cost-basis scatter, size ∝ √supply, ring by profit/underwater
  const bubble = (p) => {
    const { cx, cy, payload } = p;
    if (cx == null || cy == null) return null;
    const rad = (isMobile ? 5 : 7) + (isMobile ? 22 : 30) * Math.sqrt(payload.supplyM / maxSupM);
    const ring = payload.prof ? "#4ade80" : "#f43f5e";
    return <g>
      <circle cx={cx} cy={cy} r={rad} fill={payload.colour} fillOpacity={0.8} stroke={ring} strokeWidth={2.5} />
      {rad >= 20
        ? <><text x={cx} y={cy - 1} fill="#0b1120" fontFamily={MONO} fontSize={isMobile ? 11 : 14} fontWeight={800} textAnchor="middle">{fmtM(payload.supplyM)}</text>
            <text x={cx} y={cy + (isMobile ? 12 : 15)} fill="#0b1120" fontFamily={MONO} fontSize={isMobile ? 9 : 11} fontWeight={700} textAnchor="middle">{payload.pl}</text></>
        : <text x={cx} y={cy - rad - 6} fill="#e2e8f0" fontFamily={MONO} fontSize={isMobile ? 10 : 13} fontWeight={700} textAnchor="middle">{fmtM(payload.supplyM)}</text>}
    </g>;
  };

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="Of everyone who ever held SPX6900, who is still here?" accent="#22d3ee">
        Every wallet is placed by the era it <strong style={{ color: "#e2e8f0" }}>first bought</strong> and coloured for it -
        <strong style={{ color: "#22d3ee" }}> cyan for the launch crowd</strong>, <strong style={{ color: "#f6a23c" }}>amber for the newest</strong>.
        The launch band balloons in 2023 and shrinks to a sliver: <strong style={{ color: "#f43f5e" }}>{O.gonePct}% of everyone who ever held has left</strong>.
        But the survivors barely flinched, <strong style={{ color: "#22d3ee" }}>{O.diamondPct}% of today's holders never once sold</strong>. Huge churn, iron survivors.
      </Explain>

      <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 6, flexWrap: "wrap" }}>
        {[["who", "Who's here"], ["survival", "Survival by cohort"], ["supply", "Cost basis"], ...(flowRows.length ? [["exits", "Who left"]] : [])].map(([id, lbl]) => (
          <button key={id} onClick={() => setView(id)} {...btn(view === id)}>{lbl}</button>
        ))}
      </div>

      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", margin: "10px 0 14px", flexWrap: "wrap" }}>
        <Metric label="ever a holder" value={fmtN(O.everHeld)} color="#94a3b8" sub="all time" />
        <Metric label="still hold" value={fmtN(O.holdNow)} color="#22d3ee" sub="today" />
        <Metric label="gone" value={O.gonePct + "%"} color="#f43f5e" sub="churned out" />
        <Metric label="never sold" value={O.diamondPct + "%"} color="#4ade80" sub="of today's holders" />
      </div>

      {view === "who" ? (
        <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
          <AreaChart data={rows} margin={{ top: 8, right: 16, left: 6, bottom: 6 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey="ts" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={fDate}
              tick={{ fill: "#94a3b8", fontFamily: MONO, fontSize: 12 }} tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.12)" }} />
            <YAxis tickFormatter={fmtN} tick={{ fill: "#94a3b8", fontFamily: MONO, fontSize: 12 }} tickLine={false} axisLine={false} width={48} />
            <Tooltip content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const total = payload.reduce((s, p) => s + (p.value || 0), 0);
              return <TipBox><div style={{ fontFamily: MONO, fontSize: 12 }}>
                <div style={{ color: "#e2e8f0", marginBottom: 3 }}>{fDate(label)} · {fmtN(total)} holders</div>
                {payload.slice().reverse().filter(p => p.value > 0).map((p, i) => {
                  const k = +p.dataKey.slice(1);
                  return <div key={i} style={{ color: vintage(k, nC) }}>{shortLab(cohorts[k].label)}: {fmtN(p.value)}</div>;
                })}
              </div></TipBox>;
            }} />
            {cohorts.map((c, k) => (
              <Area key={k} type="monotone" dataKey={`v${k}`} stackId="1" stroke="#05050e" strokeWidth={0.5}
                fill={vintage(k, nC)} fillOpacity={0.9} isAnimationActive={false} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      ) : view === "survival" ? (
        <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
          <BarChart data={bars} margin={{ top: 8, right: 16, left: 6, bottom: 6 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontFamily: MONO, fontSize: 12 }} tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.12)" }} />
            <YAxis unit="%" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fill: "#94a3b8", fontFamily: MONO, fontSize: 12 }} tickLine={false} axisLine={false} width={44} />
            <Tooltip content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const b = payload[0].payload;
              return <TipBox><div style={{ fontFamily: MONO, fontSize: 12 }}>
                <div style={{ color: b.colour, marginBottom: 3 }}>{b.label}</div>
                <div style={{ color: "#e2e8f0" }}>{b.survivalPct}% still hold</div>
                <div style={{ color: "#94a3b8" }}>{fmtN(b.holdNow)} of {fmtN(b.arrived)} · {b.supplyM.toFixed(1)}M SPX</div>
              </div></TipBox>;
            }} />
            <Bar dataKey="survivalPct" radius={[5, 5, 0, 0]}>
              {bars.map((b, i) => <Cell key={i} fill={b.colour} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : view === "exits" ? (
        !flowRows.length || !line.length ? (
          <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 120 }}>Being reconstructed, check back after the next on-chain refresh.</div>
        ) : (
        <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
          <ComposedChart data={flowRows} margin={{ top: 12, right: 56, left: 6, bottom: 6 }} barCategoryGap={0} barGap={0}>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="d" ticks={yearTicks} tickFormatter={d => d.slice(0, 4)} tick={{ fill: "#94a3b8", fontFamily: MONO, fontSize: 12 }} tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.12)" }} />
            <YAxis yAxisId="cnt" tickFormatter={fmtN} tick={{ fill: "#94a3b8", fontFamily: MONO, fontSize: 12 }} tickLine={false} axisLine={false} width={46} />
            <YAxis yAxisId="px" orientation="right" scale="log" domain={[pMin, pMax]} allowDataOverflow ticks={[0.001, 0.01, 0.1, 1].filter(v => v >= pMin && v <= pMax)} tickFormatter={fmtP} tick={{ fill: "#8592a6", fontFamily: MONO, fontSize: 11 }} tickLine={false} axisLine={false} width={50} />
            <Tooltip cursor={{ fill: "rgba(255,255,255,0.06)" }} content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const r = payload.find(p => p.payload?.profit != null)?.payload; if (!r) return null;
              return <TipBox><div style={{ fontFamily: MONO, fontSize: 12 }}>
                <div style={{ color: "#e2e8f0", marginBottom: 3 }}>{fDay(r.t)} · {fmtN(r.profit + r.loss)} left</div>
                <div style={{ color: "#4ade80" }}>{fmtN(r.profit)} in profit</div>
                <div style={{ color: "#f43f5e" }}>{fmtN(r.loss)} at a loss{r.price ? ` · ${fmtP(r.price)}` : ""}</div>
              </div></TipBox>;
            }} />
            <Bar yAxisId="cnt" dataKey="profit" stackId="e" fill="#4ade80" fillOpacity={0.85} isAnimationActive={false} />
            <Bar yAxisId="cnt" dataKey="loss" stackId="e" fill="#f43f5e" fillOpacity={0.88} isAnimationActive={false} />
            <Line yAxisId="px" dataKey="price" type="monotone" dot={false} stroke="#aab6cc" strokeWidth={1.5} strokeOpacity={0.85} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
        )
      ) : !line.length ? (
        <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 120 }}>Loading price…</div>
      ) : (
        <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
          <ComposedChart margin={{ top: 12, right: 72, left: 6, bottom: 6 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="t" type="number" scale="time" domain={[t0, t1]} ticks={[2024, 2025, 2026].map(y => Date.UTC(y, 0, 1)).filter(t => t >= t0 && t <= t1)} tickFormatter={fYear}
              tick={{ fill: "#94a3b8", fontFamily: MONO, fontSize: 12 }} tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.12)" }} allowDuplicatedCategory={false} />
            <YAxis dataKey="p" type="number" scale="log" domain={[pMin, pMax]} allowDataOverflow ticks={[0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2].filter(v => v >= pMin && v <= pMax)} tickFormatter={fmtP}
              tick={{ fill: "#94a3b8", fontFamily: MONO, fontSize: 12 }} tickLine={false} axisLine={false} width={54} />
            <ReferenceArea y1={now} y2={pMax} fill="#fb7185" fillOpacity={0.11} ifOverflow="hidden" />
            <ReferenceArea y1={pMin} y2={now} fill="#4ade80" fillOpacity={0.1} ifOverflow="hidden" />
            <ReferenceLine y={now} stroke="#e2e8f0" strokeDasharray="2 6" strokeOpacity={0.6}
              label={{ value: `now ${fmtP(now)}`, position: "right", fill: "#e2e8f0", fontFamily: MONO, fontSize: 11 }} />
            <Tooltip content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const b = payload.find(p => p.payload?.supplyM != null)?.payload;
              if (!b) return null;
              return <TipBox><div style={{ fontFamily: MONO, fontSize: 12 }}>
                <div style={{ color: b.colour, marginBottom: 3 }}>{b.label} · bought ~{fmtP(b.p)}</div>
                <div style={{ color: b.prof ? "#4ade80" : "#f43f5e" }}>{b.prof ? "in profit" : "underwater"} {b.pl} vs today</div>
                <div style={{ color: "#94a3b8" }}>{b.supplyM.toFixed(1)}M SPX still held · {b.supplyPct}% of float</div>
              </div></TipBox>;
            }} />
            <Line data={line} dataKey="p" type="monotone" dot={false} stroke="#46506a" strokeWidth={1.6} isAnimationActive={false} />
            <Scatter data={bubbles} dataKey="p" shape={bubble} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      )}

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 16, lineHeight: 1.65, maxWidth: 840, marginInline: "auto" }}>
        {view === "who"
          ? <>Living holders over time, stacked by the era each wallet first bought. Old vintages thin out as they sell; the base today is mostly the {shortLab(cohorts[2]?.label || "2024")}–{shortLab(cohorts[cohorts.length - 2]?.label || "2025")} cohorts who <strong style={{ color: "#e2e8f0" }}>accumulated through the drawdown</strong>.</>
          : view === "survival"
          ? <>Share of each arrival cohort still holding today. Retention decays with tenure, the {shortLab(launch.label)} launch crowd is down to <strong style={{ color: "#f43f5e" }}>{launch.survivalPct}%</strong>. Recent cohorts read high partly because they <strong style={{ color: "#e2e8f0" }}>haven't had time to leave</strong> (right-censoring).</>
          : view === "exits"
          ? <>Departures {flowRes === "daily" ? "each day" : "each week"}, holders that left the base, one bar per {flowRes === "daily" ? "day" : "week"}, split <strong style={{ color: "#4ade80" }}>green (sold in profit)</strong> / <strong style={{ color: "#f43f5e" }}>red (at a loss)</strong> vs the price when they crossed the bar; the pale line is price. Of the {flowOverall?.left.toLocaleString("en-US")} that left, <strong style={{ color: "#4ade80" }}>{flowOverall?.profitPct}% sold green</strong>, exits spike at the tops (profit-taking) and turn red only in the drawdown. Not NUPL (that's unrealized P/L of who's still here), this is who's gone.</>
          : <>Each surviving cohort placed on the real price curve at the price it first paid, bubble size = SPX still held, <strong style={{ color: "#4ade80" }}>green ring in profit</strong> / <strong style={{ color: "#f43f5e" }}>red underwater</strong>. <strong style={{ color: "#e2e8f0" }}>{underPct}% of the float held today is underwater</strong> and still hasn't sold, the biggest bag bought near the top. The float turned over; the survivors are sitting through the drawdown.</>}
        <br />Self-custody holders (≥5,000 SPX); exchanges, LP and bridge addresses excluded. Survivorship, not a forecast.
      </div>
    </div>
  );
}
