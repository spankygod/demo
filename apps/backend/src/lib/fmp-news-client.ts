import { z } from "zod";

import { env } from "../config/env";

const fmpCryptoNewsItemSchema = z
  .object({
    image: z.string().nullable().optional(),
    publishedDate: z.string(),
    publisher: z.string().nullable().optional(),
    site: z.string().nullable().optional(),
    symbol: z.string().nullable().optional(),
    text: z.string().nullable().optional(),
    title: z.string(),
    url: z.string().url(),
  })
  .passthrough();

export type FmpCryptoNewsItem = z.infer<typeof fmpCryptoNewsItemSchema>;

export class FmpNewsApiError extends Error {
  constructor(
    message: string,
    readonly statusCode = 502,
  ) {
    super(message);
  }
}

export const getLatestCryptoNews = async (
  options: { limit?: number; page?: number } = {},
): Promise<FmpCryptoNewsItem[]> => {
  if (!env.newsApiKey) {
    return [];
  }

  const url = new URL(
    "https://financialmodelingprep.com/stable/news/crypto-latest",
  );
  url.searchParams.set("page", String(options.page ?? 0));
  url.searchParams.set("limit", String(options.limit ?? 20));
  url.searchParams.set("apikey", env.newsApiKey);

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });
  const text = await response.text();
  let payload: unknown;

  try {
    payload = JSON.parse(text);
  } catch {
    throw new FmpNewsApiError(
      "FMP crypto news returned non-JSON response",
      response.status,
    );
  }

  if (!response.ok) {
    throw new FmpNewsApiError(
      "FMP crypto news request failed",
      response.status,
    );
  }

  return z.array(fmpCryptoNewsItemSchema).parse(payload);
};
