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

  const allocationsByWallet = new Map<
    string,
    { id: number; name: string; count: number }[]
  >();
  for (const a of allocationRows) {
    const list = allocationsByWallet.get(a.walletAddress) ?? [];
    list.push({ id: a.id, name: a.name, count: a.count });
    allocationsByWallet.set(a.walletAddress, list);
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
        heldTokens: [],
        isAllocation: true,
        isCustodial: false,
        isOverAllocated: false,
      });
    }
  }

  holders.sort((a, b) => b.tokenCount - a.tokenCount);

  return NextResponse.json({ collection, holders });
}
