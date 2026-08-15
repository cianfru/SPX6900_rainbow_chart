// ACCUMULATION vs DISTRIBUTION — who's net-buying and who's net-selling AEON on the market.
//
// The arcs on the city draw wallet-to-wallet flow; this ranks it. Net marketplace trades over a
// trailing window (7 or 30 days), per wallet: bought minus sold. Positive = accumulating, negative =
// distributing. NET, so "accumulating" is honest — a wallet that bought 5 and sold 3 is +2, not +5.
//
// ⭐ ONE SOURCE for the site tornado AND the card, so the two can never disagree. Everything comes
// from the same marketplace `trades` the arcs draw, joined to current `holders` only to FLAG the
// wallets that have fully exited (sold down to zero) — a real signal, kept but labelled, never hidden.
//
// Marketplace trades only: mints and free transfers aren't "buying", so they're deliberately out —
// this is who is paying to accumulate, or taking money to leave, which is the honest read.

// Subtract n days from a 'YYYY-MM-DD' string → 'YYYY-MM-DD'. UTC so it can't drift by a timezone.
function dayMinus(d, n) {
  return new Date(Date.parse(d + "T00:00:00Z") - n * 864e5).toISOString().slice(0, 10);
}

// trades  : [{ f, to, eth, usd, token, d:'YYYY-MM-DD' }]  (f = seller, to = buyer)
// holders : [{ a, n, ... }]   current AEON per wallet (used only to flag fully-exited sellers)
// opts    : { days=30, topN=10, includeExited=true, asOf=<'YYYY-MM-DD'|null> }
export function aeonFlow(trades, holders, { days = 30, topN = 10, includeExited = true, asOf = null } = {}) {
  const t = Array.isArray(trades) ? trades : [];
  const held = new Map((holders || []).map(h => [(h.a || "").toLowerCase(), h.n || 0]));

  // Window is measured from the LATEST trade in the file, not the wall clock — the sales file trails
  // real time by up to a day, so anchoring on its own last date keeps "last 7 days" honest.
  const dates = t.map(x => x.d).filter(Boolean).sort();
  const last = asOf || dates[dates.length - 1] || null;
  const cutoff = last ? dayMinus(last, days - 1) : null;   // inclusive window of `days` days
  const inWin = x => !cutoff || (x.d && x.d >= cutoff);

  const m = new Map();
  const row = a => { let e = m.get(a); if (!e) { e = { a, bought: 0, sold: 0, ethIn: 0, usdIn: 0, ethOut: 0, usdOut: 0, days: new Set() }; m.set(a, e); } return e; };
  for (const x of t) {
    if (!inWin(x)) continue;
    const b = row((x.to || "").toLowerCase()); b.bought++; b.ethIn += x.eth || 0; b.usdIn += x.usd || 0; if (x.d) b.days.add(x.d);
    const s = row((x.f || "").toLowerCase()); s.sold++; s.ethOut += x.eth || 0; s.usdOut += x.usd || 0; if (x.d) s.days.add(x.d);
  }

  const all = [...m.values()].map(e => {
    const cur = held.has(e.a) ? held.get(e.a) : null;   // null = not in the current holder set at all
    return { ...e, net: e.bought - e.sold, held: cur, exited: (cur === 0 || cur === null) && e.sold > 0, days: e.days.size };
  });

  const accum = all.filter(e => e.net > 0).sort((a, b) => b.net - a.net || b.bought - a.bought || b.usdIn - a.usdIn);
  let distrib = all.filter(e => e.net < 0);
  if (!includeExited) distrib = distrib.filter(e => !e.exited);
  distrib = distrib.sort((a, b) => a.net - b.net || b.sold - a.sold || b.usdOut - a.usdOut);

  return {
    accum: accum.slice(0, topN),
    distrib: distrib.slice(0, topN),
    window: days, asOf: last,
    totals: {
      buyers: accum.length, sellers: distrib.length,
      netAccum: accum.reduce((s, e) => s + e.net, 0), netDistrib: distrib.reduce((s, e) => s + e.net, 0),
      exited: all.filter(e => e.exited).length,
      trades: t.filter(inWin).length,
    },
  };
}
