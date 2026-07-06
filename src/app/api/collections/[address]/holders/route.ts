import { NextRequest, NextResponse } from "next/server";
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
import { normalizeAddress } from "@/lib/address";

interface HeldToken {
  tokenId: string;
  name: string | null;
  imageUrl: string | null;
}

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

  const allocationRows = await db
    .select()
    .from(custodialAllocations)
    .where(eq(custodialAllocations.collectionId, collection.id));

  const assignmentRows = await db
    .select()
    .from(custodialTokenAssignments)
    .where(eq(custodialTokenAssignments.collectionId, collection.id));

  // wallet -> tokenId -> assigned name
  const assignedNameByWalletToken = new Map<string, Map<string, string>>();
  // wallet -> name -> number of specifically assigned tokens
  const assignedCountByWalletName = new Map<string, Map<string, number>>();
  for (const a of assignmentRows) {
    const tokenMap =
      assignedNameByWalletToken.get(a.walletAddress) ?? new Map<string, string>();
    tokenMap.set(a.tokenId, a.name);
    assignedNameByWalletToken.set(a.walletAddress, tokenMap);

    const nameMap =
      assignedCountByWalletName.get(a.walletAddress) ?? new Map<string, number>();
    nameMap.set(a.name, (nameMap.get(a.name) ?? 0) + 1);
    assignedCountByWalletName.set(a.walletAddress, nameMap);
  }

  // wallet -> name -> manual (rough) count
  const manualCountByWalletName = new Map<string, Map<string, number>>();
  for (const a of allocationRows) {
    const nameMap =
      manualCountByWalletName.get(a.walletAddress) ?? new Map<string, number>();
    nameMap.set(a.name, a.count);
    manualCountByWalletName.set(a.walletAddress, nameMap);
  }

  // A name's effective count is its assigned-token count when any exist,
  // otherwise it falls back to the manual count. Union of names from both
  // sources, per wallet.
  const allocationsByWallet = new Map<string, { name: string; count: number }[]>();
  {
    const namesByWallet = new Map<string, Set<string>>();
    for (const [walletAddress, nameMap] of manualCountByWalletName) {
      const set = namesByWallet.get(walletAddress) ?? new Set<string>();
      for (const name of nameMap.keys()) set.add(name);
      namesByWallet.set(walletAddress, set);
    }
    for (const [walletAddress, nameMap] of assignedCountByWalletName) {
      const set = namesByWallet.get(walletAddress) ?? new Set<string>();
      for (const name of nameMap.keys()) set.add(name);
      namesByWallet.set(walletAddress, set);
    }
    for (const [walletAddress, names] of namesByWallet) {
      const list = [...names].map((name) => {
        const assignedCount = assignedCountByWalletName.get(walletAddress)?.get(name) ?? 0;
        const manualCount = manualCountByWalletName.get(walletAddress)?.get(name) ?? 0;
        return { name, count: assignedCount > 0 ? assignedCount : manualCount };
      });
      allocationsByWallet.set(walletAddress, list);
    }
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
  const rawBalanceByWallet = new Map<string, number>();
  // wallet -> name -> the specific tokens assigned to them (real thumbnails)
  const assignedHeldTokensByWalletName = new Map<string, Map<string, HeldToken[]>>();

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

    const assignedName = assignedNameByWalletToken.get(row.walletAddress)?.get(row.tokenId);
    const heldToken: HeldToken = {
      tokenId: row.tokenId,
      name: row.tokenName,
      imageUrl: row.tokenImageUrl,
    };
    if (assignedName) {
      const nameMap =
        assignedHeldTokensByWalletName.get(row.walletAddress) ?? new Map<string, HeldToken[]>();
      const list = nameMap.get(assignedName) ?? [];
      list.push(heldToken);
      nameMap.set(assignedName, list);
      assignedHeldTokensByWalletName.set(row.walletAddress, nameMap);
    } else {
      // Only tokens not specifically assigned to someone stay visible on the
      // wallet's own row -- assigned ones are precisely accounted for below.
      entry.heldTokens.push(heldToken);
    }

    byGroup.set(groupKey, entry);

    rawBalanceByWallet.set(
      row.walletAddress,
      (rawBalanceByWallet.get(row.walletAddress) ?? 0) + row.balance,
    );
  }

  const holders: Array<{
    groupKey: string;
    collectorId: number | null;
    nickname: string | null;
    walletAddresses: string[];
    tokenCount: number;
    heldTokens: HeldToken[];
    isAllocation: boolean;
    isCustodial: boolean;
    isOverAllocated: boolean;
  }> = [];

  // A wallet with custodial allocations shows its *unallocated* remainder
  // here instead of its raw balance, so counts never get double-counted
  // between this row and the named allocation rows added below.
  for (const [groupKey, v] of byGroup) {
    let tokenCount = v.tokenCount;
    let isCustodial = false;
    let isOverAllocated = false;

    for (const walletAddress of v.walletAddresses) {
      const allocations = allocationsByWallet.get(walletAddress);
      if (!allocations || allocations.length === 0) continue;

      isCustodial = true;
      const allocatedTotal = allocations.reduce((sum, a) => sum + a.count, 0);
      const rawBalance = rawBalanceByWallet.get(walletAddress) ?? 0;
      if (allocatedTotal > rawBalance) isOverAllocated = true;
      const unallocated = Math.max(0, rawBalance - allocatedTotal);
      tokenCount = tokenCount - rawBalance + unallocated;
    }

    holders.push({
      groupKey,
      collectorId: v.collectorId,
      nickname: v.nickname,
      walletAddresses: [...v.walletAddresses],
      tokenCount,
      heldTokens: v.heldTokens,
      isAllocation: false,
      isCustodial,
      isOverAllocated,
    });
  }

  for (const [walletAddress, allocations] of allocationsByWallet) {
    for (const a of allocations) {
      holders.push({
        groupKey: `alloc:${walletAddress}:${a.name}`,
        collectorId: null,
        nickname: a.name,
        walletAddresses: [walletAddress],
        tokenCount: a.count,
        heldTokens:
          assignedHeldTokensByWalletName.get(walletAddress)?.get(a.name) ?? [],
        isAllocation: true,
        isCustodial: false,
        isOverAllocated: false,
      });
    }
  }

  holders.sort((a, b) => b.tokenCount - a.tokenCount);

  return NextResponse.json({ collection, holders });
}
