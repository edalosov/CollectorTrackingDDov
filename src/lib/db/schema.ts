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

export const wallets = pgTable("wallets", {
  address: text("address").primaryKey(), // lowercase 0x...
  nickname: text("nickname"),
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
