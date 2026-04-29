CREATE TABLE "MarketLeaderboardEntry" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "rank" INTEGER NOT NULL,
  "tokenMint" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "image" TEXT,
  "metric" TEXT NOT NULL,
  "score" DOUBLE PRECISION NOT NULL,
  "price" DOUBLE PRECISION,
  "marketCap" DOUBLE PRECISION,
  "volume24h" DOUBLE PRECISION,
  "change1h" DOUBLE PRECISION,
  "change24h" DOUBLE PRECISION,
  "change7d" DOUBLE PRECISION,
  "sparkline" JSONB NOT NULL,
  "label" TEXT NOT NULL,
  "href" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'bags',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MarketLeaderboardEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketLeaderboardEntry_kind_rank_key" ON "MarketLeaderboardEntry"("kind", "rank");
CREATE UNIQUE INDEX "MarketLeaderboardEntry_kind_tokenMint_key" ON "MarketLeaderboardEntry"("kind", "tokenMint");
CREATE INDEX "MarketLeaderboardEntry_kind_rank_idx" ON "MarketLeaderboardEntry"("kind", "rank");
CREATE INDEX "MarketLeaderboardEntry_tokenMint_idx" ON "MarketLeaderboardEntry"("tokenMint");

ALTER TABLE "MarketLeaderboardEntry"
ADD CONSTRAINT "MarketLeaderboardEntry_tokenMint_fkey"
FOREIGN KEY ("tokenMint") REFERENCES "BagsToken"("tokenMint")
ON DELETE CASCADE ON UPDATE CASCADE;
