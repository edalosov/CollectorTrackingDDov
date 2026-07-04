import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { collections, holdings, wallets } from "@/lib/db/schema";
import { normalizeAddress } from "@/lib/address";

export async function GET(
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

  const rows = await db
    .select({
      walletAddress: holdings.walletAddress,
      nickname: wallets.nickname,
      tokenId: holdings.tokenId,
      balance: holdings.balance,
    })
    .from(holdings)
    .leftJoin(wallets, eq(wallets.address, holdings.walletAddress))
    .where(eq(holdings.collectionId, collection.id));

  const byWallet = new Map<
    string,
    { nickname: string | null; tokenCount: number; tokenIds: string[] }
  >();

  for (const row of rows) {
    const entry = byWallet.get(row.walletAddress) ?? {
      nickname: row.nickname,
      tokenCount: 0,
      tokenIds: [],
    };
    entry.tokenCount += row.balance;
    entry.tokenIds.push(row.tokenId);
    byWallet.set(row.walletAddress, entry);
  }

  const holders = [...byWallet.entries()]
    .map(([walletAddress, v]) => ({ walletAddress, ...v }))
    .sort((a, b) => b.tokenCount - a.tokenCount);

  return NextResponse.json({ collection, holders });
}
