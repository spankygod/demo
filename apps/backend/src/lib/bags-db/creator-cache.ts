import type { PrismaClient } from "@prisma/client";

import { bagsClient } from "../bags-client";
import { upsertCachedCreators } from "./coins";
import {
  creatorSelect,
  type CachedLeaderboardRow,
  type TokenCreatorView,
} from "./shared";

const creatorFetchChunkSize = 10;

type TokenCreatorWithMint = TokenCreatorView & {
  tokenMint: string;
};

const chunk = <T>(items: T[], size: number) => {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
};

const getPreferredCreator = (creators: TokenCreatorView[]) =>
  creators.find((creator) => creator.isCreator === true) ??
  creators.at(0) ??
  null;

export const cacheTokenCreators = async (
  prisma: PrismaClient,
  tokenMints: string[],
) => {
  const uniqueTokenMints = [...new Set(tokenMints)];

  for (const tokenMintChunk of chunk(uniqueTokenMints, creatorFetchChunkSize)) {
    await Promise.allSettled(
      tokenMintChunk.map(async (tokenMint) => {
        const creators = await bagsClient.getTokenLaunchCreators(tokenMint);

        if (creators.length > 0) {
          await upsertCachedCreators(
            prisma,
            tokenMint,
            creators as Array<Record<string, unknown>>,
          );
        }
      }),
    );
  }
};

export const getHydratedCreatorsForRows = async (
  prisma: PrismaClient,
  rows: CachedLeaderboardRow[],
) => {
  const tokenMints = rows.map((row) => row.tokenMint);
  const missingCreatorMints = rows
    .filter((row) => row.token.creators.length === 0)
    .map((row) => row.tokenMint);

  if (missingCreatorMints.length > 0) {
    await cacheTokenCreators(prisma, missingCreatorMints);
  }

  const creators = (await prisma.tokenCreator.findMany({
    where: {
      tokenMint: {
        in: tokenMints,
      },
    },
    orderBy: [
      {
        isCreator: "desc",
      },
      {
        createdAt: "asc",
      },
    ],
    select: {
      tokenMint: true,
      ...creatorSelect,
    },
  })) as TokenCreatorWithMint[];
  const creatorsByMint = new Map<string, TokenCreatorView[]>();

  for (const creator of creators) {
    const mintCreators = creatorsByMint.get(creator.tokenMint) ?? [];
    const { tokenMint: _tokenMint, ...creatorView } = creator;

    mintCreators.push(creatorView);
    creatorsByMint.set(creator.tokenMint, mintCreators);
  }

  return new Map(
    tokenMints.map((tokenMint) => [
      tokenMint,
      getPreferredCreator(creatorsByMint.get(tokenMint) ?? []),
    ]),
  );
};
