# Astralmarket

Astralmarket is a Bags.fm market-intelligence product for tracking new token launches, live DBC pools, migrated DAMM v2 markets, and token-level market movement.

The product combines Bags launch data with market enrichment from DexScreener, Solana RPC supply lookups, and cached historical snapshots. The web experience presents a CoinGecko-style market dashboard and token detail pages built specifically around Bags-native activity.

## Product Overview

Astralmarket is designed for users who want to evaluate Bags token activity without manually checking launch feeds, pool state, and market data across separate sources.

Core product surfaces:

- Market leaderboard with rank, price, 1h/24h/7d movement, volume, market cap, and 7-day sparkline history.
- Bags launch and pool state visibility across fresh launches, live DBC pools, and migrated DAMM v2 pools.
- Token detail pages with market charting, pool metadata, route/source data, creator information, and derived Bags market signals.
- Latest Bags signals and optional crypto news enrichment for market context.
- Cache-first backend API designed to keep the web app fast while scheduled sync jobs refresh market data.

## Architecture

This repository is a pnpm/Turbo monorepo.

```text
apps/web       Next.js app deployed on Vercel
apps/backend   Fastify API deployed on a VPS/Droplet
apps/docs      Non-product starter docs app
packages/*     Shared UI, ESLint, and TypeScript configuration
```

Runtime flow:

```text
User
  -> Vercel web app
    -> cached server-side fetches
      -> Fastify backend
        -> Postgres/Supabase
        -> Bags API
        -> DexScreener
        -> Solana RPC
        -> optional FMP crypto news
```

The backend stores synchronized token, pool, creator, market snapshot, news, and sync-run data in Postgres through Prisma.

## Backend Capabilities

The Fastify backend provides:

- Scheduled Bags market sync jobs.
- Manual admin sync trigger.
- Cache-first market leaderboard responses.
- Token detail lookup by mint, symbol, or name slug.
- DexScreener price, market-cap, volume, liquidity, and image enrichment.
- Solana RPC supply lookup for fallback market-cap calculations.
- Derived price-change fallback from historical snapshots.
- 7-day market-history sampling for table sparklines and coin detail charts.
- Optional FMP crypto news ingestion with daily request limiting.

Primary API routes:

```text
GET  /health
GET  /v1/bags/category
GET  /v1/bags/market?page=1&limit=50
GET  /v1/bags/coins/:identifier
POST /v1/admin/sync/bags
```

API responses use a common envelope:

```json
{
  "success": true,
  "response": {}
}
```

## Web Capabilities

The Next.js web app provides:

- Market dashboard with global Bags stats.
- Paginated token leaderboard.
- Rich SVG sparklines based on cached price history.
- Trending and top-gainer highlight panels.
- Latest Bags signal rail and crypto news gallery.
- Coin detail pages with a 7-day market chart, price snapshot count, pool data, source data, and creator context.
- Vercel server-side fetch caching for public market endpoints.

Configured cache windows:

```text
/v1/bags/market              30 seconds
/v1/bags/category            300 seconds
/v1/bags/coins/:identifier   60 seconds
```

## Environment

Backend environment file:

```text
apps/backend/.env
```

Required backend values:

```env
NODE_ENV="production"
HOST="127.0.0.1"
PORT="4000"
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."
BAGS_API_KEY="..."
ADMIN_SYNC_SECRET="..."
BAGS_SYNC_ENABLED="true"
BAGS_SYNC_INTERVAL_MINUTES="30"
BAGS_SYNC_ON_START="true"
SOLANA_RPC_URL="https://api.mainnet-beta.solana.com"
```

Optional backend values:

```env
NEWS_API_KEY=""
FMP_NEWS_DAILY_REQUEST_LIMIT="200"
```

Web environment value:

```env
ASTRALMARKET_API_BASE_URL="https://api.astralmarket.xyz"
```

This value is server-side only in the Next.js app. It does not need a `NEXT_PUBLIC_` prefix.

## Local Development

Install dependencies:

```sh
pnpm install
```

Create backend env:

```sh
cp apps/backend/.env.example apps/backend/.env
```

Run backend and web together:

```sh
pnpm dev:apps
```

Default local services:

```text
Web:         http://localhost:3000
Backend API: http://127.0.0.1:4000
```

Run individual apps:

```sh
pnpm --filter web dev
pnpm --filter backend dev
```

## Database

Prisma schema and migrations live in:

```text
apps/backend/prisma
```

Generate Prisma client:

```sh
pnpm --filter backend exec prisma generate
```

Apply migrations:

```sh
pnpm --filter backend exec prisma migrate deploy
```

## Data Sync

Run a manual sync script:

```sh
pnpm --filter backend sync:bags
```

Trigger sync through the admin API:

```sh
curl -X POST https://api.astralmarket.xyz/v1/admin/sync/bags \
  -H "x-admin-sync-secret: <ADMIN_SYNC_SECRET>"
```

`ADMIN_SYNC_SECRET` should always be set in production.

## Deployment Model

Recommended production shape:

```text
Web:      Vercel
Backend:  DigitalOcean Droplet, Singapore region if Supabase is in Asia
Database: Supabase/Postgres
Proxy:    Caddy -> Fastify on 127.0.0.1:4000
Process:  systemd
```

The backend should run behind HTTPS at an API subdomain such as:

```text
https://api.astralmarket.xyz
```

Then Vercel should set:

```env
ASTRALMARKET_API_BASE_URL="https://api.astralmarket.xyz"
```

## Quality Checks

Type-check all packages:

```sh
pnpm check-types
```

Lint all packages:

```sh
pnpm lint
```

Run backend ranking tests:

```sh
pnpm --filter backend test:ranking
```

Build all packages:

```sh
pnpm build
```

## Evaluation Notes

Market graph richness depends on accumulated backend snapshots. With a 30-minute sync interval, a full 7-day chart window requires several days of scheduled sync history. Early deployments may show sparse charts until enough market snapshots are collected.

The product is intentionally cache-first: public web pages can remain responsive while backend sync jobs refresh token, pool, price, and news data in the background.
