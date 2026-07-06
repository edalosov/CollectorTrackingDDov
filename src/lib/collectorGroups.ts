import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  collections,
  collectors,
  custodialAllocations,
  custodialTokenAssignments,
  holdings,
  tokens,
  wallets,
} from "@/lib/db/schema";

export interface HeldToken {
  tokenId: string;
  name: string | null;
  imageUrl: string | null;
}

export interface CollectionBreakdown {
  collectionId: number;
  address: string;
  name: string | null;
  count: number;
  heldTokens: HeldToken[];
}

export interface CollectorGroup {
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

export interface CollectorGroupsResult {
  groups: CollectorGroup[];
  collectionCount: number;
}

// Every "holder" across every tracked collection, one row per person: a real
// wallet (or several merged under one nickname), or a named custodial split.
// Shared by /api/collectors (which additionally filters/sorts for the
// dashboard) and /api/stats (which summarizes the full unfiltered set).
export async function getCollectorGroups(): Promise<CollectorGroupsResult> {
  const allCollections = await db.select().from(collections);
  const collectionMetaById = new Map(allCollections.map((c) => [c.id, c]));

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

  const allocationRows = await db.select().from(custodialAllocations);
  const assignmentRows = await db.select().from(custodialTokenAssignments);

  // wallet -> collectionId -> tokenId -> assigned name
  const assignedNameByWalletCollectionToken = new Map<
    string,
    Map<number, Map<string, string>>
  >();
  // wallet -> collectionId -> name -> number of specifically assigned tokens
  const assignedCountByWalletCollectionName = new Map<
    string,
    Map<number, Map<string, number>>
  >();
  for (const a of assignmentRows) {
    const collMap =
      assignedNameByWalletCollectionToken.get(a.walletAddress) ??
      new Map<number, Map<string, string>>();
    const tokenMap = collMap.get(a.collectionId) ?? new Map<string, string>();
    tokenMap.set(a.tokenId, a.name);
    collMap.set(a.collectionId, tokenMap);
    assignedNameByWalletCollectionToken.set(a.walletAddress, collMap);

    const countCollMap =
      assignedCountByWalletCollectionName.get(a.walletAddress) ??
      new Map<number, Map<string, number>>();
    const nameMap = countCollMap.get(a.collectionId) ?? new Map<string, number>();
    nameMap.set(a.name, (nameMap.get(a.name) ?? 0) + 1);
    countCollMap.set(a.collectionId, nameMap);
    assignedCountByWalletCollectionName.set(a.walletAddress, countCollMap);
  }

  // wallet -> collectionId -> name -> manual (rough) count
  const manualCountByWalletCollectionName = new Map<
    string,
    Map<number, Map<string, number>>
  >();
  for (const a of allocationRows) {
    const collMap =
      manualCountByWalletCollectionName.get(a.walletAddress) ??
      new Map<number, Map<string, number>>();
    const nameMap = collMap.get(a.collectionId) ?? new Map<string, number>();
    nameMap.set(a.name, a.count);
    collMap.set(a.collectionId, nameMap);
    manualCountByWalletCollectionName.set(a.walletAddress, collMap);
  }

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
  // wallet -> collectionId -> name -> the specific tokens assigned to them
  const assignedHeldTokensByWalletCollectionName = new Map<
    string,
    Map<number, Map<string, HeldToken[]>>
  >();

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

    const assignedName = assignedNameByWalletCollectionToken
      .get(row.walletAddress)
      ?.get(row.collectionId)
      ?.get(row.tokenId);
    const heldToken: HeldToken = {
      tokenId: row.tokenId,
      name: row.tokenName,
      imageUrl: row.tokenImageUrl,
    };

    if (assignedName) {
      const collMap =
        assignedHeldTokensByWalletCollectionName.get(row.walletAddress) ??
        new Map<number, Map<string, HeldToken[]>>();
      const nameMap = collMap.get(row.collectionId) ?? new Map<string, HeldToken[]>();
      const list = nameMap.get(assignedName) ?? [];
      list.push(heldToken);
      nameMap.set(assignedName, list);
      collMap.set(row.collectionId, nameMap);
      assignedHeldTokensByWalletCollectionName.set(row.walletAddress, collMap);
    } else {
      // Only tokens not specifically assigned to someone stay visible on the
      // wallet's own row -- assigned ones are precisely accounted for below.
      breakdown.heldTokens.push(heldToken);
    }

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

  // Effective (wallet, collection) -> name -> count: assigned-token count
  // when any exist, otherwise the manual count. Union of both sources.
  const effectiveByWalletCollection = new Map<
    string,
    Map<number, Map<string, number>>
  >();
  {
    const allWallets = new Set([
      ...manualCountByWalletCollectionName.keys(),
      ...assignedCountByWalletCollectionName.keys(),
    ]);
    for (const walletAddress of allWallets) {
      const manualColl = manualCountByWalletCollectionName.get(walletAddress);
      const assignedColl = assignedCountByWalletCollectionName.get(walletAddress);
      const allCollectionIds = new Set([
        ...(manualColl?.keys() ?? []),
        ...(assignedColl?.keys() ?? []),
      ]);
      const collMap = new Map<number, Map<string, number>>();
      for (const collectionId of allCollectionIds) {
        const manualNames = manualColl?.get(collectionId);
        const assignedNames = assignedColl?.get(collectionId);
        const allNames = new Set([
          ...(manualNames?.keys() ?? []),
          ...(assignedNames?.keys() ?? []),
        ]);
        const nameMap = new Map<string, number>();
        for (const name of allNames) {
          const assignedCount = assignedNames?.get(name) ?? 0;
          const manualCount = manualNames?.get(name) ?? 0;
          nameMap.set(name, assignedCount > 0 ? assignedCount : manualCount);
        }
        collMap.set(collectionId, nameMap);
      }
      effectiveByWalletCollection.set(walletAddress, collMap);
    }
  }

  const walletGroupResults: CollectorGroup[] = [];

  // A wallet with custodial allocations shows its *unallocated* remainder
  // per collection here, so counts never double-count against the named
  // allocation rows added below.
  for (const [groupKey, v] of byGroup) {
    let isCustodial = false;
    let isOverAllocated = false;

    for (const walletAddress of v.walletAddresses) {
      const collMap = effectiveByWalletCollection.get(walletAddress);
      if (!collMap) continue;

      for (const [collectionId, nameMap] of collMap) {
        if (nameMap.size === 0) continue;
        isCustodial = true;
        const allocatedTotal = [...nameMap.values()].reduce((sum, c) => sum + c, 0);
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

  for (const [walletAddress, collMap] of effectiveByWalletCollection) {
    for (const [collectionId, nameMap] of collMap) {
      for (const [name, count] of nameMap) {
        const key = `alloc:${walletAddress}:${name}`;
        const entry = allocationGroups.get(key) ?? {
          walletAddress,
          nickname: name,
          totalCount: 0,
          byCollection: new Map<number, CollectionBreakdown>(),
        };
        entry.totalCount += count;

        const meta = collectionMetaById.get(collectionId);
        entry.byCollection.set(collectionId, {
          collectionId,
          address: meta?.address ?? "",
          name: meta?.name ?? null,
          count,
          heldTokens:
            assignedHeldTokensByWalletCollectionName
              .get(walletAddress)
              ?.get(collectionId)
              ?.get(name) ?? [],
        });
        allocationGroups.set(key, entry);
      }
    }
  }

  const allocationResults: CollectorGroup[] = [...allocationGroups.entries()].map(
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

  const groups = [...walletGroupResults, ...allocationResults].map((r) => ({
    ...r,
    collections: [...r.collections].sort((a, b) => b.count - a.count),
  }));

  return { groups, collectionCount: allCollections.length };
}
