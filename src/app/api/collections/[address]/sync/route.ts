import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { db } from "@/lib/db";
import { collections, wallets, holdings } from "@/lib/db/schema";
import { getOwnersForContract } from "@/lib/alchemy";
import { normalizeAddress } from "@/lib/address";

const CHUNK_SIZE = 1000;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  const address = normalizeAddress((await params).address);

  const [collection] = await db
    .select()
    .from(collections)
    .where(eq(collections.address, address));
  if (!collection) {
    return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  }

  let ownerHoldings;
  try {
    ownerHoldings = await getOwnersForContract(address);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Alchemy request failed" },
      { status: 502 },
    );
  }

  const uniqueWallets = [...new Set(ownerHoldings.map((h) => h.ownerAddress))];

  // Replace the collection's holdings snapshot in one atomic batch: this is a
  // full-refresh sync (not incremental), so stale rows must go before new ones land.
  const operations: BatchItem<"pg">[] = [
    db.delete(holdings).where(eq(holdings.collectionId, collection.id)),
  ];

  for (const group of chunk(uniqueWallets, CHUNK_SIZE)) {
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

  operations.push(
    db
      .update(collections)
      .set({ lastSyncedAt: new Date() })
      .where(eq(collections.id, collection.id)),
  );

  await db.batch(operations as [BatchItem<"pg">, ...BatchItem<"pg">[]]);

  return NextResponse.json({
    holderCount: uniqueWallets.length,
    tokenCount: ownerHoldings.length,
  });
}
