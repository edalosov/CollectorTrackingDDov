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

## Deploying to Vercel (no local setup required)

The database schema is created automatically on every deploy — `npm run build`
runs `drizzle-kit migrate` (applying the committed SQL files in `./drizzle`)
before `next build`, so there's no manual migration step to run yourself,
locally or otherwise.

1. **Get an Alchemy API key**: sign up at [alchemy.com](https://www.alchemy.com/),
   create an app on **Ethereum Mainnet**, and copy the API key.
2. Push this repo to GitHub (if it isn't already) and import it in Vercel.
3. In the Vercel dashboard, add a Postgres database to the project (Storage tab →
   Postgres, powered by Neon) — this auto-injects `DATABASE_URL` into the
   project's environment variables for you.
4. In Project Settings → Environment Variables, add `ALCHEMY_API_KEY` with the
   key from step 1.
5. Deploy (or redeploy if it already ran before you added the env vars). The
   build will create the `collections`/`wallets`/`holdings` tables in your new
   database automatically, then build the app.
6. The app has no login/auth — treat the deployment URL as something only you
   should have, since anyone with the link can view and edit the data.

## Local setup (optional)

If you ever want to run it on your own machine instead:

1. Copy `.env.example` to `.env.local` and fill in `DATABASE_URL` and
   `ALCHEMY_API_KEY`.
2. `npm install`
3. `npm run dev` — the dev server does **not** auto-run migrations, so the
   first time against a fresh database run `npm run db:push` once.
4. Open [http://localhost:3000](http://localhost:3000).

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
