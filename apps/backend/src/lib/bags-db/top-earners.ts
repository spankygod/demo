import { env } from "../../config/env";
import { bagsClient } from "../bags-client";
import { calculateQuotePrice } from "../bags-market";

const lamportsPerSol = 1_000_000_000;
const wrappedSolMint = "So11111111111111111111111111111111111111112";

type TopEarnerAmountRow = {
  score: number;
};

export type TopEarnerAmount = {
  amountUsdc: number | null;
};

const getBagsSolUsdcRate = async () => {
  const quote = await bagsClient.getTradeQuote(
    wrappedSolMint,
    env.priceQuoteMint,
    lamportsPerSol,
  );

  return calculateQuotePrice(quote);
};

export const getTopEarnerAmountUsdc = (
  row: TopEarnerAmountRow,
  solUsdcRate: number | null,
) => {
  if (
    solUsdcRate === null ||
    !Number.isFinite(solUsdcRate) ||
    !Number.isFinite(row.score)
  ) {
    return null;
  }

  return Number((row.score * solUsdcRate).toFixed(2));
};

export const withTopEarnerAmounts = async <
  TRow extends TopEarnerAmountRow,
>(
  rows: TRow[],
): Promise<Array<TRow & TopEarnerAmount>> => {
  if (rows.length === 0) {
    return [];
  }

  const solUsdcRate = await getBagsSolUsdcRate().catch(() => null);

  return rows.map((row) => ({
    ...row,
    amountUsdc: getTopEarnerAmountUsdc(row, solUsdcRate),
  }));
};
