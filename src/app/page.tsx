"use client";

import { useCallback, useEffect, useState } from "react";
import { NicknameEditor } from "@/components/NicknameEditor";
import { etherscanAddressUrl, shortenAddress } from "@/lib/format";

interface CollectionOption {
  id: number;
  address: string;
  name: string | null;
}

interface CollectorRow {
  walletAddress: string;
  nickname: string | null;
  totalCount: number;
  filteredCount: number;
  collections: {
    collectionId: number;
    address: string;
    name: string | null;
    count: number;
  }[];
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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Collectors</h1>
        <p className="text-sm text-neutral-400">
          Everyone holding NFTs across your tracked collections.
        </p>
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
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.walletAddress}
                className="border-b border-neutral-900 align-top"
              >
                <td className="py-2 pr-4 text-neutral-500">{i + 1}</td>
                <td className="py-2 pr-4">
                  <NicknameEditor
                    address={r.walletAddress}
                    nickname={r.nickname}
                    onSaved={(nickname) =>
                      setRows((prev) =>
                        prev.map((p) =>
                          p.walletAddress === r.walletAddress
                            ? { ...p, nickname }
                            : p,
                        ),
                      )
                    }
                  />
                  <div>
                    <a
                      href={etherscanAddressUrl(r.walletAddress)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-neutral-500 hover:underline"
                    >
                      {shortenAddress(r.walletAddress)}
                    </a>
                  </div>
                </td>
                <td className="py-2 pr-4 font-medium">{r.filteredCount}</td>
                <td className="py-2 pr-4 text-neutral-400">
                  {r.collections
                    .map(
                      (c) =>
                        `${c.name ?? shortenAddress(c.address)}: ${c.count}`,
                    )
                    .join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
