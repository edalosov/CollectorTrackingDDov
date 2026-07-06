import { NextResponse } from "next/server";
import { getCollectorGroups } from "@/lib/collectorGroups";

// Global overview stats for the Collectors dashboard's stat panel. Computed
// from the full unfiltered set of holders, independent of whatever
// search/filter the dashboard's table currently has applied.
export async function GET() {
  const { groups, collectionCount } = await getCollectorGroups();

  const totalCollectors = groups.length;
  const totalNftsTracked = groups.reduce((sum, g) => sum + g.totalCount, 0);
  const multiCollectionCollectors = groups.filter((g) => g.collections.length >= 2).length;
  const custodialSplits = groups.filter((g) => g.isAllocation).length;
  const custodialWallets = new Set(
    groups.filter((g) => g.isCustodial).flatMap((g) => g.walletAddresses),
  ).size;
  const averageNftsPerCollector =
    totalCollectors > 0 ? totalNftsTracked / totalCollectors : 0;

  const topCollector = groups.reduce<(typeof groups)[number] | null>(
    (top, g) => (!top || g.totalCount > top.totalCount ? g : top),
    null,
  );

  return NextResponse.json({
    totalCollectors,
    totalCollections: collectionCount,
    totalNftsTracked,
    multiCollectionCollectors,
    custodialSplits,
    custodialWallets,
    averageNftsPerCollector,
    topCollector: topCollector
      ? {
          nickname: topCollector.nickname,
          walletAddresses: topCollector.walletAddresses,
          totalCount: topCollector.totalCount,
          isAllocation: topCollector.isAllocation,
        }
      : null,
  });
}
