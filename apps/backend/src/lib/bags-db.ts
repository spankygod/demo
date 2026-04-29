import type { Prisma, PrismaClient } from "@prisma/client";

import { env } from "../config/env";
import {
  rankMarketCapLeaderboard,
  rankTopGainers,
  rankTrendingTokens,
} from "./bags-leaderboards";
import {
  getMarketSignal,
  type BagsLaunchView,
} from "./bags-market";

const poolSelect = {
  tokenMint: true,
  dbcConfigKey: true,
  dbcPoolKey: true,
  dammV2PoolKey: true,
} satisfies Prisma.BagsPoolSelect;

const tokenWithPoolSelect = {
  name: true,
  symbol: true,
  description: true,
  image: true,
  tokenMint: true,
  status: true,
  twitter: true,
  website: true,
  launchSignature: true,
  uri: true,
  migrationStatus: true,
  updatedAt: true,
  pool: {
    select: poolSelect,
  },
} satisfies Prisma.BagsTokenSelect;

const creatorSelect = {
  username: true,
  pfp: true,
  royaltyBps: true,
  isCreator: true,
  wallet: true,
  provider: true,
  providerUsername: true,
  twitterUsername: true,
  bagsUsername: true,
  isAdmin: true,
} satisfies Prisma.TokenCreatorSelect;

const leaderboardSnapshotSelect = {
  marketSignal: true,
  price: true,
  marketCap: true,
  volume24h: true,
  priceChange1h: true,
  priceChange24h: true,
} satisfies Prisma.TokenMarketSnapshotSelect;

const detailSnapshotSelect = {
  capturedAt: true,
  price: true,
  marketCap: true,
  marketSignal: true,
  priceChange1h: true,
  priceChange24h: true,
  lifetimeFeesLamports: true,
} satisfies Prisma.TokenMarketSnapshotSelect;

const latestSnapshotPayloadSelect = {
  ...detailSnapshotSelect,
  rawQuote: true,
} satisfies Prisma.TokenMarketSnapshotSelect;

const marketLeaderboardEntrySelect = {
  rank: true,
  name: true,
  symbol: true,
  image: true,
  tokenMint: true,
  metric: true,
  score: true,
  price: true,
  marketCap: true,
  volume24h: true,
  change1h: true,
  change24h: true,
  change7d: true,
  sparkline: true,
  label: true,
  href: true,
  source: true,
} satisfies Prisma.MarketLeaderboardEntrySelect;

const tokenLeaderboardSelect = {
  ...tokenWithPoolSelect,
  snapshots: {
    orderBy: {
      capturedAt: "desc",
    },
    take: 2,
    select: leaderboardSnapshotSelect,
  },
} satisfies Prisma.BagsTokenSelect;

type TokenWithPool = Prisma.BagsTokenGetPayload<{
  select: typeof tokenWithPoolSelect;
}>;

type TokenCreatorView = Prisma.TokenCreatorGetPayload<{
  select: typeof creatorSelect;
}>;

type TokenDetailSnapshot = Prisma.TokenMarketSnapshotGetPayload<{
  select: typeof latestSnapshotPayloadSelect;
}>;

type TokenWithDetails = TokenWithPool & {
  creators: TokenCreatorView[];
  snapshots: TokenDetailSnapshot[];
};

type TokenWithLeaderboard = Prisma.BagsTokenGetPayload<{
  select: typeof tokenLeaderboardSelect;
}>;

type CachedLeaderboardRow = Prisma.MarketLeaderboardEntryGetPayload<{
  select: typeof marketLeaderboardEntrySelect;
}>;

type TokenMarketHistoryPoint = {
  capturedAt: Date;
  price: number | null;
  tokenMint: string;
};

type MarketHistoryByMint = Map<string, TokenMarketHistoryPoint[]>;
type MarketHistoryReferenceByMint = Map<string, number>;

const toJson = (value: unknown) => value as Prisma.InputJsonValue;
const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
const referenceToleranceMs = 2 * 60 * 60 * 1000;
const maxSparklinePoints = 120;
const maxCoinDetailSnapshots = 336;

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
  updatedAt: token.updatedAt,
});

export const getCachedLaunches = async (
  prisma: PrismaClient,
  options: {
    excludePoolOnly?: boolean;
    limit?: number;
  } = {},
) => {
  const tokens = await prisma.bagsToken.findMany({
    select: tokenWithPoolSelect,
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

const downsamplePoints = (points: number[], maxPoints = maxSparklinePoints) => {
  if (points.length <= maxPoints) {
    return points;
  }

  return Array.from({ length: maxPoints }, (_, index) => {
    const sourceIndex = Math.round(
      (index / (maxPoints - 1)) * (points.length - 1),
    );

    return points[sourceIndex] as number;
  });
};

const getPriceSparkline = (
  history: TokenMarketHistoryPoint[] | undefined,
  fallbackScore: number,
  rank: number,
) => {
  const points =
    history
      ?.filter((snapshot) => snapshot.price !== null)
      .map((snapshot) => snapshot.price as number) ?? [];

  if (points.length >= 2) {
    return downsamplePoints(points);
  }

  return getSparkline(fallbackScore, rank);
};

const getSevenDayChange = (
  currentPrice: number | null | undefined,
  referencePrice: number | undefined,
) => {
  if (
    currentPrice === null ||
    currentPrice === undefined ||
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

const getSevenDayMarketHistory = async (
  prisma: PrismaClient,
  tokenMints: string[],
  capturedAt = new Date(),
) => {
  const historyByMint: MarketHistoryByMint = new Map();
  const referenceByMint: MarketHistoryReferenceByMint = new Map();

  if (tokenMints.length === 0) {
    return {
      historyByMint,
      referenceByMint,
    };
  }

  const sevenDaysAgo = new Date(capturedAt.getTime() - sevenDaysMs);
  const referenceStart = new Date(
    sevenDaysAgo.getTime() - referenceToleranceMs,
  );
  const [history, references] = await Promise.all([
    prisma.tokenMarketSnapshot.findMany({
      where: {
        tokenMint: {
          in: tokenMints,
        },
        price: {
          not: null,
        },
        capturedAt: {
          gte: sevenDaysAgo,
        },
      },
      orderBy: {
        capturedAt: "asc",
      },
      select: {
        capturedAt: true,
        price: true,
        tokenMint: true,
      },
    }),
    prisma.tokenMarketSnapshot.findMany({
      where: {
        tokenMint: {
          in: tokenMints,
        },
        price: {
          not: null,
        },
        capturedAt: {
          gte: referenceStart,
          lte: sevenDaysAgo,
        },
      },
      orderBy: {
        capturedAt: "desc",
      },
      select: {
        capturedAt: true,
        price: true,
        tokenMint: true,
      },
    }),
  ]);

  for (const snapshot of history) {
    const points = historyByMint.get(snapshot.tokenMint) ?? [];
    points.push(snapshot);
    historyByMint.set(snapshot.tokenMint, points);
  }

  for (const snapshot of references) {
    if (snapshot.price !== null && !referenceByMint.has(snapshot.tokenMint)) {
      referenceByMint.set(snapshot.tokenMint, snapshot.price);
    }
  }

  return {
    historyByMint,
    referenceByMint,
  };
};

const toLeaderboardItem = (
  entry: ReturnType<typeof buildLeaderboardEntry>,
  rank: number,
  metric: string,
  historyByMint?: MarketHistoryByMint,
  referenceByMint?: MarketHistoryReferenceByMint,
) => ({
  rank,
  name: entry.launch.name,
  symbol: entry.launch.symbol,
  image: entry.launch.image,
  tokenMint: entry.launch.tokenMint,
  metric,
  score: entry.latestSignal,
  price:
    entry.latestSnapshot?.price ?? null,
  marketCap: entry.latestSnapshot?.marketCap ?? null,
  volume24h: entry.latestSnapshot?.volume24h ?? null,
  change1h: entry.latestSnapshot?.priceChange1h ?? null,
  change24h: entry.latestSnapshot?.priceChange24h ?? null,
  change7d: getSevenDayChange(
    entry.latestSnapshot?.price ?? null,
    referenceByMint?.get(entry.launch.tokenMint),
  ),
  sparkline: getPriceSparkline(
    historyByMint?.get(entry.launch.tokenMint),
    entry.latestSignal,
    rank,
  ),
  label:
    entry.launch.migrationStatus === "migrated"
      ? "Migrated pool"
      : entry.launch.migrationStatus === "dbc"
        ? "Live DBC"
        : "Fresh launch",
  href: `/coins/${encodeURIComponent(entry.launch.tokenMint)}`,
  source: "bags" as const,
});

const toCachedLeaderboardItem = (row: CachedLeaderboardRow) => ({
  rank: row.rank,
  name: row.name,
  symbol: row.symbol,
  image: row.image,
  tokenMint: row.tokenMint,
  metric: row.metric,
  score: row.score,
  price: row.price,
  marketCap: row.marketCap,
  volume24h: row.volume24h,
  change1h: row.change1h,
  change24h: row.change24h,
  change7d: row.change7d,
  sparkline: Array.isArray(row.sparkline)
    ? row.sparkline.filter((value): value is number => typeof value === "number")
    : [],
  label: row.label,
  href: row.href,
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
  const [leaderboardTotal, leaderboardRows, trendingRows, topGainerRows] =
    await Promise.all([
      prisma.marketLeaderboardEntry.count({
        where: {
          kind: "market",
        },
      }),
      prisma.marketLeaderboardEntry.findMany({
        where: {
          kind: "market",
        },
        orderBy: {
          rank: "asc",
        },
        skip: options.leaderboardOffset,
        take: options.leaderboardLimit,
        select: marketLeaderboardEntrySelect,
      }),
      prisma.marketLeaderboardEntry.findMany({
        where: {
          kind: "trending",
        },
        orderBy: {
          rank: "asc",
        },
        take: options.sideListLimit,
        select: marketLeaderboardEntrySelect,
      }),
      prisma.marketLeaderboardEntry.findMany({
        where: {
          kind: "top_gainers",
        },
        orderBy: {
          rank: "asc",
        },
        take: options.sideListLimit,
        select: marketLeaderboardEntrySelect,
      }),
    ]);

  if (leaderboardTotal > 0) {
    return {
      leaderboard: leaderboardRows.map(toCachedLeaderboardItem),
      leaderboardTotal,
      trending: trendingRows.map(toCachedLeaderboardItem),
      topGainers: topGainerRows.map(toCachedLeaderboardItem),
    };
  }

  const tokens = await prisma.bagsToken.findMany({
    select: tokenLeaderboardSelect,
    orderBy: {
      updatedAt: "desc",
    },
  });
  const entries = tokens.map(buildLeaderboardEntry);
  const launchFeedEntries = entries.filter(
    (entry) => entry.launch.status !== "POOL_ONLY",
  );
  const rankedTrending = rankTrendingTokens(launchFeedEntries).slice(
    0,
    options.sideListLimit,
  );
  const rankedTopGainers = rankTopGainers(launchFeedEntries).slice(
    0,
    options.sideListLimit,
  );
  const rankedLeaderboard = rankMarketCapLeaderboard(entries);
  const pagedLeaderboard = rankedLeaderboard.slice(
    options.leaderboardOffset,
    options.leaderboardOffset + options.leaderboardLimit,
  );
  const historyTokenMints = [
    ...new Set(
      [...rankedTrending, ...rankedTopGainers, ...pagedLeaderboard].map(
        (entry) => entry.launch.tokenMint,
      ),
    ),
  ];
  const { historyByMint, referenceByMint } = await getSevenDayMarketHistory(
    prisma,
    historyTokenMints,
  );
  const trending = rankedTrending.map((entry, index) =>
    toLeaderboardItem(
      entry,
      index + 1,
      getTrendingMetric(entry),
      historyByMint,
      referenceByMint,
    ),
  );
  const topGainers = rankedTopGainers.map((entry, index) =>
    toLeaderboardItem(
      entry,
      index + 1,
      `${entry.latestSnapshot?.priceChange24h?.toFixed(1) ?? "N/A"}%`,
      historyByMint,
      referenceByMint,
    ),
  );
  const leaderboard = pagedLeaderboard.map((entry, index) =>
    toLeaderboardItem(
      entry,
      options.leaderboardOffset + index + 1,
      entry.latestSnapshot?.marketCap === null ||
        entry.latestSnapshot?.marketCap === undefined
        ? "N/A"
        : `$${entry.latestSnapshot.marketCap.toLocaleString(undefined, {
            maximumFractionDigits: 0,
          })}`,
      historyByMint,
      referenceByMint,
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
  options: {
    bagsSignalLimit: number;
    cryptoNewsLimit: number;
  },
) => {
  const [cryptoNews, bagsSignals] = await Promise.all([
    prisma.marketNews.findMany({
      where: {
        source: "fmp_crypto_news",
      },
      orderBy: {
        createdAt: "desc",
      },
      take: options.cryptoNewsLimit,
    }),
    prisma.marketNews.findMany({
      where: {
        source: {
          not: "fmp_crypto_news",
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: options.bagsSignalLimit,
    }),
  ]);

  return {
    bagsSignals,
    cryptoNews,
  };
};

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
    select: tokenWithPoolSelect,
    where: {
      OR: [
        { tokenMint: { equals: normalized, mode: "insensitive" } },
        { symbol: { equals: normalized, mode: "insensitive" } },
        { name: { equals: normalized, mode: "insensitive" } },
      ],
    },
    take: 25,
  });

  const token =
    tokens.find(
      (token) =>
        token.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/gu, "-")
          .replace(/^-|-$/gu, "") === slug,
    ) ??
    tokens.at(0) ??
    null;

  if (!token) {
    return null;
  }

  const [creators, snapshots, latestSnapshot] = await Promise.all([
    prisma.tokenCreator.findMany({
      where: {
        tokenMint: token.tokenMint,
      },
      select: creatorSelect,
    }),
    prisma.tokenMarketSnapshot.findMany({
      where: {
        tokenMint: token.tokenMint,
      },
      orderBy: {
        capturedAt: "desc",
      },
      take: maxCoinDetailSnapshots,
      select: detailSnapshotSelect,
    }),
    prisma.tokenMarketSnapshot.findFirst({
      where: {
        tokenMint: token.tokenMint,
      },
      orderBy: {
        capturedAt: "desc",
      },
      select: latestSnapshotPayloadSelect,
    }),
  ]);

  return {
    ...token,
    creators,
    snapshots: snapshots.map((snapshot, index) => ({
      ...snapshot,
      rawQuote: index === 0 ? latestSnapshot?.rawQuote ?? null : null,
    })),
  };
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
