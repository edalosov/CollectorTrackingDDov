# Collector Tracker

A personal tool for tracking who holds NFTs from Ethereum contracts you care about:
add a contract address, sync current owners from Alchemy, and browse/filter/nickname
holders across all your tracked collections.

## How it works

- **Collections** (`/collections`): add/remove the contract addresses you want to
  track. Each has a manual **Sync** button that pulls the current owner list from
  Alchemy's NFT API and replaces the stored snapshot for that collection.
- **Collection detail** (`/collections/[address]`): every holder of that
  collection, how many tokens they hold, and which specific token IDs.
- **Collectors** (`/`): an aggregate view across every tracked collection, with
  filters for collection, min/max NFTs owned, and address/nickname search.
- Any wallet address can be given a **nickname** (click it inline anywhere it
  appears) so you can recognize collectors without memorizing addresses.

Syncing is manual only — nothing polls in the background, so you control when
API calls happen.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Postgres via [Neon](https://neon.tech) (Vercel's native Postgres integration),
  accessed with [Drizzle ORM](https://orm.drizzle.team)
- [Alchemy NFT API](https://www.alchemy.com/docs/reference/nft-api-endpoints) for
  contract metadata and owner/token data (Ethereum mainnet only)

## Local setup

1. **Get an Alchemy API key**: sign up at [alchemy.com](https://www.alchemy.com/),
   create an app on **Ethereum Mainnet**, and copy the API key.
2. **Get a Postgres database**: easiest is a free [Neon](https://neon.tech) project
   (or provision Postgres from your Vercel dashboard, which is backed by Neon) —
   copy the connection string.
3. Copy `.env.example` to `.env.local` and fill in both values:
   ```bash
   cp .env.example .env.local
   ```
4. Install dependencies and push the schema to your database:
   ```bash
   npm install
   npm run db:push
   ```
5. Run the dev server:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000).

## Deploying to Vercel

1. Push this repo to GitHub and import it in Vercel.
2. In the Vercel dashboard, add a Postgres database to the project (Storage tab →
   Postgres, powered by Neon) — this auto-injects `DATABASE_URL` into your
   deployment's environment variables.
3. Add an `ALCHEMY_API_KEY` environment variable in the project settings.
4. After the first deploy, run the schema push once against the production
   database (from your machine, with the production `DATABASE_URL` in your
   shell env): `npm run db:push`.
5. Redeploy. The app has no login/auth — treat the deployment URL as something
   only you should have, since anyone with the link can view and edit the data.

## Database schema notes

- `collections`: one row per tracked contract address.
- `wallets`: one row per Ethereum address ever seen holding something, plus its
  optional nickname.
- `holdings`: one row per (collection, token ID, wallet) — the source of truth
  for "who owns what." Each sync fully replaces the rows for that collection.

## Useful scripts

- `npm run db:generate` — generate a SQL migration from schema changes.
- `npm run db:migrate` — apply generated migrations.
- `npm run db:push` — push the schema directly without migration files (fastest
  for solo iteration).
- `npm run db:studio` — open Drizzle Studio to browse the database.
