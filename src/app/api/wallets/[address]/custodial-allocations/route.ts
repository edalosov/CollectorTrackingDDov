import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  collections,
  custodialAllocations,
  custodialTokenAssignments,
  holdings,
  tokens,
  wallets,
} from "@/lib/db/schema";
import { normalizeAddress } from "@/lib/address";

// Every collection this wallet holds tokens in (or has an allocation for):
// its balance, the wallet's tokens (for the assignment picker), and whatever
// named splits/assignments are already recorded.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  const address = normalizeAddress((await params).address);

  const allCollections = await db.select().from(collections);

  const tokenRows = await db
    .select({
      collectionId: holdings.collectionId,
      tokenId: holdings.tokenId,
      tokenName: tokens.name,
      tokenImageUrl: tokens.imageUrl,
    })
    .from(holdings)
    .leftJoin(
      tokens,
      and(
        eq(tokens.collectionId, holdings.collectionId),
        eq(tokens.tokenId, holdings.tokenId),
      ),
    )
    .where(eq(holdings.walletAddress, address));

  const balanceByCollection = new Map<number, number>();
  const tokensByCollection = new Map<
    number,
    { tokenId: string; name: string | null; imageUrl: string | null }[]
  >();
  for (const row of tokenRows) {
    balanceByCollection.set(
      row.collectionId,
      (balanceByCollection.get(row.collectionId) ?? 0) + 1,
    );
    const list = tokensByCollection.get(row.collectionId) ?? [];
    list.push({ tokenId: row.tokenId, name: row.tokenName, imageUrl: row.tokenImageUrl });
    tokensByCollection.set(row.collectionId, list);
  }

  const allocationRows = await db
    .select()
    .from(custodialAllocations)
    .where(eq(custodialAllocations.walletAddress, address));

  const assignmentRows = await db
    .select()
    .from(custodialTokenAssignments)
    .where(eq(custodialTokenAssignments.walletAddress, address));

  const assignedTokenByCollection = new Map<number, Map<string, string>>();
  const assignedCountByCollectionName = new Map<number, Map<string, number>>();
  for (const a of assignmentRows) {
    const tokenMap = assignedTokenByCollection.get(a.collectionId) ?? new Map();
    tokenMap.set(a.tokenId, a.name);
    assignedTokenByCollection.set(a.collectionId, tokenMap);

    const nameMap = assignedCountByCollectionName.get(a.collectionId) ?? new Map();
    nameMap.set(a.name, (nameMap.get(a.name) ?? 0) + 1);
    assignedCountByCollectionName.set(a.collectionId, nameMap);
  }

  interface AllocationEntry {
    id: number | null;
    manualCount: number;
    assignedCount: number;
  }
  const allocationsByCollection = new Map<number, Map<string, AllocationEntry>>();

  for (const a of allocationRows) {
    const map = allocationsByCollection.get(a.collectionId) ?? new Map();
    map.set(a.name, { id: a.id, manualCount: a.count, assignedCount: 0 });
    allocationsByCollection.set(a.collectionId, map);
  }
  for (const [collectionId, nameMap] of assignedCountByCollectionName) {
    const map = allocationsByCollection.get(collectionId) ?? new Map();
    for (const [name, assignedCount] of nameMap) {
      const existing = map.get(name) ?? { id: null, manualCount: 0, assignedCount: 0 };
      existing.assignedCount = assignedCount;
      map.set(name, existing);
    }
    allocationsByCollection.set(collectionId, map);
  }

  const result = allCollections
    .map((c) => {
      const allocationMap = allocationsByCollection.get(c.id) ?? new Map();
      const assignedTokens = assignedTokenByCollection.get(c.id);

      return {
        collectionId: c.id,
        collectionName: c.name,
        collectionAddress: c.address,
        walletBalance: balanceByCollection.get(c.id) ?? 0,
        allocations: [...allocationMap.entries()].map(([name, v]) => ({
          id: v.id,
          name,
          count: v.assignedCount > 0 ? v.assignedCount : v.manualCount,
          manualCount: v.manualCount,
          assignedCount: v.assignedCount,
        })),
        tokens: (tokensByCollection.get(c.id) ?? []).map((t) => ({
          ...t,
          assignedTo: assignedTokens?.get(t.tokenId) ?? null,
        })),
      };
    })
    .filter((c) => c.walletBalance > 0 || c.allocations.length > 0);

  return NextResponse.json(result);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  const address = normalizeAddress((await params).address);

  const body = await req.json().catch(() => null);
  const collectionId = Number(body?.collectionId);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const count = Number(body?.count);

  if (!Number.isInteger(collectionId) || collectionId <= 0) {
    return NextResponse.json({ error: "Invalid collection" }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!Number.isInteger(count) || count < 0) {
    return NextResponse.json(
      { error: "Count must be a non-negative whole number" },
      { status: 400 },
    );
  }

  await db
    .insert(wallets)
    .values({ address })
    .onConflictDoNothing({ target: wallets.address });

  const [allocation] = await db
    .insert(custodialAllocations)
    .values({ walletAddress: address, collectionId, name, count })
    .onConflictDoUpdate({
      target: [
        custodialAllocations.walletAddress,
        custodialAllocations.collectionId,
        custodialAllocations.name,
      ],
      set: { count },
    })
    .returning();

  return NextResponse.json(allocation);
}
