import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { custodialAllocations } from "@/lib/db/schema";
import { normalizeAddress } from "@/lib/address";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ address: string; id: string }> },
) {
  const { address, id } = await params;
  const walletAddress = normalizeAddress(address);
  const allocationId = Number(id);

  if (!Number.isInteger(allocationId) || allocationId <= 0) {
    return NextResponse.json({ error: "Invalid allocation id" }, { status: 400 });
  }

  await db
    .delete(custodialAllocations)
    .where(
      and(
        eq(custodialAllocations.id, allocationId),
        eq(custodialAllocations.walletAddress, walletAddress),
      ),
    );

  return NextResponse.json({ ok: true });
}
