import type { Prisma, PrismaClient } from "@prisma/client";

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
import { getTokenSupply } from "./solana-rpc";

const toJson = (value: unknown) => value as Prisma.InputJsonValue;

const chunk = <T>(items: T[], size: number) => {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
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
  };
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

    const fallbackQuoteTargets = enrichedLaunches.slice(0, 100);

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

    await prisma.tokenMarketSnapshot.createMany({
      data: enrichedLaunches.map((launch, index) => {
        const quote = quoteResults.get(launch.tokenMint);
        const supply = supplyResults.get(launch.tokenMint);
        const dexMarketData = dexResults.get(launch.tokenMint);
        const price = dexMarketData?.price ?? calculateQuotePrice(quote);
        const marketCap =
          dexMarketData?.marketCap ??
          (price !== null && supply?.uiAmount
            ? Number((price * supply.uiAmount).toFixed(2))
            : null);

        return {
          tokenMint: launch.tokenMint,
          quoteMint: env.priceQuoteMint,
          outAmount: quote?.outAmount,
          priceImpactPct: quote?.priceImpactPct,
          rawQuote: quote ? toJson(quote) : undefined,
          tokenSupply: supply?.uiAmountString,
          price,
          marketCap,
          priceChange1h: dexMarketData?.priceChange1h,
          priceChange6h: dexMarketData?.priceChange6h,
          priceChange24h: dexMarketData?.priceChange24h,
          volume24h: dexMarketData?.volume24h,
          liquidityUsd: dexMarketData?.liquidityUsd,
          dexPairAddress: dexMarketData?.dexPairAddress,
          dexTokenName: dexMarketData?.name,
          dexTokenSymbol: dexMarketData?.symbol,
          dexImage: dexMarketData?.image,
          marketDataSource: dexMarketData
            ? "dexscreener"
            : price
              ? "bags_quote"
              : undefined,
          marketSignal: getMarketSignal(launch, index),
          migrationStatus: launch.migrationStatus,
        };
      }),
    });
    rowsWritten += enrichedLaunches.length;

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
