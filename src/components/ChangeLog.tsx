"use client";

import { useEffect, useState } from "react";
import {
  etherscanAddressUrl,
  etherscanTokenUrl,
  formatRelativeTime,
  shortenAddress,
} from "@/lib/format";

interface ChangeItem {
  id: number;
  collectionId: number;
  collectionName: string | null;
  collectionAddress: string;
  tokenId: string;
  tokenName: string | null;
  tokenImageUrl: string | null;
  walletAddress: string;
  walletNickname: string | null;
  previousBalance: number;
  newBalance: number;
  detectedAt: string;
}

const POLL_INTERVAL_MS = 20000;

export function ChangeLog() {
  const [items, setItems] = useState<ChangeItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/changes");
        if (!cancelled && res.ok) {
          setItems(await res.json());
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <aside className="hidden w-80 shrink-0 border-l border-neutral-800 px-4 py-6 lg:block">
      <h2 className="mb-1 text-sm font-semibold text-neutral-200">
        Change log
      </h2>
      <p className="mb-4 text-xs text-neutral-500">
        Holder balance changes detected between syncs.
      </p>

      {loading ? (
        <p className="text-xs text-neutral-500">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-neutral-500">
          No changes yet. Changes only show up starting from a
          collection&apos;s second sync onward.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => {
            const gained = item.newBalance > item.previousBalance;
            return (
              <li
                key={item.id}
                className="flex gap-2 border-b border-neutral-900 pb-3 text-xs"
              >
                <a
                  href={etherscanTokenUrl(item.collectionAddress, item.tokenId)}
                  target="_blank"
                  rel="noreferrer"
                  className="block h-9 w-9 shrink-0 overflow-hidden rounded border border-neutral-700 bg-neutral-800"
                >
                  {item.tokenImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.tokenImageUrl}
                      alt={item.tokenName ?? `#${item.tokenId}`}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-[8px] text-neutral-500">
                      #{item.tokenId}
                    </span>
                  )}
                </a>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-neutral-300">
                    {item.collectionName ??
                      shortenAddress(item.collectionAddress)}{" "}
                    #{item.tokenId}
                  </div>
                  <div className="truncate text-neutral-500">
                    <a
                      href={etherscanAddressUrl(item.walletAddress)}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:underline"
                    >
                      {item.walletNickname ?? shortenAddress(item.walletAddress)}
                    </a>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className={gained ? "text-emerald-400" : "text-red-400"}>
                      {item.previousBalance} → {item.newBalance}
                    </span>
                    <span className="text-neutral-500">
                      {formatRelativeTime(item.detectedAt)}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
