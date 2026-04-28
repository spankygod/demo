import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { BagsApiError, bagsClient } from "../../../../lib/bags-client";
import {
  getCachedLaunches,
  getCachedLeaderboards,
  getCachedMarketNews,
  getCachedMarketStats,
} from "../../../../lib/bags-db";
import {
  buildLaunchViews,
  buildMarketStats,
  formatSignal,
  getMarketSignal,
} from "../../../../lib/bags-market";

const marketItemSchema = z.object({
  rank: z.number(),
  name: z.string(),
  symbol: z.string(),
  image: z.string().nullable().optional(),
  tokenMint: z.string(),
  metric: z.string(),
  score: z.number(),
  price: z.number().nullable(),
  marketCap: z.number().nullable(),
  change1h: z.number().nullable(),
  change24h: z.number().nullable(),
  sparkline: z.array(z.number()),
  label: z.string(),
  href: z.string(),
  source: z.literal("bags"),
});

const newsItemSchema = z.object({
  headline: z.string(),
  detail: z.string(),
  tokenMint: z.string().optional(),
  href: z.string(),
  source: z.literal("bags_launch_feed"),
});

const bagsMarketResponseSchema = z.object({
  success: z.literal(true),
  response: z.object({
    stats: z.object({
      launches: z.number(),
      activePools: z.number(),
      migratedPools: z.number(),
      liveDbcPools: z.number(),
      quoteMint: z.string(),
    }),
    trending: z.array(marketItemSchema),
    topGainers: z.array(marketItemSchema),
    leaderboard: z.array(marketItemSchema),
    pagination: z.object({
      page: z.number(),
      pageSize: z.number(),
      total: z.number(),
      totalPages: z.number(),
      hasNextPage: z.boolean(),
      hasPreviousPage: z.boolean(),
    }),
    insights: z.array(newsItemSchema),
    latestMarketNews: z.array(newsItemSchema),
  }),
});

const toMarketItem = (
  launch: {
    name: string;
    symbol: string;
    image?: string | null;
    tokenMint: string;
    migrationStatus: "migrated" | "dbc" | "launching";
  },
  index: number,
) => {
  const score = getMarketSignal({ ...launch, pool: null }, index);

  return {
    rank: index + 1,
    name: launch.name,
    symbol: launch.symbol,
    image: launch.image,
    tokenMint: launch.tokenMint,
    metric: formatSignal(score),
    score,
    price: null,
    marketCap: null,
    change1h: null,
    change24h: null,
    sparkline: Array.from({ length: 12 }, (_, sparkIndex) =>
      Number((score - 6 + sparkIndex * 0.6).toFixed(2)),
    ),
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

const bagsMarketRoute: FastifyPluginAsync = async (fastify) => {
  fastify.withTypeProvider<ZodTypeProvider>().get(
    "/",
    {
      schema: {
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(100).default(25),
          page: z.coerce.number().int().min(1).default(1),
        }),
        response: {
          200: bagsMarketResponseSchema,
        },
      },
    },
    async function (request) {
      const { limit, page } = request.query;
      const leaderboardOffset = (page - 1) * limit;

      try {
        const cachedLaunches = await getCachedLaunches(fastify.prisma, {
          excludePoolOnly: true,
        });

        if (cachedLaunches.length > 0) {
          const leaderboards = await getCachedLeaderboards(fastify.prisma, {
            leaderboardLimit: limit,
            leaderboardOffset,
            sideListLimit: 3,
          });
          const totalPages = Math.max(
            Math.ceil(leaderboards.leaderboardTotal / limit),
            1,
          );
          const cachedNews = await getCachedMarketNews(fastify.prisma, limit);
          const latestMarketNews =
            cachedNews.length > 0
              ? cachedNews.map((item) => ({
                  headline: item.headline,
                  detail: item.detail,
                  tokenMint: item.tokenMint ?? undefined,
                  href: item.href ?? "/",
                  source: "bags_launch_feed" as const,
                }))
              : cachedLaunches.slice(0, limit).map((launch) => ({
                  headline: `${launch.symbol || launch.name} is cached from Bags`,
                  detail:
                    launch.migrationStatus === "migrated"
                      ? "Pool has migrated to DAMM v2."
                      : launch.migrationStatus === "dbc"
                        ? "Token has an active DBC pool."
                        : "Token is still in launch state.",
                  tokenMint: launch.tokenMint,
                  href: `/coins/${encodeURIComponent(launch.tokenMint)}`,
                  source: "bags_launch_feed" as const,
                }));

          return {
            success: true as const,
            response: {
              stats: await getCachedMarketStats(fastify.prisma),
              trending: leaderboards.trending,
              topGainers: leaderboards.topGainers,
              leaderboard: leaderboards.leaderboard,
              pagination: {
                page,
                pageSize: limit,
                total: leaderboards.leaderboardTotal,
                totalPages,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1,
              },
              insights: latestMarketNews.slice(0, 3),
              latestMarketNews,
            },
          };
        }

        const [feed, pools] = await Promise.all([
          bagsClient.getTokenLaunchFeed(),
          bagsClient.getPools(false),
        ]);
        const launches = buildLaunchViews(feed, pools);
        const activeLaunches = launches.filter((launch) => launch.pool);
        const trendingSource =
          activeLaunches.length > 0 ? activeLaunches : launches;
        const gainerSource =
          activeLaunches.length > 0 ? activeLaunches : launches;
        const trending = trendingSource.slice(0, limit).map(toMarketItem);
        const topGainers = [...gainerSource]
          .sort((a, b) => {
            const aRank = a.migrationStatus === "migrated" ? 0 : 1;
            const bRank = b.migrationStatus === "migrated" ? 0 : 1;
            return aRank - bRank;
          })
          .slice(0, limit)
          .map(toMarketItem);
        const latestMarketNews = launches.slice(0, limit).map((launch) => {
          const displaySymbol = launch.symbol.trim() || launch.name;

          return {
            headline: `${displaySymbol} entered the Bags launch feed as ${launch.status.replace(/_/gu, " ")}`,
            detail:
              launch.migrationStatus === "migrated"
                ? "Pool has migrated to DAMM v2."
                : launch.migrationStatus === "dbc"
                  ? "Token has an active DBC pool."
                  : "Token is still in launch state.",
            tokenMint: launch.tokenMint,
            href: `/coins/${encodeURIComponent(launch.tokenMint)}`,
            source: "bags_launch_feed" as const,
          };
        });

        return {
          success: true as const,
          response: {
            stats: buildMarketStats(feed, pools),
            trending,
            topGainers,
            leaderboard: trending,
            pagination: {
              page: 1,
              pageSize: limit,
              total: trending.length,
              totalPages: 1,
              hasNextPage: false,
              hasPreviousPage: false,
            },
            insights: latestMarketNews.slice(0, 3),
            latestMarketNews,
          },
        };
      } catch (error) {
        if (error instanceof BagsApiError) {
          throw fastify.httpErrors.createError(error.statusCode, error.message);
        }

        throw error;
      }
    },
  );
};

export default bagsMarketRoute;
