"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { CollectorCell } from "@/components/CollectorCell";
import { TokenThumbnails } from "@/components/TokenThumbnails";
import { etherscanAddressUrl } from "@/lib/format";

interface HeldToken {
  tokenId: string;
  name: string | null;
  imageUrl: string | null;
}

interface Holder {
  groupKey: string;
  collectorId: number | null;
  walletAddresses: string[];
  nickname: string | null;
  tokenCount: number;
  heldTokens: HeldToken[];
}

interface CollectionInfo {
  id: number;
  address: string;
  name: string | null;
  symbol: string | null;
  tokenType: string | null;
  lastSyncedAt: string | null;
}

export default function CollectionDetailPage() {
  const params = useParams<{ address: string }>();
  const address = params.address;

  const [collection, setCollection] = useState<CollectionInfo | null>(null);
  const [holders, setHolders] = useState<Holder[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncInfo, setSyncInfo] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [minCount, setMinCount] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/collections/${address}/holders`);
    if (res.ok) {
      const data = await res.json();
      setCollection(data.collection);
      setHolders(data.holders);
    } else {
      setNotFound(true);
    }
    setLoading(false);
  }, [address]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSync() {
    setSyncing(true);
    setSyncError(null);
    setSyncInfo(null);
    try {
      const res = await fetch(`/api/collections/${address}/sync`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setSyncError(data.error ?? "Sync failed");
        return;
      }

      if (data.metadataWarning) {
        setSyncError(`Synced holders, but couldn't fetch NFT images: ${data.metadataWarning}`);
      }

      setSyncInfo(
        `Synced ${data.holderCount ?? 0} holders, ${data.tokenCount ?? 0} tokens, ${data.changeCount ?? 0} change${data.changeCount === 1 ? "" : "s"} logged.`,
      );
      await load();
    } finally {
      setSyncing(false);
    }
  }

  const filtered = useMemo(() => {
    return holders.filter((h) => {
      if (minCount && h.tokenCount < Number(minCount)) return false;
      if (search) {
        const s = search.toLowerCase();
        if (
          !h.walletAddresses.some((a) => a.includes(s)) &&
          !(h.nickname?.toLowerCase().includes(s) ?? false)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [holders, search, minCount]);

  if (loading && !collection) {
    return <p className="text-neutral-400">Loading...</p>;
  }

  if (notFound || !collection) {
    return <p className="text-neutral-400">Collection not found.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">
            {collection.name ?? "Unnamed collection"}
            {collection.symbol && (
              <span className="ml-2 text-neutral-500">${collection.symbol}</span>
            )}
          </h1>
          <a
            href={etherscanAddressUrl(collection.address)}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-neutral-500 hover:underline"
          >
            {collection.address}
          </a>
          <p className="text-xs text-neutral-500">
            Last synced:{" "}
            {collection.lastSyncedAt
              ? new Date(collection.lastSyncedAt).toLocaleString()
              : "Never"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="rounded bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 disabled:opacity-50"
          >
            {syncing ? "Syncing..." : "Sync now"}
          </button>
          {syncError && <p className="text-xs text-red-400">{syncError}</p>}
          {!syncError && syncInfo && (
            <p className="text-xs text-neutral-500">{syncInfo}</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          placeholder="Search address or nickname"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm"
        />
        <input
          placeholder="Min NFTs owned"
          type="number"
          value={minCount}
          onChange={(e) => setMinCount(e.target.value)}
          className="w-40 rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm"
        />
      </div>

      {holders.length === 0 ? (
        <p className="text-neutral-400">
          No holders synced yet. Click &ldquo;Sync now&rdquo; to fetch current owners.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-neutral-400">
            <tr className="border-b border-neutral-800">
              <th className="py-2 pr-4">#</th>
              <th className="py-2 pr-4">Collector</th>
              <th className="py-2 pr-4">NFTs owned</th>
              <th className="py-2 pr-4">Tokens</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((h, i) => (
              <tr
                key={h.groupKey}
                className="border-b border-neutral-900 align-top"
              >
                <td className="py-2 pr-4 text-neutral-500">{i + 1}</td>
                <td className="py-2 pr-4">
                  <CollectorCell
                    walletAddresses={h.walletAddresses}
                    nickname={h.nickname}
                    onSaved={(nickname) =>
                      setHolders((prev) =>
                        prev.map((p) =>
                          p.groupKey === h.groupKey ? { ...p, nickname } : p,
                        ),
                      )
                    }
                    onMerged={load}
                  />
                </td>
                <td className="py-2 pr-4 font-medium">{h.tokenCount}</td>
                <td className="py-2 pr-4">
                  <TokenThumbnails
                    contractAddress={collection.address}
                    tokens={h.heldTokens}
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
