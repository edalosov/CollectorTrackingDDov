import { NextRequest, NextResponse } from "next/server";
import { getCollectorGroups } from "@/lib/collectorGroups";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const collectionIdParam = searchParams.get("collectionId");
  const minCountParam = searchParams.get("minCount");
  const maxCountParam = searchParams.get("maxCount");
  const search = searchParams.get("search")?.trim().toLowerCase() ?? "";

  const { groups } = await getCollectorGroups();
  const collectionIdFilter = collectionIdParam ? Number(collectionIdParam) : null;

  let results = groups.map((r) => {
    const filteredCount = collectionIdFilter
      ? (r.collections.find((c) => c.collectionId === collectionIdFilter)?.count ?? 0)
      : r.totalCount;
    return { ...r, filteredCount };
  });

  if (collectionIdFilter) {
    results = results.filter((r) =>
      r.collections.some((c) => c.collectionId === collectionIdFilter),
    );
  }

  if (minCountParam) {
    const min = Number(minCountParam);
    results = results.filter((r) => r.filteredCount >= min);
  }

  if (maxCountParam) {
    const max = Number(maxCountParam);
    results = results.filter((r) => r.filteredCount <= max);
  }

  if (search) {
    results = results.filter(
      (r) =>
        r.walletAddresses.some((a) => a.includes(search)) ||
        (r.nickname?.toLowerCase().includes(search) ?? false),
    );
  }

  results.sort((a, b) => b.filteredCount - a.filteredCount);

  return NextResponse.json(results);
}
