import Image from "next/image";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const footerColumns = [
  {
    title: "Resources",
    links: [
      ["Bags Tokens", "#leaderboard"],
      ["Market Leaderboard", "#leaderboard"],
      ["Token Launches", "#bags-overview"],
      ["Crypto API", null],
      ["Market Signals", "#latest-bags-signals"],
    ],
  },
  {
    title: "Support",
    links: [
      ["Request Form", null],
      ["Advertising", null],
      ["Help Center", null],
      ["Bug Bounty", null],
      ["FAQ", null],
    ],
  },
  {
    title: "About Astralmarket",
    links: [
      ["About Us", "#site-footer"],
      ["Methodology", "#site-footer"],
      ["Disclaimer", "#site-footer"],
      ["Terms of Service", null],
      ["Privacy Policy", null],
    ],
  },
  {
    title: "Community",
    links: [
      ["X/Twitter", null],
      ["Telegram Chat", null],
      ["Telegram News", null],
      ["Discord", null],
      ["Github", null],
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-[#1a1a1a] bg-[#000000]" id="site-footer">
      <div className="mx-auto grid max-w-[1780px] gap-10 px-6 py-10 lg:grid-cols-[minmax(280px,1.2fr)_repeat(4,minmax(140px,1fr))] lg:px-7">
        <div>
          <div className="flex items-center gap-3">
            <Image
              alt=""
              className="size-9 invert"
              height={36}
              priority
              src="/assets/logo.svg"
              width={36}
            />
            <span className="text-2xl font-bold tracking-tight text-white">
              astralmarket
            </span>
          </div>
          <p className="mt-6 max-w-xl text-sm leading-6 text-zinc-300">
            Astralmarket tracks Bags.fm launches, migrated pools, and market
            data using live Bags snapshots and DexScreener coverage for price,
            movement, and market capitalization.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {["Bags data", "DexScreener market data"].map((item) => (
              <span
                className="rounded-md border border-[#2a2a2a] bg-[#080808] px-3 py-2 text-xs font-semibold text-zinc-100"
                key={item}
              >
                {item}
              </span>
            ))}
          </div>
        </div>

        {footerColumns.map((column) => (
          <div key={column.title}>
            <h3 className="text-sm font-bold text-zinc-100">{column.title}</h3>
            <ul className="mt-5 space-y-4 text-sm text-zinc-400">
              {column.links.map(([label, href]) => (
                <li key={label}>
                  {href ? (
                    <a className="hover:text-white" href={href}>
                      {label}
                    </a>
                  ) : (
                    <span className="cursor-not-allowed text-zinc-600">
                      {label}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-[#1a1a1a]">
        <div className="mx-auto flex max-w-[1780px] flex-col gap-4 px-6 py-6 lg:flex-row lg:items-center lg:justify-between lg:px-7">
          <div>
            <p className="text-sm font-semibold text-zinc-100">
              Interested in staying up to date with Bags market moves?
            </p>
            <p className="mt-2 text-sm text-zinc-400">
              Get leaderboard updates, sync coverage, and launch-feed signals.
            </p>
          </div>
          <form className="flex w-full max-w-md gap-2">
            <Input
              aria-label="Email updates"
              className="h-10 border-[#2a2a2a] bg-[#080808] text-zinc-100 placeholder:text-slate-500"
              placeholder="Enter your email address"
              type="email"
            />
            <Button
              className="h-10 bg-white px-4 text-black hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
              disabled
              title="Email subscriptions are not available yet"
            >
              Subscribe
            </Button>
          </form>
        </div>
      </div>

      <div className="border-t border-[#1a1a1a]">
        <div className="mx-auto max-w-[1780px] px-6 py-7 text-xs leading-5 text-zinc-400 lg:px-7">
          <p>© 2026 Astralmarket. All rights reserved.</p>
          <p className="mt-5">
            <b className="text-zinc-100">Important disclaimer:</b> Market data
            is provided for informational purposes only and may come from third
            party sources. Nothing on this site is financial advice. Always do
            your own research before trading or relying on token market data.
          </p>
        </div>
      </div>
    </footer>
  );
}
