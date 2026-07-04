import { eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { db } from "@/lib/db";
import {
  collections,
  wallets,
  holdings,
  tokens,
  ownershipChanges,
} from "@/lib/db/schema";
import { getOwnersForContract, getNFTMetadataBatch } from "@/lib/alchemy";

const CHUNK_SIZE = 1000;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export interface SyncResult {
  collectionId: number;
  address: string;
  holderCount: number;
  tokenCount: number;
  changeCount: number;
  metadataWarning: string | null;
}

// Full refresh of one collection: current owners/tokens (replaced wholesale).
// Also derives a change log by diffing this fresh snapshot against whatever
// was stored from the previous sync — no extra Alchemy calls needed for
// that, just a comparison of our own data. On the very first sync for a
// collection (no previous snapshot to diff against) nothing is logged,
// since "everything is new" isn't a useful change log entry.
export async function syncCollection(collection: {
  id: number;
  address: string;
  lastSyncedAt: Date | null;
}): Promise<SyncResult> {
  const isFirstSync = collection.lastSyncedAt === null;

  const previousHoldings = isFirstSync
    ? []
    : await db
        .select({
          tokenId: holdings.tokenId,
          walletAddress: holdings.walletAddress,
          balance: holdings.balance,
        })
        .from(holdings)
        .where(eq(holdings.collectionId, collection.id));

  const ownerHoldings = await getOwnersForContract(collection.address);

  const uniqueHolders = [...new Set(ownerHoldings.map((h) => h.ownerAddress))];
  const uniqueTokenIds = [...new Set(ownerHoldings.map((h) => h.tokenId))];

  let tokenMetadata: Awaited<ReturnType<typeof getNFTMetadataBatch>> = [];
  let metadataWarning: string | null = null;
  try {
    tokenMetadata = await getNFTMetadataBatch(collection.address, uniqueTokenIds);
  } catch (err) {
    metadataWarning =
      err instanceof Error ? err.message : "Alchemy metadata request failed";
    console.error("Failed to fetch NFT metadata/images:", err);
  }

  // Diff previous vs. new balances per (tokenId, wallet). This naturally
  // captures ERC721 transfers as a pair of rows (one wallet -1, another +1)
  // and ERC1155 partial balance moves as single rows, with no need for any
  // separate transfer/sale API call.
  const previousBalanceByKey = new Map<string, number>();
  for (const h of previousHoldings) {
    previousBalanceByKey.set(`${h.tokenId}:${h.walletAddress}`, h.balance);
  }

  const newBalanceByKey = new Map<string, number>();
  for (const h of ownerHoldings) {
    const key = `${h.tokenId}:${h.ownerAddress}`;
    newBalanceByKey.set(key, (newBalanceByKey.get(key) ?? 0) + h.balance);
  }

  const syncedAt = new Date();
  const changedKeys = new Set([
    ...previousBalanceByKey.keys(),
    ...newBalanceByKey.keys(),
  ]);

  const changeRows = isFirstSync
    ? []
    : [...changedKeys]
        .map((key) => {
          const separatorIndex = key.lastIndexOf(":");
          return {
            tokenId: key.slice(0, separatorIndex),
            walletAddress: key.slice(separatorIndex + 1),
            previousBalance: previousBalanceByKey.get(key) ?? 0,
            newBalance: newBalanceByKey.get(key) ?? 0,
          };
        })
        .filter((c) => c.previousBalance !== c.newBalance)
        .map((c) => ({
          collectionId: collection.id,
          tokenId: c.tokenId,
          walletAddress: c.walletAddress,
          previousBalance: c.previousBalance,
          newBalance: c.newBalance,
          detectedAt: syncedAt,
        }));

  const allWalletAddresses = [
    ...new Set([
      ...uniqueHolders,
      ...previousHoldings.map((h) => h.walletAddress),
    ]),
  ];

  // Replace the collection's holdings/tokens snapshot in one atomic batch:
  // this is a full-refresh sync (not incremental), so stale rows must go
  // before new ones land. Change log rows are append-only (never deleted).
  const operations: BatchItem<"pg">[] = [
    db.delete(holdings).where(eq(holdings.collectionId, collection.id)),
    db.delete(tokens).where(eq(tokens.collectionId, collection.id)),
  ];

  for (const group of chunk(allWalletAddresses, CHUNK_SIZE)) {
    operations.push(
      db
        .insert(wallets)
        .values(group.map((walletAddress) => ({ address: walletAddress })))
        .onConflictDoNothing({ target: wallets.address }),
    );
  }

  for (const group of chunk(ownerHoldings, CHUNK_SIZE)) {
    operations.push(
      db
        .insert(holdings)
        .values(
          group.map((h) => ({
            collectionId: collection.id,
            walletAddress: h.ownerAddress,
            tokenId: h.tokenId,
            balance: h.balance,
          })),
        )
        .onConflictDoNothing(),
    );
  }

  for (const group of chunk(tokenMetadata, CHUNK_SIZE)) {
    operations.push(
      db
        .insert(tokens)
        .values(
          group.map((t) => ({
            collectionId: collection.id,
            tokenId: t.tokenId,
            name: t.name,
            imageUrl: t.imageUrl,
          })),
        )
        .onConflictDoNothing({ target: [tokens.collectionId, tokens.tokenId] }),
    );
  }

  for (const group of chunk(changeRows, CHUNK_SIZE)) {
    operations.push(db.insert(ownershipChanges).values(group));
  }

  operations.push(
    db
      .update(collections)
      .set({ lastSyncedAt: syncedAt })
      .where(eq(collections.id, collection.id)),
  );

  await db.batch(operations as [BatchItem<"pg">, ...BatchItem<"pg">[]]);

  return {
    collectionId: collection.id,
    address: collection.address,
    holderCount: uniqueHolders.length,
    tokenCount: ownerHoldings.length,
    changeCount: changeRows.length,
    metadataWarning,
  };
}
