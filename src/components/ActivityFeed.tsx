"use client";

import { useEffect, useState } from "react";
import {
  ZERO_ADDRESS,
  etherscanAddressUrl,
  etherscanTxUrl,
  formatRelativeTime,
  shortenAddress,
  weiToEth,
} from "@/lib/format";

interface ActivityItem {
  id: number;
  collectionId: number;
  collectionName: string | null;
  collectionAddress: string;
  tokenId: string;
  tokenName: string | null;
  tokenImageUrl: string | null;
  fromAddress: string;
  fromNickname: string | null;
  toAddress: string;
  toNickname: string | null;
  txHash: string;
  blockNumber: number;
  blockTimestamp: string | null;
  isSale: boolean;
  marketplace: string | null;
  priceWei: string | null;
  priceSymbol: string | null;
}

const POLL_INTERVAL_MS = 20000;

function AddressLabel({
  address,
  nickname,
}: {
  address: string;
  nickname: string | null;
}) {
  if (address === ZERO_ADDRESS) {
    return <span>mint</span>;
  }
  return (
    <a
      href={etherscanAddressUrl(address)}
      target="_blank"
      rel="noreferrer"
      className="hover:underline"
    >
      {nickname ?? shortenAddress(address)}
    </a>
  );
}

export function ActivityFeed() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/activity");
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
      <h2 className="mb-1 text-sm font-semibold text-neutral-200">Activity</h2>
      <p className="mb-4 text-xs text-neutral-500">
        Recent transfers &amp; sales across tracked collections.
      </p>

      {loading ? (
        <p className="text-xs text-neutral-500">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-neutral-500">
          No activity yet. Sync a collection to fetch recent transfers.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex gap-2 border-b border-neutral-900 pb-3 text-xs"
            >
              <a
                href={etherscanTxUrl(item.txHash)}
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
                  {item.collectionName ?? shortenAddress(item.collectionAddress)}{" "}
                  #{item.tokenId}
                </div>
                <div className="truncate text-neutral-500">
                  <AddressLabel
                    address={item.fromAddress}
                    nickname={item.fromNickname}
                  />
                  {" → "}
                  <AddressLabel
                    address={item.toAddress}
                    nickname={item.toNickname}
                  />
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-neutral-500">
                  {item.isSale && item.priceWei && (
                    <span className="text-emerald-400">
                      {weiToEth(item.priceWei)} {item.priceSymbol ?? "ETH"}
                      {item.marketplace ? ` · ${item.marketplace}` : ""}
                    </span>
                  )}
                  <span>{formatRelativeTime(item.blockTimestamp)}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
