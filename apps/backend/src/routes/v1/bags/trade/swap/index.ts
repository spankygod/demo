import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import {
  BagsApiError,
  bagsClient,
  bagsTradeQuoteSchema,
} from "../../../../../lib/bags-client";

const swapRequestSchema = z.object({
  quoteResponse: bagsTradeQuoteSchema,
  userPublicKey: z.string().min(32),
});

const swapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.withTypeProvider<ZodTypeProvider>().post(
    "/",
    {
      schema: {
        body: swapRequestSchema,
      },
    },
    async function (request) {
      const { quoteResponse, userPublicKey } = request.body;

      try {
        const swap = await bagsClient.createSwapTransaction(
          quoteResponse,
          userPublicKey,
        );

        return {
          success: true as const,
          response: swap,
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

export default swapRoute;
