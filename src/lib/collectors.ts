import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { collectors, wallets } from "@/lib/db/schema";

// Call after removing a wallet from a collector group, in case it was the
// last one — an unnamed, wallet-less collector row is just clutter.
export async function deleteCollectorIfOrphaned(
  collectorId: number,
): Promise<void> {
  const [remaining] = await db
    .select({ address: wallets.address })
    .from(wallets)
    .where(eq(wallets.collectorId, collectorId))
    .limit(1);

  if (!remaining) {
    await db.delete(collectors).where(eq(collectors.id, collectorId));
  }
}
