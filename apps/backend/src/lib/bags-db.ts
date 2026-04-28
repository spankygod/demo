import type { Prisma, PrismaClient } from "@prisma/client";

import { env } from "../config/env";
import {
  rankMarketCapLeaderboard,
  rankTopGainers,
  rankTrendingTokens,
} from "./bags-leaderboards";
import {
  calculateQuotePrice,
  getMarketSignal,
  type BagsLaunchView,
} from "./bags-market";

type TokenWithPool = Prisma.BagsTokenGetPayload<{
  include: {
    pool: true;
  };
}>;

type TokenWithDetails = Prisma.BagsTokenGetPayload<{
  include: {
    creators: true;
    pool: true;
    snapshots: {
      orderBy: {
        capturedAt: "desc";
      };
      take: 64;
    };
  };
}>;

type TokenWithLeaderboard = Prisma.BagsTokenGetPayload<{
  include: {
    pool: true;
    snapshots: {
      orderBy: {
        capturedAt: "desc";
      };
      take: 2;
    };
  };
}>;

const toJson = (value: unknown) => value as Prisma.InputJsonValue;

export const tokenToLaunchView = (token: TokenWithPool): BagsLaunchView => ({
  name: token.name,
  symbol: token.symbol,
  description: token.description,
  image: token.image,
  tokenMint: token.tokenMint,
  status: token.status,
  twitter: token.twitter,
  website: token.website,
  launchSignature: token.launchSignature,
  uri: token.uri,
  dbcPoolKey: token.pool?.dbcPoolKey,
  dbcConfigKey: token.pool?.dbcConfigKey,
  pool: token.pool
    ? {
        tokenMint: token.pool.tokenMint,
        dbcConfigKey: token.pool.dbcConfigKey ?? "",
        dbcPoolKey: token.pool.dbcPoolKey ?? "",
        dammV2PoolKey: token.pool.dammV2PoolKey,
      }
    : null,
  migrationStatus:
    token.migrationStatus === "migrated" || token.migrationStatus === "dbc"
      ? token.migrationStatus
      : "launching",
  bagsUrl: `https://bags.fm/${token.tokenMint}`,
});

export const getCachedLaunches = async (
  prisma: PrismaClient,
  options: {
    excludePoolOnly?: boolean;
    limit?: number;
  } = {},
) => {
  const tokens = await prisma.bagsToken.findMany({
    include: {
      pool: true,
    },
    where: options.excludePoolOnly
      ? {
          status: {
            not: "POOL_ONLY",
          },
        }
      : undefined,
    orderBy: {
      updatedAt: "desc",
    },
    take: options.limit,
  });

  return tokens.map(tokenToLaunchView);
};

export const getCachedMarketStats = async (prisma: PrismaClient) => {
  const [launches, activePools, migratedPools] = await Promise.all([
    prisma.bagsToken.count(),
    prisma.bagsPool.count(),
    prisma.bagsPool.count({
      where: {
        dammV2PoolKey: {
          not: null,
        },
      },
    }),
  ]);

  return {
    launches,
    activePools,
    migratedPools,
    liveDbcPools: Math.max(activePools - migratedPools, 0),
    quoteMint: env.priceQuoteMint,
  };
};

export const buildCachedMarketItem = (
  launch: BagsLaunchView,
  index: number,
) => {
  return {
    name: launch.name,
    symbol: launch.symbol,
    tokenMint: launch.tokenMint,
    status: launch.status,
    metric: `${getMarketSignal(launch, index).toFixed(1)} signal`,
    label:
      launch.migrationStatus === "migrated"
        ? "Migrated pool"
        : launch.migrationStatus === "dbc"
          ? "Live DBC"
          : "Fresh launch",
    href: `/coins/${encodeURIComponent(launch.tokenMint)}`,
    source: "bags" as const,
  };
};

const getRecencyScore = (updatedAt: Date) => {
  const ageHours = Math.max(
    (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60),
    0,
  );

  return Math.max(12 - ageHours / 2, 0);
};

const getPoolStateScore = (launch: BagsLaunchView) => {
  if (launch.migrationStatus === "migrated") {
    return 14;
  }

  if (launch.migrationStatus === "dbc") {
    return 9;
  }

  return 3;
};

const buildLeaderboardEntry = (token: TokenWithLeaderboard, index: number) => {
  const launch = tokenToLaunchView(token);
  const latestSnapshot = token.snapshots.at(0);
  const latestSignal =
    latestSnapshot?.marketSignal ?? getMarketSignal(launch, index);
  const previousSignal = token.snapshots.at(1)?.marketSignal ?? null;
  const gainerDelta =
    previousSignal === null
      ? latestSignal
      : Number((latestSignal - previousSignal).toFixed(2));
  const trendScore = Number(
    (
      latestSignal +
      getPoolStateScore(launch) +
      getRecencyScore(token.updatedAt)
    ).toFixed(2),
  );

  return {
    launch,
    gainerDelta,
    latestSignal,
    latestSnapshot,
    trendScore,
  };
};

const getSparkline = (score: number, rank: number) => {
  const start = Math.max(score - 8 - rank, 1);

  return Array.from({ length: 12 }, (_, index) =>
    Number((start + index * 0.7 + ((index + rank) % 3) * 0.45).toFixed(2)),
  );
};

const toLeaderboardItem = (
  entry: ReturnType<typeof buildLeaderboardEntry>,
  rank: number,
  metric: string,
) => ({
  rank,
  name: entry.launch.name,
  symbol: entry.launch.symbol,
  image: entry.launch.image,
  tokenMint: entry.launch.tokenMint,
  metric,
  score: entry.latestSignal,
  price:
    entry.latestSnapshot?.price ??
    calculateQuotePrice(entry.latestSnapshot?.rawQuote),
  marketCap: entry.latestSnapshot?.marketCap ?? null,
  change1h: entry.latestSnapshot?.priceChange1h ?? null,
  change24h: entry.latestSnapshot?.priceChange24h ?? null,
  sparkline: getSparkline(entry.latestSignal, rank),
  label:
    entry.launch.migrationStatus === "migrated"
      ? "Migrated pool"
      : entry.launch.migrationStatus === "dbc"
        ? "Live DBC"
        : "Fresh launch",
  href: `/coins/${encodeURIComponent(entry.launch.tokenMint)}`,
  source: "bags" as const,
});

const getTrendingMetric = (entry: ReturnType<typeof buildLeaderboardEntry>) => {
  const change24h = entry.latestSnapshot?.priceChange24h;

  if (change24h !== null && change24h !== undefined) {
    return `${change24h >= 0 ? "+" : ""}${change24h.toFixed(1)}%`;
  }

  const marketCap = entry.latestSnapshot?.marketCap;

  if (marketCap !== null && marketCap !== undefined) {
    return `$${marketCap.toLocaleString(undefined, {
      maximumFractionDigits: 0,
    })}`;
  }

  return "N/A";
};

export const getCachedLeaderboards = async (
  prisma: PrismaClient,
  options: {
    leaderboardLimit: number;
    leaderboardOffset: number;
    sideListLimit: number;
  },
) => {
  const tokens = await prisma.bagsToken.findMany({
    include: {
      pool: true,
      snapshots: {
        orderBy: {
          capturedAt: "desc",
        },
        take: 2,
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
  });
  const entries = tokens.map(buildLeaderboardEntry);
  const launchFeedEntries = entries.filter(
    (entry) => entry.launch.status !== "POOL_ONLY",
  );
  const trending = rankTrendingTokens(launchFeedEntries)
    .slice(0, options.sideListLimit)
    .map((entry, index) =>
      toLeaderboardItem(entry, index + 1, getTrendingMetric(entry)),
    );
  const topGainers = rankTopGainers(launchFeedEntries)
    .slice(0, options.sideListLimit)
    .map((entry, index) =>
      toLeaderboardItem(
        entry,
        index + 1,
        `${entry.latestSnapshot?.priceChange24h?.toFixed(1) ?? "N/A"}%`,
      ),
    );
  const rankedLeaderboard = rankMarketCapLeaderboard(entries);
  const leaderboard = rankedLeaderboard
    .slice(
      options.leaderboardOffset,
      options.leaderboardOffset + options.leaderboardLimit,
    )
    .map((entry, index) =>
      toLeaderboardItem(
        entry,
        options.leaderboardOffset + index + 1,
        entry.latestSnapshot?.marketCap === null ||
          entry.latestSnapshot?.marketCap === undefined
          ? "N/A"
          : `$${entry.latestSnapshot.marketCap.toLocaleString(undefined, {
              maximumFractionDigits: 0,
            })}`,
      ),
    );

  return {
    leaderboard,
    leaderboardTotal: rankedLeaderboard.length,
    trending,
    topGainers,
  };
};

export const getCachedMarketNews = async (
  prisma: PrismaClient,
  limit: number,
) =>
  prisma.marketNews.findMany({
    orderBy: {
      createdAt: "desc",
    },
    take: limit,
  });

export const findCachedToken = async (
  prisma: PrismaClient,
  identifier: string,
): Promise<TokenWithDetails | null> => {
  const normalized = decodeURIComponent(identifier).trim();
  const slug = normalized
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
  const tokens = await prisma.bagsToken.findMany({
    include: {
      creators: true,
      pool: true,
      snapshots: {
        orderBy: {
          capturedAt: "desc",
        },
        take: 64,
      },
    },
    where: {
      OR: [
        { tokenMint: { equals: normalized, mode: "insensitive" } },
        { symbol: { equals: normalized, mode: "insensitive" } },
        { name: { equals: normalized, mode: "insensitive" } },
      ],
    },
    take: 25,
  });

  return (
    tokens.find(
      (token) =>
        token.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/gu, "-")
          .replace(/^-|-$/gu, "") === slug,
    ) ??
    tokens.at(0) ??
    null
  );
};

export const upsertCachedCreators = async (
  prisma: PrismaClient,
  tokenMint: string,
  creators: Array<Record<string, unknown>>,
) => {
  await Promise.all(
    creators.map((creator, index) =>
      prisma.tokenCreator.upsert({
        where: {
          tokenMint_wallet: {
            tokenMint,
            wallet:
              typeof creator["wallet"] === "string"
                ? creator["wallet"]
                : `${tokenMint}:creator:${index}`,
          },
        },
        create: {
          tokenMint,
          wallet:
            typeof creator["wallet"] === "string" ? creator["wallet"] : null,
          username:
            typeof creator["username"] === "string"
              ? creator["username"]
              : null,
          pfp: typeof creator["pfp"] === "string" ? creator["pfp"] : null,
          provider:
            typeof creator["provider"] === "string"
              ? creator["provider"]
              : null,
          providerUsername:
            typeof creator["providerUsername"] === "string"
              ? creator["providerUsername"]
              : null,
          twitterUsername:
            typeof creator["twitterUsername"] === "string"
              ? creator["twitterUsername"]
              : null,
          bagsUsername:
            typeof creator["bagsUsername"] === "string"
              ? creator["bagsUsername"]
              : null,
          royaltyBps:
            typeof creator["royaltyBps"] === "number"
              ? creator["royaltyBps"]
              : null,
          isCreator:
            typeof creator["isCreator"] === "boolean"
              ? creator["isCreator"]
              : null,
          isAdmin:
            typeof creator["isAdmin"] === "boolean" ? creator["isAdmin"] : null,
          raw: toJson(creator),
        },
        update: {
          username:
            typeof creator["username"] === "string"
              ? creator["username"]
              : null,
          pfp: typeof creator["pfp"] === "string" ? creator["pfp"] : null,
          provider:
            typeof creator["provider"] === "string"
              ? creator["provider"]
              : null,
          providerUsername:
            typeof creator["providerUsername"] === "string"
              ? creator["providerUsername"]
              : null,
          twitterUsername:
            typeof creator["twitterUsername"] === "string"
              ? creator["twitterUsername"]
              : null,
          bagsUsername:
            typeof creator["bagsUsername"] === "string"
              ? creator["bagsUsername"]
              : null,
          royaltyBps:
            typeof creator["royaltyBps"] === "number"
              ? creator["royaltyBps"]
              : null,
          isCreator:
            typeof creator["isCreator"] === "boolean"
              ? creator["isCreator"]
              : null,
          isAdmin:
            typeof creator["isAdmin"] === "boolean" ? creator["isAdmin"] : null,
          raw: toJson(creator),
        },
      }),
    ),
  );
};

export const tokenWithDetailsToResponse = (token: TokenWithDetails) => {
  const latestSnapshot = token.snapshots.at(0);

  return {
    launch: tokenToLaunchView(token),
    creators: token.creators,
    latestSnapshot,
  };
};
