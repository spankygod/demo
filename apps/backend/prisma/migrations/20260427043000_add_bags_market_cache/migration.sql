CREATE TABLE "BagsToken" (
    "id" TEXT NOT NULL,
    "tokenMint" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "description" TEXT,
    "image" TEXT,
    "status" TEXT NOT NULL,
    "migrationStatus" TEXT NOT NULL DEFAULT 'launching',
    "website" TEXT,
    "twitter" TEXT,
    "uri" TEXT,
    "launchSignature" TEXT,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BagsToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BagsPool" (
    "id" TEXT NOT NULL,
    "tokenMint" TEXT NOT NULL,
    "dbcConfigKey" TEXT,
    "dbcPoolKey" TEXT,
    "dammV2PoolKey" TEXT,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BagsPool_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TokenCreator" (
    "id" TEXT NOT NULL,
    "tokenMint" TEXT NOT NULL,
    "wallet" TEXT,
    "username" TEXT,
    "pfp" TEXT,
    "provider" TEXT,
    "providerUsername" TEXT,
    "twitterUsername" TEXT,
    "bagsUsername" TEXT,
    "royaltyBps" INTEGER,
    "isCreator" BOOLEAN,
    "isAdmin" BOOLEAN,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TokenCreator_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TokenMarketSnapshot" (
    "id" TEXT NOT NULL,
    "tokenMint" TEXT NOT NULL,
    "quoteMint" TEXT NOT NULL,
    "outAmount" TEXT,
    "priceImpactPct" TEXT,
    "lifetimeFeesLamports" TEXT,
    "marketSignal" DOUBLE PRECISION,
    "migrationStatus" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawQuote" JSONB,

    CONSTRAINT "TokenMarketSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketNews" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "tokenMint" TEXT,
    "headline" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "href" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketNews_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "rowsRead" INTEGER NOT NULL DEFAULT 0,
    "rowsWritten" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BagsToken_tokenMint_key" ON "BagsToken"("tokenMint");
CREATE INDEX "BagsToken_symbol_idx" ON "BagsToken"("symbol");
CREATE INDEX "BagsToken_name_idx" ON "BagsToken"("name");
CREATE INDEX "BagsToken_status_idx" ON "BagsToken"("status");
CREATE INDEX "BagsToken_migrationStatus_idx" ON "BagsToken"("migrationStatus");
CREATE UNIQUE INDEX "BagsPool_tokenMint_key" ON "BagsPool"("tokenMint");
CREATE INDEX "TokenCreator_tokenMint_idx" ON "TokenCreator"("tokenMint");
CREATE UNIQUE INDEX "TokenCreator_tokenMint_wallet_key" ON "TokenCreator"("tokenMint", "wallet");
CREATE INDEX "TokenMarketSnapshot_tokenMint_capturedAt_idx" ON "TokenMarketSnapshot"("tokenMint", "capturedAt");
CREATE INDEX "TokenMarketSnapshot_capturedAt_idx" ON "TokenMarketSnapshot"("capturedAt");
CREATE UNIQUE INDEX "MarketNews_sourceKey_key" ON "MarketNews"("sourceKey");
CREATE INDEX "MarketNews_tokenMint_idx" ON "MarketNews"("tokenMint");
CREATE INDEX "MarketNews_createdAt_idx" ON "MarketNews"("createdAt");

ALTER TABLE "BagsPool" ADD CONSTRAINT "BagsPool_tokenMint_fkey" FOREIGN KEY ("tokenMint") REFERENCES "BagsToken"("tokenMint") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TokenCreator" ADD CONSTRAINT "TokenCreator_tokenMint_fkey" FOREIGN KEY ("tokenMint") REFERENCES "BagsToken"("tokenMint") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TokenMarketSnapshot" ADD CONSTRAINT "TokenMarketSnapshot_tokenMint_fkey" FOREIGN KEY ("tokenMint") REFERENCES "BagsToken"("tokenMint") ON DELETE CASCADE ON UPDATE CASCADE;
