import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { collections, holdings } from "@/lib/db/schema";
import { getContractMetadata } from "@/lib/alchemy";
import { isValidAddress, normalizeAddress } from "@/lib/address";

export async function GET() {
  const rows = await db
    .select({
      id: collections.id,
      address: collections.address,
      name: collections.name,
      symbol: collections.symbol,
      tokenType: collections.tokenType,
      addedAt: collections.addedAt,
      lastSyncedAt: collections.lastSyncedAt,
      holderCount: sql<number>`count(distinct ${holdings.walletAddress})`,
      tokenCount: sql<number>`coalesce(sum(${holdings.balance}), 0)`,
    })
    .from(collections)
    .leftJoin(holdings, eq(holdings.collectionId, collections.id))
    .groupBy(collections.id)
    .orderBy(collections.addedAt);

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const rawAddress = typeof body?.address === "string" ? body.address : "";

  if (!isValidAddress(rawAddress)) {
    return NextResponse.json(
      { error: "Invalid Ethereum contract address" },
      { status: 400 },
    );
  }

  const address = normalizeAddress(rawAddress);

  const [existing] = await db
    .select({ id: collections.id })
    .from(collections)
    .where(eq(collections.address, address));
  if (existing) {
    return NextResponse.json(
      { error: "This collection is already tracked" },
      { status: 409 },
    );
  }

  let metadata;
  try {
    metadata = await getContractMetadata(address);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Alchemy request failed" },
      { status: 502 },
    );
  }

  const [created] = await db
    .insert(collections)
    .values({
      address,
      name: metadata.name,
      symbol: metadata.symbol,
      tokenType: metadata.tokenType,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
