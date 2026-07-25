// Methods — the page you link when someone says the model is made up.
//
// The site ships 53 charts and, until now, explained how none of them were computed
// except in captions scattered inside the components. That is the "trust me" shape
// the project exists to avoid: the moat is that every number is reproducible, and a
// reproducible number nobody can find the method for is just an assertion.
//
// Static by design — no fetching, no data gating. Counts come from the catalog via
// `chartsIn()` so a family can never advertise a number it no longer has.
import { METHOD_FAMILIES, METHOD_OF, CHART_META, chartsIn } from "./charts-catalog.js";
import { SANS, MONO, MAX_W } from "./chart-ui.jsx";

const DIM = "#7c8a9e", BODY = "#9aa7bb", NEAR = "#cbd5e1", TEXT = "#f1f5f9";

const Caps = ({ children, style }) => (
  <div style={{ fontFamily: SANS, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: DIM, ...style }}>{children}</div>
);

// What refreshes on its own and what waits for a human. Being straight about the
// second list is the point — a stale number presented as live is a broken promise.
const SOURCES = [
  ["Price", "CoinGecko · Hyperliquid · Coinbase", "Live, ~60s"],
  ["Holder counts", "HolderScan (ETH) · Blockscout (Base) · Solana RPC", "Daily"],
  ["Realized price / break-even", "HolderScan, forward-filled", "Daily"],
  ["Fear & Greed", "alternative.me", "Daily"],
  ["Alt-market denominator", "CoinGecko global + DeFiLlama stablecoin cap", "Daily"],
  ["SPX transfer history", "Dune (incremental) over a full-history archive", "Weekly"],
  ["Exchange & LP balances", "Dune, tagged addresses + a public RPC forward-fill", "Weekly + daily"],
  ["Bitcoin HODL waves", "Google BigQuery public Bitcoin dataset (UTXO age)", "One-off reconstruction"],
  ["Bitcoin MVRV", "Coin Metrics community API", "Monthly"],
  ["AEON floor / owners / metadata", "Alchemy", "Daily"],
  ["AEON transfers & sales", "Dune", "Daily"],
];

const LIMITS = [
  ["It is Ethereum-native where it matters", "Cost basis, holding age and concentration are reconstructed from Ethereum transfers only. Base and Solana are bridged; a bridge hop destroys the acquisition price. Holder COUNTS are multi-chain, valuation is not — the charts say which they are."],
  ["Known addresses only", "Exchange, LP and bridge balances cover the addresses we have identified. That makes every exchange total a floor, not a census."],
  ["Wallets are not people", "One person can hold a dozen wallets, and one custodial wallet can hold thousands of people. Holder counts measure addresses."],
  ["A frozen model drifts by design", "The power-law fit does not chase price. As time passes the fair-value line rises whether or not price does, so the bands move under a flat price. That is the honest behaviour of a fixed model, not a bug."],
  ["One cycle is not a sample", "SPX launched in August 2023. Anything described as a cycle pattern rests on roughly one cycle. Indicators borrowed from Bitcoin carry its calibration, not SPX's."],
  ["Position, never advice", "Every valuation reading on this site says where price sits relative to a published yardstick. None of it says what to do about that, and a metric that looks cheap can keep getting cheaper."],
];

export default function MethodsPage({ isMobile, onOpen }) {
  const total = METHOD_FAMILIES.reduce((a, f) => a + f.charts.length, 0);
  const pad = isMobile ? 16 : 32;

  const Rule = ({ mt = 34, mb = 20 }) => (
    <div style={{ borderTop: "1px solid #2a2a31", marginTop: mt, marginBottom: mb }} />
  );

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto", padding: `0 ${pad}px 60px`, fontFamily: SANS }}>

      <Caps>How this site computes things</Caps>
      <h1 style={{
        fontFamily: SANS, fontSize: isMobile ? 34 : 52, fontWeight: 700, letterSpacing: "-0.03em",
        color: TEXT, margin: "10px 0 14px", lineHeight: 1.05,
      }}>Methods</h1>
      <p style={{ fontSize: isMobile ? 15 : 18, lineHeight: 1.6, color: NEAR, maxWidth: 760, margin: "0 0 6px" }}>
        Every chart here is worked out one of seven ways. This page names each one, the data it stands on,
        and the thing it cannot tell you. Nothing on this site is a proprietary composite you have to take
        on faith — the inputs are public, the code is in the open, and the caveats are on the page rather
        than in the footnotes.
      </p>

      {/* Site readout */}
      <div style={{
        display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)",
        gap: 14, margin: "26px 0 6px",
      }}>
        {[["Charts", total], ["Method families", METHOD_FAMILIES.length],
          ["Power-law fit R²", "0.74"], ["History since", "Aug 2023"]].map(([k, v]) => (
          <div key={k} style={{ border: "1px solid #1c1c21", padding: "14px 16px" }}>
            <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 700, color: TEXT, letterSpacing: "-0.02em" }}>{v}</div>
            <Caps style={{ marginTop: 5, fontSize: 10 }}>{k}</Caps>
          </div>
        ))}
      </div>

      <Rule />

      {/* Method 01, worked properly — it is the one the whole site is named after */}
      <Caps>Method 01 · in full</Caps>
      <h2 style={{ fontSize: isMobile ? 22 : 26, fontWeight: 700, color: TEXT, letterSpacing: "-0.02em", margin: "8px 0 12px" }}>
        How the rainbow is fit
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: isMobile ? 18 : 28 }}>
        {[
          ["Take the log of both axes", "Price against days since launch, both on log scales. A power law is a straight line in that space, which is what makes it fittable at all."],
          ["Fit one straight line", "Least-squares through the weekly closes. That line is fair value. Its slope is the exponent — how fast the trend compounds with age."],
          ["Split the spread into nine", "Every close sits some distance above or below the line. Those residuals are divided into nine bands, from Fire Sale at the bottom to Max Bubble at the top."],
        ].map(([h, b], i) => (
          <div key={i}>
            <div style={{ fontFamily: MONO, fontSize: 12, color: DIM, marginBottom: 7 }}>{`0${i + 1}`}</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: NEAR, marginBottom: 6 }}>{h}</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.62, color: BODY }}>{b}</div>
          </div>
        ))}
      </div>
      <div style={{
        marginTop: 20, borderLeft: "2px solid #f59e0b", padding: "10px 0 10px 16px",
        fontSize: 13.5, lineHeight: 1.62, color: BODY, maxWidth: 860,
      }}>
        <strong style={{ color: NEAR }}>The fit is frozen.</strong> It is computed once, from the bundled history,
        and never re-fit to live price. This matters more than any other decision on the site: a model
        re-fit whenever price escapes it would always look right and would mean nothing. The cost of
        freezing it is that the bands march upward over time even if price does not — so a flat price
        drifts down through the bands. That drift is the model working, not failing.
      </div>

      <Rule />

      {/* The seven families */}
      <Caps>The seven families</Caps>
      <div style={{ marginTop: 14 }}>
        {METHOD_FAMILIES.map(f => (
          <div key={f.id} style={{ borderTop: "1px solid #1c1c21", padding: isMobile ? "18px 0" : "22px 0" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
              <span style={{ fontFamily: MONO, fontSize: 13, color: DIM }}>{f.id}</span>
              <span style={{ fontSize: isMobile ? 17 : 20, fontWeight: 600, color: TEXT, letterSpacing: "-0.01em" }}>{f.name}</span>
              <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 12, color: DIM }}>
                {chartsIn(f.id)} chart{chartsIn(f.id) === 1 ? "" : "s"}
              </span>
            </div>
            <div style={{ marginTop: 4 }}><Caps style={{ fontSize: 10 }}>{f.spine}</Caps></div>
            <div style={{ fontSize: 14, lineHeight: 1.62, color: BODY, margin: "10px 0 0", maxWidth: 880 }}>{f.what}</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.62, color: BODY, margin: "9px 0 0", maxWidth: 880 }}>
              <span style={{ color: "#fbbf24", fontWeight: 600 }}>What it cannot tell you. </span>{f.caveat}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 12 }}>
              {f.charts.map(id => CHART_META[id] && (
                <button key={id} onClick={() => onOpen?.(id)} title={CHART_META[id].desc}
                  style={{
                    fontFamily: SANS, fontSize: 12, color: NEAR, background: "transparent", cursor: "pointer",
                    border: "1px solid #2a2a31", borderRadius: 999, padding: "4px 11px",
                    display: "inline-flex", alignItems: "center", gap: 7,
                  }}>
                  <span style={{ width: 6, height: 6, borderRadius: 6, background: CHART_META[id].color, flexShrink: 0 }} />
                  {CHART_META[id].title}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Rule />

      {/* Frozen vs live — the distinction that confuses people most */}
      <Caps>Frozen vs live</Caps>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 16 : 28, marginTop: 14 }}>
        <div style={{ border: "1px solid #1c1c21", padding: "18px 20px" }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: TEXT, marginBottom: 8 }}>Frozen</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.62, color: BODY }}>
            The power-law fit and every band boundary derived from it. Set once from the bundled weekly
            history and left alone. Re-fitting is a deliberate, rare, documented act — not something that
            happens because price moved.
          </div>
        </div>
        <div style={{ border: "1px solid #1c1c21", padding: "18px 20px" }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: TEXT, marginBottom: 8 }}>Live</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.62, color: BODY }}>
            The price line, the band you are currently in, holder counts, realized price, Fear &amp; Greed
            and the AEON floor. These extend the drawn chart and update the readouts, but they never
            move the model underneath.
          </div>
        </div>
      </div>

      <Rule />

      {/* Sources */}
      <Caps>Where the numbers come from</Caps>
      <div style={{ marginTop: 12 }}>
        {SOURCES.map(([what, src, cadence]) => (
          <div key={what} style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "220px 1fr 190px",
            gap: isMobile ? 2 : 16, padding: "11px 0", borderTop: "1px solid #1c1c21",
            fontSize: 13.5, lineHeight: 1.5,
          }}>
            <div style={{ color: NEAR, fontWeight: 500 }}>{what}</div>
            <div style={{ color: BODY }}>{src}</div>
            <div style={{ color: DIM, fontFamily: MONO, fontSize: 12, textAlign: isMobile ? "left" : "right" }}>{cadence}</div>
          </div>
        ))}
      </div>

      <Rule />

      {/* Limits */}
      <Caps>Limits that apply to everything</Caps>
      <div style={{
        display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
        gap: isMobile ? 18 : "18px 40px", marginTop: 16,
      }}>
        {LIMITS.map(([h, b], i) => (
          <div key={i}>
            <div style={{ display: "flex", gap: 11, alignItems: "baseline" }}>
              <span style={{ fontFamily: MONO, fontSize: 12, color: DIM, flexShrink: 0 }}>{`0${i + 1}`}</span>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: NEAR, marginBottom: 5 }}>{h}</div>
                <div style={{ fontSize: 13.5, lineHeight: 1.62, color: BODY }}>{b}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ borderTop: "1px solid #2a2a31", marginTop: 40, paddingTop: 16, fontSize: 12.5, color: DIM, lineHeight: 1.6 }}>
        Independent analytics. Not affiliated with the SPX6900 project. Nothing here is financial advice.
      </div>
    </div>
  );
}
