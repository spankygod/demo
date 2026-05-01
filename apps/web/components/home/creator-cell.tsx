import { UserRound } from "lucide-react";
import Image from "next/image";

import type { BagsTableRow } from "@/lib/home-market-mappers";

const shortenWallet = (wallet: string) =>
  wallet.length > 12 ? `${wallet.slice(0, 4)}...${wallet.slice(-4)}` : wallet;

const cleanHandle = (value: string) =>
  value
    .trim()
    .replace(/^https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\//iu, "")
    .replace(/^@/u, "")
    .split(/[/?#]/u)[0] ?? "";

const getCreatorProfile = (creator: BagsTableRow["creator"]) => {
  if (!creator) {
    return null;
  }

  const provider = creator.provider?.toLowerCase();
  const twitterHandle =
    provider === "twitter"
      ? creator.providerUsername ?? creator.twitterUsername
      : creator.twitterUsername;

  if (twitterHandle) {
    const handle = cleanHandle(twitterHandle);

    if (!handle) {
      return null;
    }

    return {
      href: `https://twitter.com/${encodeURIComponent(handle)}`,
      label: handle,
      source: "twitter" as const,
    };
  }

  const bagsHandle = creator.bagsUsername ?? creator.username;

  if (bagsHandle) {
    return {
      href: null,
      label: bagsHandle,
      source: "bags" as const,
    };
  }

  return creator.wallet
    ? {
        href: null,
        label: shortenWallet(creator.wallet),
        source: "wallet" as const,
      }
    : null;
};

function CreatorSourceMark({
  source,
}: {
  source: "bags" | "twitter" | "wallet";
}) {
  if (source === "twitter") {
    return (
      <span
        aria-label="Twitter creator"
        className="grid size-5 shrink-0 place-items-center rounded bg-[#1d9bf0] text-[10px] font-bold text-white"
        title="Twitter creator"
      >
        X
      </span>
    );
  }

  if (source === "bags") {
    return (
      <span
        aria-label="Bags creator"
        className="grid size-5 shrink-0 place-items-center rounded bg-white text-[10px] font-bold text-black"
        title="Bags creator"
      >
        B
      </span>
    );
  }

  return (
    <span
      aria-label="Wallet creator"
      className="grid size-5 shrink-0 place-items-center rounded bg-[#111827] text-[10px] font-bold text-zinc-300"
      title="Wallet creator"
    >
      #
    </span>
  );
}

export function CreatorCell({ token }: { token: BagsTableRow }) {
  const profile = getCreatorProfile(token.creator);

  if (!profile) {
    return <span className="text-sm text-slate-500">-</span>;
  }

  const content = (
    <>
      {token.creator?.pfp ? (
        <Image
          alt=""
          className="size-6 shrink-0 rounded-full object-cover"
          height={24}
          unoptimized
          src={token.creator.pfp}
          width={24}
        />
      ) : (
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#111827] text-zinc-300">
          <UserRound className="size-3.5" />
        </span>
      )}
      <span className="truncate text-sm font-semibold text-zinc-100">
        {profile.label}
      </span>
      <CreatorSourceMark source={profile.source} />
    </>
  );

  return profile.href ? (
    <a
      className="flex min-w-0 items-center gap-2 hover:text-white"
      href={profile.href}
      rel="noreferrer"
      target="_blank"
    >
      {content}
    </a>
  ) : (
    <div className="flex min-w-0 items-center gap-2">{content}</div>
  );
}
