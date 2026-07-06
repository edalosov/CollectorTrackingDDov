import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { custodialTokenAssignments, wallets } from "@/lib/db/schema";
import { normalizeAddress } from "@/lib/address";

// Assign (or reassign) one specific token to a named person. A token can
// only belong to one person at a time, so this replaces any prior owner.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  const address = normalizeAddress((await params).address);

  const body = await req.json().catch(() => null);
  const collectionId = Number(body?.collectionId);
  const tokenId = typeof body?.tokenId === "string" ? body.tokenId : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";

  if (!Number.isInteger(collectionId) || collectionId <= 0) {
    return NextResponse.json({ error: "Invalid collection" }, { status: 400 });
  }
  if (!tokenId) {
    return NextResponse.json({ error: "Invalid token id" }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  await db
    .insert(wallets)
    .values({ address })
    .onConflictDoNothing({ target: wallets.address });

  const [assignment] = await db
    .insert(custodialTokenAssignments)
    .values({ walletAddress: address, collectionId, tokenId, name })
    .onConflictDoUpdate({
      target: [
        custodialTokenAssignments.walletAddress,
        custodialTokenAssignments.collectionId,
        custodialTokenAssignments.tokenId,
      ],
      set: { name },
    })
    .returning();

  return NextResponse.json(assignment);
}

// Unassign a specific token, making it unallocated again.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  const address = normalizeAddress((await params).address);

  const body = await req.json().catch(() => null);
  const collectionId = Number(body?.collectionId);
  const tokenId = typeof body?.tokenId === "string" ? body.tokenId : "";

  if (!Number.isInteger(collectionId) || collectionId <= 0) {
    return NextResponse.json({ error: "Invalid collection" }, { status: 400 });
  }
  if (!tokenId) {
    return NextResponse.json({ error: "Invalid token id" }, { status: 400 });
  }

  await db
    .delete(custodialTokenAssignments)
    .where(
      and(
        eq(custodialTokenAssignments.walletAddress, address),
        eq(custodialTokenAssignments.collectionId, collectionId),
        eq(custodialTokenAssignments.tokenId, tokenId),
      ),
    );

  return NextResponse.json({ ok: true });
}
