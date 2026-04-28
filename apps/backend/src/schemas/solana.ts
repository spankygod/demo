import { z } from "zod";

export const solanaPublicKeySchema = z
  .string()
  .min(32)
  .max(44)
  .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, "Expected a base58 Solana public key");

export const quoteAmountSchema = z.coerce
  .number()
  .int()
  .positive()
  .safe()
  .default(1_000_000);
