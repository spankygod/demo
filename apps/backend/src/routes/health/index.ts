import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.withTypeProvider<ZodTypeProvider>().get(
    "/",
    {
      schema: {
        response: {
          200: z.object({
            service: z.string(),
            environment: z.string(),
            status: z.literal("ok"),
            uptime: z.number(),
            timestamp: z.string(),
          }),
        },
      },
    },
    async function () {
      return {
        service: fastify.config.appName,
        environment: fastify.config.nodeEnv,
        status: "ok" as const,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      };
    },
  );
};

export default healthRoutes;
