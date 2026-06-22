// Approximate monthly closing prices for ETH and SOL, used ONLY by the
// "SPX6900 at <major>'s age" overlay cards. These are illustrative, monthly-
// granularity figures (the big moves are right; individual months are ±), since
// full early daily history isn't reachable from the bot's allowlisted sources.
// Drop in a precise CSV later if exact numbers are wanted. Output matches
// BTC_HISTORY: [ageDaysSinceLaunch, priceUSD].
const DAY = 86400000;
const build = (launch, monthly) => {
  const t0 = Date.parse(launch);
  return monthly
    .map(([ym, p]) => [Math.round((Date.parse(ym + "-15") - t0) / DAY), p])
    .filter(([a]) => a >= 0);
};

// Ethereum — launched ~2015-08-07 (first market ~$1–3, then the 2017 run-up).
export const ETH_HISTORY = build("2015-08-07", [
  ["2015-08", 1.2], ["2015-09", 0.9], ["2015-10", 0.5], ["2015-11", 0.93], ["2015-12", 0.95],
  ["2016-01", 2.5], ["2016-02", 4.5], ["2016-03", 11.7], ["2016-04", 8.2], ["2016-05", 14.2], ["2016-06", 13.0],
  ["2016-07", 12.0], ["2016-08", 11.0], ["2016-09", 12.8], ["2016-10", 11.4], ["2016-11", 9.5], ["2016-12", 8.2],
  ["2017-01", 10.7], ["2017-02", 15.5], ["2017-03", 49], ["2017-04", 50], ["2017-05", 230], ["2017-06", 280],
  ["2017-07", 200], ["2017-08", 386], ["2017-09", 303], ["2017-10", 305], ["2017-11", 432], ["2017-12", 756],
  ["2018-01", 1118], ["2018-02", 855], ["2018-03", 397], ["2018-04", 670], ["2018-05", 577],
]);

// Solana — launched ~2020-04-10 (~$0.8, the 2021 run to ~$220, then the FTX crash).
export const SOL_HISTORY = build("2020-04-10", [
  ["2020-04", 0.78], ["2020-05", 0.6], ["2020-06", 0.9], ["2020-07", 1.6], ["2020-08", 3.4], ["2020-09", 2.8],
  ["2020-10", 1.8], ["2020-11", 1.5], ["2020-12", 1.8],
  ["2021-01", 4.6], ["2021-02", 14], ["2021-03", 19.4], ["2021-04", 28], ["2021-05", 35], ["2021-06", 27],
  ["2021-07", 31], ["2021-08", 110], ["2021-09", 141], ["2021-10", 200], ["2021-11", 220], ["2021-12", 170],
  ["2022-01", 100], ["2022-02", 95], ["2022-03", 130], ["2022-04", 100], ["2022-05", 42], ["2022-06", 34],
  ["2022-07", 40], ["2022-08", 32], ["2022-09", 33], ["2022-10", 32], ["2022-11", 13], ["2022-12", 10],
  ["2023-01", 24],
]);
