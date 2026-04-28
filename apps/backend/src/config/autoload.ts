import type { AutoloadPluginOptions } from "@fastify/autoload";

export const autoloadConfig = {
  forceESM: true,
  ignorePattern: /(?:\.test|\.spec|\.d)\.(?:ts|js)$/u,
  routeParams: true,
  scriptPattern: /\.(?:ts|js)$/u,
} satisfies Partial<AutoloadPluginOptions>;
