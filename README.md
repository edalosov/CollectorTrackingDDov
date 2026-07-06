# Collector Tracker

A personal tool for tracking who holds NFTs from Ethereum contracts you care about:
add a contract address, sync current owners from Alchemy, and browse/filter/nickname
holders across all your tracked collections.

## How it works

- **Collections** (`/collections`): add/remove the contract addresses you want to
  track. Each has a manual **Sync** button that pulls the current owner list from
  Alchemy's NFT API and replaces the stored snapshot for that collection.
- **Collection detail** (`/collections/[address]`): every holder of that
  collection, how many tokens they hold, and a thumbnail for each specific
  NFT they own.
- **Collectors** (`/`): an aggregate view across every tracked collection, with
  filters for collection, min/max NFTs owned, and address/nickname search. A
  **Sync all collections** button re-syncs every tracked collection in one click.
  A **Comments** column next to the breakdown lets you jot free-text notes on
  any named collector (clamped to ~2 lines with a "See more" toggle so a long
  comment doesn't blow out the row); requires a nickname first, since comments
  live on the collector, not an individual wallet.
- **Change log sidebar**: a persistent right-hand panel (desktop only) showing
  holder balance changes detected between syncs (e.g. "wallet X: 2 → 1", "wallet
  Y: 0 → 1") for every tracked collection. Polls every 20s; new data only shows
  up after a sync. This is derived entirely from diffing each sync's ownership
  snapshot against the previous one — no separate Alchemy call, so it costs
  nothing extra. A collection's first-ever sync never logs changes (there's no
  "previous" snapshot to diff against yet); logging starts from its second sync.
- Any wallet address can be given a **nickname** (click it inline anywhere it
  appears) so you can recognize collectors without memorizing addresses. Click
  the **+** next to a nickname to add another wallet address under the same
  name — useful when you know someone splits their collection across multiple
  wallets. Merged wallets show as a single row everywhere, with their holdings
  combined.
- **Custodial wallets**: click the **C** button next to any wallet's row to
  record a per-collection breakdown of who a shared/custodial wallet actually
  holds NFTs for (e.g. an exchange or vault address holding on behalf of
  several people). Two ways to split, and you can mix both per wallet:
  - **Rough count**: add a name and a number — fast, but that person's row
    shows no thumbnails since the exact tokens aren't tracked.
  - **Exact tokens**: expand "Assign specific NFTs to a name," type a name
    once, then click individual token thumbnails to assign them — that
    person's row then shows real thumbnails, tracked exactly like a normal
    wallet's holdings. Click an assigned thumbnail again to unassign it.
  A name's count comes from its assigned tokens whenever any exist, otherwise
  the rough count. The wallet's own displayed count becomes the *unallocated
  remainder* either way, and its thumbnails exclude tokens that have been
  precisely assigned to someone (so nothing is shown as "unclaimed" once it's
  known who has it). These splits are manual bookkeeping, deliberately kept
  separate from the nickname/merge system above, and don't auto-update if the
  wallet's real balance changes on a later sync (an "over-allocated" warning
  shows if your splits now add up to more than the wallet actually holds).

Syncing is manual only — nothing polls Alchemy in the background, so you
control when API calls happen. This intentionally does not track transfer
history or marketplace sale prices — just "who owned what, then vs. now" — to
keep sync cheap (2 Alchemy calls per collection, well under free-tier rate
limits) and simple.

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
- `collectors`: one row per named person, who may control more than one
  wallet. The nickname and free-text notes live here, not on an individual wallet.
- `wallets`: one row per Ethereum address ever seen holding something, with an
  optional `collectorId` linking it to a named collector. Multiple wallets
  can point at the same collector — that's how the "add another wallet under
  this nickname" feature works.
- `holdings`: one row per (collection, token ID, wallet) — the source of truth
  for "who owns what." Each sync fully replaces the rows for that collection.
- `tokens`: one row per (collection, token ID) with its name and thumbnail
  image URL, used to render NFT thumbnails next to each holder's tokens. Also
  replaced in full on each sync.
- `ownership_changes`: one row per (collection, token ID, wallet) balance
  change detected during a sync — e.g. a token moving from one wallet to
  another produces two rows (the seller's balance dropping, the buyer's
  rising). Unlike `holdings`/`tokens`, this is append-only — never deleted,
  only added to on each sync — since it's a history log, not a current-state
  snapshot.
- `custodial_allocations`: one row per (wallet, collection, name) rough
  count split — how many of a custodial wallet's NFTs in a given collection
  belong to a named person, when the exact tokens aren't known. Intentionally
  not linked to `collectors`; these are unverified bookkeeping claims, not
  on-chain fact.
- `custodial_token_assignments`: one row per (wallet, collection, token ID)
  precise split — this specific NFT belongs to this named person. A token can
  only be assigned to one person; when any exist for a name, they take
  precedence over that name's row in `custodial_allocations` for both the
  displayed count and thumbnails.

## Useful scripts

- `npm run db:generate` — generate a SQL migration from schema changes.
- `npm run db:migrate` — apply generated migrations.
- `npm run db:push` — push the schema directly without migration files (fastest
  for solo iteration).
- `npm run db:studio` — open Drizzle Studio to browse the database.
