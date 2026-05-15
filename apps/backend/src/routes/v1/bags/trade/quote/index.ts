import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { BagsApiError, bagsClient } from "../../../../../lib/bags-client";

const tradeQuoteRequestSchema = z
  .object({
    amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    inputMint: z.string().min(32),
    outputMint: z.string().min(32),
    slippageBps: z.number().int().min(0).max(10_000).optional(),
    slippageMode: z.enum(["auto", "manual"]).default("auto"),
  })
  .refine(
    (value) => value.slippageMode === "auto" || value.slippageBps !== undefined,
    {
      message: "slippageBps is required when slippageMode is manual",
      path: ["slippageBps"],
    },
  );

const tradeQuoteRoute: FastifyPluginAsync = async (fastify) => {
  fastify.withTypeProvider<ZodTypeProvider>().post(
    "/",
    {
      schema: {
        body: tradeQuoteRequestSchema,
      },
    },
    async function (request) {
      const { amount, inputMint, outputMint, slippageBps, slippageMode } =
        request.body;

      try {
        const quote = await bagsClient.getTradeQuote(
          inputMint,
          outputMint,
          amount,
          {
            slippageBps,
            slippageMode,
          },
        );

        return {
          success: true as const,
          response: quote,
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

export default tradeQuoteRoute;
