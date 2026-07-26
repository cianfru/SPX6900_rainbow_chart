// Methods — the page you link when someone says the model is made up.
//
// Deliberately short and plain: rules and text, one column, tabular figures. No pills,
// no cards, no boxes, no gradients — same understated styling as the rest of the site.
// The numbers that CAN be live are live: the rainbow's equation, R² and σ come from the
// same frozen model the home page draws, and the family counts + composite weights come
// straight from the catalog and the composite engine, so nothing here can silently drift.
import { METHOD_FAMILIES } from "./charts-catalog.js";
import { AXES } from "../scripts/bot/valuation-composite.mjs";
import { SANS, MONO } from "./chart-ui.jsx";

const DIM = "#7c8a9e", BODY = "#9aa7bb", NEAR = "#cbd5e1", TEXT = "#f1f5f9";
const RULE = "#1c1c21", HEADRULE = "#2a2a31";

// One line each — what the family is built on, in plain words.
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
  ["Bitcoin comparisons", "BigQuery public dataset", "one-off"],
  ["Project AEON", "Alchemy, Dune", "daily"],
];

export default function MethodsPage({ m, isMobile }) {
  const pad = isMobile ? 18 : 32;

  const Head = ({ children }) => (
    <div style={{
      fontFamily: SANS, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase",
      color: DIM, borderTop: `1px solid ${HEADRULE}`, paddingTop: 14, marginTop: 44, marginBottom: 16,
    }}>{children}</div>
  );
  const P = ({ children, mb = 14 }) => (
    <p style={{ fontSize: 15, lineHeight: 1.68, color: BODY, margin: `0 0 ${mb}px` }}>{children}</p>
  );
  const Strong = ({ children }) => <strong style={{ color: NEAR, fontWeight: 600 }}>{children}</strong>;
  const Row = ({ id, name, note, right, w = 232 }) => (
    <div style={{ display: "flex", alignItems: "baseline", gap: isMobile ? 10 : 16, padding: "10px 0", borderBottom: `1px solid ${RULE}` }}>
      {id && <span style={{ fontFamily: MONO, fontSize: 12.5, color: DIM, flexShrink: 0 }}>{id}</span>}
      <span style={{ fontSize: isMobile ? 14 : 15, color: NEAR, fontWeight: 500, flexShrink: 0, width: isMobile ? "auto" : w }}>{name}</span>
      {!isMobile && note && <span style={{ fontSize: 14, color: BODY, flex: 1 }}>{note}</span>}
      <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 12.5, color: DIM, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{right}</span>
    </div>
  );

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: `0 ${pad}px 70px`, fontFamily: SANS }}>

      <h1 style={{ fontFamily: SANS, fontSize: isMobile ? 32 : 44, fontWeight: 700, letterSpacing: "-0.03em", color: TEXT, margin: "4px 0 12px", lineHeight: 1.05 }}>
        Methods
      </h1>
      <p style={{ fontSize: isMobile ? 15 : 17, lineHeight: 1.6, color: NEAR, margin: 0 }}>
        Every chart here is worked out one of seven ways. None of them is a black box.
      </p>

      <Head>The rainbow</Head>
      <P>
        Price against age, both on log scales, fitted with a single straight line. That line is fair
        value. The spread of prices around it is divided into nine bands — cut from the actual residuals
        (2nd to 98th percentile), so they widen on the upside where bubbles overshoot.
      </P>
      <P mb={16}>
        <Strong>The fit is frozen.</Strong> It is computed once, from the bundled history, and never
        re-fitted to live price. A model re-fitted whenever price escaped it would always look right and
        would mean nothing. The cost is that the bands march upward over time, so a flat price drifts down
        through them — that is the model working, not failing.
      </P>
      {m && (
        <div style={{ fontFamily: MONO, fontSize: 12.5, color: DIM, lineHeight: 1.7 }}>
          <div style={{ color: NEAR }}>{m.formula}</div>
          <div>R² {m.r2.toFixed(3)} · σ {m.std.toFixed(3)} · frozen on weekly closes since August 2023</div>
        </div>
      )}

      <Head>The valuation composite</Head>
      <P>
        The single reading on the home page is not a new metric. It groups the measures below into four
        <Strong> independent axes</Strong> — because several of them (rainbow, MVRV, supply-in-profit) are
        0.7–0.85 correlated, so left flat they'd count one signal three times. Correlated lenses are combined
        so each axis votes once; each is ranked against its <Strong>own history</Strong> (0 = cheapest it's
        been, 100 = dearest), with the unitless ones also anchored against Bitcoin's decade. The axis weights
        are the only editorial choice, so they are published:
      </P>
      {AXES.map(a => (
        <Row key={a.key} name={a.label} note={a.members.map(m => m.label).join(" · ")} right={`${a.weight}%`} w={140} />
      ))}

      <Head>The seven families</Head>
      {METHOD_FAMILIES.map(f => (
        <Row key={f.id} id={f.id} name={f.name} note={SPINE[f.id]} right={f.charts.length} />
      ))}

      <Head>What none of it can tell you</Head>
      {LIMITS.map(([h, b], i) => (
        <p key={i} style={{ fontSize: 14.5, lineHeight: 1.65, color: BODY, margin: "0 0 11px" }}>
          <Strong>{h}</Strong> {b}
        </p>
      ))}

      <Head>Sources</Head>
      {SOURCES.map(([what, src, cadence]) => (
        <Row key={what} name={what} note={src} right={cadence} />
      ))}

      <div style={{ marginTop: 40, fontSize: 12.5, color: DIM, lineHeight: 1.6 }}>
        Independent analytics. Not affiliated with the SPX6900 project. Nothing here is financial advice.
      </div>
    </div>
  );
}
