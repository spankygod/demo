import cors from "@fastify/cors";
import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

const corsPlugin: FastifyPluginAsync = async (app) => {
  await app.register(cors, {
    origin: true,
  });
};

export default fp(corsPlugin, {
  name: "cors",
});
