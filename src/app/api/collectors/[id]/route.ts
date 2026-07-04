import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { collectors } from "@/lib/db/schema";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const rawId = (await params).id;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid collector id" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const notes =
    typeof body?.notes === "string" ? body.notes.trim() || null : null;

  const [updated] = await db
    .update(collectors)
    .set({ notes })
    .where(eq(collectors.id, id))
    .returning({ id: collectors.id, notes: collectors.notes });

  if (!updated) {
    return NextResponse.json({ error: "Collector not found" }, { status: 404 });
  }

  return NextResponse.json(updated);
}
