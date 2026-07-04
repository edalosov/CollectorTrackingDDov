"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { etherscanAddressUrl, shortenAddress } from "@/lib/format";

interface Collection {
  id: number;
  address: string;
  name: string | null;
  symbol: string | null;
  tokenType: string | null;
  addedAt: string;
  lastSyncedAt: string | null;
  holderCount: number;
  tokenCount: number;
}

export default function CollectionsPage() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [addAddress, setAddAddress] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/collections");
    const data = await res.json();
    setCollections(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: addAddress }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to add collection");
        return;
      }
      setAddAddress("");
      await load();
    } finally {
      setAdding(false);
    }
  }

  async function handleSync(collection: Collection) {
    setSyncingId(collection.id);
    setError(null);
    try {
      const res = await fetch(`/api/collections/${collection.address}/sync`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Sync failed");
        return;
      }
      await load();
    } finally {
      setSyncingId(null);
    }
  }

  async function handleDelete(collection: Collection) {
    if (
      !confirm(
        `Stop tracking ${collection.name ?? collection.address}? This deletes all synced holder data for it.`,
      )
    ) {
      return;
    }
    await fetch(`/api/collections/${collection.address}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">Collections</h1>
        <p className="text-sm text-neutral-400">
          Add an Ethereum NFT contract address to start tracking its holders.
        </p>
      </div>

      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          value={addAddress}
          onChange={(e) => setAddAddress(e.target.value)}
          placeholder="0x contract address"
          className="w-full max-w-md rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={adding}
          className="rounded bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 disabled:opacity-50"
        >
          {adding ? "Adding..." : "Add"}
        </button>
      </form>
      {error && <p className="text-sm text-red-400">{error}</p>}

      {loading ? (
        <p className="text-neutral-400">Loading...</p>
      ) : collections.length === 0 ? (
        <p className="text-neutral-400">No collections tracked yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-neutral-400">
            <tr className="border-b border-neutral-800">
              <th className="py-2 pr-4">Collection</th>
              <th className="py-2 pr-4">Type</th>
              <th className="py-2 pr-4">Holders</th>
              <th className="py-2 pr-4">Tokens tracked</th>
              <th className="py-2 pr-4">Last synced</th>
              <th className="py-2 pr-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {collections.map((c) => (
              <tr key={c.id} className="border-b border-neutral-900">
                <td className="py-2 pr-4">
                  <Link
                    href={`/collections/${c.address}`}
                    className="font-medium hover:underline"
                  >
                    {c.name ?? "Unnamed collection"}
                  </Link>
                  {c.symbol && (
                    <span className="ml-1 text-neutral-500">${c.symbol}</span>
                  )}
                  <div>
                    <a
                      href={etherscanAddressUrl(c.address)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-neutral-500 hover:underline"
                    >
                      {shortenAddress(c.address)}
                    </a>
                  </div>
                </td>
                <td className="py-2 pr-4 text-neutral-400">
                  {c.tokenType ?? "—"}
                </td>
                <td className="py-2 pr-4">{c.holderCount}</td>
                <td className="py-2 pr-4">{c.tokenCount}</td>
                <td className="py-2 pr-4 text-neutral-400">
                  {c.lastSyncedAt
                    ? new Date(c.lastSyncedAt).toLocaleString()
                    : "Never"}
                </td>
                <td className="py-2 pr-4">
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleSync(c)}
                      disabled={syncingId === c.id}
                      className="text-neutral-300 hover:underline disabled:opacity-50"
                    >
                      {syncingId === c.id ? "Syncing..." : "Sync"}
                    </button>
                    <button
                      onClick={() => handleDelete(c)}
                      className="text-red-400 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
