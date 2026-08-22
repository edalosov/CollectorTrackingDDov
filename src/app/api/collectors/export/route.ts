import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { collections } from "@/lib/db/schema";
import { filterAndSortCollectorGroups, getCollectorGroups } from "@/lib/collectorGroups";
import { shortenAddress } from "@/lib/format";

// Same filters as /api/collectors (collectionId/minCount/maxCount/search), so
// the download matches whatever the dashboard table is currently showing.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const collectionIdParam = searchParams.get("collectionId");
  const minCountParam = searchParams.get("minCount");
  const maxCountParam = searchParams.get("maxCount");

  const collectionIdFilter = collectionIdParam ? Number(collectionIdParam) : null;
  const { groups, collectionCount } = await getCollectorGroups();
  const results = filterAndSortCollectorGroups(groups, {
    collectionId: collectionIdFilter,
    minCount: minCountParam ? Number(minCountParam) : null,
    maxCount: maxCountParam ? Number(maxCountParam) : null,
    search: searchParams.get("search") ?? "",
  });

  const allCollections = await db.select().from(collections);
  allCollections.sort((a, b) =>
    (a.name ?? a.address).localeCompare(b.name ?? b.address),
  );

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Collector Tracker";
  workbook.created = new Date();

  const overviewSheet = workbook.addWorksheet("Overview");
  overviewSheet.columns = [
    { header: "Metric", key: "metric", width: 30 },
    { header: "Value", key: "value", width: 20 },
  ];
  overviewSheet.getRow(1).font = { bold: true };

  const totalNftsTracked = groups.reduce((sum, g) => sum + g.totalCount, 0);
  const multiCollectionCollectors = groups.filter((g) => g.collections.length >= 2).length;
  const custodialSplits = groups.filter((g) => g.isAllocation).length;
  const custodialWallets = new Set(
    groups.filter((g) => g.isCustodial).flatMap((g) => g.walletAddresses),
  ).size;

  overviewSheet.addRows([
    { metric: "Exported at", value: new Date().toLocaleString() },
    { metric: "Total collectors", value: groups.length },
    { metric: "Collections tracked", value: collectionCount },
    { metric: "NFTs tracked", value: totalNftsTracked },
    { metric: "Collectors owning from 2+ collections", value: multiCollectionCollectors },
    { metric: "Custodial splits identified", value: custodialSplits },
    { metric: "Custodial wallets", value: custodialWallets },
    { metric: "Rows in this export (after filters applied)", value: results.length },
  ]);

  const sheet = workbook.addWorksheet("Collectors");
  const collectionColumns = allCollections.map((c) => ({
    header: c.name ?? shortenAddress(c.address),
    key: `col_${c.id}`,
    width: 14,
  }));
  sheet.columns = [
    { header: "Name", key: "name", width: 24 },
    { header: "Type", key: "type", width: 20 },
    { header: "Wallet address(es)", key: "wallets", width: 46 },
    {
      header: collectionIdFilter ? "NFTs in this collection" : "Total NFTs",
      key: "total",
      width: 20,
    },
    ...collectionColumns,
    { header: "Notes", key: "notes", width: 40 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  for (const r of results) {
    const row: Record<string, string | number> = {
      name: r.nickname ?? "(no nickname)",
      type: r.isAllocation
        ? "Custodial split"
        : r.isCustodial
          ? "Wallet (custodial)"
          : "Wallet",
      wallets: r.walletAddresses.join(", "),
      total: r.filteredCount,
      notes: r.notes ?? "",
    };
    for (const c of allCollections) {
      const breakdown = r.collections.find((cb) => cb.collectionId === c.id);
      if (breakdown) row[`col_${c.id}`] = breakdown.count;
    }
    sheet.addRow(row);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `collectors-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
