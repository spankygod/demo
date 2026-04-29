import { BookOpen, Maximize2, Newspaper } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { BagsMarketNewsItem } from "@/lib/bags-api";

import { PositiveText } from "./market-text";

const narratives: Array<[string, string]> = [
  ["🔥 Fresh Bags Launches", "+6.1%"],
  ["🔥 Migrated Pool Flow", "+2.8%"],
  ["🔥 Low Impact Quotes", "+1.5%"],
  ["🔥 DBC Momentum", "+4.6%"],
];

const getNewsSourceLabel = (source: string) => {
  if (source === "fmp_crypto_news") {
    return "Crypto news";
  }

  return "Bags launch feed";
};

export function RightRail({
  insights,
  latestBagsSignals,
  latestCryptoNews,
}: {
  insights: BagsMarketNewsItem[];
  latestBagsSignals: BagsMarketNewsItem[];
  latestCryptoNews: BagsMarketNewsItem[];
}) {
  const primaryInsight = insights.at(0);

  return (
    <aside className="hidden border-l border-[#1a1a1a] bg-[#000000] 2xl:block">
      <div className="sticky top-[117px] h-[calc(100vh-117px)] overflow-y-auto px-5 py-4">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex gap-4 text-sm">
            <span className="font-semibold text-zinc-100">Insights</span>
            <span className="text-slate-500">Watchlist</span>
          </div>
          <div className="flex gap-3 text-zinc-300">
            <Maximize2 className="size-4" />
            <BookOpen className="size-4" />
          </div>
        </div>

        <Separator className="mb-4 bg-[#1a1a1a]" />

        <section id="market-insights">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-slate-100">
              Bags Market Overview
            </h3>
            <div className="flex gap-2">
              <span className="grid size-5 place-items-center rounded-full bg-[#111111] text-xs">
                ‹
              </span>
              <span className="grid size-5 place-items-center rounded-full bg-[#111111] text-xs">
                ›
              </span>
            </div>
          </div>
          <p className="text-sm leading-6 text-slate-400">
            <b className="text-slate-300">Summary:</b>{" "}
            {primaryInsight
              ? primaryInsight.detail
              : "Live Bags market data is not available."}
          </p>
          <p className="mt-6 text-xs text-slate-500">live Bags feed</p>
          <a
            className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-lg border border-[#2a2a2a] bg-[#111111] px-2.5 text-sm font-medium text-slate-100 transition-colors hover:bg-[#181818]"
            href="#latest-bags-signals"
          >
            View Full Insights
          </a>
        </section>

        <Separator className="my-5 bg-[#1a1a1a]" />

        <section>
          <h3 className="mb-3 font-semibold text-slate-100">
            Bags Narratives Today
          </h3>
          <div className="space-y-2">
            {narratives.map(([name, change]) => (
              <Badge
                className="flex h-7 w-fit items-center gap-2 rounded-md bg-[#111111] px-3 text-slate-300"
                key={name}
                variant="secondary"
              >
                {name} <PositiveText value={change} />
              </Badge>
            ))}
          </div>
        </section>

        <Separator className="my-5 bg-[#1a1a1a]" />

        <section id="latest-bags-signals">
          <h3 className="mb-4 flex items-center gap-2 font-semibold text-slate-100">
            <Newspaper className="size-4 text-zinc-400" />
            Latest Bags Signals
          </h3>
          <div className="space-y-6 border-l border-[#1a1a1a] pl-4">
            {latestBagsSignals.length === 0 ? (
              <p className="text-sm text-slate-500">
                No live signals available.
              </p>
            ) : (
              latestBagsSignals.map((item, index) => (
                <article
                  className="relative"
                  key={`${item.source}-${item.tokenMint ?? item.href}-${index}`}
                >
                  <span className="absolute -left-[21px] top-1 size-2 rounded-full bg-zinc-600" />
                  <p className="text-xs text-slate-500">
                    {getNewsSourceLabel(item.source)}
                  </p>
                  <h4 className="mt-3 text-sm font-semibold leading-5 text-slate-200">
                    <Link className="hover:text-white" href={item.href}>
                      {item.headline}
                    </Link>
                  </h4>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    {item.detail}
                  </p>
                  <Badge
                    className="mt-3 rounded-full border-[#1f1f1f] bg-transparent text-slate-400"
                    variant="outline"
                  >
                    1 source
                  </Badge>
                </article>
              ))
            )}
          </div>
        </section>

        <Separator className="my-5 bg-[#1a1a1a]" />

        <section id="latest-crypto-news">
          <h3 className="mb-4 flex items-center gap-2 font-semibold text-slate-100">
            <Newspaper className="size-4 text-zinc-400" />
            Latest Crypto News
          </h3>
          <div className="space-y-6 border-l border-[#1a1a1a] pl-4">
            {latestCryptoNews.length === 0 ? (
              <p className="text-sm text-slate-500">
                No crypto news available.
              </p>
            ) : (
              latestCryptoNews.map((item, index) => (
                <article
                  className="relative"
                  key={`${item.source}-${item.href}-${index}`}
                >
                  <span className="absolute -left-[21px] top-1 size-2 rounded-full bg-zinc-600" />
                  <p className="text-xs text-slate-500">
                    {getNewsSourceLabel(item.source)}
                  </p>
                  <h4 className="mt-3 text-sm font-semibold leading-5 text-slate-200">
                    <Link className="hover:text-white" href={item.href}>
                      {item.headline}
                    </Link>
                  </h4>
                  <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-500">
                    {item.detail}
                  </p>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </aside>
  );
}
