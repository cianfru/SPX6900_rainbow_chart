// Bundle the BigQuery BTC realized-cap / MVRV reconstruction (bigquery/btc_realized_cap.sql) into
// public/btc-mvrv.json — the series the MVRV-vs-Bitcoin chart + card read.
//
// The reconstruction (our own, from the public UTXO set) reaches back to ~2010-07 (BTC age ~1.5y),
// earlier than the Coin Metrics series that currently seeds btc-mvrv.json (2011). Two modes:
//   • default (--merge): PREPEND only the reconstructed months BEFORE Coin Metrics' first date,
//     seam-rebased so the two align at the boundary, then keep Coin Metrics for everything after
//     (it's the trusted, widely-cross-checked series; we only fill the early gap it can't reach).
//   • --replace: use the reconstruction for the WHOLE series (fully reproducible, drops Coin Metrics).
//
// The 2010→2011 stretch is inherently noisy (pre-price coins carry realized value 0 — see the SQL
// header), so --merge is the safe default: it adds the honest early slice without disturbing the
// trusted middle. Usage:
//   node scripts/build-btc-realized-cap.mjs --csv=btc_realized_cap.csv [--replace] [--out=public/btc-mvrv.json]
import { readFileSync, writeFileSync, existsSync } from "node:fs";

// Parse the query's CSV → [{ date:"YYYY-MM-DD", mvrv:Number }] (ignores the other columns).
export function parseReconCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const head = lines[0].split(",").map(s => s.trim().toLowerCase());
  const di = head.indexOf("date"), mi = head.indexOf("mvrv");
  if (di < 0 || mi < 0) throw new Error("CSV must have `date` and `mvrv` columns");
  const out = [];
  for (const ln of lines.slice(1)) {
    const c = ln.split(",");
    const date = (c[di] || "").trim(), mvrv = parseFloat(c[mi]);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(mvrv) && mvrv > 0) out.push({ date, mvrv });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

// Merge the reconstruction with the existing Coin Metrics points ([[date, mvrv]], ascending).
// mode "merge" (default): prepend recon months strictly before CM's first date, rebased to line up
// at the seam (ratio of CM's first value to the recon value nearest that date). mode "replace":
// return the recon as points. Returns { points:[[date,mvrv]], added, mode, seamRatio }.
export function mergeReconstruction(recon, cmPoints, mode = "merge") {
  const reconPts = recon.map(r => [r.date, +r.mvrv]);
  if (mode === "replace" || !cmPoints?.length) return { points: reconPts, added: reconPts.length, mode: "replace", seamRatio: 1 };
  const cmFirst = cmPoints[0][0];
  const before = recon.filter(r => r.date < cmFirst);
  if (!before.length) return { points: cmPoints.map(p => [p[0], p[1]]), added: 0, mode, seamRatio: 1 };
  // seam rebase: align the prepended slice's LEVEL to Coin Metrics at the boundary so there's no jump.
  // Use the recon value on/nearest CM's first date (search recon at or after cmFirst; fall back to last-before).
  const atSeam = recon.find(r => r.date >= cmFirst) || recon[recon.length - 1];
  const seamRatio = atSeam && atSeam.mvrv > 0 ? cmPoints[0][1] / atSeam.mvrv : 1;
  const prepended = before.map(r => [r.date, +(r.mvrv * seamRatio).toFixed(4)]);
  return { points: [...prepended, ...cmPoints.map(p => [p[0], p[1]])], added: prepended.length, mode, seamRatio: +seamRatio.toFixed(4) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = k => process.argv.find(a => a.startsWith(k));
  const csv = arg("--csv=")?.slice(6);
  if (!csv) { console.error("usage: build-btc-realized-cap.mjs --csv=<file> [--replace] [--out=public/btc-mvrv.json]"); process.exit(1); }
  const out = arg("--out=")?.slice(6) || "public/btc-mvrv.json";
  const mode = process.argv.includes("--replace") ? "replace" : "merge";
  const recon = parseReconCsv(readFileSync(csv, "utf8"));
  const cur = existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : null;
  const cmPoints = Array.isArray(cur?.points) ? cur.points : (Array.isArray(cur) ? cur : []);
  const { points, added, seamRatio } = mergeReconstruction(recon, cmPoints, mode);
  const updated = points.length ? points[points.length - 1][0] : new Date().toISOString().slice(0, 10);
  writeFileSync(out, JSON.stringify({ updated, source: mode === "replace" ? "utxo-reconstruction" : "coinmetrics+utxo-early", points }));
  console.error(`btc realized-cap: ${recon.length} recon months · mode ${mode} · added ${added} early months (seam ×${seamRatio}) · ${points.length} total → ${out}`);
}
