import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { collections, collectors, holdings, tokens, wallets } from "@/lib/db/schema";
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
      collectorId: wallets.collectorId,
      nickname: collectors.name,
      tokenId: holdings.tokenId,
      balance: holdings.balance,
      tokenName: tokens.name,
      tokenImageUrl: tokens.imageUrl,
    })
    .from(holdings)
    .leftJoin(wallets, eq(wallets.address, holdings.walletAddress))
    .leftJoin(collectors, eq(collectors.id, wallets.collectorId))
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

  // Group by collector when the wallet belongs to one (so merged wallets
  // combine into a single row), otherwise each ungrouped wallet is its own
  // group of one.
  const byGroup = new Map<
    string,
    {
      collectorId: number | null;
      nickname: string | null;
      walletAddresses: Set<string>;
      tokenCount: number;
      heldTokens: HeldToken[];
    }
  >();

  for (const row of rows) {
    const groupKey =
      row.collectorId != null ? `c:${row.collectorId}` : `w:${row.walletAddress}`;
    const entry = byGroup.get(groupKey) ?? {
      collectorId: row.collectorId,
      nickname: row.nickname,
      walletAddresses: new Set<string>(),
      tokenCount: 0,
      heldTokens: [],
    };
    entry.walletAddresses.add(row.walletAddress);
    entry.tokenCount += row.balance;
    entry.heldTokens.push({
      tokenId: row.tokenId,
      name: row.tokenName,
      imageUrl: row.tokenImageUrl,
    });
    byGroup.set(groupKey, entry);
  }

  const holders = [...byGroup.entries()]
    .map(([groupKey, v]) => ({
      groupKey,
      collectorId: v.collectorId,
      nickname: v.nickname,
      walletAddresses: [...v.walletAddresses],
      tokenCount: v.tokenCount,
      heldTokens: v.heldTokens,
    }))
    .sort((a, b) => b.tokenCount - a.tokenCount);

  return NextResponse.json({ collection, holders });
}
