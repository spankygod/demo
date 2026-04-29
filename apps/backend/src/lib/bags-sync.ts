import { Prisma, type PrismaClient } from "@prisma/client";

import { env } from "../config/env";
import { bagsClient } from "./bags-client";
import {
  getDexScreenerMarketData,
  type DexMarketData,
} from "./dexscreener-client";
import {
  buildLaunchViews,
  buildMarketStats,
  calculateQuotePrice,
  getMarketSignal,
  getNullableQuote,
  type BagsLaunchView,
} from "./bags-market";
import {
  rankMarketCapLeaderboard,
  rankTopGainers,
  rankTrendingTokens,
} from "./bags-leaderboards";
import { FmpNewsApiError, getLatestCryptoNews } from "./fmp-news-client";
import { getTokenSupply } from "./solana-rpc";

const toJson = (value: unknown) => value as Prisma.InputJsonValue;

const chunk = <T>(items: T[], size: number) => {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
};

const priceChangeWindows = [
  { key: "h1", ageMs: 60 * 60 * 1000 },
  { key: "h24", ageMs: 24 * 60 * 60 * 1000 },
] as const;
const fallbackQuoteLimit = 100;
const fmpNewsSource = "fmp_crypto_news";
const cachedLeaderboardSideListLimit = 100;

type PriceChangeWindow = (typeof priceChangeWindows)[number]["key"];
type HistoricalPriceReferences = Map<
  string,
  Partial<Record<PriceChangeWindow, number>>
>;
type SnapshotRow = Prisma.TokenMarketSnapshotCreateManyInput & {
  tokenMint: string;
  marketSignal: number | null;
  price: number | null;
  marketCap: number | null;
  volume24h: number | null;
  priceChange1h: number | null;
  priceChange24h: number | null;
};
type SyncLeaderboardEntry = {
  launch: BagsLaunchView;
  latestSignal: number;
  latestSnapshot: SnapshotRow;
  trendScore: number;
};

export type BagsSyncResult = {
  syncRunId: string;
  rowsRead: number;
  rowsWritten: number;
  stats: ReturnType<typeof buildMarketStats>;
  coverage: {
    durationMs: number;
    tokensScanned: number;
    dexScreenerHits: number;
    prices: number;
    marketCaps: number;
    images: number;
    skippedNoMarketData: number;
    derivedPriceChanges: number;
    priceChanges1h: number;
    priceChanges24h: number;
  };
};

const derivePriceChange = (
  currentPrice: number | null,
  referencePrice?: number,
) => {
  if (
    currentPrice === null ||
    referencePrice === undefined ||
    !Number.isFinite(currentPrice) ||
    !Number.isFinite(referencePrice) ||
    referencePrice <= 0
  ) {
    return null;
  }

  return Number(
    (((currentPrice - referencePrice) / referencePrice) * 100).toFixed(2),
  );
};

const getHistoricalPriceReferences = async (
  prisma: PrismaClient,
  tokenMints: string[],
  capturedAt: Date,
): Promise<HistoricalPriceReferences> => {
  const references: HistoricalPriceReferences = new Map();

  if (tokenMints.length === 0) {
    return references;
  }

  const referenceRows = await Promise.all(
    priceChangeWindows.map(async (window) => {
      const cutoff = new Date(capturedAt.getTime() - window.ageMs);
      const oldestReferenceAt = new Date(
        cutoff.getTime() - 6 * 60 * 60 * 1000,
      );

      return prisma.$queryRaw<
        Array<{
          tokenMint: string;
          price: number;
          windowKey: PriceChangeWindow;
        }>
      >(Prisma.sql`
        SELECT DISTINCT ON ("tokenMint")
          "tokenMint",
          "price",
          ${window.key}::text AS "windowKey"
        FROM "TokenMarketSnapshot"
        WHERE "tokenMint" IN (${Prisma.join(tokenMints)})
          AND "price" IS NOT NULL
          AND "capturedAt" >= ${oldestReferenceAt}
          AND "capturedAt" <= ${cutoff}
        ORDER BY "tokenMint", "capturedAt" DESC
      `);
    }),
  );

  for (const row of referenceRows.flat()) {
    const tokenReferences = references.get(row.tokenMint) ?? {};
    tokenReferences[row.windowKey] = row.price;
    references.set(row.tokenMint, tokenReferences);
  }

  return references;
};

const marketDataPriorityScore = (
  launch: BagsLaunchView,
  dexMarketData: DexMarketData | undefined,
  index: number,
) => {
  if (
    dexMarketData?.marketCap !== null &&
    dexMarketData?.marketCap !== undefined
  ) {
    return dexMarketData.marketCap;
  }

  if (
    dexMarketData?.liquidityUsd !== null &&
    dexMarketData?.liquidityUsd !== undefined
  ) {
    return dexMarketData.liquidityUsd;
  }

  if (
    dexMarketData?.volume24h !== null &&
    dexMarketData?.volume24h !== undefined
  ) {
    return dexMarketData.volume24h;
  }

  return getMarketSignal(launch, index);
};

const getFallbackQuoteTargets = (
  launches: BagsLaunchView[],
  dexResults: Map<string, DexMarketData>,
) =>
  launches
    .map((launch, index) => ({
      launch,
      priorityScore: marketDataPriorityScore(
        launch,
        dexResults.get(launch.tokenMint),
        index,
      ),
    }))
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, fallbackQuoteLimit)
    .map((item) => item.launch);

const getPoolStateScore = (launch: BagsLaunchView) => {
  if (launch.migrationStatus === "migrated") {
    return 14;
  }

  if (launch.migrationStatus === "dbc") {
    return 9;
  }

  return 3;
};

const getSparkline = (score: number, rank: number) => {
  const start = Math.max(score - 8 - rank, 1);

  return Array.from({ length: 12 }, (_, index) =>
    Number((start + index * 0.7 + ((index + rank) % 3) * 0.45).toFixed(2)),
  );
};

const getLeaderboardLabel = (launch: BagsLaunchView) =>
  launch.migrationStatus === "migrated"
    ? "Migrated pool"
    : launch.migrationStatus === "dbc"
      ? "Live DBC"
      : "Fresh launch";

const getTrendingMetric = (entry: SyncLeaderboardEntry) => {
  const change24h = entry.latestSnapshot.priceChange24h;

  if (change24h !== null && change24h !== undefined) {
    return `${change24h >= 0 ? "+" : ""}${change24h.toFixed(1)}%`;
  }

  const marketCap = entry.latestSnapshot.marketCap;

  if (marketCap !== null && marketCap !== undefined) {
    return `$${marketCap.toLocaleString(undefined, {
      maximumFractionDigits: 0,
    })}`;
  }

  return "N/A";
};

const toMarketLeaderboardRow = (
  kind: string,
  entry: SyncLeaderboardEntry,
  rank: number,
  metric: string,
): Prisma.MarketLeaderboardEntryCreateManyInput => ({
  kind,
  rank,
  name: entry.launch.name,
  symbol: entry.launch.symbol,
  image: entry.launch.image,
  tokenMint: entry.launch.tokenMint,
  metric,
  score: entry.latestSignal,
  price: entry.latestSnapshot.price ?? null,
  marketCap: entry.latestSnapshot.marketCap ?? null,
  volume24h: entry.latestSnapshot.volume24h ?? null,
  change1h: entry.latestSnapshot.priceChange1h ?? null,
  change24h: entry.latestSnapshot.priceChange24h ?? null,
  change7d: null,
  sparkline: toJson(getSparkline(entry.latestSignal, rank)),
  label: getLeaderboardLabel(entry.launch),
  href: `/coins/${encodeURIComponent(entry.launch.tokenMint)}`,
  source: "bags",
});

const refreshMarketLeaderboardCache = async (
  prisma: PrismaClient,
  launches: BagsLaunchView[],
  snapshotRows: SnapshotRow[],
) => {
  const snapshotsByMint = new Map(
    snapshotRows.map((snapshot) => [snapshot.tokenMint, snapshot]),
  );
  const entries = launches
    .map((launch, index): SyncLeaderboardEntry | null => {
      const latestSnapshot = snapshotsByMint.get(launch.tokenMint);

      if (!latestSnapshot) {
        return null;
      }

      const latestSignal =
        latestSnapshot.marketSignal ?? getMarketSignal(launch, index);
      const recencyScore = Math.max(12 - index * 0.002, 0);
      const trendScore = Number(
        (latestSignal + getPoolStateScore(launch) + recencyScore).toFixed(2),
      );

      return {
        launch,
        latestSignal,
        latestSnapshot,
        trendScore,
      };
    })
    .filter((entry): entry is SyncLeaderboardEntry => entry !== null);
  const launchFeedEntries = entries.filter(
    (entry) => entry.launch.status !== "POOL_ONLY",
  );
  const marketRows = rankMarketCapLeaderboard(entries).map((entry, index) =>
    toMarketLeaderboardRow(
      "market",
      entry,
      index + 1,
      entry.latestSnapshot.marketCap === null ||
        entry.latestSnapshot.marketCap === undefined
        ? "N/A"
        : `$${entry.latestSnapshot.marketCap.toLocaleString(undefined, {
            maximumFractionDigits: 0,
          })}`,
    ),
  );
  const trendingRows = rankTrendingTokens(launchFeedEntries)
    .slice(0, cachedLeaderboardSideListLimit)
    .map((entry, index) =>
      toMarketLeaderboardRow(
        "trending",
        entry,
        index + 1,
        getTrendingMetric(entry),
      ),
    );
  const topGainerRows = rankTopGainers(launchFeedEntries)
    .slice(0, cachedLeaderboardSideListLimit)
    .map((entry, index) =>
      toMarketLeaderboardRow(
        "top_gainers",
        entry,
        index + 1,
        `${entry.latestSnapshot.priceChange24h?.toFixed(1) ?? "N/A"}%`,
      ),
    );
  const rows = [...marketRows, ...trendingRows, ...topGainerRows];

  await prisma.$transaction(async (tx) => {
    await tx.marketLeaderboardEntry.deleteMany();

    for (const rowChunk of chunk(rows, 1000)) {
      if (rowChunk.length > 0) {
        await tx.marketLeaderboardEntry.createMany({
          data: rowChunk,
        });
      }
    }
  });

  return rows.length;
};

const parseFmpPublishedDate = (value: string) => {
  const date = new Date(`${value.replace(" ", "T")}Z`);

  return Number.isNaN(date.getTime()) ? new Date() : date;
};

const getUtcDayStart = (date: Date) =>
  new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );

const reserveFmpNewsRequest = async (prisma: PrismaClient) => {
  if (!env.newsApiKey) {
    return null;
  }

  const startedAt = new Date();
  const requestsToday = await prisma.syncRun.count({
    where: {
      source: fmpNewsSource,
      startedAt: {
        gte: getUtcDayStart(startedAt),
      },
      status: {
        not: "skipped",
      },
    },
  });

  if (requestsToday >= env.fmpNewsDailyRequestLimit) {
    await prisma.syncRun.create({
      data: {
        source: fmpNewsSource,
        status: "skipped",
        startedAt,
        finishedAt: new Date(),
        error: `Daily FMP news request limit reached (${env.fmpNewsDailyRequestLimit})`,
      },
    });

    return null;
  }

  return prisma.syncRun.create({
    data: {
      source: fmpNewsSource,
      status: "running",
      startedAt,
      rowsRead: 1,
    },
  });
};

const syncCryptoNews = async (prisma: PrismaClient) => {
  const fmpRequestRun = await reserveFmpNewsRequest(prisma);

  if (!fmpRequestRun) {
    return 0;
  }

  try {
    const news = await getLatestCryptoNews({ limit: 50 });

    for (const newsChunk of chunk(news, 25)) {
      await Promise.all(
        newsChunk.map((item) => {
          const publishedAt = parseFmpPublishedDate(item.publishedDate);
          const sourceLabel = item.publisher ?? item.site ?? "FMP Crypto News";
          const detail = item.text?.trim()
            ? `${sourceLabel}: ${item.text.trim()}`
            : `Latest crypto market news from ${sourceLabel}.`;

          return prisma.marketNews.upsert({
            where: {
              sourceKey: `${fmpNewsSource}:${item.url}`,
            },
            create: {
              sourceKey: `${fmpNewsSource}:${item.url}`,
              headline: item.title,
              detail,
              source: fmpNewsSource,
              href: item.url,
              createdAt: publishedAt,
            },
            update: {
              headline: item.title,
              detail,
              href: item.url,
            },
          });
        }),
      );
    }

    await prisma.syncRun.update({
      where: {
        id: fmpRequestRun.id,
      },
      data: {
        status: "success",
        finishedAt: new Date(),
        rowsWritten: news.length,
      },
    });

    return news.length;
  } catch (error) {
    await prisma.syncRun.update({
      where: {
        id: fmpRequestRun.id,
      },
      data: {
        status: "error",
        finishedAt: new Date(),
        error: error instanceof Error ? error.message : "FMP news sync failed",
      },
    });

    if (error instanceof FmpNewsApiError) {
      return 0;
    }

    throw error;
  }
};

export const upsertLaunch = async (
  prisma: PrismaClient,
  launch: BagsLaunchView,
) => {
  await prisma.bagsToken.upsert({
    where: {
      tokenMint: launch.tokenMint,
    },
    create: {
      tokenMint: launch.tokenMint,
      name: launch.name,
      symbol: launch.symbol,
      description: launch.description,
      image: launch.image,
      status: launch.status,
      migrationStatus: launch.migrationStatus,
      website: launch.website,
      twitter: launch.twitter,
      uri: launch.uri,
      launchSignature: launch.launchSignature,
      raw: toJson(launch),
    },
    update: {
      name: launch.name,
      symbol: launch.symbol,
      description: launch.description,
      image: launch.image,
      status: launch.status,
      migrationStatus: launch.migrationStatus,
      website: launch.website,
      twitter: launch.twitter,
      uri: launch.uri,
      launchSignature: launch.launchSignature,
      raw: toJson(launch),
    },
  });

  if (launch.pool) {
    await prisma.bagsPool.upsert({
      where: {
        tokenMint: launch.tokenMint,
      },
      create: {
        tokenMint: launch.tokenMint,
        dbcConfigKey: launch.pool.dbcConfigKey,
        dbcPoolKey: launch.pool.dbcPoolKey,
        dammV2PoolKey: launch.pool.dammV2PoolKey,
        raw: toJson(launch.pool),
      },
      update: {
        dbcConfigKey: launch.pool.dbcConfigKey,
        dbcPoolKey: launch.pool.dbcPoolKey,
        dammV2PoolKey: launch.pool.dammV2PoolKey,
        raw: toJson(launch.pool),
      },
    });
  }
};

export const syncBagsMarket = async (
  prisma: PrismaClient,
): Promise<BagsSyncResult> => {
  const startedAt = Date.now();
  const syncRun = await prisma.syncRun.create({
    data: {
      source: "bags",
      status: "running",
    },
  });

  try {
    const [feed, pools] = await Promise.all([
      bagsClient.getTokenLaunchFeed(),
      bagsClient.getPools(false),
    ]);
    const launches = buildLaunchViews(feed, pools);
    const launchMints = new Set(launches.map((launch) => launch.tokenMint));
    const poolOnlyLaunches = pools
      .filter((pool) => !launchMints.has(pool.tokenMint))
      .map(
        (pool): BagsLaunchView => ({
          name: pool.tokenMint,
          symbol: "",
          tokenMint: pool.tokenMint,
          status: "POOL_ONLY",
          pool,
          migrationStatus: pool.dammV2PoolKey ? "migrated" : "dbc",
          bagsUrl: `https://bags.fm/${pool.tokenMint}`,
        }),
      );
    const quoteResults = new Map<
      string,
      Awaited<ReturnType<typeof getNullableQuote>>
    >();
    const supplyResults = new Map<
      string,
      Awaited<ReturnType<typeof getTokenSupply>>
    >();
    const dexResults = new Map<string, DexMarketData>();
    const allLaunches = [...launches, ...poolOnlyLaunches];

    for (const dexChunk of chunk(allLaunches, 30)) {
      const dexMarketData = await getDexScreenerMarketData(
        dexChunk.map((launch) => launch.tokenMint),
      );

      for (const [tokenMint, marketData] of dexMarketData.entries()) {
        dexResults.set(tokenMint, marketData);
      }
    }

    const enrichedLaunches = allLaunches.map((launch) => {
      const dexMarketData = dexResults.get(launch.tokenMint);

      if (launch.status !== "POOL_ONLY" || !dexMarketData) {
        return launch;
      }

      return {
        ...launch,
        image: dexMarketData.image ?? launch.image,
        name: dexMarketData.name ?? launch.name,
        symbol: dexMarketData.symbol ?? launch.symbol,
      };
    });

    let rowsWritten = 0;

    for (const launchChunk of chunk(enrichedLaunches, 25)) {
      await Promise.all(
        launchChunk.map(async (launch) => {
          await upsertLaunch(prisma, launch);
        }),
      );
      rowsWritten += launchChunk.length;
    }

    const fallbackQuoteTargets = getFallbackQuoteTargets(
      enrichedLaunches,
      dexResults,
    );

    for (const marketDataChunk of chunk(fallbackQuoteTargets, 5)) {
      const marketData = await Promise.all(
        marketDataChunk.map(async (launch) => ({
          tokenMint: launch.tokenMint,
          quote: await getNullableQuote(launch.tokenMint),
          supply: await getTokenSupply(launch.tokenMint),
        })),
      );

      for (const result of marketData) {
        quoteResults.set(result.tokenMint, result.quote);
        supplyResults.set(result.tokenMint, result.supply);
      }
    }

    const snapshotCapturedAt = new Date();
    const historicalPriceReferences = await getHistoricalPriceReferences(
      prisma,
      enrichedLaunches.map((launch) => launch.tokenMint),
      snapshotCapturedAt,
    );
    let derivedPriceChanges = 0;

    const snapshotRows = enrichedLaunches.map((launch, index) => {
      const quote = quoteResults.get(launch.tokenMint);
      const supply = supplyResults.get(launch.tokenMint);
      const dexMarketData = dexResults.get(launch.tokenMint);
      const price = dexMarketData?.price ?? calculateQuotePrice(quote);
      const marketCap =
        dexMarketData?.marketCap ??
        (price !== null && supply?.uiAmount
          ? Number((price * supply.uiAmount).toFixed(2))
          : null);
      const priceReferences = historicalPriceReferences.get(launch.tokenMint);
      const priceChange1h =
        dexMarketData?.priceChange1h ??
        derivePriceChange(price, priceReferences?.h1);
      const priceChange24h =
        dexMarketData?.priceChange24h ??
        derivePriceChange(price, priceReferences?.h24);

      if (dexMarketData?.priceChange1h == null && priceChange1h !== null) {
        derivedPriceChanges += 1;
      }

      if (dexMarketData?.priceChange24h == null && priceChange24h !== null) {
        derivedPriceChanges += 1;
      }

      return {
        tokenMint: launch.tokenMint,
        quoteMint: env.priceQuoteMint,
        outAmount: quote?.outAmount,
        priceImpactPct: quote?.priceImpactPct,
        rawQuote: quote ? toJson(quote) : undefined,
        tokenSupply: supply?.uiAmountString,
        price,
        marketCap,
        priceChange1h,
        priceChange6h: null,
        priceChange24h,
        volume24h: dexMarketData?.volume24h ?? null,
        liquidityUsd: dexMarketData?.liquidityUsd ?? null,
        dexPairAddress: dexMarketData?.dexPairAddress ?? null,
        dexTokenName: dexMarketData?.name ?? null,
        dexTokenSymbol: dexMarketData?.symbol ?? null,
        dexImage: dexMarketData?.image ?? null,
        marketDataSource: dexMarketData
          ? "dexscreener"
          : price
            ? "bags_quote"
            : undefined,
        marketSignal: getMarketSignal(launch, index),
        migrationStatus: launch.migrationStatus,
        capturedAt: snapshotCapturedAt,
      };
    });

    await prisma.tokenMarketSnapshot.createMany({
      data: snapshotRows,
    });
    rowsWritten += enrichedLaunches.length;
    rowsWritten += await refreshMarketLeaderboardCache(
      prisma,
      enrichedLaunches,
      snapshotRows,
    );

    for (const newsChunk of chunk(launches.slice(0, 100), 25)) {
      await Promise.all(
        newsChunk.map(async (launch) => {
          const displaySymbol = launch.symbol.trim() || launch.name;
          const detail =
            launch.migrationStatus === "migrated"
              ? "Pool has migrated to DAMM v2."
              : launch.migrationStatus === "dbc"
                ? "Token has an active DBC pool."
                : "Token is still in launch state.";

          await prisma.marketNews.upsert({
            where: {
              sourceKey: `bags_launch_feed:${launch.tokenMint}:${launch.status}`,
            },
            create: {
              sourceKey: `bags_launch_feed:${launch.tokenMint}:${launch.status}`,
              tokenMint: launch.tokenMint,
              headline: `${displaySymbol} entered the Bags launch feed as ${launch.status.replace(/_/gu, " ")}`,
              detail,
              source: "bags_launch_feed",
              href: `/coins/${encodeURIComponent(launch.tokenMint)}`,
            },
            update: {
              headline: `${displaySymbol} entered the Bags launch feed as ${launch.status.replace(/_/gu, " ")}`,
              detail,
              href: `/coins/${encodeURIComponent(launch.tokenMint)}`,
            },
          });
        }),
      );
      rowsWritten += newsChunk.length;
    }
    rowsWritten += await syncCryptoNews(prisma);

    const stats = buildMarketStats(feed, pools);
    const coverage = {
      durationMs: Date.now() - startedAt,
      tokensScanned: enrichedLaunches.length,
      dexScreenerHits: dexResults.size,
      prices: [...dexResults.values()].filter((item) => item.price !== null)
        .length,
      marketCaps: [...dexResults.values()].filter(
        (item) => item.marketCap !== null,
      ).length,
      images: enrichedLaunches.filter((launch) => launch.image).length,
      skippedNoMarketData: enrichedLaunches.length - dexResults.size,
      derivedPriceChanges,
      priceChanges1h: snapshotRows.filter(
        (snapshot) => snapshot.priceChange1h !== null,
      ).length,
      priceChanges24h: snapshotRows.filter(
        (snapshot) => snapshot.priceChange24h !== null,
      ).length,
    };

    await prisma.syncRun.update({
      where: {
        id: syncRun.id,
      },
      data: {
        status: "success",
        finishedAt: new Date(),
        rowsRead: feed.length + pools.length,
        rowsWritten,
      },
    });

    return {
      syncRunId: syncRun.id,
      rowsRead: feed.length + pools.length,
      rowsWritten,
      stats,
      coverage,
    };
  } catch (error) {
    await prisma.syncRun.update({
      where: {
        id: syncRun.id,
      },
      data: {
        status: "failed",
        finishedAt: new Date(),
        error: error instanceof Error ? error.message : String(error),
      },
    });

    throw error;
  }
};
