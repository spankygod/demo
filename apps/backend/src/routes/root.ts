import type { FastifyPluginAsync } from "fastify";

const root: FastifyPluginAsync = async (fastify): Promise<void> => {
  fastify.get("/", async function () {
    return {
      service: fastify.config.appName,
      environment: fastify.config.nodeEnv,
      status: "ok",
    };
  });
};

export default root;
