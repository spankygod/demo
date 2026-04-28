import { env } from "../config/env";

const tokenSupplyResponseSchema = (payload: unknown) => {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const response = payload as {
    result?: {
      value?: {
        amount?: unknown;
        decimals?: unknown;
        uiAmount?: unknown;
        uiAmountString?: unknown;
      };
    };
  };
  const value = response.result?.value;

  if (!value || typeof value.uiAmountString !== "string") {
    return null;
  }

  return {
    amount: typeof value.amount === "string" ? value.amount : null,
    decimals: typeof value.decimals === "number" ? value.decimals : null,
    uiAmount:
      typeof value.uiAmount === "number"
        ? value.uiAmount
        : Number(value.uiAmountString),
    uiAmountString: value.uiAmountString,
  };
};

export const getTokenSupply = async (tokenMint: string) => {
  const response = await fetch(env.solanaRpcUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: tokenMint,
      jsonrpc: "2.0",
      method: "getTokenSupply",
      params: [tokenMint],
    }),
  });

  if (!response.ok) {
    return null;
  }

  const payload: unknown = await response.json();
  const parsed = tokenSupplyResponseSchema(payload);

  if (!parsed || !Number.isFinite(parsed.uiAmount)) {
    return null;
  }

  return parsed;
};
