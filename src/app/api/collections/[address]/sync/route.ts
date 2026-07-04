import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { collections } from "@/lib/db/schema";
import { normalizeAddress } from "@/lib/address";
import { syncCollection } from "@/lib/syncCollection";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  const address = normalizeAddress((await params).address);

  const [collection] = await db
    .select()
    .from(collections)
    .where(eq(collections.address, address));
  if (!collection) {
    return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  }

  try {
    const result = await syncCollection(collection);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Alchemy request failed" },
      { status: 502 },
    );
  }
}
