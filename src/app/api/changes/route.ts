import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { collections, collectors, ownershipChanges, tokens, wallets } from "@/lib/db/schema";

const LIMIT = 50;

export async function GET() {
  const rows = await db
    .select({
      id: ownershipChanges.id,
      collectionId: ownershipChanges.collectionId,
      collectionName: collections.name,
      collectionAddress: collections.address,
      tokenId: ownershipChanges.tokenId,
      tokenName: tokens.name,
      tokenImageUrl: tokens.imageUrl,
      walletAddress: ownershipChanges.walletAddress,
      walletNickname: collectors.name,
      previousBalance: ownershipChanges.previousBalance,
      newBalance: ownershipChanges.newBalance,
      detectedAt: ownershipChanges.detectedAt,
    })
    .from(ownershipChanges)
    .innerJoin(collections, eq(collections.id, ownershipChanges.collectionId))
    .leftJoin(
      tokens,
      and(
        eq(tokens.collectionId, ownershipChanges.collectionId),
        eq(tokens.tokenId, ownershipChanges.tokenId),
      ),
    )
    .leftJoin(wallets, eq(wallets.address, ownershipChanges.walletAddress))
    .leftJoin(collectors, eq(collectors.id, wallets.collectorId))
    .orderBy(desc(ownershipChanges.detectedAt), desc(ownershipChanges.id))
    .limit(LIMIT);

  return NextResponse.json(rows);
}
