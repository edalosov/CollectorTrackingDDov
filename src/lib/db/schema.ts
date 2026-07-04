import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const collections = pgTable("collections", {
  id: serial("id").primaryKey(),
  address: text("address").notNull().unique(), // lowercase 0x... contract address
  name: text("name"),
  symbol: text("symbol"),
  tokenType: text("token_type"), // "ERC721" | "ERC1155"
  addedAt: timestamp("added_at").defaultNow().notNull(),
  lastSyncedAt: timestamp("last_synced_at"),
});

// A collector is a person, who may control more than one wallet address.
// The nickname lives here rather than on an individual wallet, so multiple
// addresses can be merged under one name with their holdings combined.
export const collectors = pgTable("collectors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const wallets = pgTable("wallets", {
  address: text("address").primaryKey(), // lowercase 0x...
  collectorId: integer("collector_id").references(() => collectors.id, {
    onDelete: "set null",
  }),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const holdings = pgTable(
  "holdings",
  {
    id: serial("id").primaryKey(),
    collectionId: integer("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    walletAddress: text("wallet_address")
      .notNull()
      .references(() => wallets.address, { onDelete: "cascade" }),
    tokenId: text("token_id").notNull(), // stored as text, can exceed JS number range
    balance: integer("balance").notNull().default(1), // >1 possible for ERC1155
  },
  (table) => [
    uniqueIndex("holdings_collection_token_wallet_idx").on(
      table.collectionId,
      table.tokenId,
      table.walletAddress,
    ),
    index("holdings_collection_idx").on(table.collectionId),
    index("holdings_wallet_idx").on(table.walletAddress),
  ],
);

export const tokens = pgTable(
  "tokens",
  {
    id: serial("id").primaryKey(),
    collectionId: integer("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    tokenId: text("token_id").notNull(),
    name: text("name"),
    imageUrl: text("image_url"),
  },
  (table) => [
    uniqueIndex("tokens_collection_token_idx").on(
      table.collectionId,
      table.tokenId,
    ),
  ],
);

// Derived by diffing each sync's freshly-fetched ownership snapshot against
// what was stored from the previous sync — no separate transfer/sale API
// calls involved, just a comparison of our own data.
export const ownershipChanges = pgTable(
  "ownership_changes",
  {
    id: serial("id").primaryKey(),
    collectionId: integer("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    tokenId: text("token_id").notNull(),
    walletAddress: text("wallet_address")
      .notNull()
      .references(() => wallets.address, { onDelete: "cascade" }),
    previousBalance: integer("previous_balance").notNull(),
    newBalance: integer("new_balance").notNull(),
    detectedAt: timestamp("detected_at").notNull(),
  },
  (table) => [
    index("ownership_changes_collection_idx").on(table.collectionId),
    index("ownership_changes_detected_idx").on(table.detectedAt),
  ],
);
