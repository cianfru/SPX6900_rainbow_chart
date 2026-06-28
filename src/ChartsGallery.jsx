import { useState, useEffect, useCallback } from "react";

// Browsable "all charts" gallery — an ITC-style grid of preview tiles. Each tile
// shows the chart's card image (rendered by /api/og?post=<id>&thumb=1, hard-cached)
// plus a title + one-liner. Tiles that have a native interactive tab on the site
// open it (onOpen); the rest open a lightbox of the full card image.
//
// `tab` = the site's interactive version (a NAV_TABS id) when one exists; `post`
// = the rotation card id used for the thumbnail (and the lightbox image).

const SANS = "'Space Grotesk', system-ui, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace";
const MAX_W = 1400;

const thumbUrl = post => `/api/og?post=${post}&thumb=1`;
const fullUrl = post => `/api/og?post=${post}`;

// Category accent colors (match the site's neon palette).
const CATS = [
  {
    title: "Valuation",
    desc: "Where the price sits versus its long-term trend.",
    color: "#a78bfa",
    items: [
      { tab: "rainbow", post: "valuation", title: "Rainbow Bands", desc: "Price across its power-law valuation bands." },
      { tab: "channel", post: "channel", title: "Power-Law Channel", desc: "The log-regression trend channel over time." },
      { post: "roadmap", title: "Price Roadmap", desc: "When the trend line crosses $6.90, $69, $690." },
      { tab: "model", post: "model", title: "The Model", desc: "How the rainbow bands are fit from the data." },
      { post: "riskcolor", title: "Valuation Z-Score", desc: "Price recoloured by how many σ from fair value." },
      { post: "riskheat", title: "20-Week Heat", desc: "How stretched price is from its 20-week average." },
      { post: "risklevels", title: "Risk Levels", desc: "What price equals each risk band right now." },
      { tab: "risk", post: "risk", title: "Risk Meter", desc: "Historical valuation risk on a 0–1 scale." },
    ],
  },
  {
    title: "Targets",
    desc: "How far the run could go — the aspirational multiples.",
    color: "#4ade80",
    items: [
      { post: "targets", title: "Price Targets", desc: "How far to $1, $6.90 and $69." },
      { post: "milestones", title: "Crypto Milestones", desc: "The market caps SPX6900 could flip next." },
      { post: "memecoins", title: "Memecoin Ladder", desc: "The memecoins still above SPX by market cap." },
      { post: "hundred", title: "Road to $100B", desc: "What each milestone cap means per coin." },
      { post: "btcgrade", title: "Fraction of Bitcoin", desc: "SPX6900 priced as a slice of BTC's cap." },
      { post: "dogeclock", title: "Flip DOGE", desc: "How many X it takes to reach DOGE's cap." },
      { post: "alltime", title: "Since Launch", desc: "The full run, day one to today." },
      { post: "majorcaps", title: "If SPX Had Their Cap", desc: "Price at Apple, gold and other giants' caps." },
    ],
  },
  {
    title: "Returns & Seasonality",
    desc: "What it's done — rallies, drawdowns and monthly patterns.",
    color: "#2dd4bf",
    items: [
      { tab: "rally", post: "rally", title: "Rallies", desc: "Every major rally up off the lows." },
      { tab: "drawdown", post: "drawdown", title: "Drawdowns", desc: "The depth and recovery of each dip." },
      { tab: "monthly", post: "monthlyreturns", title: "Seasonality", desc: "Returns by month, every year, as a heatmap." },
      { post: "monthcompare", title: "Month vs Month", desc: "Same calendar month, year over year." },
      { post: "monthlybars", title: "Monthly Returns", desc: "One bar per month across all history." },
      { post: "runningroi", title: "365-Day ROI", desc: "Rolling one-year return over time." },
      { post: "dca", title: "DCA Simulator", desc: "What steady weekly buying would be worth." },
      { post: "dcaladder", title: "Risk-Tiered DCA", desc: "Buying more when it's historically cheap." },
    ],
  },
  {
    title: "On-Chain & Sentiment",
    desc: "Holders, cost basis and crowd mood.",
    color: "#60a5fa",
    items: [
      { tab: "supply", post: "distribution", title: "Holder Conviction", desc: "Supply split across holder cohorts." },
      { tab: "holders", post: "marketcap", title: "Holders", desc: "The holder base and its average cost basis." },
      { post: "breakeven", title: "Cost Basis", desc: "Price versus the average holder's break-even." },
      { post: "diamondtrend", title: "Diamond Hands", desc: "Share of supply sitting in profit and holding." },
      { post: "fngdial", title: "Fear & Greed", desc: "The current market-sentiment dial." },
      { post: "fngtrend", title: "Fear & Greed Trend", desc: "How sentiment has swung over time." },
      { post: "rsidots", title: "RSI Dots", desc: "Price coloured by RSI, PlanB-style." },
      { post: "timeinband", title: "Time in Bands", desc: "How long price spends in each risk band." },
    ],
  },
  {
    title: "Bitcoin & Markets",
    desc: "SPX6900 against BTC, the majors and the S&P 500.",
    color: "#f7931a",
    items: [
      { tab: "spxbtc", post: "btc", title: "SPX vs BTC", desc: "The SPX6900/Bitcoin ratio over time." },
      { tab: "btccycle", post: "cycle", title: "Bitcoin Cycle", desc: "SPX6900 tracing Bitcoin's last cycle." },
      { post: "cycleclock", title: "Cycle Clock", desc: "Where we sit on the aligned BTC clock." },
      { tab: "relative", post: "majors", title: "vs Majors", desc: "SPX6900 measured against BTC, ETH, SOL." },
      { post: "spxvssp", title: "SPX vs S&P 500", desc: "The growth-multiple race since launch." },
      { post: "sp500", title: "If SPX = S&P 500", desc: "Price at the entire S&P 500's market cap." },
      { post: "sp500ytd", title: "vs S&P, This Year", desc: "SPX6900 against the S&P 500, year to date." },
      { post: "ytd", title: "Majors, This Year", desc: "SPX6900 versus the majors, year to date." },
    ],
  },
];

function Thumb({ post }) {
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState(false);
  return (
    <div style={{
      position: "relative", width: "100%", aspectRatio: "1200 / 630",
      background: "rgba(255,255,255,0.03)", overflow: "hidden",
    }}>
      {!loaded && !err && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: MONO, fontSize: 12, color: "#475569",
        }}>loading…</div>
      )}
      {err ? (
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: MONO, fontSize: 12, color: "#475569",
        }}>preview unavailable</div>
      ) : (
        <img
          src={thumbUrl(post)} alt="" loading="lazy" decoding="async"
          onLoad={() => setLoaded(true)} onError={() => setErr(true)}
          style={{
            display: "block", width: "100%", height: "100%", objectFit: "cover",
            opacity: loaded ? 1 : 0, transition: "opacity .35s ease",
          }}
        />
      )}
    </div>
  );
}

function Tile({ item, color, onOpen, onZoom }) {
  const interactive = !!item.tab;
  const click = () => interactive ? onOpen(item.tab) : onZoom(item);
  return (
    <button
      className="pill" onClick={click}
      title={interactive ? `Open the interactive ${item.title} chart` : `View ${item.title}`}
      style={{
        display: "flex", flexDirection: "column", textAlign: "left", padding: 0, cursor: "pointer",
        borderRadius: 14, overflow: "hidden", background: "rgba(13,15,28,0.55)",
        border: "1px solid rgba(255,255,255,0.10)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 8px 30px rgba(0,0,0,0.35)",
        "--glow": color,
      }}
    >
      <Thumb post={item.post} />
      <div style={{ padding: "13px 15px 15px", borderTop: `1px solid ${color}26` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0, boxShadow: `0 0 8px ${color}` }} />
          <span style={{ fontFamily: SANS, fontSize: 16, fontWeight: 700, color: "#f1f5f9", lineHeight: 1.15 }}>{item.title}</span>
          <span style={{
            marginLeft: "auto", fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
            textTransform: "uppercase", color: interactive ? color : "#64748b",
            border: `1px solid ${interactive ? color + "66" : "rgba(148,163,184,0.3)"}`,
            borderRadius: 5, padding: "2px 6px", whiteSpace: "nowrap",
          }}>{interactive ? "Interactive" : "Card"}</span>
        </div>
        <div style={{ fontFamily: SANS, fontSize: 13, color: "#94a3b8", lineHeight: 1.45 }}>{item.desc}</div>
      </div>
    </button>
  );
}

export default function ChartsGallery({ isMobile, onOpen }) {
  const [zoom, setZoom] = useState(null); // {post, title} of the lightboxed card

  const close = useCallback(() => setZoom(null), []);
  useEffect(() => {
    if (!zoom) return;
    const onKey = e => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom, close]);

  const total = CATS.reduce((n, c) => n + c.items.length, 0);

  return (
    <div style={{ padding: isMobile ? "16px 12px 48px" : "26px 20px 60px" }}>
      <div style={{ maxWidth: MAX_W, margin: "0 auto 26px", textAlign: "center" }}>
        <h2 style={{
          fontFamily: SANS, fontSize: isMobile ? 26 : 36, fontWeight: 800, margin: "0 0 8px",
          letterSpacing: "-0.02em",
          background: "linear-gradient(90deg,#a78bfa,#22d3ee,#4ade80,#fbbf24,#f7931a)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>Charts Gallery</h2>
        <div style={{ fontFamily: SANS, fontSize: isMobile ? 14 : 16, color: "#94a3b8" }}>
          {total} ways to look at SPX6900 — tap any chart to open it.
        </div>
      </div>

      {CATS.map(cat => (
        <div key={cat.title} style={{ maxWidth: MAX_W, margin: "0 auto 38px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: cat.color, boxShadow: `0 0 10px ${cat.color}` }} />
            <h3 style={{ fontFamily: SANS, fontSize: isMobile ? 18 : 22, fontWeight: 800, color: "#f1f5f9", margin: 0, letterSpacing: "-0.01em" }}>{cat.title}</h3>
            <span style={{ fontFamily: SANS, fontSize: isMobile ? 12.5 : 14, color: "#7c8a9e" }}>{cat.desc}</span>
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${isMobile ? 260 : 320}px), 1fr))`,
            gap: isMobile ? 12 : 16,
          }}>
            {cat.items.map(item => (
              <Tile key={item.post} item={item} color={cat.color} onOpen={onOpen} onZoom={setZoom} />
            ))}
          </div>
        </div>
      ))}

      {/* Lightbox for card-only charts */}
      {zoom && (
        <div
          onClick={close}
          style={{
            position: "fixed", inset: 0, zIndex: 100, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 16, padding: isMobile ? 16 : 32,
            background: "rgba(2,3,10,0.86)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontFamily: SANS, fontSize: isMobile ? 16 : 20, fontWeight: 700, color: "#f1f5f9" }}>{zoom.title}</span>
            <button onClick={close} aria-label="Close" style={{
              fontFamily: SANS, fontSize: 18, lineHeight: 1, color: "#cbd5e1", cursor: "pointer",
              background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: 8, width: 32, height: 32,
            }}>×</button>
          </div>
          <img
            src={fullUrl(zoom.post)} alt={zoom.title} onClick={e => e.stopPropagation()}
            style={{
              maxWidth: "min(96vw, 1100px)", maxHeight: "78vh", width: "auto", height: "auto",
              borderRadius: 12, border: "1px solid rgba(255,255,255,0.14)", boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
            }}
          />
          <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b" }}>Tap anywhere to close · this chart posts daily on X</div>
        </div>
      )}
    </div>
  );
}
