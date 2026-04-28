# Astralmarket

Astralmarket is a Bags.fm market-intelligence app. The web app renders Bags token leaderboards and coin detail pages, while the backend syncs Bags launch and pool data into Postgres and enriches it with DexScreener and Solana RPC market data.

## Workspace

This repository is a pnpm/Turbo monorepo.

- `apps/web` - Next.js frontend for the market leaderboard and coin pages.
- `apps/backend` - Fastify API with Prisma/Postgres storage and Bags market sync jobs.
- `apps/docs` - starter documentation app, currently not product-facing.
- `packages/ui` - shared React component package.
- `packages/eslint-config` and `packages/typescript-config` - shared repo configuration.

## Requirements

- Node.js 18 or newer
- pnpm 9
- PostgreSQL database, typically Supabase
- Bags API key for live sync and fallback API reads

## Setup

Install dependencies from the repository root:

```sh
pnpm install
```

Create backend environment files:

```sh
cp apps/backend/.env.example apps/backend/.env
```

Update `apps/backend/.env` with database and Bags API credentials.

For the web app, set `ASTRALMARKET_API_BASE_URL` if the backend is not running on the default `http://127.0.0.1:4000`.

## Development

Run the web and backend apps together:

```sh
pnpm dev:apps
```

The default local services are:

- Web: `http://localhost:3000`
- Backend API: `http://127.0.0.1:4000`

Run individual apps when needed:

```sh
pnpm --filter web dev
pnpm --filter backend dev
```

## Database

The Prisma schema and migrations live in `apps/backend/prisma`.

Generate the Prisma client:

```sh
pnpm --filter backend exec prisma generate
```

Apply migrations:

```sh
pnpm --filter backend exec prisma migrate deploy
```

For local migration work, use Prisma from the backend package directory so it can load `apps/backend/prisma.config.ts`.

## Data Sync

The backend can sync Bags market data through a scheduled job or a manual admin endpoint.

Manual script:

```sh
pnpm --filter backend sync:bags
```

Manual API trigger:

```sh
curl -X POST http://127.0.0.1:4000/v1/admin/sync/bags \
  -H "x-admin-sync-secret: <ADMIN_SYNC_SECRET>"
```

Set `ADMIN_SYNC_SECRET` in production. If it is empty, the admin sync endpoint is not protected by this header.

Useful sync environment variables:

- `BAGS_SYNC_ENABLED` - enables the scheduler.
- `BAGS_SYNC_INTERVAL_MINUTES` - scheduler interval.
- `BAGS_SYNC_ON_START` - runs a sync when the backend starts.
- `PRICE_QUOTE_MINT` - quote mint used for Bags trade quotes.
- `SOLANA_RPC_URL` - RPC endpoint for token supply lookups.

## API Routes

Primary backend routes:

- `GET /health`
- `GET /v1/bags/category`
- `GET /v1/bags/market?page=1&limit=50`
- `GET /v1/bags/coins/:identifier`
- `POST /v1/admin/sync/bags`

API responses use a common envelope:

```json
{
  "success": true,
  "response": {}
}
```

## Checks

Run type checks:

```sh
pnpm check-types
```

Run lint:

```sh
pnpm lint
```

Run the backend leaderboard ranking test:

```sh
pnpm --filter backend test:ranking
```

Build all packages:

```sh
pnpm build
```
