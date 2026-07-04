import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { collections } from "@/lib/db/schema";
import { syncCollection } from "@/lib/syncCollection";

export async function POST() {
  const allCollections = await db.select().from(collections);

  const settled = await Promise.allSettled(
    allCollections.map((c) => syncCollection(c)),
  );

  const results = settled.map((outcome, i) => {
    const collection = allCollections[i];
    if (outcome.status === "fulfilled") {
      return {
        name: collection.name,
        ok: true as const,
        ...outcome.value,
      };
    }
    return {
      address: collection.address,
      name: collection.name,
      ok: false as const,
      error:
        outcome.reason instanceof Error
          ? outcome.reason.message
          : "Sync failed",
    };
  });

  return NextResponse.json({ results });
}
