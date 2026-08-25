// DEEP FIELD DRIP — which walled members charts are RELEASED vs still "under construction".
// The owner flips each from the control panel (writes public/deepfield-releases.json); the change
// ships on the next deploy. An UNRELEASED chart shows "Under construction" to EVERYONE (members
// included); a RELEASED one becomes members-only (login/register). Release them one at a time.
// SPX City is PUBLIC (the flagship showpiece + its per-building Zerion cards stay open to everyone).
// The walled members set is the granular ANALYTICAL charts only.
export const DRIP_CHARTS = ["entities", "clustercity", "whaleentry", "whaleswatching", "smartmoney", "urpdterrain"];
export const isDripChart = id => DRIP_CHARTS.includes(id);
let _p;
export function loadReleases() {
  if (!_p) _p = fetch("/deepfield-releases.json", { cache: "no-store" })
    .then(r => (r.ok ? r.json() : null))
    .then(d => new Set(Array.isArray(d?.released) ? d.released : []))
    .catch(() => new Set());
  return _p;
}
