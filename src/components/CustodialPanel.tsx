"use client";

import { useCallback, useEffect, useState } from "react";
import { shortenAddress } from "@/lib/format";

interface Allocation {
  id: number;
  name: string;
  count: number;
}

interface CollectionEntry {
  collectionId: number;
  collectionName: string | null;
  collectionAddress: string | null;
  walletBalance: number;
  allocations: Allocation[];
}

export function CustodialPanel({
  walletAddress,
  onClose,
  onChanged,
}: {
  walletAddress: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [entries, setEntries] = useState<CollectionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<
    Record<number, { name: string; count: string }>
  >({});
  const [savingCollectionId, setSavingCollectionId] = useState<number | null>(
    null,
  );

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/wallets/${walletAddress}/custodial-allocations`);
    if (res.ok) {
      setEntries(await res.json());
    }
    setLoading(false);
  }, [walletAddress]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdd(collectionId: number) {
    const draft = drafts[collectionId] ?? { name: "", count: "" };
    if (!draft.name.trim()) {
      setError("Name is required");
      return;
    }
    const count = Number(draft.count);
    if (!Number.isInteger(count) || count < 0) {
      setError("Count must be a non-negative whole number");
      return;
    }

    setSavingCollectionId(collectionId);
    setError(null);
    try {
      const res = await fetch(
        `/api/wallets/${walletAddress}/custodial-allocations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ collectionId, name: draft.name, count }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save");
        return;
      }
      setDrafts((prev) => ({ ...prev, [collectionId]: { name: "", count: "" } }));
      await load();
      onChanged?.();
    } finally {
      setSavingCollectionId(null);
    }
  }

  async function handleRemove(id: number) {
    await fetch(`/api/wallets/${walletAddress}/custodial-allocations/${id}`, {
      method: "DELETE",
    });
    await load();
    onChanged?.();
  }

  return (
    <div className="z-10 mt-2 w-80 rounded border border-neutral-700 bg-neutral-900 p-3 text-xs shadow-lg">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium text-neutral-200">
          Custodial splits — {shortenAddress(walletAddress)}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-neutral-500 hover:text-neutral-200"
        >
          ✕
        </button>
      </div>

      {loading ? (
        <p className="text-neutral-500">Loading...</p>
      ) : entries.length === 0 ? (
        <p className="text-neutral-500">
          This wallet doesn&apos;t currently hold anything in a tracked
          collection.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {entries.map((entry) => {
            const allocatedTotal = entry.allocations.reduce(
              (sum, a) => sum + a.count,
              0,
            );
            const unallocated = entry.walletBalance - allocatedTotal;
            const draft = drafts[entry.collectionId] ?? { name: "", count: "" };

            return (
              <div
                key={entry.collectionId}
                className="border-t border-neutral-800 pt-2 first:border-t-0 first:pt-0"
              >
                <div className="mb-1 font-medium text-neutral-300">
                  {entry.collectionName ??
                    shortenAddress(entry.collectionAddress ?? "")}
                  <span className="ml-1 text-neutral-500">
                    ({entry.walletBalance} total)
                  </span>
                </div>

                {entry.allocations.length > 0 && (
                  <ul className="mb-1 flex flex-col gap-0.5">
                    {entry.allocations.map((a) => (
                      <li
                        key={a.id}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="text-neutral-300">
                          {a.name}: {a.count}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemove(a.id)}
                          className="text-neutral-500 hover:text-red-400"
                        >
                          remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <p
                  className={
                    unallocated < 0 ? "text-red-400" : "text-neutral-500"
                  }
                >
                  {unallocated < 0
                    ? `Over-allocated by ${-unallocated}`
                    : `Unallocated: ${unallocated}`}
                </p>

                <div className="mt-1 flex gap-1">
                  <input
                    value={draft.name}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [entry.collectionId]: { ...draft, name: e.target.value },
                      }))
                    }
                    placeholder="Name"
                    className="w-24 min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-950 px-1.5 py-0.5"
                  />
                  <input
                    value={draft.count}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [entry.collectionId]: { ...draft, count: e.target.value },
                      }))
                    }
                    placeholder="Count"
                    type="number"
                    className="w-14 rounded border border-neutral-700 bg-neutral-950 px-1.5 py-0.5"
                  />
                  <button
                    type="button"
                    onClick={() => handleAdd(entry.collectionId)}
                    disabled={savingCollectionId === entry.collectionId}
                    className="rounded bg-neutral-100 px-2 font-medium text-neutral-900 disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {error && <p className="mt-2 text-red-400">{error}</p>}
    </div>
  );
}
