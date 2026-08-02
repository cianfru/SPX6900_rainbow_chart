import { useState, useMemo, useCallback, useEffect, useRef, lazy, Suspense } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis,
  CartesianGrid, ReferenceLine
} from "recharts";
import { DEFAULT_RAW, fetchLivePrices, fetchSpotPrice, fetchMajors, fetchMemekings } from "./data.js";
import { SPX_DAILY } from "./spx-daily.js";
import { loadHistory, loadPriceHistory } from "./history-data.js";

// Dense DRAWN base: the thinned weekly model bundle + the full DAILY history (launch→now)
// so the price line is never boxy. The MODEL FIT still runs on DEFAULT_RAW only (frozen).
const DENSE_BASE = (() => {
  const m = new Map(DEFAULT_RAW.map(r => [r.date, r.price]));
  for (const [d, p] of SPX_DAILY) if (p > 0) m.set(d, p);
  return [...m].map(([date, price]) => ({ date, price })).sort((a, b) => a.date.localeCompare(b.date));
})();
import {
  buildModel, BAND_LABELS, TARGETS,
  dayN, ds, bandVal, bandIndex,
  whenHitsCenter, whenHitsBand,
} from "./models.js";
import { CRYPTO_MILESTONES } from "./milestones.js";
import { CHART_META, CHART_IDS, AEON_GROUPS } from "./charts-catalog.js";

// Whale City and Aeon City became one page. Their old ids are no longer in the catalog, so they
// would fail the CHART_IDS check and dump the visitor on the gallery — these send them to the city
// instead, opened on the mode that id used to be.
const ALIAS = { whalewatch: "spxcity", aeonskyline: "spxcity" };
const resolveId = id => ALIAS[id] || id;
import ChartFreshness from "./ChartFreshness.jsx";
import BandStats from "./BandStats.jsx";
// Secondary tab charts are lazy-loaded so their code only ships when the tab is opened.
import ErrorBoundary from "./ErrorBoundary.jsx";
import BandHistory from "./BandHistory.jsx";
import { SANS, MONO, MAX_W } from "./chart-ui.jsx";
const HolderscanDashboard = lazy(() => import("./HolderscanDashboard.jsx"));
const RiskChart = lazy(() => import("./RiskChart.jsx"));
const DrawdownChart = lazy(() => import("./DrawdownChart.jsx"));
const RallyChart = lazy(() => import("./RallyChart.jsx"));
const SpxBtcChart = lazy(() => import("./SpxBtcChart.jsx"));
const BtcCycleChart = lazy(() => import("./BtcCycleChart.jsx"));
const RelativeChart = lazy(() => import("./RelativeChart.jsx"));
const SupplyConviction = lazy(() => import("./SupplyConviction.jsx"));
const ModelChart = lazy(() => import("./ModelChart.jsx"));
const ChannelChart = lazy(() => import("./ChannelChart.jsx"));
const SeasonalityGrid = lazy(() => import("./SeasonalityGrid.jsx"));
const RiskColorChart = lazy(() => import("./RiskColorChart.jsx"));
const RiskHeatChart = lazy(() => import("./RiskHeatChart.jsx"));
const RunningRoiChart = lazy(() => import("./RunningRoiChart.jsx"));
const RsiDotsChart = lazy(() => import("./RsiDotsChart.jsx"));
const RaceChart = lazy(() => import("./RaceChart.jsx"));
const HoldersPriceChart = lazy(() => import("./HoldersPriceChart.jsx"));
const RoadmapChart = lazy(() => import("./RoadmapChart.jsx"));
const OnchainValueChart = lazy(() => import("./OnchainValueChart.jsx"));
const SupplyInProfitChart = lazy(() => import("./SupplyInProfitChart.jsx"));
const HodlWavesChart = lazy(() => import("./HodlWavesChart.jsx"));
const WhalesChart = lazy(() => import("./OwnershipCharts.jsx").then(m => ({ default: m.WhalesChart })));
const SurvivorshipChart = lazy(() => import("./SurvivorshipChart.jsx"));
const SmartMoneyChart = lazy(() => import("./SmartMoneyChart.jsx"));
const WalletWavesChart = lazy(() => import("./OwnershipCharts.jsx").then(m => ({ default: m.WalletWavesChart })));
const WealthWavesChart = lazy(() => import("./OwnershipCharts.jsx").then(m => ({ default: m.WealthWavesChart })));
const HolderConcentrationChart = lazy(() => import("./HolderConcentrationChart.jsx"));
const AeonFloorChart = lazy(() => import("./AeonFloorChart.jsx"));
const AeonRarityChart = lazy(() => import("./AeonRarityChart.jsx"));
const AeonValueChart = lazy(() => import("./AeonValueChart.jsx"));
const AeonVsSpxChart = lazy(() => import("./AeonVsSpxChart.jsx"));
const AeonLeadLagChart = lazy(() => import("./AeonLeadLagChart.jsx"));
const AeonTradersChart = lazy(() => import("./AeonTradersChart.jsx"));
const AeonValuationChart = lazy(() => import("./AeonValuationChart.jsx"));
const AeonSalesRarityChart = lazy(() => import("./AeonSalesRarityChart.jsx"));
const AeonTraitsChart = lazy(() => import("./AeonTraitsChart.jsx"));
const AeonHodlChart = lazy(() => import("./AeonHodlChart.jsx"));
const AeonOwnersChart = lazy(() => import("./AeonOwnersChart.jsx"));
const AeonConcentrationChart = lazy(() => import("./AeonConcentrationChart.jsx"));
const AeonBehaviourChart = lazy(() => import("./AeonBehaviourChart.jsx"));
const UrpdChart = lazy(() => import("./UrpdChart.jsx"));
const UrpdAgeChart = lazy(() => import("./UrpdAgeChart.jsx"));
const LthSthChart = lazy(() => import("./LthSthChart.jsx"));
const SoprChart = lazy(() => import("./SoprChart.jsx"));
const NrplChart = lazy(() => import("./NrplChart.jsx"));
const LivelinessChart = lazy(() => import("./LivelinessChart.jsx"));
const SpxCity = lazy(() => import("./SpxCity.jsx"));
const CityLab = lazy(() => import("./CityLab.jsx"));
const CexSupplyChart = lazy(() => import("./CexSupplyChart.jsx"));
const CexFlowChart = lazy(() => import("./CexFlowChart.jsx"));
const CexVenuesChart = lazy(() => import("./CexVenuesChart.jsx"));
const CexVenFlowChart = lazy(() => import("./CexVenFlowChart.jsx"));
const WalletGrowthChart = lazy(() => import("./WalletGrowthChart.jsx"));
const MvrvContextChart = lazy(() => import("./MvrvContextChart.jsx"));
const PiCycleChart = lazy(() => import("./PiCycleChart.jsx"));
const LongShortChart = lazy(() => import("./LongShortChart.jsx"));
const AltMarketChart = lazy(() => import("./AltMarketChart.jsx"));
const ValuationComposite = lazy(() => import("./ValuationComposite.jsx"));
const FreeFloatChart = lazy(() => import("./FreeFloatChart.jsx"));
const NuplChart = lazy(() => import("./NuplChart.jsx"));
const QuantileFanChart = lazy(() => import("./QuantileFanChart.jsx"));
const ChartsGallery = lazy(() => import("./ChartsGallery.jsx"));
const MethodsPage = lazy(() => import("./MethodsPage.jsx"));
const DocsPage = lazy(() => import("./DocsPage.jsx"));
const LandingPage = lazy(() => import("./LandingPage.jsx")); // dark-committed landing (staging at ?view=next)

// Basket rosters for the performance-race charts (keys match the /api endpoints).
const MAJORS_META = [
  { key: "BTC", label: "Bitcoin", color: "#f7931a" },
  { key: "ETH", label: "Ethereum", color: "#8b9bff" },
  { key: "SOL", label: "Solana", color: "#14f195" },
];
const MEMEKINGS_META = [
  { key: "DOGE", label: "Dogecoin", color: "#c2a633" },
  { key: "SHIB", label: "Shiba Inu", color: "#f43f5e" },
  { key: "PEPE", label: "Pepe", color: "#4ade80" },
];

const LED = "'DSEG7 Classic', ui-monospace, monospace";

// Frosted-glass card style. Pass an rgb string + alpha to tint the fill.
const glass = (rgb = "255, 255, 255", alpha = 0.05, blur = 14) => ({
  background: `rgba(${rgb}, ${alpha})`,
  backdropFilter: `blur(${blur}px)`,
  WebkitBackdropFilter: `blur(${blur}px)`,
  border: "1px solid rgba(255, 255, 255, 0.12)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.10), 0 8px 30px rgba(0,0,0,0.35)",
});

// Rainbow aurora blobs that drift slowly behind the glass (matches the chart's bands).
const AURORA = [
  { c: "#6366f1", top: "-10%", left: "-8%",  size: "48vw", anim: "aurora-1 26s" },
  { c: "#3b82f6", top: "8%",   left: "60%",  size: "44vw", anim: "aurora-2 30s" },
  { c: "#06b6d4", top: "46%",  left: "-12%", size: "42vw", anim: "aurora-3 24s" },
  { c: "#22c55e", top: "62%",  left: "58%",  size: "46vw", anim: "aurora-1 29s" },
  { c: "#f59e0b", top: "36%",  left: "82%",  size: "34vw", anim: "aurora-2 33s" },
  { c: "#dc2626", top: "78%",  left: "18%",  size: "38vw", anim: "aurora-3 27s" },
];

// Track viewport width so we can size things responsively for phones/tablets.
function useViewport() {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1400);
  useEffect(() => {
    const onResize = () => setW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return w;
}

const fP = v => {
  if (v == null) return "";
  if (v >= 10000) return "$" + (v / 1000).toFixed(0) + "k";
  if (v >= 1000) return "$" + v.toFixed(0);
  if (v >= 1) return "$" + v.toFixed(2);
  if (v >= 0.01) return "$" + v.toFixed(3);
  if (v >= 0.001) return "$" + v.toFixed(4);
  return "$" + v.toExponential(1);
};

const fT = v => {
  if (v >= 1000) return "$" + (v / 1000).toFixed(0) + "k";
  if (v >= 1) return "$" + v.toFixed(0);
  if (v >= 0.01) return "$" + v.toFixed(2);
  return "$" + v.toFixed(3);
};

// Socials & donations
const X_URL = "https://x.com/SPX6900Rainbow";

const fD = s => new Date(s).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
const dateToTs = dateStr => new Date(dateStr).getTime();
const fW = w => w ? w.dt.toLocaleDateString("en-US", { month: "short", year: "numeric" }) : ">50 yr";


// Line icons (Lucide-style) for the chart tabs; inherit the pill's color via currentColor.
function TabIcon({ name }) {
  const p = { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", style: { flexShrink: 0 } };
  switch (name) {
    case "rainbow": return (<svg {...p}><path d="M3 16a9 9 0 0 1 18 0" /><path d="M6 16a6 6 0 0 1 12 0" /><path d="M9 16a3 3 0 0 1 6 0" /></svg>);
    case "channel": return (<svg {...p}><path d="M3 21 21 3" /><path d="M3 14 14 3" /><path d="M10 21 21 10" /></svg>);
    case "risk": return (<svg {...p}><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>);
    case "drawdown": return (<svg {...p}><polyline points="22 17 13.5 8.5 8.5 13.5 2 7" /><polyline points="16 17 22 17 22 11" /></svg>);
    case "monthly": return (<svg {...p}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M8 2v4" /><path d="M16 2v4" /><path d="M3 10h18" /><path d="M8 14h.01" /><path d="M12 14h.01" /><path d="M16 14h.01" /><path d="M8 18h.01" /><path d="M12 18h.01" /></svg>);
    case "rally": return (<svg {...p}><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></svg>);
    case "spxbtc": return (<svg {...p}><path d="M8 3 4 7l4 4" /><path d="M4 7h16" /><path d="M16 21l4-4-4-4" /><path d="M20 17H4" /></svg>);
    case "btccycle": return (<svg {...p}><path d="M3 17l5-6 4 3 5-7" /><path d="M17 7h4v4" /><path d="M3 21h18" strokeDasharray="2 3" /></svg>);
    case "relative": return (<svg {...p}><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" /><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" /><path d="M7 21h10" /><path d="M12 3v18" /><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" /></svg>);
    case "supply": return (<svg {...p}><path d="M6 3h12l4 6-10 13L2 9Z" /><path d="M11 3 8 9l4 13 4-13-3-6" /><path d="M2 9h20" /></svg>);
    case "holders": return (<svg {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>);
    case "model": return (<svg {...p}><path d="M3 3v18h18" /><circle cx="8" cy="15" r="1.4" /><circle cx="13" cy="10" r="1.4" /><circle cx="18" cy="6" r="1.4" /><path d="M3 17 21 5" strokeDasharray="3 3" /></svg>);
    case "riskcolor": return (<svg {...p}><path d="M3 17c3-1 4-9 7-9s4 6 7 4 3-7 4-8" /><circle cx="8" cy="8" r="1.2" /><circle cx="17" cy="12" r="1.2" /></svg>);
    case "riskheat": return (<svg {...p}><path d="M3 12h3l2-6 4 12 2.5-7 1.5 3H21" /></svg>);
    case "picycle": return (<svg {...p}><path d="M3 7c3 0 4 2 6 2s3-6 6-6" /><path d="M3 20c3 0 5-9 8-9s4 5 10 5" /><line x1="3" y1="13" x2="21" y2="13" strokeDasharray="3 2" strokeOpacity="0.7" /></svg>);
    case "rsidots": return (<svg {...p}><circle cx="5" cy="16" r="1.6" /><circle cx="10" cy="11" r="1.6" /><circle cx="15" cy="13" r="1.6" /><circle cx="20" cy="6" r="1.6" /><path d="M3 19 21 4" strokeDasharray="3 3" /></svg>);
    case "runningroi": return (<svg {...p}><path d="M3 12a9 9 0 1 0 9-9" /><path d="M3 4v4h4" /><path d="M12 8v4l3 2" /></svg>);
    case "vsmajors":
    case "vsmemekings": return (<svg {...p}><path d="M4 20V6" /><path d="M10 20V10" /><path d="M16 20V4" /><path d="M3 20h18" /><path d="M4 6l6 4 6-6" strokeDasharray="2 2" /></svg>);
    case "holdersprice": return (<svg {...p}><path d="M3 17l5-4 4 2 5-7 4 3" /><path d="M3 20l5-2 4 1 5-4 4 2" strokeDasharray="2 3" strokeOpacity="0.7" /></svg>);
    case "mvrv": return (<svg {...p}><path d="M3 15l5-3 4 1 5-6 4 2" /><path d="M3 18l5-1 4 0 5-3 4 1" strokeDasharray="2 3" strokeOpacity="0.7" /></svg>);
    case "supplyprofit": return (<svg {...p}><path d="M3 16c3 1 5-8 8-8s4 7 10 3" /><line x1="3" y1="12" x2="21" y2="12" strokeDasharray="3 2" strokeOpacity="0.7" /></svg>);
    case "hodlwaves": return (<svg {...p}><path d="M3 18h18" /><path d="M3 14h18" strokeOpacity="0.75" /><path d="M3 10h18" strokeOpacity="0.5" /><path d="M3 6h18" strokeOpacity="0.3" /></svg>);
    case "whales": return (<svg {...p}><path d="M3 15c4 3 8 3 12 0s5-4 6-1" /><path d="M9 15c0-4 3-7 7-7" strokeOpacity="0.6" /><circle cx="17" cy="7" r="1.2" /></svg>);
    case "survivorship": return (<svg {...p}><path d="M3 20V9l4-2 4 3 4-4 6 2v12" strokeLinejoin="round" /><line x1="3" y1="20" x2="21" y2="20" /></svg>);
    case "smartmoney": return (<svg {...p}><path d="M4 15l5-5 3 3 8-8" strokeLinejoin="round" strokeLinecap="round" /><path d="M16 5h4v4" strokeLinejoin="round" strokeLinecap="round" /><line x1="4" y1="20" x2="20" y2="20" /></svg>);
    case "walletwaves": return (<svg {...p}><path d="M3 19h18" /><path d="M3 15h13" strokeOpacity="0.8" /><path d="M3 11h9" strokeOpacity="0.6" /><path d="M3 7h5" strokeOpacity="0.4" /></svg>);
    case "wealthwaves": return (<svg {...p}><path d="M3 20h18" /><path d="M6 20v-4M11 20v-8M16 20v-12" /><circle cx="20" cy="5" r="1.4" /></svg>);
    case "aeontraders": return (<svg {...p}><path d="M4 20V8M10 20V4M16 20v-9M22 20H2" /></svg>);
    case "aeonvaluation": return (<svg {...p}><path d="M4 20V12M9 20V7M14 20V10M19 20V5" /><line x1="2" y1="20" x2="22" y2="20" strokeOpacity="0.4"/></svg>);
    case "aeonsalesrarity": return (<svg {...p}><circle cx="6" cy="16" r="1.5"/><circle cx="11" cy="11" r="1.5"/><circle cx="16" cy="13" r="1.5"/><circle cx="20" cy="7" r="1.5"/><path d="M3 18 21 6" strokeDasharray="3 3" strokeOpacity="0.7"/></svg>);
    case "aeontraits": return (<svg {...p}><path d="M4 7h10M4 12h14M4 17h7" /></svg>);
    case "aeonvsspx": return (<svg {...p}><path d="M3 14c3 0 4-6 7-6s4 8 4 8 3-9 7-9" /><line x1="3" y1="11" x2="21" y2="11" strokeDasharray="3 2" strokeOpacity="0.7" /></svg>);
    case "aeonleadlag": return (<svg {...p}><path d="M3 16c2 0 3-8 6-8s3 4 3 4" /><line x1="12" y1="4" x2="12" y2="20" strokeDasharray="3 2" strokeOpacity="0.7" /><path d="M12 12c2 0 3 1 3 1s2 0 3 0" /></svg>);
    case "aeonvalue": return (<svg {...p}><circle cx="6" cy="16" r="1.6" /><circle cx="10" cy="12" r="1.6" /><circle cx="15" cy="14" r="1.6" /><circle cx="19" cy="7" r="1.6" /><path d="M3 18 21 6" strokeDasharray="3 3" strokeOpacity="0.7" /></svg>);
    case "aeonrarity": return (<svg {...p}><polygon points="12 3 14.5 9 21 9.5 16 14 17.5 20.5 12 17 6.5 20.5 8 14 3 9.5 9.5 9" /></svg>);
    case "spxcity": return (<svg {...p}><rect x="4" y="10" width="3" height="10" /><rect x="9" y="5" width="3" height="15" /><rect x="14" y="12" width="3" height="8" /><rect x="19" y="8" width="2.5" height="12" strokeOpacity="0.7" /></svg>);
    case "aeonfloor": return (<svg {...p}><path d="M3 15l4-5 4 3 6-8" /><path d="M3 20h18" strokeOpacity="0.4" /><rect x="4" y="17" width="2" height="3" strokeOpacity="0.5" /><rect x="11" y="16" width="2" height="4" strokeOpacity="0.5" /><rect x="18" y="18" width="2" height="2" strokeOpacity="0.5" /></svg>);
    case "aeonhodl": return (<svg {...p}><path d="M3 18h18" /><path d="M3 13h18" strokeOpacity="0.7" /><path d="M3 8h18" strokeOpacity="0.4" /></svg>);
    case "aeonowners": return (<svg {...p}><circle cx="9" cy="7" r="3" /><circle cx="17" cy="9" r="2.4" /><path d="M3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1" /><path d="M15 20v-1a4 4 0 0 1 4-4h0a3 3 0 0 1 3 3v2" strokeOpacity="0.6" /></svg>);
    case "aeonconcentration": return (<svg {...p}><path d="M3 8c4 0 6-3 9-3s5 3 9 3" /><path d="M3 18c4 0 6-2 9-2s5 2 9 2" strokeOpacity="0.7" /></svg>);
    case "aeonbehaviour": return (<svg {...p}><line x1="3" y1="12" x2="21" y2="12" strokeOpacity="0.4" /><rect x="5" y="6" width="3" height="6" /><rect x="11" y="12" width="3" height="5" /><rect x="17" y="7" width="3" height="5" /></svg>);
    case "concentration": return (<svg {...p}><path d="M3 8c4 0 6-3 9-3s5 3 9 3" /><path d="M3 18c4 0 6-2 9-2s5 2 9 2" strokeOpacity="0.7" /></svg>);
    case "urpd": return (<svg {...p}><path d="M4 20V14M7 20V10M10 20V6M13 20V11M16 20V8M19 20V13" /><line x1="11.5" y1="4" x2="11.5" y2="21" strokeDasharray="2 2" strokeOpacity="0.8" /></svg>);
    case "urpdage": return (<svg {...p}><rect x="3" y="4" width="18" height="16" rx="1" /><path d="M9 4v16M15 4v16M3 9.3h18M3 14.6h18" strokeOpacity="0.7" /></svg>);
    case "lthsth": return (<svg {...p}><path d="M3 20h18" /><path d="M3 20V13c4 0 5-4 9-4s5 3 9 3v8z" strokeOpacity="0.55" /><path d="M3 20v-3c4 0 5-2 9-2s5 1 9 1v4z" /></svg>);
    case "sopr": return (<svg {...p}><path d="M3 14c2 0 3-6 5-6s2 8 4 8 3-9 5-9 2 5 4 5" /><line x1="3" y1="11" x2="21" y2="11" strokeDasharray="3 2" strokeOpacity="0.7" /></svg>);
    case "nrpl": return (<svg {...p}><line x1="3" y1="12" x2="21" y2="12" /><rect x="5" y="6" width="3" height="6" /><rect x="10" y="12" width="3" height="5" /><rect x="15" y="8" width="3" height="4" /></svg>);
    case "liveliness": return (<svg {...p}><path d="M3 12h3l2-5 3 10 2-7 2 4h5" /></svg>);
    case "cexsupply": return (<svg {...p}><path d="M3 20V15c4 0 5-2 9-2s5 1 9 1v6z" strokeOpacity="0.55" /><path d="M3 20v-3c4 0 5-6 9-6s5 4 9 4v5z" /><path d="M3 20h18" /></svg>);
    case "cexflow": return (<svg {...p}><line x1="3" y1="12" x2="21" y2="12" strokeDasharray="3 2" strokeOpacity="0.7" /><path d="M5 9v-3M5 6l-2 2M5 6l2 2" /><path d="M12 15v3M12 18l-2-2M12 18l2-2" /><path d="M19 9v-3M19 6l-2 2M19 6l2 2" /></svg>);
    case "cexvenues": return (<svg {...p}><path d="M3 20v-4c4 0 5-1 9-1s5 1 9 1v4z" strokeOpacity="0.5" /><path d="M3 20v-7c4 0 5-2 9-2s5 1 9 1v8z" strokeOpacity="0.8" /><path d="M3 20v-10c4 0 5 1 9 1s5-2 9-2v11z" /></svg>);
    case "cexvenflow": return (<svg {...p}><line x1="12" y1="3" x2="12" y2="21" strokeOpacity="0.5" /><rect x="12" y="4" width="7" height="3" rx="1" /><rect x="12" y="10" width="4" height="3" rx="1" /><rect x="6" y="16" width="6" height="3" rx="1" /></svg>);
    case "walletgrowth": return (<svg {...p}><path d="M3 20v-3c4 0 5-6 9-6s5 4 9 4v5z" /><path d="M3 20h18" /></svg>);
    case "mvrvbtc": return (<svg {...p}><path d="M3 16c3 1 4-8 7-8s3 7 6 5 3-6 5-7" /><line x1="3" y1="11" x2="21" y2="11" strokeDasharray="3 2" strokeOpacity="0.8" /></svg>);
    case "altmarket": return (<svg {...p}><line x1="3" y1="12" x2="21" y2="12" /><path d="M3 12c2 0 3-6 5-6s2 10 4 10 3-8 5-8 2 4 4 4" /></svg>);
    case "valuation": return (<svg {...p}><path d="M3 16c2 0 3-9 5-9s2 7 4 7 3-11 5-11 2 6 4 6" /><line x1="3" y1="12" x2="21" y2="12" strokeDasharray="3 2" strokeOpacity="0.5" /></svg>);
    case "freefloat": return (<svg {...p}><path d="M3 6c4 0 6 4 9 6s5 5 9 6" /><path d="M3 20h18" strokeOpacity="0.4" /></svg>);
    case "nupl": return (<svg {...p}><path d="M3 8c3 0 4-3 6-3s3 6 5 6 3-5 7-5" /><line x1="3" y1="14" x2="21" y2="14" strokeDasharray="3 2" strokeOpacity="0.6" /><path d="M3 20c3 0 4-2 6-2s3 3 5 3 3-2 7-2" strokeOpacity="0.5" /></svg>);
    case "longshort": return (<svg {...p}><line x1="3" y1="12" x2="21" y2="12" strokeDasharray="2 3" /><rect x="5" y="6" width="3" height="6" /><rect x="11" y="12" width="3" height="5" /><rect x="17" y="8" width="3" height="4" /></svg>);
    case "quantilefan": return (<svg {...p}><path d="M3 20 Q9 6 21 4" /><path d="M3 20 Q9 11 21 9" strokeOpacity="0.7" /><path d="M3 20 Q9 15 21 14" strokeOpacity="0.5" /></svg>);
    case "roadmap": return (<svg {...p}><path d="M3 20 21 4" strokeDasharray="4 3" /><circle cx="9" cy="13.5" r="1.4" /><circle cx="15" cy="8.5" r="1.4" /><circle cx="20" cy="4.5" r="1.4" /></svg>);
    default: return null;
  }
}

// The interactive-chart roster + deep-link ids live in charts-catalog.js now
// (CHART_META / CHART_IDS). The site is: Rainbow hero (home) → "Charts" gallery →
// a dedicated interactive page per chart.
const REL_IDS = new Set(["BTC", "ETH", "SOL", "BASKET"]);

export default function App() {
  // `priceData` is bundled history + any new live points beyond the last bundled date.
  // The MODEL FIT is always computed from DEFAULT_RAW (bundled) only, so the
  // rainbow shape is stable and never changes when fresh data arrives.
  const vw = useViewport();
  const isMobile = vw < 640;
  const isTablet = vw < 980;

  const [priceData, setPriceData] = useState(DENSE_BASE);
  const [, setDataStatus] = useState(null);
  const [tickFlash, setTickFlash] = useState({ key: 0, dir: null }); // up/down flash on price move
  const prevPriceRef = useRef(null); // last live spot price, for tick direction
  const [hi, setHi] = useState(1); // default 10Y
  const [tg, setTg] = useState(new Set([0, 1, 2, 4])); // includes $6,900 by default
  const [showMilestones, setShowMilestones] = useState(true);
  const [showAbout, setShowAbout] = useState(false);
  const [tab, setTab] = useState("risk");
  // route: "home" = the Rainbow hero (landing) · "gallery" = the Charts grid ·
  // "chart" = a dedicated interactive chart page (which one = `tab`).
  const [route, setRoute] = useState("home");
  const [docSlug, setDocSlug] = useState("index"); // which page of the manual (?view=docs&p=…)
  const [copied, setCopied] = useState(false);  // "Share" → link copied confirmation
  const [relWhich, setRelWhich] = useState("BTC"); // Relative chart asset (its own in-chart selector)
  const navRef = useRef(null);
  const chartBoxRef = useRef(null);   // wrapper div, for measuring the plot area
  // Crosshair elements updated imperatively (no React re-render while moving).
  const vLineRef = useRef(null);
  const hLineRef = useRef(null);
  const dotRef = useRef(null);
  const boxRef = useRef(null);
  const dateRef = useRef(null);
  const priceRef = useRef(null);
  const bandRef = useRef(null);
  const HZ = [
    { l: "5Y", y: 5 },
    { l: "10Y", y: 10 },
    { l: "20Y", y: 20 },
    { l: "30Y", y: 30 },
    { l: "Auto", y: null }, // auto-fit to highest selected target
  ];

  // Build the DRAWN price series at DAILY precision. The bundled history is thinned
  // to ~weekly in its early stretch (curated for the model fit), which makes lines
  // boxy; the /api/prices daily candles (full history) fill those gaps so the shape
  // is precise. Precedence: daily candles are the base, curated bundled closes are
  // kept where present (so existing anchor points don't move), and the daily
  // snapshot wins on recent dates. The MODEL stays frozen on DEFAULT_RAW — this only
  // densifies what's drawn. If the candle fetch fails we fall back to bundle+snapshot.
  const applyLive = useCallback((priceHist, candles, snapshot) => {
    // Build the drawn series, later sources overriding earlier (increasing authority):
    const byDate = new Map();
    for (const r of DEFAULT_RAW) byDate.set(r.date, r.price);                            // thinned bundle — the always-present fallback
    for (const [d, p] of SPX_DAILY) if (p > 0) byDate.set(d, p);                         // full DAILY launch→now — kills the boxy early years
    for (const p of priceHist) if (p?.date && p.price > 0) byDate.set(p.date, p.price);  // dense daily history (CI-built) — the real precision fix
    for (const p of candles) if (p?.date && p.price > 0) byDate.set(p.date, p.price);    // live daily candles (recent, fresher)
    for (const r of snapshot) if (r?.d && r.p > 0) byDate.set(r.d, r.p);                 // on-chain snapshot — authoritative recent
    const merged = [...byDate].map(([date, price]) => ({ date, price })).sort((a, b) => a.date.localeCompare(b.date));
    setPriceData(merged);
    const added = merged.length - DEFAULT_RAW.length;
    setDataStatus(added > 0 ? `Live · daily +${added} pts` : "Up to date · bundled covers latest");
  }, []);

  // Sources feed the dense drawn series so it's precise AND never freezes if one is
  // stale: /price-history.json = the CI-built dense daily history (fixes the boxy
  // early years); /history.json = the daily on-chain snapshot (authoritative recent);
  // /api/prices = live daily candles (freshest, backfills). The MODEL stays frozen
  // on DEFAULT_RAW — this only densifies what's drawn.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadPriceHistory(),                                // never rejects → []
      loadHistory(),                                     // never rejects → []
      fetchLivePrices().then(r => r.prices, () => []),   // swallow error → []
    ]).then(([priceHist, snap, live]) => {
      if (cancelled) return;
      applyLive(Array.isArray(priceHist) ? priceHist : [], Array.isArray(live) ? live : [], Array.isArray(snap) ? snap : []);
    });
    return () => { cancelled = true; };
  }, [applyLive]);

  // Upsert the live spot price as "today"'s point so the headline LED, the NOW
  // band and the price line all reflect the latest on-chain price in place.
  const upsertSpot = useCallback((price) => {
    const today = new Date().toISOString().slice(0, 10);
    setPriceData(prev => {
      const lastPt = prev[prev.length - 1];
      if (lastPt.date === today) {
        if (lastPt.price === price) return prev; // no change
        const next = prev.slice();
        next[next.length - 1] = { date: today, price };
        return next;
      }
      if (today > lastPt.date) return [...prev, { date: today, price }];
      // Clock skew / pre-open edge case: just refresh the latest point's price.
      const next = prev.slice();
      next[next.length - 1] = { ...lastPt, price };
      return next;
    });
  }, []);

  // Poll the live spot price so it refreshes without a full page reload. This is
  // ~99% of our Vercel edge traffic, so it's kept lean: a 60s interval (SPX6900
  // doesn't move enough in a minute to matter for a rainbow chart), and polling
  // PAUSES both while the tab is hidden AND after a few minutes with no
  // interaction — an open-but-abandoned tab was what burned most of the quota. It
  // resumes (with an immediate refresh) when the user switches back or interacts.
  useEffect(() => {
    let cancelled = false;
    let timer;
    const POLL_MS = 60_000;             // a rainbow chart doesn't need sub-minute ticks
    const IDLE_MS = 5 * 60_000;         // stop polling after 5 min with no interaction
    let lastActivity = Date.now();
    const awake = () => !document.hidden && Date.now() - lastActivity < IDLE_MS;
    const schedule = () => {
      clearTimeout(timer);
      if (!cancelled && awake()) timer = setTimeout(tick, POLL_MS);
    };
    const tick = async () => {
      try {
        const { price, source } = await fetchSpotPrice();
        if (!cancelled && price > 0) {
          // Flash green/red only when the price actually moves between ticks.
          const prev = prevPriceRef.current;
          if (prev != null && price !== prev) {
            setTickFlash(t => ({ key: t.key + 1, dir: price > prev ? "up" : "down" }));
          }
          prevPriceRef.current = price;
          upsertSpot(price);
          setDataStatus(`Live · ${source} spot`);
        }
      } catch { /* keep last known price; try again next tick */ }
      schedule();
    };
    // Wake on real activity (or tab focus): note the time and, if we'd gone idle,
    // refresh + resume the loop. Listeners are passive so they never block input.
    const wake = () => {
      const wasAsleep = !awake();
      lastActivity = Date.now();
      if (wasAsleep && !cancelled) { clearTimeout(timer); tick(); }
    };
    const onVisible = () => { if (document.visibilityState === "visible") wake(); else clearTimeout(timer); };
    const ACTIVITY = ["pointermove", "pointerdown", "keydown", "scroll", "touchstart"];
    if (!document.hidden) tick();
    document.addEventListener("visibilitychange", onVisible);
    ACTIVITY.forEach(e => window.addEventListener(e, wake, { passive: true }));
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      ACTIVITY.forEach(e => window.removeEventListener(e, wake));
    };
  }, [upsertSpot]);

  // Fit the model ON BUNDLED DATA ONLY. This is the stable historical record
  // we curated — daily live data shouldn't reshape the rainbow.
  const m = useMemo(() => buildModel(DEFAULT_RAW), []);

  // Auto-fit horizon: extend until the center band reaches the highest selected target.
  const endDay = useMemo(() => {
    const horizon = HZ[hi];
    if (horizon.y != null) return Math.round(horizon.y * 365.25);
    const selectedTargets = [...tg].map(i => TARGETS[i].price);
    if (selectedTargets.length === 0) return Math.round(10 * 365.25);
    const topTarget = Math.max(...selectedTargets);
    const hit = whenHitsCenter(m, topTarget);
    // Pad ~15% so the target line isn't hugging the right edge
    const fallback = 30 * 365.25;
    const day = hit ? hit.d * 1.15 : fallback;
    return Math.round(Math.min(day, fallback));
  }, [m, hi, tg, HZ]);
  const tt = useCallback(i => setTg(p => {
    const n = new Set(p);
    n.has(i) ? n.delete(i) : n.add(i);
    return n;
  }), []);

  const data = useMemo(() => {
    const firstDay = dayN(priceData[0].date);
    const leadStart = Math.max(1, firstDay - 60);
    const pts = [];
    const pushPoint = (d, dateStr, price) => {
      const e = { date: dateStr, ts: dateToTs(dateStr), price };
      for (let i = 0; i < 9; i++) {
        e[`b${i}`] = [bandVal(m, d, i), bandVal(m, d, i + 1)];
      }
      e.reg = Math.exp(m.predict(d));
      pts.push(e);
    };
    for (let d = leadStart; d < firstDay; d += 3) {
      pushPoint(d, ds(d), null);
    }
    priceData.forEach(d => {
      pushPoint(dayN(d.date), d.date, d.price);
    });
    const lastDay = dayN(priceData[priceData.length - 1].date);
    const years = endDay / 365.25;
    const step = years > 25 ? 30 : years > 15 ? 14 : 6;
    for (let d = lastDay + step; d <= endDay; d += step) {
      pushPoint(d, ds(d), null);
    }
    return pts;
  }, [m, endDay, priceData]);

  const last = priceData[priceData.length - 1];
  const ld = dayN(last.date);
  const bIdx = bandIndex(m, last.price, ld);
  const cb = BAND_LABELS[bIdx];
  // Distance from the live price to the next band boundary, upside and downside.
  // The upper boundary is the top of the current band; the lower is its floor.
  const upTarget = bandVal(m, ld, Math.min(bIdx + 1, m.bands.length - 1));
  const dnTarget = bandVal(m, ld, bIdx);
  const upBand = bIdx + 1 <= BAND_LABELS.length - 1 ? BAND_LABELS[bIdx + 1] : null;
  const dnBand = bIdx - 1 >= 0 ? BAND_LABELS[bIdx - 1] : null;
  const bandHops = [
    { dir: "up", arrow: "▲", pct: upTarget / last.price - 1, target: upTarget, band: upBand, fallback: "ceiling", c: upBand ? upBand.c : "#dc2626" },
    { dir: "down", arrow: "▼", pct: dnTarget / last.price - 1, target: dnTarget, band: dnBand, fallback: "floor", c: dnBand ? dnBand.c : "#6366f1" },
  ];
  const fPctAbs = x => { const v = Math.abs(x) * 100; return (v < 10 ? v.toFixed(1) : Math.round(v).toString()) + "%"; };
  // LED price: the lit value plus an "all segments on" ghost (8.8.8) behind it
  const priceNum = fP(last.price).replace(/^\$/, "");
  const priceGhost = priceNum.replace(/[0-9]/g, "8");

  // Compute yMin/yMax from the actual band values so bands never get clipped.
  // No artificial cap: at long horizons the top band legitimately grows large,
  // and capping it makes the rainbow appear flat-topped (visual distortion).
  const { yMin, yMax } = useMemo(() => {
    let minB = Infinity, maxB = 0;
    for (const d of data) {
      const lo = d.b0?.[0];
      const hi = d.b8?.[1];
      if (lo != null && lo > 0 && lo < minB) minB = lo;
      if (hi != null && hi > maxB) maxB = hi;
    }
    let yMaxCalc = maxB;
    tg.forEach(i => { if (TARGETS[i].price > yMaxCalc) yMaxCalc = TARGETS[i].price * 1.3; });
    if (showMilestones) CRYPTO_MILESTONES.forEach(ms => { if (ms.price > yMaxCalc) yMaxCalc = ms.price * 1.3; });
    return {
      yMin: minB * 0.6,
      yMax: yMaxCalc * 1.3,
    };
  }, [data, tg, showMilestones]);

  const logT = [0.00001, 0.0001, 0.001, 0.01, 0.1, 1, 10, 100, 1000, 10000, 100000].filter(v => v >= yMin * 0.5 && v <= yMax * 2);

  const { xDomain, xT } = useMemo(() => {
    if (data.length === 0) return { xDomain: ["auto", "auto"], xT: [] };
    const startTs = data[0].ts;
    const endTs = data[data.length - 1].ts;
    const years = (endTs - startTs) / (365.25 * 86400 * 1000);
    // Pick year-step that gives ~8-12 labels regardless of horizon
    const yearStep = years > 24 ? 4 : years > 12 ? 2 : 1;
    const monthMod = years > 6 ? 12 : 6;
    const ticks = [];
    const startYear = new Date(startTs).getFullYear();
    const endYear = new Date(endTs).getFullYear();
    for (let yr = startYear; yr <= endYear + 1; yr++) {
      if (yr % yearStep !== 0) continue;
      for (let mo = 0; mo < 12; mo += monthMod) {
        const ts = new Date(yr, mo, 1).getTime();
        if (ts >= startTs && ts <= endTs) ticks.push(ts);
      }
    }
    return { xDomain: [startTs, endTs], xT: ticks };
  }, [data]);

  const ms = useMemo(() => TARGETS.filter((_, i) => tg.has(i)).map(t => ({
    ...t,
    sell: whenHitsBand(m, t.price, 8),
    center: whenHitsCenter(m, t.price),
    fire: whenHitsBand(m, t.price, 0),
  })), [m, tg]);

  // Free crosshair: map any cursor position in the plot to (date, price, band)
  // and update the overlay DOM directly — no setState, so it tracks instantly.
  const hideCursor = () => {
    [vLineRef, hLineRef, dotRef, boxRef].forEach(r => { if (r.current) r.current.style.display = "none"; });
  };
  const handleChartMove = (e) => {
    const box = chartBoxRef.current;
    if (!box) return;
    const bg = box.querySelector(".recharts-cartesian-grid-bg") || box.querySelector(".recharts-cartesian-grid");
    if (!bg) return;
    const cr = box.getBoundingClientRect();
    const gr = bg.getBoundingClientRect();
    const left = gr.left - cr.left, top = gr.top - cr.top, width = gr.width, height = gr.height;
    const x = e.clientX - cr.left, y = e.clientY - cr.top;
    if (width <= 0 || height <= 0 || x < left || x > left + width || y < top || y > top + height) {
      hideCursor();
      return;
    }
    const fx = (x - left) / width;
    const ts = xDomain[0] + fx * (xDomain[1] - xDomain[0]);
    const fy = (y - top) / height;
    const price = Math.exp(Math.log(yMax) - fy * (Math.log(yMax) - Math.log(yMin)));
    const bl = BAND_LABELS[bandIndex(m, price, dayN(new Date(ts)))];

    const v = vLineRef.current, h = hLineRef.current, d = dotRef.current, b = boxRef.current;
    if (!v || !h || !d || !b) return;
    v.style.display = "block"; v.style.left = x + "px"; v.style.top = top + "px"; v.style.height = height + "px";
    h.style.display = "block"; h.style.left = left + "px"; h.style.top = y + "px"; h.style.width = width + "px";
    d.style.display = "block"; d.style.left = (x - 4) + "px"; d.style.top = (y - 4) + "px";
    d.style.background = bl.c; d.style.boxShadow = `0 0 8px ${bl.c}`;
    b.style.display = "block";
    b.style.left = (x > left + width * 0.62 ? x - 186 : x + 14) + "px";
    b.style.top = Math.min(Math.max(y - 30, top), top + height - 96) + "px";
    b.style.borderColor = bl.c + "80";
    dateRef.current.textContent = new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    priceRef.current.textContent = fP(price);
    bandRef.current.textContent = "● " + bl.l;
    bandRef.current.style.color = bl.c;
  };

  // Reflect the current route in the URL so everything is shareable and browser
  // back/forward works: home = clean, gallery = ?view=charts, a chart = ?chart=<id>.
  const syncUrl = (r, id, rel) => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    params.delete("tab"); // legacy param — superseded by ?chart=
    params.delete("view"); params.delete("chart"); params.delete("rel"); params.delete("p");
    if (r === "gallery") params.set("view", "charts");
    else if (r === "aeon") params.set("view", "aeon");
    else if (r === "methods") params.set("view", "methods");
    // the manual carries its page in ?p= so any page in the book is directly linkable
    else if (r === "docs") { params.set("view", "docs"); if (id) params.set("p", id); }
    else if (r === "next") params.set("view", "next");
    else if (r === "chart" && id) {
      params.set("chart", id);
      if (id === "relative" && rel && rel !== "BTC") params.set("rel", rel);
    }
    const qs = params.toString();
    // SPX City gets a clean path of its own (/city); every other route lives at "/" with a query,
    // so leaving the city resets the pathname back to root rather than stranding ?view= on /city.
    const path = r === "city" ? "/city" : "/";
    const next = path + (qs ? "?" + qs : "") + window.location.hash;
    const cur = window.location.pathname + window.location.search + window.location.hash;
    if (next !== cur) window.history.pushState(null, "", next);
  };
  const goHome = () => { setRoute("home"); syncUrl("home"); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const openGallery = () => { setRoute("gallery"); syncUrl("gallery"); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const openAeon = () => { setRoute("aeon"); syncUrl("aeon"); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const openCity = () => { setRoute("city"); syncUrl("city"); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const openMethods = () => { setRoute("methods"); syncUrl("methods"); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const openDocs = (slug = "index") => { setDocSlug(slug); setRoute("docs"); syncUrl("docs", slug); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const goChart = (id, relOverride) => {
    if (id === "rainbow") { goHome(); return; }
    id = resolveId(id);
    if (!CHART_IDS.has(id)) { openGallery(); return; }
    setRoute("chart"); setTab(id);
    syncUrl("chart", id, id === "relative" ? (relOverride || relWhich) : null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Share the current chart. The /share?tab=… route serves per-chart Open Graph
  // meta (so the preview card matches) and bounces to the app. Use the native
  // share sheet on mobile, else copy the link with a "Copied!" confirmation.
  const shareChart = async () => {
    const q = tab === "relative" && relWhich !== "BTC" ? `?tab=relative&rel=${relWhich}` : `?tab=${tab}`;
    const url = `${window.location.origin}/share${q}`;
    const title = "SPX6900 — " + (CHART_META[tab]?.title ?? "Chart");
    if (navigator.share) { try { await navigator.share({ title, url }); return; } catch { /* cancelled */ } }
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* blocked */ }
  };

  // On load, honor a deep link; keep state synced with browser back/forward via
  // popstate. ?view=charts → gallery, ?chart=<id> (or legacy ?tab=<id>) → that
  // interactive chart, otherwise the Rainbow hero.
  useEffect(() => {
    const apply = () => {
      // SPX City is a path (/city), not a query — check it first.
      if (window.location.pathname === "/city") { setRoute("city"); return; }
      const p = new URLSearchParams(window.location.search);
      const rel = p.get("rel");
      if (rel && REL_IDS.has(rel)) setRelWhich(rel);
      const id = p.get("chart") || p.get("tab"); // ?tab= kept for old shared links
      if (p.get("view") === "charts") setRoute("gallery");
      else if (p.get("view") === "aeon") setRoute("aeon");
      else if (p.get("view") === "methods") setRoute("methods");
      else if (p.get("view") === "docs") { setRoute("docs"); setDocSlug(p.get("p") || "index"); }
      else if (p.get("view") === "next") setRoute("next");
      else if (id && CHART_IDS.has(resolveId(id))) { setRoute("chart"); setTab(resolveId(id)); }
      else setRoute("home");
    };
    apply();
    const onPop = () => apply();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Render the interactive component for a chart id — shared by the dedicated
  // chart page and the gallery's live mini-previews. `preview` => non-interactive
  // (no live relative-asset switching) and always the desktop layout.
  const chartEl = (id, { preview = false } = {}) => {
    const mob = preview ? false : isMobile;
    switch (id) {
      case "channel": return <ChannelChart series={priceData} m={m} isMobile={mob} />;
      case "roadmap": return <RoadmapChart series={priceData} m={m} isMobile={mob} preview={preview} />;
      case "risk": return <RiskChart series={priceData} m={m} isMobile={mob} />;
      case "riskcolor": return <RiskColorChart series={priceData} m={m} isMobile={mob} />;
      case "riskheat": return <RiskHeatChart series={priceData} isMobile={mob} />;
      case "picycle": return <PiCycleChart series={priceData} isMobile={mob} preview={preview} />;
      case "rsidots": return <RsiDotsChart series={priceData} isMobile={mob} />;
      case "runningroi": return <RunningRoiChart series={priceData} isMobile={mob} preview={preview} />;
      case "drawdown": return <DrawdownChart series={priceData} isMobile={mob} />;
      case "monthly": return <SeasonalityGrid series={priceData} isMobile={mob} />;
      case "rally": return <RallyChart series={priceData} m={m} isMobile={mob} />;
      case "spxbtc": return <SpxBtcChart series={priceData} isMobile={mob} />;
      case "btccycle": return <BtcCycleChart series={priceData} isMobile={mob} />;
      case "relative": return <RelativeChart series={priceData} isMobile={mob} which={relWhich} setWhich={preview ? () => {} : setRelWhich} />;
      case "vsmajors": return <RaceChart series={priceData} isMobile={mob} preview={preview} fetchCoins={fetchMajors} coins={MAJORS_META} basketLabel="majors" />;
      case "vsmemekings": return <RaceChart series={priceData} isMobile={mob} preview={preview} fetchCoins={fetchMemekings} coins={MEMEKINGS_META} basketLabel="memekings" />;
      case "supply": return <SupplyConviction price={last.price} isMobile={mob} />;
      case "holders": return <HolderscanDashboard />;
      case "holdersprice": return <HoldersPriceChart isMobile={mob} preview={preview} />;
      case "mvrv": return <OnchainValueChart isMobile={mob} preview={preview} />;
      case "supplyprofit": return <SupplyInProfitChart isMobile={mob} preview={preview} />;
      case "hodlwaves": return <HodlWavesChart isMobile={mob} preview={preview} />;
      case "whales": return <WhalesChart isMobile={mob} preview={preview} />;
      case "survivorship": return <SurvivorshipChart isMobile={mob} />;
      case "smartmoney": return <SmartMoneyChart isMobile={mob} />;
      case "walletwaves": return <WalletWavesChart isMobile={mob} preview={preview} />;
      case "wealthwaves": return <WealthWavesChart isMobile={mob} preview={preview} />;
      case "concentration": return <HolderConcentrationChart isMobile={mob} preview={preview} />;
      case "urpd": return <UrpdChart isMobile={mob} preview={preview} price={last?.price} />;
      case "urpdage": return <UrpdAgeChart isMobile={mob} preview={preview} price={last?.price} />;
      case "lthsth": return <LthSthChart isMobile={mob} preview={preview} />;
      case "sopr": return <SoprChart isMobile={mob} preview={preview} />;
      case "nrpl": return <NrplChart isMobile={mob} preview={preview} />;
      case "liveliness": return <LivelinessChart isMobile={mob} preview={preview} />;
      case "spxcity": return <SpxCity isMobile={mob} preview={preview} initialMode="spx" />;
      case "citylab": return <CityLab isMobile={mob} />;
      case "cexsupply": return <CexSupplyChart isMobile={mob} preview={preview} />;
      case "cexflow": return <CexFlowChart isMobile={mob} preview={preview} />;
      case "cexvenues": return <CexVenuesChart isMobile={mob} preview={preview} />;
      case "cexvenflow": return <CexVenFlowChart isMobile={mob} preview={preview} />;
      case "walletgrowth": return <WalletGrowthChart isMobile={mob} preview={preview} />;
      case "mvrvbtc": return <MvrvContextChart isMobile={mob} preview={preview} />;
      case "altmarket": return <AltMarketChart isMobile={mob} preview={preview} />;
      case "valuation": return <ValuationComposite isMobile={mob} preview={preview} />;
      case "freefloat": return <FreeFloatChart isMobile={mob} preview={preview} />;
      case "nupl": return <NuplChart isMobile={mob} preview={preview} />;
      case "longshort": return <LongShortChart series={priceData} isMobile={mob} />;
      case "quantilefan": return <QuantileFanChart series={priceData} isMobile={mob} preview={preview} />;
      case "model": return <ModelChart series={priceData} m={m} isMobile={mob} />;
      case "aeonfloor": return <AeonFloorChart isMobile={mob} />;

      case "aeonrarity": return <AeonRarityChart isMobile={mob} preview={preview} />;
      case "aeonvalue": return <AeonValueChart isMobile={mob} />;
      case "aeonvsspx": return <AeonVsSpxChart isMobile={mob} />;
      case "aeonleadlag": return <AeonLeadLagChart isMobile={mob} />;
      case "aeontraders": return <AeonTradersChart isMobile={mob} />;
      case "aeonvaluation": return <AeonValuationChart isMobile={mob} />;
      case "aeonsalesrarity": return <AeonSalesRarityChart isMobile={mob} />;
      case "aeontraits": return <AeonTraitsChart isMobile={mob} />;
      case "aeonhodl": return <AeonHodlChart isMobile={mob} />;
      case "aeonowners": return <AeonOwnersChart isMobile={mob} />;
      case "aeonconcentration": return <AeonConcentrationChart isMobile={mob} />;
      case "aeonbehaviour": return <AeonBehaviourChart isMobile={mob} />;
      default: return null;
    }
  };

  const navIcon = (rgb, glow, color = "#e2e8f0") => ({
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: 38, height: 38, borderRadius: 9, cursor: "pointer", textDecoration: "none",
    color, ...glass(rgb, 0.10), border: "1px solid transparent", boxShadow: "none", "--glow": glow,
  });
  // Minimal nav: Rainbow (home) · Charts (gallery) · X. The full chart library
  // lives inside the gallery now, not in a crowded top strip.
  const navPill = (active, c) => ({
    display: "inline-flex", alignItems: "center", gap: 7, whiteSpace: "nowrap", flexShrink: 0, cursor: "pointer",
    fontFamily: SANS, fontSize: isMobile ? 13.5 : 14, fontWeight: 700,
    padding: isMobile ? "8px 10px" : "8px 15px", borderRadius: 9, background: active ? `${c}1f` : "transparent",
    border: `1px solid ${active ? c + "cc" : "transparent"}`, boxShadow: active ? `0 0 14px ${c}55` : "none",
    color: active ? "#f8fafc" : "#94a3b8", "--glow": c,
  });
  const navActions = (
    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
      <a className="pill" href={X_URL} target="_blank" rel="noopener noreferrer" title="@SPX6900Rainbow" style={navIcon("255, 255, 255", "rgba(226,232,240,0.5)")}>
        <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
      </a>
    </div>
  );

  return (
    <div style={{
      position: "relative", isolation: "isolate",
      width: "100%", minHeight: "100vh",
      background: `radial-gradient(1100px 540px at 50% -8%, ${cb.c}24, transparent 60%), #020208`,
      transition: "background 0.6s ease",
      fontFamily: SANS, color: "#e2e8f0",
    }}>
      {/* Rainbow aurora mesh */}
      <div aria-hidden="true" style={{
        position: "fixed", inset: 0, zIndex: -2, overflow: "hidden", pointerEvents: "none",
      }}>
        {/* Fewer, lighter-blurred blobs on phones — 6 large blur(40px) layers are the
            main GPU cost of this backdrop and tank scroll perf on weaker devices. */}
        {(isMobile ? AURORA.slice(0, 3) : AURORA).map((b, i) => (
          <div key={i} style={{
            position: "absolute", top: b.top, left: b.left,
            width: b.size, height: b.size, borderRadius: "50%",
            background: `radial-gradient(circle, ${b.c} 0%, transparent 70%)`,
            opacity: 0.32, filter: isMobile ? "blur(28px)" : "blur(40px)", willChange: "transform",
            animation: `${b.anim} ease-in-out infinite`,
          }} />
        ))}
      </div>

      {/* Animated starfield backdrop */}
      <div aria-hidden="true" style={{
        position: "fixed", top: 0, left: 0, width: "100%", height: "calc(100% + 200px)",
        zIndex: -1, pointerEvents: "none",
        backgroundRepeat: "repeat", backgroundSize: "200px 200px",
        backgroundImage: [
          "radial-gradient(1px 1px at 24px 28px, rgba(255,255,255,0.28), transparent 100%)",
          "radial-gradient(1px 1px at 76px 96px, rgba(255,255,255,0.18), transparent 100%)",
          "radial-gradient(1.6px 1.6px at 142px 52px, rgba(196,181,253,0.22), transparent 100%)",
          "radial-gradient(1.2px 1.2px at 168px 150px, rgba(255,255,255,0.14), transparent 100%)",
        ].join(","),
        animation: "star-drift 26s linear infinite",
      }} />

      {/* Unified sticky nav — minimal */}
      <nav ref={navRef} style={{
        position: "sticky", top: 0, zIndex: 50, width: "100%",
        background: "rgba(6, 8, 18, 0.35)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
      }}>
        <div style={{
          maxWidth: MAX_W, margin: "0 auto", padding: isMobile ? "0 10px" : "0 18px",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <div style={{
            display: "flex", gap: isMobile ? 6 : 8, alignItems: "center",
            flex: 1, justifyContent: isMobile ? "flex-start" : "center", flexWrap: "nowrap",
            padding: "9px 2px", overflowX: "auto", scrollbarWidth: "none", WebkitOverflowScrolling: "touch",
          }}>
            <button className="pill" onClick={goHome} title="Rainbow chart (home)" style={navPill(route === "home", "#a78bfa")}>
              {!isMobile && <span style={{ color: "#a78bfa", display: "inline-flex" }}><TabIcon name="rainbow" /></span>}
              <span>Rainbow</span>
            </button>
            <button className="pill" onClick={openGallery} title="Browse all charts" style={navPill(route === "gallery" || (route === "chart" && CHART_META[tab]?.group !== "Project Aeon"), "#22d3ee")}>
              {!isMobile && (
<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: "#22d3ee" }}>
                <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
)}
              <span>Charts</span>
            </button>
            <button className="pill" onClick={openCity} title="SPX City — every holder a building (3D)" style={navPill(route === "city", "#7dd3fc")}>
              {!isMobile && <span style={{ color: "#7dd3fc", display: "inline-flex" }}><TabIcon name="spxcity" /></span>}
              <span>City</span>
            </button>
            <button className="pill" onClick={openAeon} title="Project Aeon — NFT analytics" style={navPill(route === "aeon", "#f472b6")}>
              {!isMobile && (
<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: "#f472b6" }}>
                <path d="M12 2 4 7v10l8 5 8-5V7z" /><path d="M12 22V12" /><path d="M4 7l8 5 8-5" />
              </svg>
)}
              <span>{isMobile ? "Aeon" : "Project Aeon"}</span>
            </button>
            {/* Methods is buried for now (still in dev — new charts landing). The page stays reachable
                at ?view=methods, it's just not a nav tab. */}
          </div>
          {navActions}
        </div>
      </nav>

      {/* Content */}
      <div style={{ padding: isMobile ? "16px 12px 40px" : "26px 20px 52px" }}>

      {/* Browse-all gallery */}
      {route === "gallery" && (
        <Suspense fallback={<div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading charts…</div>}>
          <ChartsGallery isMobile={isMobile} onOpen={goChart} onHome={goHome} onOther={openAeon} renderPreview={id => chartEl(id, { preview: true })} />
        </Suspense>
      )}

      {/* Project Aeon — its own tab: the NFT collection's on-chain charts, kept
          separate from the SPX charts gallery. */}
      {route === "aeon" && (
        <Suspense fallback={<div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading charts…</div>}>
          <ChartsGallery
            isMobile={isMobile} onOpen={goChart} onHome={goHome} onOther={openGallery} renderPreview={id => chartEl(id, { preview: true })}
            groups={AEON_GROUPS} showFeatured={false} title="Project Aeon"
            titleGradient="linear-gradient(90deg,#2dd4bf,#3b82f6,#a855f7,#f472b6)"
            subtitle="On-chain analytics for the Project AEON NFT collection — 3,333 on Ethereum. Every number checkable, reproducible."
          />
        </Suspense>
      )}


      {/* SPX City — its own top-level tab at /city (every holder a building). Rendered directly
          rather than through the charts gallery so it gets a clean path and first-class billing. */}
      {route === "city" && (
        <Suspense fallback={<div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading the city…</div>}>
          <SpxCity isMobile={isMobile} initialMode="spx" />
        </Suspense>
      )}

      {/* The manual — docs/*.md pre-rendered at build time, hosted here rather than linked out. */}
      {route === "docs" && (
        <Suspense fallback={<div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading…</div>}>
          <DocsPage isMobile={isMobile} slug={docSlug} onNavigate={openDocs} />
        </Suspense>
      )}

      {/* Methods — how every number on the site is computed. Static, reads the live model. */}
      {route === "methods" && (
        <Suspense fallback={<div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading…</div>}>
          <MethodsPage m={m} isMobile={isMobile} />
        </Suspense>
      )}

      {/* Landing redesign (dark-committed) — staged at ?view=next; swaps into home when ready. */}
      {route === "next" && (
        <Suspense fallback={<div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading…</div>}>
          <LandingPage isMobile={isMobile} priceData={priceData} />
        </Suspense>
      )}

      {/* Home — the Rainbow hero + its rainbow-specific sections */}
      {route === "home" && (<>
      {/* Header */}
      <div style={{ maxWidth: MAX_W, margin: "0 auto 24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: isMobile ? 10 : 18, flexWrap: "nowrap" }}>
          <img
            src="/spx6900.gif"
            alt="SPX6900"
            style={{
              height: isMobile ? 44 : 84, width: "auto", flexShrink: 0,
              filter: "invert(1)",
              mixBlendMode: "screen",
            }}
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
          <h1 style={{
            fontFamily: SANS, fontSize: isMobile ? 27 : isTablet ? 38 : 48, fontWeight: 800, margin: 0,
            letterSpacing: "-0.02em", lineHeight: 1.05, textAlign: "center",
            background: "linear-gradient(90deg,#6366f1,#3b82f6,#06b6d4,#22c55e,#84cc16,#f59e0b,#ea580c,#dc2626,#8b0000,#6366f1)",
            backgroundSize: "200% auto",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            animation: "title-shimmer 8s ease-in-out infinite alternate",
          }}>
            SPX6900 Rainbow Chart
          </h1>
          <img
            src="/spx6900.gif"
            alt=""
            aria-hidden="true"
            style={{
              height: isMobile ? 44 : 84, width: "auto", flexShrink: 0,
              filter: "invert(1)",
              mixBlendMode: "screen",
              transform: "scaleX(-1)",
            }}
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        </div>
        <div style={{ marginTop: 12, textAlign: "center" }}>
          <div style={{
            fontFamily: SANS, fontWeight: 600, fontSize: isMobile ? 15 : 20,
            color: "#cbd5e1", letterSpacing: 0.2, lineHeight: 1.35,
          }}>
            Logarithmic regression valuation bands for{" "}
            <span style={{ color: "#93c5fd", fontWeight: 700 }}>SPX6900</span>
          </div>
        </div>
      </div>

      {/* About (collapsible) */}
      <div style={{
        maxWidth: MAX_W, margin: "0 auto 20px",
        ...glass("99, 102, 241", 0.08),
        borderRadius: 10, overflow: "hidden",
      }}>
        <button onClick={() => setShowAbout(v => !v)} style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: isMobile ? "13px 16px" : "15px 22px", cursor: "pointer",
          background: "transparent", border: "none",
          fontFamily: SANS, fontSize: isMobile ? 15 : 17, fontWeight: 700, color: "#c4b5fd",
        }}>
          <span>About this chart</span>
          <span style={{ color: "#94a3b8", transition: "transform 0.2s", transform: showAbout ? "rotate(180deg)" : "none" }}>▾</span>
        </button>
        {showAbout && (
          <div style={{
            padding: isMobile ? "0 16px 16px" : "0 22px 20px",
            fontFamily: SANS, fontSize: isMobile ? 14 : 15, color: "#cbd5e1", lineHeight: 1.7,
          }}>
        <p style={{ marginBottom: 12 }}>
          The <strong style={{ color: "#f1f5f9" }}>SPX6900 Rainbow Chart</strong> is a fun, long-term way to
          visualize where the price of SPX6900 sits relative to its historical trend. It plots the price on a{" "}
          <strong style={{ color: "#f1f5f9" }}>logarithmic scale</strong> and overlays colored &ldquo;rainbow&rdquo;
          bands that range from undervalued (cooler blues/greens) to overvalued (hotter oranges/reds). It is{" "}
          <em>not</em> financial advice or a price prediction — just a lighthearted lens on the bigger picture.
        </p>
        <p style={{ marginBottom: 12 }}>
          It&apos;s directly inspired by the famous{" "}
          <a
            href="https://www.blockchaincenter.net/en/bitcoin-rainbow-chart/"
            target="_blank" rel="noopener noreferrer"
            style={{ color: "#c4b5fd", fontWeight: 600 }}
          >
            Bitcoin Rainbow Chart
          </a>. That chart was originally created in 2014 by Reddit user{" "}
          <strong style={{ color: "#f1f5f9" }}>azop</strong>, who posted log-scale charts with rainbow color bands
          in the /r/Bitcoin community to give people some perspective (and &ldquo;hopium&rdquo;) during the brutal
          post-MtGox bear market. In 2019, blockchaincenter.net turned it into an always-up-to-date live version,
          combining it with a logarithmic regression fit (originally{" "}
          <span style={{ fontFamily: MONO, color: "#c4b5fd" }}>y = 2.9065·ln(x) − 19.493</span> from
          Bitcointalk user <em>trolololo</em>) to give the rainbow its characteristic flattening &ldquo;bow&rdquo;
          shape. The Bitcoin Rainbow Chart was always meant as a meme and a look at history — never a serious model —
          and the same spirit applies here.
        </p>
        <div style={{ fontWeight: 700, color: "#c4b5fd", margin: "16px 0 8px", fontSize: 16 }}>How It Works</div>
        <p style={{ marginBottom: 12 }}>
          This chart fits a <strong style={{ color: "#f1f5f9" }}>weighted log-quadratic regression</strong> to
          SPX6900 price history. The model is{" "}
          <span style={{ fontFamily: MONO, color: "#c4b5fd" }}>ln(P) = a×(ln t)² + b×ln t + c</span>{" "}
          — the squared term captures the S-curve shape that early-stage memecoins follow.
        </p>
        <p style={{ marginBottom: 12 }}>
          The colored bands are <strong style={{ color: "#f1f5f9" }}>asymmetric percentile bands</strong> built
          from actual residuals (p2 to p98), so they widen during bubble phases naturally rather than assuming
          normal distribution.
        </p>
        <p style={{ fontSize: 13, color: "#94a3b8" }}>
          Data: bundled historical baseline (Aug 2023 launch onward) merged with live updates from{" "}
          <strong>GeckoTerminal</strong> (Uniswap pool), falling back to Coinbase/Bybit. Supply: ~939M.
        </p>
          </div>
        )}
      </div>

      {/* Current verdict banner */}
      <div className="verdict-breathe" style={{
        maxWidth: MAX_W, margin: "0 auto 20px", padding: isMobile ? "18px 18px" : "22px 30px",
        background: `linear-gradient(135deg, ${cb.c}26, ${cb.c}0a)`,
        backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
        border: `1.5px solid ${cb.c}66`,
        borderRadius: 14,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.12), 0 0 50px ${cb.c}24, 0 8px 30px rgba(0,0,0,0.35)`,
        overflow: "hidden",
        "--g1": `${cb.c}30`, "--g2": `${cb.c}80`,
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: isMobile ? 14 : 28, flexWrap: "wrap",
        }}>
          <img
            src="/spx6900logo.png"
            alt="SPX6900"
            style={{
              height: isMobile ? 54 : 84, width: "auto", flexShrink: 0,
              filter: `drop-shadow(0 0 16px ${cb.c}55)`,
            }}
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
          <div style={{
            display: "flex", alignItems: "baseline", justifyContent: "center",
            flexWrap: "wrap", gap: isMobile ? "0 10px" : "0 14px",
            textAlign: "center",
          }}>
            <span style={{ fontFamily: SANS, fontSize: isMobile ? 15 : 22, color: "#94a3b8" }}>is at</span>
            <span style={{ display: "inline-flex", alignItems: "baseline", gap: 5 }}>
              <span style={{
                fontFamily: MONO, fontSize: isMobile ? 16 : 22, fontWeight: 700, color: cb.c, opacity: 0.85,
              }}>
                $
              </span>
              <span style={{ position: "relative", display: "inline-block" }}>
                {/* dim "all segments on" backdrop */}
                <span aria-hidden="true" style={{
                  position: "absolute", left: 0, top: 0,
                  fontFamily: LED, fontSize: isMobile ? 24 : 34, letterSpacing: "0.04em",
                  color: cb.c, opacity: 0.16, pointerEvents: "none",
                }}>
                  {priceGhost}
                </span>
                {/* lit value — flashes green/red on each price move, then settles to band color */}
                <span
                  key={tickFlash.key}
                  style={{
                    position: "relative", display: "inline-block",
                    fontFamily: LED, fontSize: isMobile ? 24 : 34, letterSpacing: "0.04em",
                    color: cb.c, textShadow: `0 0 6px ${cb.c}, 0 0 18px ${cb.c}cc`,
                    ...(tickFlash.dir ? {
                      "--flash": tickFlash.dir === "up" ? "#22e07a" : "#ff5247",
                      animation: "price-tick 0.7s ease",
                    } : null),
                  }}
                >
                  {priceNum}
                </span>
              </span>
            </span>
            <span style={{ fontFamily: SANS, fontSize: isMobile ? 15 : 22, color: "#94a3b8" }}>and is a</span>
            <span className="chrome-text" style={{
              fontFamily: SANS, fontSize: isMobile ? 30 : 44, fontWeight: 800, lineHeight: 1.02,
              letterSpacing: "-0.02em", "--c1": cb.c,
            }}>
              {cb.l}
            </span>
          </div>
        </div>
        {/* How far to the next band — trading-HUD readout: down | up */}
        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: "center", justifyContent: "center", gap: isMobile ? 7 : 24, marginTop: isMobile ? 12 : 18 }}>
          {[bandHops[1], bandHops[0]].map(({ dir, arrow, pct, band, fallback, c }, i) => (
            <span key={dir} style={{ display: "inline-flex", alignItems: "center", gap: isMobile ? 7 : 9 }}>
              {i === 1 && !isMobile && <span aria-hidden style={{ width: 1, height: 26, marginRight: 15, background: `linear-gradient(to bottom, transparent, ${cb.c}99, transparent)` }} />}
              <span style={{ color: c, fontSize: isMobile ? 12 : 15, filter: `drop-shadow(0 0 6px ${c})`, transform: "translateY(-1px)" }}>{arrow}</span>
              <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: isMobile ? 17 : 22, color: "#f8fafc", textShadow: "0 0 12px rgba(255,255,255,0.22)" }}>
                {pct >= 0 ? "+" : "−"}{fPctAbs(pct)}
              </span>
              <span style={{ fontFamily: SANS, fontWeight: 800, letterSpacing: 1.6, fontSize: isMobile ? 11 : 13, textTransform: "uppercase", color: c, textShadow: `0 0 14px ${c}aa` }}>
                {band ? band.l : fallback}
              </span>
            </span>
          ))}
        </div>
      </div>

      <BandStats m={m} series={priceData} isMobile={isMobile} />

      {/* Rainbow chart — the hero, always visible */}
      {/* Controls */}
      <div style={{ maxWidth: MAX_W, margin: "0 auto 14px", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {HZ.map((h, i) => (
            <button key={i} onClick={() => setHi(i)}
              className={`neon-pill${i === hi ? " active" : ""}`}
              style={{
                fontFamily: SANS, fontSize: isMobile ? 13 : 14, fontWeight: 600, padding: isMobile ? "7px 12px" : "8px 16px", borderRadius: 7,
                color: i === hi ? "#f8fafc" : "#94a3b8", "--glow": "#3b82f6",
              }}>{h.l}</button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {TARGETS.map((t, i) => (
            <button key={i} onClick={() => tt(i)}
              className={`neon-pill${tg.has(i) ? " active" : ""}`}
              style={{
                fontFamily: SANS, fontSize: 13, fontWeight: 600, padding: "7px 12px", borderRadius: 6,
                color: tg.has(i) ? "#f8fafc" : "#94a3b8", "--glow": t.c,
              }}>
              <span style={{ fontFamily: MONO }}>{t.label}</span> <span style={{ opacity: 0.55, fontSize: 11 }}>{t.mc}</span>
            </button>
          ))}
        </div>

        <button onClick={() => setShowMilestones(!showMilestones)}
          className={`neon-pill${showMilestones ? " active" : ""}`}
          style={{
          fontFamily: SANS, fontSize: 13, fontWeight: 600, padding: "7px 12px", borderRadius: 6,
          color: showMilestones ? "#f8fafc" : "#94a3b8", "--glow": "#fb923c",
        }}>Crypto Milestones</button>
      </div>

      {/* Chart — framed in a glass panel with a band-tinted glow + corner brand
          watermark. The inner chartBoxRef stays unpadded so the imperatively
          positioned crosshair/tooltip math (handleChartMove) is unaffected. */}
      <div style={{
        maxWidth: MAX_W, margin: "0 auto", position: "relative", overflow: "hidden",
        borderRadius: 18,
        padding: isMobile ? "10px 6px 4px" : "16px 20px 8px",
        border: `1px solid ${cb.c}33`,
        background: `radial-gradient(130% 100% at 82% -10%, ${cb.c}26, transparent 55%), linear-gradient(180deg, rgba(13,15,28,0.55) 0%, rgba(4,5,12,0.30) 100%)`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.05), 0 18px 50px -20px ${cb.c}44`,
        backdropFilter: "blur(7px)", WebkitBackdropFilter: "blur(7px)",
        transition: "background 0.6s ease, border-color 0.6s ease, box-shadow 0.6s ease",
      }}>
        {/* Brand watermark — large, faint coin logo bleeding off the empty
            bottom-right corner (panel's overflow:hidden clips it to the edge). */}
        <img
          src="/spx6900logo.png" alt="" aria-hidden="true" draggable="false"
          style={{
            position: "absolute", bottom: isMobile ? 26 : 44, right: isMobile ? "-10%" : -64,
            width: isMobile ? "58%" : "42%", maxWidth: 440, opacity: 0.07, zIndex: 0,
            pointerEvents: "none", userSelect: "none",
          }}
        />
        <div
          ref={chartBoxRef}
          onMouseMove={handleChartMove}
          onMouseLeave={hideCursor}
          style={{ position: "relative", zIndex: 1 }}
        >
        <ResponsiveContainer width="100%" height={isMobile ? 440 : isTablet ? 580 : 720}>
          <ComposedChart data={data} margin={{ top: 10, right: isMobile ? 64 : 130, bottom: 24, left: isMobile ? 0 : 12 }}>
            <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.07)" vertical={false} fill="transparent" />
            <XAxis
              dataKey="ts"
              type="number"
              scale="time"
              domain={xDomain}
              ticks={xT}
              tickFormatter={ts => fD(new Date(ts).toISOString().slice(0, 10))}
              tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 13, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false}
              allowDataOverflow={false}
              interval="preserveStartEnd"
              minTickGap={isMobile ? 32 : 8}
            />
            <YAxis
              scale="log" domain={[yMin, yMax]} ticks={logT} tickFormatter={fT}
              tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 13, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 46 : 68}
              allowDataOverflow
            />

            {Array.from({ length: 9 }).map((_, i) => (
              <Area
                key={`b${i}`} dataKey={`b${i}`} fill={BAND_LABELS[i].c}
                fillOpacity={0.38} stroke="none" isAnimationActive={false} activeDot={false}
              />
            ))}

            {TARGETS.map((t, i) => tg.has(i) && t.price <= yMax ? (
              <ReferenceLine
                key={`tgt${i}`} y={t.price} stroke={t.c}
                strokeDasharray="5 3" strokeWidth={1.2} strokeOpacity={0.75}
                label={{
                  value: isMobile ? t.label : `${t.label}  ${t.mc}`, position: "right",
                  fill: t.c, fontSize: isMobile ? 10 : 12, fontFamily: MONO, fontWeight: 700,
                  offset: 6,
                }}
              />
            ) : null)}

            {showMilestones && CRYPTO_MILESTONES.map((ms, i) => ms.price <= yMax ? (
              <ReferenceLine
                key={`ms${i}`} y={ms.price} stroke={ms.c}
                strokeDasharray="2 4" strokeWidth={1.2} strokeOpacity={0.5}
                label={{
                  value: isMobile ? ms.label : `${ms.label} (${ms.mc})`, position: "insideTopLeft",
                  fill: ms.c, fontSize: isMobile ? 9 : 11, fontFamily: SANS, fontWeight: 600,
                  offset: 4,
                }}
              />
            ) : null)}

            <ReferenceLine
              x={dateToTs(last.date)} stroke="rgba(255,255,255,0.3)" strokeDasharray="2 3" strokeWidth={1.2}
              label={{ value: "NOW", position: "top", fill: "#e2e8f0", fontSize: 12, fontFamily: SANS, fontWeight: 700 }}
            />

            <Line
              dataKey="reg" stroke="rgba(255,255,255,0.35)" strokeWidth={1.2}
              strokeDasharray="3 5" dot={false} isAnimationActive={false} activeDot={false}
            />
            <Line
              type="monotone" dataKey="price" stroke="#ffffff" strokeWidth={2.2} dot={false}
              isAnimationActive={false} connectNulls={false}
              activeDot={{ r: 5, fill: "#fff", stroke: cb.c, strokeWidth: 2.5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>

        {/* Free crosshair overlay — positioned imperatively in handleChartMove */}
        <div ref={vLineRef} style={{ position: "absolute", display: "none", left: 0, top: 0, width: 1, background: "rgba(255,255,255,0.4)", pointerEvents: "none" }} />
        <div ref={hLineRef} style={{ position: "absolute", display: "none", left: 0, top: 0, height: 1, background: "rgba(255,255,255,0.4)", pointerEvents: "none" }} />
        <div ref={dotRef} style={{ position: "absolute", display: "none", left: 0, top: 0, width: 8, height: 8, borderRadius: "50%", pointerEvents: "none" }} />
        <div ref={boxRef} style={{
          position: "absolute", display: "none", left: 0, top: 0, width: 172, pointerEvents: "none",
          background: "rgba(4,4,12,0.97)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10,
          padding: "10px 13px", fontFamily: SANS, backdropFilter: "blur(8px)",
        }}>
          <div ref={dateRef} style={{ fontFamily: MONO, fontSize: 12, color: "#94a3b8", marginBottom: 4 }} />
          <div ref={priceRef} style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, color: "#f8fafc", lineHeight: 1.1 }} />
          <div ref={bandRef} style={{ fontSize: 13, fontWeight: 700, marginTop: 3 }} />
        </div>
        </div>
      </div>

      {/* Band legend */}
      <div style={{
        maxWidth: MAX_W, margin: "12px auto 0", display: "flex", justifyContent: "center",
        gap: "8px 22px", flexWrap: "wrap",
      }}>
        {[...BAND_LABELS].reverse().map((b, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 7,
            fontFamily: SANS, fontSize: 13, fontWeight: 500, color: "#cbd5e1",
          }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: b.c, opacity: 0.85 }} />
            {b.l}
          </div>
        ))}
      </div>

      {/* Milestones */}
      {ms.length > 0 && (
        <div style={{ maxWidth: MAX_W, margin: "32px auto 0" }}>
          <div style={{
            fontFamily: SANS, fontSize: 14, fontWeight: 700, color: "#cbd5e1", marginBottom: 12,
            letterSpacing: 1.2, textTransform: "uppercase",
          }}>
            Target Timeline
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${isMobile ? 150 : 200}px), 1fr))`,
            gap: 12,
          }}>
            {ms.map((t, i) => (
              <div key={i} style={{
                background: `${t.c}12`, border: `1px solid ${t.c}45`,
                backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.10), 0 8px 30px rgba(0,0,0,0.35)",
                borderRadius: 10, padding: "16px 18px",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                  <span style={{ fontSize: isMobile ? 22 : 26, fontWeight: 700, color: t.c, fontFamily: MONO }}>{t.label}</span>
                  <span style={{ fontSize: 13, color: "#94a3b8", fontFamily: MONO }}>{t.mc}</span>
                </div>
                <div style={{ fontSize: 14, color: "#cbd5e1", lineHeight: 2.1, fontFamily: SANS }}>
                  {[
                    ["▲", "#dc2626", "SELL", t.sell],
                    ["●", "#f59e0b", "Center", t.center],
                    ["▼", "#6366f1", "Fire", t.fire],
                  ].map(([icon, ic, lab, w], j) => (
                    <div key={j} style={{ display: "flex", justifyContent: "space-between" }}>
                      <span><span style={{ color: ic, marginRight: 6 }}>{icon}</span> {lab}</span>
                      <span style={{ color: "#f1f5f9", fontWeight: 600, fontFamily: MONO }}>{fW(w)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <BandHistory m={m} series={priceData} isMobile={isMobile} />

      {/* Model details footer */}
      <div style={{ maxWidth: MAX_W, margin: "24px auto 0", display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={{
          flex: "1 1 500px", padding: "16px 20px",
          ...glass("255, 255, 255", 0.04),
          borderRadius: 8, fontFamily: SANS, fontSize: 13, color: "#94a3b8", lineHeight: 1.7,
        }}>
          <span style={{ color: "#f1f5f9", fontWeight: 700 }}>{m.name}: </span>
          <span style={{ fontFamily: MONO }}>{m.formula}</span>
          <span style={{ fontFamily: MONO }}> · R²={m.r2.toFixed(4)} · σ={m.std.toFixed(4)}</span>
          <br /><span style={{ color: "#7c8a9e" }}>{m.note}</span>
        </div>
      </div>

      </>)}{/* end home */}

      {/* Dedicated interactive chart page */}
      {route === "chart" && (
      <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
        {/* page header: back · category · title · description · share */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          {(() => { const aeon = CHART_META[tab]?.group === "Project Aeon"; return (
          <button className="pill" onClick={aeon ? openAeon : openGallery} title={aeon ? "Back to Project Aeon" : "Back to all charts"} style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, cursor: "pointer",
            background: "transparent", border: "1px solid transparent", color: "#cbd5e1",
            fontFamily: SANS, fontSize: 13, fontWeight: 600, "--glow": "rgba(148,163,184,0.6)",
          }}>← {aeon ? "Project Aeon" : "All charts"}</button>
          ); })()}
          <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: CHART_META[tab]?.color }}>{CHART_META[tab]?.group}</span>
          <button className="pill" onClick={shareChart} title="Share this chart"
            style={{
              marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8,
              background: "transparent", border: `1px solid ${copied ? "rgba(74,222,128,0.5)" : "rgba(148,163,184,0.3)"}`,
              cursor: "pointer", color: copied ? "#4ade80" : "#94a3b8",
              fontFamily: SANS, fontSize: 13, fontWeight: 600, "--glow": "rgba(148,163,184,0.5)",
            }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
              <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" /><line x1="15.4" y1="6.5" x2="8.6" y2="10.5" />
            </svg>
            {copied ? "Copied!" : "Share"}
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 4 }}>
          <span style={{ color: CHART_META[tab]?.color, display: "inline-flex" }}><TabIcon name={tab} /></span>
          <h2 style={{ fontFamily: SANS, fontSize: isMobile ? 26 : 34, fontWeight: 800, margin: 0, color: "#f8fafc", letterSpacing: "-0.02em" }}>{CHART_META[tab]?.title}</h2>
        </div>
        <div style={{ fontFamily: SANS, fontSize: isMobile ? 14 : 16, color: "#94a3b8", marginBottom: 10 }}>{CHART_META[tab]?.desc}</div>
        <ChartFreshness chartId={tab} />
        <ErrorBoundary key={tab}>
        <Suspense fallback={<div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 40 }}>Loading chart…</div>}>
          {chartEl(tab)}
        </Suspense>
        </ErrorBoundary>
      </div>
      )}{/* end chart page */}

      {route !== "gallery" && route !== "aeon" && (
      <div style={{
        maxWidth: MAX_W, margin: "16px auto 0", fontFamily: SANS, fontSize: 12,
        color: "#7c8a9e", textAlign: "center", lineHeight: 1.6,
      }}>
        Single-cycle fit on a memecoin. Not financial advice. Supply ~939M.
      </div>
      )}
      </div>{/* end content */}

    </div>
  );
}
