import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  collections,
  collectors,
  custodialAllocations,
  holdings,
  tokens,
  wallets,
} from "@/lib/db/schema";

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
      collectorId: wallets.collectorId,
      nickname: collectors.name,
      notes: collectors.notes,
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
    .leftJoin(collectors, eq(collectors.id, wallets.collectorId))
    .leftJoin(
      tokens,
      and(
        eq(tokens.collectionId, holdings.collectionId),
        eq(tokens.tokenId, holdings.tokenId),
      ),
    );

  // Group by collector when the wallet belongs to one (so merged wallets
  // combine into a single row), otherwise each ungrouped wallet is its own
  // group of one.
  const byGroup = new Map<
    string,
    {
      collectorId: number | null;
      nickname: string | null;
      notes: string | null;
      walletAddresses: Set<string>;
      totalCount: number;
      byCollection: Map<number, CollectionBreakdown>;
    }
  >();
  const rawBalanceByWalletCollection = new Map<string, Map<number, number>>();

  for (const row of rows) {
    const groupKey =
      row.collectorId != null ? `c:${row.collectorId}` : `w:${row.walletAddress}`;
    const entry = byGroup.get(groupKey) ?? {
      collectorId: row.collectorId,
      nickname: row.nickname,
      notes: row.notes,
      walletAddresses: new Set<string>(),
      totalCount: 0,
      byCollection: new Map<number, CollectionBreakdown>(),
    };
    entry.walletAddresses.add(row.walletAddress);
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

    byGroup.set(groupKey, entry);

    const walletBalances =
      rawBalanceByWalletCollection.get(row.walletAddress) ?? new Map<number, number>();
    walletBalances.set(
      row.collectionId,
      (walletBalances.get(row.collectionId) ?? 0) + row.balance,
    );
    rawBalanceByWalletCollection.set(row.walletAddress, walletBalances);
  }

  const allocationRows = await db
    .select({
      walletAddress: custodialAllocations.walletAddress,
      collectionId: custodialAllocations.collectionId,
      collectionAddress: collections.address,
      collectionName: collections.name,
      name: custodialAllocations.name,
      count: custodialAllocations.count,
    })
    .from(custodialAllocations)
    .innerJoin(collections, eq(collections.id, custodialAllocations.collectionId));

  const allocatedByWalletCollection = new Map<string, Map<number, number>>();
  for (const a of allocationRows) {
    const walletMap =
      allocatedByWalletCollection.get(a.walletAddress) ?? new Map<number, number>();
    walletMap.set(a.collectionId, (walletMap.get(a.collectionId) ?? 0) + a.count);
    allocatedByWalletCollection.set(a.walletAddress, walletMap);
  }

  interface ResultRow {
    groupKey: string;
    collectorId: number | null;
    walletAddresses: string[];
    nickname: string | null;
    notes: string | null;
    totalCount: number;
    collections: CollectionBreakdown[];
    isAllocation: boolean;
    isCustodial: boolean;
    isOverAllocated: boolean;
  }

  const walletGroupResults: ResultRow[] = [];

  // A wallet with custodial allocations shows its *unallocated* remainder
  // per collection here, so counts never double-count against the named
  // allocation rows added below.
  for (const [groupKey, v] of byGroup) {
    let isCustodial = false;
    let isOverAllocated = false;

    for (const walletAddress of v.walletAddresses) {
      const allocatedByCollection = allocatedByWalletCollection.get(walletAddress);
      if (!allocatedByCollection) continue;

      for (const [collectionId, allocatedTotal] of allocatedByCollection) {
        isCustodial = true;
        const rawBalance =
          rawBalanceByWalletCollection.get(walletAddress)?.get(collectionId) ?? 0;
        if (allocatedTotal > rawBalance) isOverAllocated = true;
        const unallocated = Math.max(0, rawBalance - allocatedTotal);
        const delta = unallocated - rawBalance;

        v.totalCount += delta;
        const breakdown = v.byCollection.get(collectionId);
        if (breakdown) breakdown.count += delta;
      }
    }

    walletGroupResults.push({
      groupKey,
      collectorId: v.collectorId,
      walletAddresses: [...v.walletAddresses],
      nickname: v.nickname,
      notes: v.notes,
      totalCount: v.totalCount,
      collections: [...v.byCollection.values()],
      isAllocation: false,
      isCustodial,
      isOverAllocated,
    });
  }

  // Named custodial allocations combine across collections for the same
  // (wallet, name) pair into their own group, same shape as a real collector.
  const allocationGroups = new Map<
    string,
    {
      walletAddress: string;
      nickname: string;
      totalCount: number;
      byCollection: Map<number, CollectionBreakdown>;
    }
  >();

  for (const a of allocationRows) {
    const key = `alloc:${a.walletAddress}:${a.name}`;
    const entry = allocationGroups.get(key) ?? {
      walletAddress: a.walletAddress,
      nickname: a.name,
      totalCount: 0,
      byCollection: new Map<number, CollectionBreakdown>(),
    };
    entry.totalCount += a.count;
    const breakdown = entry.byCollection.get(a.collectionId) ?? {
      collectionId: a.collectionId,
      address: a.collectionAddress,
      name: a.collectionName,
      count: 0,
      heldTokens: [],
    };
    breakdown.count += a.count;
    entry.byCollection.set(a.collectionId, breakdown);
    allocationGroups.set(key, entry);
  }

  const allocationResults: ResultRow[] = [...allocationGroups.entries()].map(
    ([groupKey, v]) => ({
      groupKey,
      collectorId: null,
      walletAddresses: [v.walletAddress],
      nickname: v.nickname,
      notes: null,
      totalCount: v.totalCount,
      collections: [...v.byCollection.values()],
      isAllocation: true,
      isCustodial: false,
      isOverAllocated: false,
    }),
  );

  const collectionIdFilter = collectionIdParam ? Number(collectionIdParam) : null;

  let results = [...walletGroupResults, ...allocationResults].map((r) => {
    const collectionsList = [...r.collections].sort((a, b) => b.count - a.count);
    const filteredCount = collectionIdFilter
      ? (collectionsList.find((c) => c.collectionId === collectionIdFilter)
          ?.count ?? 0)
      : r.totalCount;

    return { ...r, collections: collectionsList, filteredCount };
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
        r.walletAddresses.some((a) => a.includes(search)) ||
        (r.nickname?.toLowerCase().includes(search) ?? false),
    );
  }

  results.sort((a, b) => b.filteredCount - a.filteredCount);

  return NextResponse.json(results);
}
