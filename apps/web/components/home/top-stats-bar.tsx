import { Bell, Settings } from "lucide-react";

import { Button } from "@/components/ui/button";

import { PositiveText } from "./market-text";

export function TopStatsBar({
  stats,
}: {
  stats: Array<[string, string, string?]>;
}) {
  return (
    <div className="border-b border-[#1a1a1a] bg-[#000000]">
      <div className="mx-auto flex h-[52px] max-w-[1780px] items-center gap-5 overflow-x-auto px-9 text-xs text-zinc-300">
        {stats.map(([label, value, change]) => (
          <p className="shrink-0" key={label}>
            <span className="text-zinc-400">{label}: </span>
            <b className="text-white">{value}</b>{" "}
            {change ? <PositiveText value={change} /> : null}
          </p>
        ))}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button
            className="size-9 border-[#2a2a2a] bg-[#111111] disabled:cursor-not-allowed disabled:opacity-50"
            disabled
            size="icon"
            title="Settings are not available yet"
          >
            <Settings className="size-4" />
          </Button>
          <Button
            className="size-9 border-[#2a2a2a] bg-[#111111] disabled:cursor-not-allowed disabled:opacity-50"
            disabled
            size="icon"
            title="Alerts are not available yet"
          >
            <Bell className="size-4" />
          </Button>
          <Button
            className="h-9 border-[#2a2a2a] bg-[#111111] px-4 text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled
            title="Authentication is not available yet"
          >
            Login
          </Button>
          <Button
            className="h-9 bg-white px-4 text-slate-950 hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
            disabled
            title="Authentication is not available yet"
          >
            Sign up
          </Button>
        </div>
      </div>
    </div>
  );
}
