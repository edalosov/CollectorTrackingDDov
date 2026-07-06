"use client";

import { useCallback, useEffect, useState } from "react";
import { CollectorCell } from "@/components/CollectorCell";
import { CommentsCell } from "@/components/CommentsCell";
import { TokenThumbnails } from "@/components/TokenThumbnails";
import { etherscanAddressUrl, shortenAddress } from "@/lib/format";

interface CollectionOption {
  id: number;
  address: string;
  name: string | null;
}

interface HeldToken {
  tokenId: string;
  name: string | null;
  imageUrl: string | null;
}

interface CollectionBreakdown {
  collectionId: number;
  address: string;
  name: string | null;
  count: number;
  heldTokens: HeldToken[];
}

interface CollectorRow {
  groupKey: string;
  collectorId: number | null;
  walletAddresses: string[];
  nickname: string | null;
  notes: string | null;
  totalCount: number;
  filteredCount: number;
  collections: CollectionBreakdown[];
  isAllocation: boolean;
  isCustodial: boolean;
  isOverAllocated: boolean;
}

export default function CollectorsPage() {
  const [collectionOptions, setCollectionOptions] = useState<
    CollectionOption[]
  >([]);
  const [rows, setRows] = useState<CollectorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [collectionId, setCollectionId] = useState("");
  const [minCount, setMinCount] = useState("");
  const [maxCount, setMaxCount] = useState("");
  const [search, setSearch] = useState("");
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncAllResult, setSyncAllResult] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/collections")
      .then((r) => r.json())
      .then(setCollectionOptions);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (collectionId) params.set("collectionId", collectionId);
    if (minCount) params.set("minCount", minCount);
    if (maxCount) params.set("maxCount", maxCount);
    if (search) params.set("search", search);
    const res = await fetch(`/api/collectors?${params.toString()}`);
    const data = await res.json();
    setRows(data);
    setLoading(false);
  }, [collectionId, minCount, maxCount, search]);

  useEffect(() => {
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [load]);

  async function handleSyncAll() {
    setSyncingAll(true);
    setSyncAllResult(null);
    try {
      const res = await fetch("/api/collections/sync-all", { method: "POST" });
      const data = await res.json();
      const results: Array<{
        address: string;
        name: string | null;
        ok: boolean;
        error?: string;
      }> = data.results ?? [];
      const failed = results.filter((r) => !r.ok);
      setSyncAllResult(
        failed.length === 0
          ? `Synced ${results.length} collection${results.length === 1 ? "" : "s"}.`
          : `Synced ${results.length - failed.length} of ${results.length}. Failed: ${failed
              .map((r) => r.name ?? r.address)
              .join(", ")}`,
      );
      await load();
    } finally {
      setSyncingAll(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Collectors</h1>
          <p className="text-sm text-neutral-400">
            Everyone holding NFTs across your tracked collections.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={handleSyncAll}
            disabled={syncingAll}
            className="rounded bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 disabled:opacity-50"
          >
            {syncingAll ? "Syncing all..." : "Sync all collections"}
          </button>
          {syncAllResult && (
            <p className="max-w-xs text-right text-xs text-neutral-500">
              {syncAllResult}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          value={collectionId}
          onChange={(e) => setCollectionId(e.target.value)}
          className="rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm"
        >
          <option value="">All collections</option>
          {collectionOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name ?? shortenAddress(c.address)}
            </option>
          ))}
        </select>
        <input
          placeholder="Min NFTs owned"
          type="number"
          value={minCount}
          onChange={(e) => setMinCount(e.target.value)}
          className="w-40 rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm"
        />
        <input
          placeholder="Max NFTs owned"
          type="number"
          value={maxCount}
          onChange={(e) => setMaxCount(e.target.value)}
          className="w-40 rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm"
        />
        <input
          placeholder="Search address or nickname"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm"
        />
      </div>

      {loading ? (
        <p className="text-neutral-400">Loading...</p>
      ) : rows.length === 0 ? (
        <p className="text-neutral-400">
          No collectors found yet. Add a collection and sync it first.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-neutral-400">
            <tr className="border-b border-neutral-800">
              <th className="py-2 pr-4">#</th>
              <th className="py-2 pr-4">Collector</th>
              <th className="py-2 pr-4">
                {collectionId ? "NFTs in this collection" : "Total NFTs"}
              </th>
              <th className="py-2 pr-4">Breakdown</th>
              <th className="py-2 pr-4">Comments</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.groupKey}
                className="border-b border-neutral-900 align-top"
              >
                <td className="py-2 pr-4 text-neutral-500">{i + 1}</td>
                <td className="py-2 pr-4">
                  {r.isAllocation ? (
                    <div>
                      <div className="flex items-center gap-1.5 font-medium">
                        {r.nickname}
                        <span className="rounded border border-amber-700 px-1 text-[10px] font-normal text-amber-500">
                          custodial
                        </span>
                      </div>
                      <a
                        href={etherscanAddressUrl(r.walletAddresses[0])}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-neutral-500 hover:underline"
                      >
                        via {shortenAddress(r.walletAddresses[0])}
                      </a>
                    </div>
                  ) : (
                    <CollectorCell
                      walletAddresses={r.walletAddresses}
                      nickname={r.nickname}
                      onSaved={(nickname) =>
                        setRows((prev) =>
                          prev.map((p) =>
                            p.groupKey === r.groupKey ? { ...p, nickname } : p,
                          ),
                        )
                      }
                      onDataChanged={load}
                    />
                  )}
                </td>
                <td className="py-2 pr-4 font-medium">
                  {r.filteredCount}
                  {r.isCustodial && (
                    <span className="ml-1 text-xs font-normal text-neutral-500">
                      unallocated
                    </span>
                  )}
                  {r.isOverAllocated && (
                    <span className="ml-1 text-xs font-normal text-red-400">
                      over-allocated
                    </span>
                  )}
                </td>
                <td className="py-2 pr-4">
                  <div className="flex flex-col gap-3">
                    {r.collections.map((c) => (
                      <div key={c.collectionId}>
                        <div className="mb-1 text-xs text-neutral-400">
                          {c.name ?? shortenAddress(c.address)}: {c.count}
                        </div>
                        <TokenThumbnails
                          contractAddress={c.address}
                          tokens={c.heldTokens}
                          max={6}
                        />
                      </div>
                    ))}
                  </div>
                </td>
                <td className="py-2 pr-4">
                  <CommentsCell
                    collectorId={r.collectorId}
                    notes={r.notes}
                    onSaved={(notes) =>
                      setRows((prev) =>
                        prev.map((p) =>
                          p.groupKey === r.groupKey ? { ...p, notes } : p,
                        ),
                      )
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
