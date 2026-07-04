import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { collections } from "@/lib/db/schema";
import { normalizeAddress } from "@/lib/address";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  const address = normalizeAddress((await params).address);
  await db.delete(collections).where(eq(collections.address, address));
  return NextResponse.json({ ok: true });
}
