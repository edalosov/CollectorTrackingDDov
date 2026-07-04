import { eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { db } from "@/lib/db";
import { collections, wallets, holdings, tokens, activity } from "@/lib/db/schema";
import {
  getOwnersForContract,
  getNFTMetadataBatch,
  getRecentTransfers,
  getRecentSales,
} from "@/lib/alchemy";

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
  newActivityCount: number;
  metadataWarning: string | null;
  activityWarning: string | null;
}

// Full refresh of one collection: current owners/tokens (replaced wholesale)
// plus recent transfer/sale activity (appended, never deleted). Ownership
// data is the primary value, so a failure fetching metadata or activity is
// downgraded to a warning rather than failing the whole sync.
export async function syncCollection(collection: {
  id: number;
  address: string;
}): Promise<SyncResult> {
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

  let transfers: Awaited<ReturnType<typeof getRecentTransfers>> = [];
  let sales: Awaited<ReturnType<typeof getRecentSales>> = [];
  let activityWarning: string | null = null;
  try {
    [transfers, sales] = await Promise.all([
      getRecentTransfers(collection.address),
      getRecentSales(collection.address),
    ]);
  } catch (err) {
    activityWarning =
      err instanceof Error ? err.message : "Alchemy activity request failed";
    console.error("Failed to fetch transfer/sale activity:", err);
  }

  const salesByTxToken = new Map<string, (typeof sales)[number]>();
  for (const sale of sales) {
    salesByTxToken.set(`${sale.txHash}:${sale.tokenId}`, sale);
  }

  const activityRows = transfers.map((t) => {
    const sale = salesByTxToken.get(`${t.txHash}:${t.tokenId}`);
    return {
      collectionId: collection.id,
      tokenId: t.tokenId,
      fromAddress: t.fromAddress,
      toAddress: t.toAddress,
      txHash: t.txHash,
      logIndex: t.logIndex,
      blockNumber: t.blockNumber,
      blockTimestamp: t.blockTimestamp ? new Date(t.blockTimestamp) : null,
      isSale: Boolean(sale),
      marketplace: sale?.marketplace ?? null,
      priceWei: sale?.priceWei ?? null,
      priceSymbol: sale?.priceSymbol ?? null,
    };
  });

  const allWalletAddresses = [
    ...new Set([
      ...uniqueHolders,
      ...activityRows.flatMap((a) => [a.fromAddress, a.toAddress]),
    ]),
  ];

  // Replace the collection's holdings/tokens snapshot in one atomic batch:
  // this is a full-refresh sync (not incremental), so stale rows must go
  // before new ones land. Activity rows are append-only (never deleted).
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

  for (const group of chunk(activityRows, CHUNK_SIZE)) {
    operations.push(db.insert(activity).values(group).onConflictDoNothing());
  }

  operations.push(
    db
      .update(collections)
      .set({ lastSyncedAt: new Date() })
      .where(eq(collections.id, collection.id)),
  );

  await db.batch(operations as [BatchItem<"pg">, ...BatchItem<"pg">[]]);

  return {
    collectionId: collection.id,
    address: collection.address,
    holderCount: uniqueHolders.length,
    tokenCount: ownerHoldings.length,
    newActivityCount: activityRows.length,
    metadataWarning,
    activityWarning,
  };
}
