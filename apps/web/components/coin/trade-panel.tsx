"use client";

import bs58 from "bs58";
import {
  ArrowRightLeft,
  CircleHelp,
  ExternalLink,
  Send,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { VersionedTransaction } from "@solana/web3.js";

import {
  createBagsSwapTransaction,
  fetchBagsTradeQuote,
  sendBagsSignedTransaction,
  type BagsCoinDetailData,
  type BagsTradeQuote,
} from "@/lib/bags-api";
import { shortenKey } from "@/lib/coin-detail-mappers";

type SolanaPublicKey = {
  toBase58(): string;
};

type SolanaProvider = {
  connect(): Promise<{ publicKey: SolanaPublicKey }>;
  isPhantom?: boolean;
  publicKey?: SolanaPublicKey;
  signTransaction<T extends VersionedTransaction>(transaction: T): Promise<T>;
};

declare global {
  interface Window {
    solana?: SolanaProvider;
  }
}

const usdcDecimals = 6;
const defaultTokenDecimals = 6;
const defaultAmount = "1";
type QuoteSide = "token" | "usdc";

const parseDecimalAmount = (value: string, decimals: number) => {
  const normalized = value.trim();

  if (!/^\d+(\.\d+)?$/u.test(normalized)) {
    return null;
  }

  const [whole = "0", fraction = ""] = normalized.split(".");

  if (fraction.length > decimals) {
    return null;
  }

  const units = BigInt(`${whole}${fraction.padEnd(decimals, "0")}`);

  if (units <= 0n || units > BigInt(Number.MAX_SAFE_INTEGER)) {
    return null;
  }

  return Number(units);
};

const formatBaseUnits = (
  value: string,
  decimals: number,
  maximumFractionDigits = 6,
  options: { useGrouping?: boolean } = {},
) => {
  const raw = BigInt(value);
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const fraction = raw % divisor;
  const fractionText = fraction.toString().padStart(decimals, "0");
  const trimmedFraction = fractionText
    .slice(0, maximumFractionDigits)
    .replace(/0+$/u, "");
  const wholeText = whole.toLocaleString(undefined, {
    useGrouping: options.useGrouping ?? true,
  });

  return trimmedFraction ? `${wholeText}.${trimmedFraction}` : wholeText;
};

const getQuoteOutputDecimals = (quote: BagsTradeQuote | null) => {
  const finalRoute = quote?.routePlan.at(-1);

  return finalRoute?.outputMintDecimals ?? usdcDecimals;
};

export function TradePanel({ coin }: { coin: BagsCoinDetailData }) {
  const [tokenAmount, setTokenAmount] = useState(defaultAmount);
  const [usdcAmount, setUsdcAmount] = useState("0");
  const [lastEditedSide, setLastEditedSide] = useState<QuoteSide | null>(null);
  const [, setError] = useState<string | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [quote, setQuote] = useState<BagsTradeQuote | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [tokenDecimals, setTokenDecimals] = useState(defaultTokenDecimals);
  const ticker = coin.token.symbol || coin.token.name || "Token";
  const activeInputValue = lastEditedSide === "usdc" ? usdcAmount : tokenAmount;
  const activeBaseAmount = useMemo(() => {
    if (lastEditedSide === "usdc") {
      return parseDecimalAmount(usdcAmount, usdcDecimals);
    }

    return parseDecimalAmount(tokenAmount, tokenDecimals);
  }, [lastEditedSide, tokenAmount, tokenDecimals, usdcAmount]);

  const connectWallet = async () => {
    setError(null);

    const provider = window.solana;

    if (!provider) {
      setError("No Solana wallet was found.");
      return null;
    }

    const response = await provider.connect();
    const nextPublicKey = response.publicKey.toBase58();

    setPublicKey(nextPublicKey);
    return nextPublicKey;
  };

  const requestQuote = useCallback(
    async (side: QuoteSide = lastEditedSide ?? "token") => {
      setError(null);
      setSignature(null);

      const amount =
        side === "usdc"
          ? parseDecimalAmount(usdcAmount, usdcDecimals)
          : parseDecimalAmount(tokenAmount, tokenDecimals);

      if (!amount) {
        setQuote(null);
        setError(`Enter a valid ${side === "usdc" ? "USDC" : ticker} amount.`);
        return null;
      }

      setIsQuoting(true);

      try {
        const nextQuote = await fetchBagsTradeQuote({
          amount,
          inputMint: side === "usdc" ? coin.quoteMint : coin.token.tokenMint,
          outputMint: side === "usdc" ? coin.token.tokenMint : coin.quoteMint,
          slippageMode: "auto",
        });

        if (!nextQuote) {
          setQuote(null);
          setError("Bags did not return a quote for this route.");
          return null;
        }

        const inputTokenDecimals =
          side === "token"
            ? nextQuote.routePlan.at(0)?.inputMintDecimals
            : nextQuote.routePlan.at(-1)?.outputMintDecimals;

        if (inputTokenDecimals !== undefined) {
          setTokenDecimals(inputTokenDecimals);
        }

        const outputAmount = formatBaseUnits(
          nextQuote.outAmount,
          getQuoteOutputDecimals(nextQuote),
          6,
          { useGrouping: false },
        );

        if (side === "usdc") {
          setTokenAmount(outputAmount);
        } else {
          setUsdcAmount(outputAmount);
        }

        setQuote(nextQuote);
        return nextQuote;
      } finally {
        setIsQuoting(false);
      }
    },
    [
      coin.quoteMint,
      coin.token.tokenMint,
      lastEditedSide,
      ticker,
      tokenAmount,
      tokenDecimals,
      usdcAmount,
    ],
  );

  useEffect(() => {
    if (!lastEditedSide || !activeBaseAmount) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void requestQuote(lastEditedSide);
    }, 450);

    return () => {
      window.clearTimeout(timeoutId);
    };
    // Only the edited input should retrigger auto quotes. Quote responses fill
    // the opposite field and must not recursively request a fresh quote.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBaseAmount, activeInputValue, lastEditedSide]);

  const executeSwap = async () => {
    setError(null);
    setSignature(null);
    setIsSwapping(true);

    try {
      const provider = window.solana;

      if (!provider) {
        setError("No Solana wallet was found.");
        return;
      }

      const walletPublicKey = publicKey ?? (await connectWallet());

      if (!walletPublicKey) {
        return;
      }

      const activeQuote =
        quote ?? (await requestQuote(lastEditedSide ?? "token"));

      if (!activeQuote) {
        return;
      }

      const swap = await createBagsSwapTransaction({
        quoteResponse: activeQuote,
        userPublicKey: walletPublicKey,
      });

      if (!swap) {
        setError("Bags could not create a swap transaction.");
        return;
      }

      const transaction = VersionedTransaction.deserialize(
        bs58.decode(swap.swapTransaction),
      );
      const signedTransaction = await provider.signTransaction(transaction);
      const signedPayload = bs58.encode(signedTransaction.serialize());
      const nextSignature = await sendBagsSignedTransaction({
        transaction: signedPayload,
      });

      if (!nextSignature) {
        setError("The signed transaction was not submitted.");
        return;
      }

      setSignature(nextSignature);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Swap failed before confirmation.",
      );
    } finally {
      setIsSwapping(false);
    }
  };

  return (
    <section className="mt-7 border-t border-[#1a1a1a] pt-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold text-white">
          <ArrowRightLeft className="size-4 text-zinc-300" />
          Trade
        </h2>
        <button
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#2a2a2a] bg-[#111111] px-2.5 text-xs font-semibold text-zinc-100 transition-colors hover:bg-[#181818]"
          onClick={async () => {
            await connectWallet();
          }}
          type="button"
        >
          <Wallet className="size-3.5" />
          {publicKey ? shortenKey(publicKey) : "Connect"}
        </button>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-[#1a1a1a] bg-[#050505]">
        <label className="flex h-14 items-center justify-between gap-3 border-b border-[#1a1a1a] px-3">
          <input
            className="min-w-0 flex-1 bg-transparent font-mono text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
            inputMode="decimal"
            onChange={(event) => {
              setTokenAmount(event.target.value);
              setLastEditedSide("token");
              setQuote(null);
              setSignature(null);
            }}
            placeholder="0"
            type="text"
            value={tokenAmount}
          />
          <span className="max-w-[11rem] truncate text-sm font-semibold text-zinc-400">
            {ticker}
          </span>
        </label>
        <label className="flex h-14 items-center justify-between gap-3 px-3">
          <input
            className="min-w-0 flex-1 bg-transparent font-mono text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
            inputMode="decimal"
            onChange={(event) => {
              setUsdcAmount(event.target.value);
              setLastEditedSide("usdc");
              setQuote(null);
              setSignature(null);
            }}
            placeholder="0"
            type="text"
            value={usdcAmount}
          />
          <span className="text-sm font-semibold text-zinc-400">USDC</span>
        </label>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-zinc-500">
          <span>{isQuoting ? "Updating quote..." : "Slippage"}</span>
          {quote ? (
            <span className="group relative inline-flex">
              <button
                aria-label="Quote details"
                className="inline-flex size-4 items-center justify-center rounded-full text-zinc-500 outline-none transition-colors hover:text-zinc-200 focus-visible:text-zinc-200"
                type="button"
              >
                <CircleHelp className="size-3.5" />
              </button>
              <dl className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-52 -translate-x-1/2 rounded-md border border-[#252525] bg-[#080808] p-3 text-xs opacity-0 shadow-xl shadow-black/40 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-zinc-500">Min received</dt>
                  <dd className="font-mono text-zinc-200">
                    {formatBaseUnits(
                      quote.minOutAmount,
                      getQuoteOutputDecimals(quote),
                    )}
                  </dd>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <dt className="text-zinc-500">Price impact</dt>
                  <dd className="font-mono text-zinc-200">
                    {Number(quote.priceImpactPct).toFixed(3)}%
                  </dd>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <dt className="text-zinc-500">Slippage</dt>
                  <dd className="font-mono text-zinc-200">
                    {(quote.slippageBps / 100).toFixed(2)}%
                  </dd>
                </div>
              </dl>
            </span>
          ) : null}
        </div>
        <button
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-green-400 px-3 text-sm font-bold text-black transition-colors hover:bg-green-300 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isQuoting || isSwapping || !activeBaseAmount}
          onClick={executeSwap}
          type="button"
        >
          <Send className="size-4" />
          {isSwapping ? "Signing" : "Swap"}
        </button>
      </div>

      {signature ? (
        <a
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-green-300 hover:text-green-200"
          href={`https://solscan.io/tx/${signature}`}
          rel="noreferrer"
          target="_blank"
        >
          {shortenKey(signature)}
          <ExternalLink className="size-3" />
        </a>
      ) : null}
    </section>
  );
}
