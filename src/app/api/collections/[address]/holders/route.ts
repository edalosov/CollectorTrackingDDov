import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { collections, holdings, tokens, wallets } from "@/lib/db/schema";
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
      tokenName: tokens.name,
      tokenImageUrl: tokens.imageUrl,
    })
    .from(holdings)
    .leftJoin(wallets, eq(wallets.address, holdings.walletAddress))
    .leftJoin(
      tokens,
      and(
        eq(tokens.collectionId, holdings.collectionId),
        eq(tokens.tokenId, holdings.tokenId),
      ),
    )
    .where(eq(holdings.collectionId, collection.id));

  interface HeldToken {
    tokenId: string;
    name: string | null;
    imageUrl: string | null;
  }

  const byWallet = new Map<
    string,
    { nickname: string | null; tokenCount: number; heldTokens: HeldToken[] }
  >();

  for (const row of rows) {
    const entry = byWallet.get(row.walletAddress) ?? {
      nickname: row.nickname,
      tokenCount: 0,
      heldTokens: [],
    };
    entry.tokenCount += row.balance;
    entry.heldTokens.push({
      tokenId: row.tokenId,
      name: row.tokenName,
      imageUrl: row.tokenImageUrl,
    });
    byWallet.set(row.walletAddress, entry);
  }

  const holders = [...byWallet.entries()]
    .map(([walletAddress, v]) => ({ walletAddress, ...v }))
    .sort((a, b) => b.tokenCount - a.tokenCount);

  return NextResponse.json({ collection, holders });
}
