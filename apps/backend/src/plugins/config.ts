import fp from "fastify-plugin";

import { buildAppConfig, type AppConfig } from "../config/env";

export default fp(
  async (fastify) => {
    fastify.decorate("config", buildAppConfig());
  },
  {
    name: "app-config",
  },
);

declare module "fastify" {
  interface FastifyInstance {
    config: AppConfig;
  }
}
