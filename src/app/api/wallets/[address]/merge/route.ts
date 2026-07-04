import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { wallets } from "@/lib/db/schema";
import { isValidAddress, normalizeAddress } from "@/lib/address";
import { deleteCollectorIfOrphaned } from "@/lib/collectors";

// Attaches `address` (from the request body) to the same collector group as
// the wallet in the URL. Both wallets then show the same nickname and their
// holdings are combined for display.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  const rawAnchor = (await params).address;
  if (!isValidAddress(rawAnchor)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  const anchorAddress = normalizeAddress(rawAnchor);

  const body = await req.json().catch(() => null);
  const rawOther = typeof body?.address === "string" ? body.address : "";
  if (!isValidAddress(rawOther)) {
    return NextResponse.json(
      { error: "Invalid Ethereum address" },
      { status: 400 },
    );
  }
  const otherAddress = normalizeAddress(rawOther);

  if (otherAddress === anchorAddress) {
    return NextResponse.json(
      { error: "That's the same address" },
      { status: 400 },
    );
  }

  const [anchor] = await db
    .select()
    .from(wallets)
    .where(eq(wallets.address, anchorAddress));
  if (!anchor?.collectorId) {
    return NextResponse.json(
      { error: "Give this wallet a nickname first, then add others to it" },
      { status: 400 },
    );
  }

  const [other] = await db
    .select()
    .from(wallets)
    .where(eq(wallets.address, otherAddress));
  const previousCollectorId = other?.collectorId ?? null;

  await db
    .insert(wallets)
    .values({ address: otherAddress, collectorId: anchor.collectorId })
    .onConflictDoUpdate({
      target: wallets.address,
      set: { collectorId: anchor.collectorId, updatedAt: new Date() },
    });

  if (previousCollectorId && previousCollectorId !== anchor.collectorId) {
    await deleteCollectorIfOrphaned(previousCollectorId);
  }

  return NextResponse.json({ ok: true });
}
