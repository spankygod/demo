import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { env } from "../../../../../config/env";
import { BagsApiError, bagsClient } from "../../../../../lib/bags-client";
import {
  quoteAmountSchema,
  solanaPublicKeySchema,
} from "../../../../../schemas/solana";

const marketChangeSchema = z.object({
  change6h: z.number().nullable(),
  change24h: z.number().nullable(),
  status: z.literal("history_source_required"),
});

const poolSchema = z.object({
  tokenMint: z.string(),
  dbcConfigKey: z.string(),
  dbcPoolKey: z.string(),
  dammV2PoolKey: z.string().nullable().optional(),
});

const quoteRoutePlanSchema = z.object({
  venue: z.string(),
  inAmount: z.string(),
  outAmount: z.string(),
  inputMint: z.string(),
  outputMint: z.string(),
  inputMintDecimals: z.number(),
  outputMintDecimals: z.number(),
  marketKey: z.string(),
  data: z.string().nullable().optional(),
});

const tradeQuoteSchema = z.object({
  requestId: z.string(),
  contextSlot: z.number(),
  inAmount: z.string(),
  inputMint: z.string(),
  outAmount: z.string(),
  outputMint: z.string(),
  minOutAmount: z.string(),
  otherAmountThreshold: z.string(),
  priceImpactPct: z.string(),
  slippageBps: z.number(),
  routePlan: z.array(quoteRoutePlanSchema),
  platformFee: z
    .object({
      amount: z.string().nullable().optional(),
      feeBps: z.number().nullable().optional(),
      feeAccount: z.string().nullable().optional(),
      segmenterFeeAmount: z.string().nullable().optional(),
      segmenterFeePct: z.number().nullable().optional(),
    })
    .optional(),
  outTransferFee: z.string().nullable().optional(),
  simulatedComputeUnits: z.number().optional(),
});

const tokenIntelligenceResponseSchema = z.object({
  success: z.literal(true),
  response: z.object({
    tokenMint: z.string(),
    quoteMint: z.string(),
    source: z.literal("bags"),
    pool: poolSchema,
    price: z.object({
      amountIn: z.string(),
      amountOut: z.string(),
      priceInQuoteToken: z.number().nullable(),
      priceImpactPct: z.string(),
    }),
    marketChange: marketChangeSchema,
    quote: tradeQuoteSchema,
  }),
});

const calculatePriceInQuoteToken = (
  inAmount: string,
  outAmount: string,
  inputMintDecimals?: number,
  outputMintDecimals?: number,
) => {
  if (inputMintDecimals === undefined || outputMintDecimals === undefined) {
    return null;
  }

  const normalizedInput = Number(inAmount) / 10 ** inputMintDecimals;
  const normalizedOutput = Number(outAmount) / 10 ** outputMintDecimals;

  if (!Number.isFinite(normalizedInput) || normalizedInput <= 0) {
    return null;
  }

  return normalizedOutput / normalizedInput;
};

const tokenIntelligenceRoute: FastifyPluginAsync = async (fastify) => {
  fastify.withTypeProvider<ZodTypeProvider>().get(
    "/",
    {
      schema: {
        params: z.object({
          tokenMint: solanaPublicKeySchema,
        }),
        querystring: z.object({
          amount: quoteAmountSchema,
          quoteMint: solanaPublicKeySchema.default(env.priceQuoteMint),
        }),
        response: {
          200: tokenIntelligenceResponseSchema,
        },
      },
    },
    async function (request) {
      const { tokenMint } = request.params;
      const { amount, quoteMint } = request.query;

      try {
        const [pool, quote] = await Promise.all([
          bagsClient.getPoolByTokenMint(tokenMint),
          bagsClient.getTradeQuote(tokenMint, quoteMint, amount),
        ]);
        const firstRoute = quote.routePlan.at(0);

        return {
          success: true as const,
          response: {
            tokenMint,
            quoteMint,
            source: "bags" as const,
            pool,
            price: {
              amountIn: quote.inAmount,
              amountOut: quote.outAmount,
              priceInQuoteToken: calculatePriceInQuoteToken(
                quote.inAmount,
                quote.outAmount,
                firstRoute?.inputMintDecimals,
                firstRoute?.outputMintDecimals,
              ),
              priceImpactPct: quote.priceImpactPct,
            },
            marketChange: {
              change6h: null,
              change24h: null,
              status: "history_source_required" as const,
            },
            quote,
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

export default tokenIntelligenceRoute;
