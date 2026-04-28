import assert from "node:assert/strict";
import test from "node:test";

import { rankMarketCapLeaderboard, rankTopGainers } from "./bags-leaderboards";

const entry = (
  id: string,
  marketCap: number | null,
  priceChange24h: number | null,
  trendScore: number,
) => ({
  id,
  latestSignal: trendScore,
  latestSnapshot: {
    marketCap,
    priceChange24h,
  },
  trendScore,
});

test("market cap leaderboard ranks real market caps before null values", () => {
  const ranked = rankMarketCapLeaderboard([
    entry("no-market-cap", null, 500, 99),
    entry("small-cap", 100, 1, 1),
    entry("large-cap", 1000, -20, 1),
  ]);

  assert.deepEqual(
    ranked.map((item) => item.id),
    ["large-cap", "small-cap", "no-market-cap"],
  );
});

test("market cap leaderboard uses 24h change as the first tie breaker", () => {
  const ranked = rankMarketCapLeaderboard([
    entry("flat", 1000, 0, 100),
    entry("winner", 1000, 25, 1),
  ]);

  assert.deepEqual(
    ranked.map((item) => item.id),
    ["winner", "flat"],
  );
});

test("top gainers only includes rows with real 24h change", () => {
  const ranked = rankTopGainers([
    entry("missing-change", 1000, null, 100),
    entry("positive", 100, 12, 1),
    entry("negative", 200, -3, 99),
  ]);

  assert.deepEqual(
    ranked.map((item) => item.id),
    ["positive", "negative"],
  );
});
