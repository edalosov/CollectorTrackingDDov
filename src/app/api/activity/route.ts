import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { activity, collections, tokens, wallets } from "@/lib/db/schema";

const LIMIT = 50;

export async function GET() {
  const fromWallet = alias(wallets, "from_wallet");
  const toWallet = alias(wallets, "to_wallet");

  const rows = await db
    .select({
      id: activity.id,
      collectionId: activity.collectionId,
      collectionName: collections.name,
      collectionAddress: collections.address,
      tokenId: activity.tokenId,
      tokenName: tokens.name,
      tokenImageUrl: tokens.imageUrl,
      fromAddress: activity.fromAddress,
      fromNickname: fromWallet.nickname,
      toAddress: activity.toAddress,
      toNickname: toWallet.nickname,
      txHash: activity.txHash,
      blockNumber: activity.blockNumber,
      blockTimestamp: activity.blockTimestamp,
      isSale: activity.isSale,
      marketplace: activity.marketplace,
      priceWei: activity.priceWei,
      priceSymbol: activity.priceSymbol,
    })
    .from(activity)
    .innerJoin(collections, eq(collections.id, activity.collectionId))
    .leftJoin(
      tokens,
      and(
        eq(tokens.collectionId, activity.collectionId),
        eq(tokens.tokenId, activity.tokenId),
      ),
    )
    .leftJoin(fromWallet, eq(fromWallet.address, activity.fromAddress))
    .leftJoin(toWallet, eq(toWallet.address, activity.toAddress))
    .orderBy(desc(activity.blockNumber), desc(activity.logIndex))
    .limit(LIMIT);

  return NextResponse.json(rows);
}
