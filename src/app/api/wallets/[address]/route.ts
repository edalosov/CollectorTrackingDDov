import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { wallets } from "@/lib/db/schema";
import { isValidAddress, normalizeAddress } from "@/lib/address";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  const rawAddress = (await params).address;
  if (!isValidAddress(rawAddress)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  const address = normalizeAddress(rawAddress);

  const body = await req.json().catch(() => null);
  const nickname =
    typeof body?.nickname === "string" ? body.nickname.trim() || null : null;

  await db
    .insert(wallets)
    .values({ address, nickname, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: wallets.address,
      set: { nickname, updatedAt: new Date() },
    });

  return NextResponse.json({ address, nickname });
}
