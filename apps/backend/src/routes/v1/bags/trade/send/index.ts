import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { BagsApiError, bagsClient } from "../../../../../lib/bags-client";

const sendRequestSchema = z.object({
  transaction: z.string().min(1),
});

const sendRoute: FastifyPluginAsync = async (fastify) => {
  fastify.withTypeProvider<ZodTypeProvider>().post(
    "/",
    {
      schema: {
        body: sendRequestSchema,
      },
    },
    async function (request) {
      const { transaction } = request.body;

      try {
        const signature = await bagsClient.sendTransaction(transaction);

        return {
          success: true as const,
          response: signature,
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

export default sendRoute;
