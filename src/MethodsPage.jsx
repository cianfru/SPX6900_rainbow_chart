// Methods — the page you link when someone says the model is made up.
//
// Deliberately short. The first version had seven prose blocks, fifty-three chart
// pills and eleven source rows, which is a wall to read and says less than a page a
// third the size. The per-family caveats also mostly restated the same five limits,
// so those are stated once at the bottom instead of seven times in the middle.
//
// No pills, no cards, no boxes. Rules and text, one column, tabular figures.
// Counts come from the catalog so they cannot go stale.
import { METHOD_FAMILIES, chartsIn } from "./charts-catalog.js";
import { SANS, MONO, MAX_W } from "./chart-ui.jsx";

const DIM = "#7c8a9e", BODY = "#9aa7bb", NEAR = "#cbd5e1", TEXT = "#f1f5f9";

// One line each. What the family is built on, in plain words.
const SPINE = {
  "01": "Weekly closes since launch",
  "02": "Bitcoin indicators, applied to SPX",
  "03": "Daily closes",
  "04": "2.6M Ethereum transfers, replayed locally",
  "05": "Tagged exchange and LP addresses",
  "06": "SPX priced against another asset",
  "07": "AEON transfers and marketplace trades",
};

const LIMITS = [
  ["Cost basis is Ethereum-only.", "A bridge hop destroys the acquisition price, so Base and Solana count toward holder numbers but never toward valuation."],
  ["Exchange totals are a floor.", "They cover the addresses we have identified, not every address that exists."],
  ["Wallets are not people.", "One person can hold a dozen; one custodial wallet can hold thousands."],
  ["One cycle is not a sample.", "SPX launched in August 2023. Anything called a cycle pattern rests on roughly one."],
  ["None of it is advice.", "Every reading says where price sits against a published yardstick, not what to do about it."],
];

const SOURCES = [
  ["Price", "CoinGecko, Hyperliquid, Coinbase", "live"],
  ["Holders, cost basis, sentiment", "HolderScan, Blockscout, Solana RPC, alternative.me", "daily"],
  ["Transfer history", "Dune, over a full-history archive", "weekly"],
  ["Bitcoin comparisons", "BigQuery public dataset, Coin Metrics", "one-off"],
  ["Project AEON", "Alchemy, Dune", "daily"],
];

export default function MethodsPage({ isMobile }) {
  const pad = isMobile ? 18 : 32;
  const Head = ({ children }) => (
    <div style={{
      fontFamily: SANS, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase",
      color: DIM, borderTop: "1px solid #2a2a31", paddingTop: 14, marginTop: 44, marginBottom: 16,
    }}>{children}</div>
  );

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: `0 ${pad}px 70px`, fontFamily: SANS }}>

      <h1 style={{
        fontFamily: SANS, fontSize: isMobile ? 32 : 44, fontWeight: 700, letterSpacing: "-0.03em",
        color: TEXT, margin: "4px 0 12px", lineHeight: 1.05,
      }}>Methods</h1>
      <p style={{ fontSize: isMobile ? 15 : 17, lineHeight: 1.6, color: NEAR, margin: 0 }}>
        Every chart here is worked out one of seven ways. None of them is a black box.
      </p>

      <Head>The rainbow</Head>
      <p style={{ fontSize: 15, lineHeight: 1.68, color: BODY, margin: "0 0 14px" }}>
        Price against age, both on log scales, fitted with a single straight line. That line is fair
        value. The spread of prices around it is divided into nine bands.
      </p>
      <p style={{ fontSize: 15, lineHeight: 1.68, color: BODY, margin: 0 }}>
        <strong style={{ color: NEAR, fontWeight: 600 }}>The fit is frozen.</strong> It is computed once,
        from the bundled history, and never re-fitted to live price. A model re-fitted whenever price
        escaped it would always look right and would mean nothing. The cost is that the bands march
        upward over time, so a flat price drifts down through them — that is the model working, not failing.
      </p>
      <div style={{ fontFamily: MONO, fontSize: 12.5, color: DIM, marginTop: 16 }}>
        R² 0.74 · fitted on weekly closes since August 2023
      </div>

      <Head>The seven families</Head>
      {METHOD_FAMILIES.map(f => (
        <div key={f.id} style={{
          display: "flex", alignItems: "baseline", gap: isMobile ? 10 : 16,
          padding: "10px 0", borderBottom: "1px solid #1c1c21",
        }}>
          <span style={{ fontFamily: MONO, fontSize: 12.5, color: DIM, flexShrink: 0 }}>{f.id}</span>
          <span style={{
            fontSize: isMobile ? 14 : 15, color: NEAR, fontWeight: 500,
            flexShrink: 0, width: isMobile ? "auto" : 232,
          }}>{f.name}</span>
          {!isMobile && <span style={{ fontSize: 14, color: BODY, flex: 1 }}>{SPINE[f.id]}</span>}
          <span style={{
            marginLeft: "auto", fontFamily: MONO, fontSize: 12.5, color: DIM,
            flexShrink: 0, fontVariantNumeric: "tabular-nums",
          }}>{chartsIn(f.id)}</span>
        </div>
      ))}

      <Head>What none of it can tell you</Head>
      {LIMITS.map(([h, b], i) => (
        <p key={i} style={{ fontSize: 14.5, lineHeight: 1.65, color: BODY, margin: "0 0 11px" }}>
          <strong style={{ color: NEAR, fontWeight: 600 }}>{h}</strong> {b}
        </p>
      ))}

      <Head>Sources</Head>
      {SOURCES.map(([what, src, cadence]) => (
        <div key={what} style={{
          display: "flex", alignItems: "baseline", gap: 14,
          padding: "9px 0", borderBottom: "1px solid #1c1c21", fontSize: 14,
        }}>
          <span style={{ color: NEAR, flexShrink: 0, width: isMobile ? "auto" : 232 }}>{what}</span>
          {!isMobile && <span style={{ color: BODY, flex: 1 }}>{src}</span>}
          <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 12, color: DIM, flexShrink: 0 }}>{cadence}</span>
        </div>
      ))}

      <div style={{ marginTop: 40, fontSize: 12.5, color: DIM, lineHeight: 1.6 }}>
        Independent analytics. Not affiliated with the SPX6900 project. Nothing here is financial advice.
      </div>
    </div>
  );
}
