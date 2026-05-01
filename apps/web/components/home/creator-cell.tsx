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
      ? (creator.providerUsername ??
        creator.twitterUsername ??
        creator.bagsUsername ??
        creator.username)
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
        className="grid h-4 w-6 shrink-0 place-items-center"
        title="Twitter creator"
      >
        <Image
          alt=""
          className="h-4 w-auto object-contain"
          height={16}
          src="/x.svg"
          unoptimized
          width={26}
        />
      </span>
    );
  }

  if (source === "bags") {
    return (
      <span
        aria-label="Bags creator"
        className="grid h-4 w-6 shrink-0 place-items-center text-sm leading-none"
        title="Bags creator"
      >
        💰
      </span>
    );
  }

  return (
    <span
      aria-label="Wallet creator"
      className="grid h-4 w-6 shrink-0 place-items-center text-sm font-bold leading-none text-zinc-400"
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
      <CreatorSourceMark source={profile.source} />
      <span className="min-w-0 truncate text-sm font-semibold text-zinc-100">
        {profile.label}
      </span>
    </>
  );

  return profile.href ? (
    <a
      className="flex min-w-0 max-w-full items-center justify-start gap-2 hover:text-white"
      href={profile.href}
      rel="noreferrer"
      target="_blank"
    >
      {content}
    </a>
  ) : (
    <div className="flex min-w-0 max-w-full items-center justify-start gap-2">
      {content}
    </div>
  );
}
