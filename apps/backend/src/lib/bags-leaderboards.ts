export type RankingSnapshot = {
  marketCap: number | null;
  priceChange24h: number | null;
};

export type RankingEntry = {
  latestSignal: number;
  latestSnapshot?: RankingSnapshot | null;
  trendScore: number;
};

const marketCapValue = (entry: RankingEntry) =>
  entry.latestSnapshot?.marketCap ?? -1;

const change24hValue = (entry: RankingEntry) =>
  entry.latestSnapshot?.priceChange24h ?? -Infinity;

export const rankMarketCapLeaderboard = <T extends RankingEntry>(
  entries: T[],
) =>
  [...entries].sort(
    (a, b) =>
      marketCapValue(b) - marketCapValue(a) ||
      change24hValue(b) - change24hValue(a) ||
      b.trendScore - a.trendScore,
  );

export const rankTrendingTokens = <T extends RankingEntry>(entries: T[]) =>
  [...entries].sort((a, b) => b.trendScore - a.trendScore);

export const rankTopGainers = <T extends RankingEntry>(entries: T[]) =>
  entries
    .filter((entry) => entry.latestSnapshot?.priceChange24h !== null)
    .filter((entry) => entry.latestSnapshot?.priceChange24h !== undefined)
    .sort(
      (a, b) =>
        change24hValue(b) - change24hValue(a) ||
        b.latestSignal - a.latestSignal,
    );
