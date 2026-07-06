import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { collections, custodialAllocations, holdings, wallets } from "@/lib/db/schema";
import { normalizeAddress } from "@/lib/address";

// Every collection this wallet holds tokens in (or has an allocation for),
// its current balance there, and whatever named splits are already recorded.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  const address = normalizeAddress((await params).address);

  const allCollections = await db.select().from(collections);

  const balanceRows = await db
    .select({ collectionId: holdings.collectionId, balance: holdings.balance })
    .from(holdings)
    .where(eq(holdings.walletAddress, address));
  const balanceByCollection = new Map<number, number>();
  for (const row of balanceRows) {
    balanceByCollection.set(
      row.collectionId,
      (balanceByCollection.get(row.collectionId) ?? 0) + row.balance,
    );
  }

  const allocationRows = await db
    .select()
    .from(custodialAllocations)
    .where(eq(custodialAllocations.walletAddress, address));
  const allocationsByCollection = new Map<
    number,
    { id: number; name: string; count: number }[]
  >();
  for (const a of allocationRows) {
    const list = allocationsByCollection.get(a.collectionId) ?? [];
    list.push({ id: a.id, name: a.name, count: a.count });
    allocationsByCollection.set(a.collectionId, list);
  }

  const result = allCollections
    .map((c) => ({
      collectionId: c.id,
      collectionName: c.name,
      collectionAddress: c.address,
      walletBalance: balanceByCollection.get(c.id) ?? 0,
      allocations: allocationsByCollection.get(c.id) ?? [],
    }))
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
