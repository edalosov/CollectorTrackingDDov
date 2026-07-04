import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { collectors, wallets } from "@/lib/db/schema";
import { isValidAddress, normalizeAddress } from "@/lib/address";
import { deleteCollectorIfOrphaned } from "@/lib/collectors";

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

  const [existingWallet] = await db
    .select()
    .from(wallets)
    .where(eq(wallets.address, address));

  if (nickname === null) {
    // Clearing only detaches this one wallet from its group — other wallets
    // sharing the same collector keep their nickname.
    if (existingWallet?.collectorId) {
      const oldCollectorId = existingWallet.collectorId;
      await db
        .update(wallets)
        .set({ collectorId: null, updatedAt: new Date() })
        .where(eq(wallets.address, address));
      await deleteCollectorIfOrphaned(oldCollectorId);
    } else {
      await db
        .insert(wallets)
        .values({ address })
        .onConflictDoNothing({ target: wallets.address });
    }
    return NextResponse.json({ address, nickname: null });
  }

  if (existingWallet?.collectorId) {
    // Wallet is already part of a group: renaming it renames the whole group.
    await db
      .update(collectors)
      .set({ name: nickname })
      .where(eq(collectors.id, existingWallet.collectorId));
    return NextResponse.json({ address, nickname });
  }

  // First time naming this wallet: create a new (initially solo) collector.
  const [collector] = await db
    .insert(collectors)
    .values({ name: nickname })
    .returning();

  await db
    .insert(wallets)
    .values({ address, collectorId: collector.id })
    .onConflictDoUpdate({
      target: wallets.address,
      set: { collectorId: collector.id, updatedAt: new Date() },
    });

  return NextResponse.json({ address, nickname });
}
