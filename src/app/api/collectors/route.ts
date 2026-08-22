import { NextRequest, NextResponse } from "next/server";
import { filterAndSortCollectorGroups, getCollectorGroups } from "@/lib/collectorGroups";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const collectionIdParam = searchParams.get("collectionId");
  const minCountParam = searchParams.get("minCount");
  const maxCountParam = searchParams.get("maxCount");

  const { groups } = await getCollectorGroups();

  const results = filterAndSortCollectorGroups(groups, {
    collectionId: collectionIdParam ? Number(collectionIdParam) : null,
    minCount: minCountParam ? Number(minCountParam) : null,
    maxCount: maxCountParam ? Number(maxCountParam) : null,
    search: searchParams.get("search") ?? "",
  });

  return NextResponse.json(results);
}
