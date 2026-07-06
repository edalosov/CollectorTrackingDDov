"use client";

import { useEffect, useState } from "react";
import { formatCompactNumber, shortenAddress } from "@/lib/format";

interface Stats {
  totalCollectors: number;
  totalCollections: number;
  totalNftsTracked: number;
  multiCollectionCollectors: number;
  custodialSplits: number;
  custodialWallets: number;
  averageNftsPerCollector: number;
  topCollector: {
    nickname: string | null;
    walletAddresses: string[];
    totalCount: number;
    isAllocation: boolean;
  } | null;
}

function StatTile({
  label,
  value,
  subtext,
}: {
  label: string;
  value: string;
  subtext?: string;
}) {
  return (
    <div className="rounded border border-neutral-800 bg-neutral-900 px-3 py-2.5">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-0.5 truncate text-xl font-semibold text-neutral-100">
        {value}
      </div>
      {subtext && (
        <div className="mt-0.5 truncate text-xs text-neutral-500">{subtext}</div>
      )}
    </div>
  );
}

export function StatsPanel() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then(setStats);
  }, []);

  if (!stats || stats.totalCollectors === 0) {
    return null;
  }

  const topCollectorLabel = stats.topCollector
    ? (stats.topCollector.nickname ?? shortenAddress(stats.topCollector.walletAddresses[0]))
    : "—";

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <StatTile label="Collectors" value={formatCompactNumber(stats.totalCollectors)} />
      <StatTile
        label="Collections tracked"
        value={formatCompactNumber(stats.totalCollections)}
      />
      <StatTile
        label="NFTs tracked"
        value={formatCompactNumber(stats.totalNftsTracked)}
      />
      <StatTile
        label="Own 2+ collections"
        value={formatCompactNumber(stats.multiCollectionCollectors)}
      />
      <StatTile
        label="Custodial splits"
        value={formatCompactNumber(stats.custodialSplits)}
        subtext={
          stats.custodialWallets > 0
            ? `across ${stats.custodialWallets} wallet${stats.custodialWallets === 1 ? "" : "s"}`
            : undefined
        }
      />
      {stats.topCollector && (
        <StatTile
          label="Top collector"
          value={formatCompactNumber(stats.topCollector.totalCount)}
          subtext={topCollectorLabel}
        />
      )}
    </div>
  );
}
