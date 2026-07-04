import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { collections, holdings, tokens, wallets } from "@/lib/db/schema";

interface HeldToken {
  tokenId: string;
  name: string | null;
  imageUrl: string | null;
}

interface CollectionBreakdown {
  collectionId: number;
  address: string;
  name: string | null;
  count: number;
  heldTokens: HeldToken[];
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const collectionIdParam = searchParams.get("collectionId");
  const minCountParam = searchParams.get("minCount");
  const maxCountParam = searchParams.get("maxCount");
  const search = searchParams.get("search")?.trim().toLowerCase() ?? "";

  const rows = await db
    .select({
      walletAddress: holdings.walletAddress,
      nickname: wallets.nickname,
      tokenId: holdings.tokenId,
      balance: holdings.balance,
      collectionId: collections.id,
      collectionAddress: collections.address,
      collectionName: collections.name,
      tokenName: tokens.name,
      tokenImageUrl: tokens.imageUrl,
    })
    .from(holdings)
    .innerJoin(collections, eq(collections.id, holdings.collectionId))
    .leftJoin(wallets, eq(wallets.address, holdings.walletAddress))
    .leftJoin(
      tokens,
      and(
        eq(tokens.collectionId, holdings.collectionId),
        eq(tokens.tokenId, holdings.tokenId),
      ),
    );

  const byWallet = new Map<
    string,
    {
      nickname: string | null;
      totalCount: number;
      byCollection: Map<number, CollectionBreakdown>;
    }
  >();

  for (const row of rows) {
    const entry = byWallet.get(row.walletAddress) ?? {
      nickname: row.nickname,
      totalCount: 0,
      byCollection: new Map<number, CollectionBreakdown>(),
    };
    entry.totalCount += row.balance;

    const breakdown = entry.byCollection.get(row.collectionId) ?? {
      collectionId: row.collectionId,
      address: row.collectionAddress,
      name: row.collectionName,
      count: 0,
      heldTokens: [],
    };
    breakdown.count += row.balance;
    breakdown.heldTokens.push({
      tokenId: row.tokenId,
      name: row.tokenName,
      imageUrl: row.tokenImageUrl,
    });
    entry.byCollection.set(row.collectionId, breakdown);

    byWallet.set(row.walletAddress, entry);
  }

  const collectionIdFilter = collectionIdParam ? Number(collectionIdParam) : null;

  let results = [...byWallet.entries()].map(([walletAddress, v]) => {
    const collectionsList = [...v.byCollection.values()].sort(
      (a, b) => b.count - a.count,
    );
    const filteredCount = collectionIdFilter
      ? (collectionsList.find((c) => c.collectionId === collectionIdFilter)
          ?.count ?? 0)
      : v.totalCount;

    return {
      walletAddress,
      nickname: v.nickname,
      totalCount: v.totalCount,
      collections: collectionsList,
      filteredCount,
    };
  });

  if (collectionIdFilter) {
    results = results.filter((r) =>
      r.collections.some((c) => c.collectionId === collectionIdFilter),
    );
  }

  if (minCountParam) {
    const min = Number(minCountParam);
    results = results.filter((r) => r.filteredCount >= min);
  }

  if (maxCountParam) {
    const max = Number(maxCountParam);
    results = results.filter((r) => r.filteredCount <= max);
  }

  if (search) {
    results = results.filter(
      (r) =>
        r.walletAddress.includes(search) ||
        (r.nickname?.toLowerCase().includes(search) ?? false),
    );
  }

  results.sort((a, b) => b.filteredCount - a.filteredCount);

  return NextResponse.json(results);
}
