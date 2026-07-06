"use client";

import { useState } from "react";
import { NicknameEditor } from "@/components/NicknameEditor";
import { CustodialPanel } from "@/components/CustodialPanel";
import { etherscanAddressUrl, shortenAddress } from "@/lib/format";

export function CollectorCell({
  walletAddresses,
  nickname,
  onSaved,
  onDataChanged,
}: {
  walletAddresses: string[];
  nickname: string | null;
  onSaved?: (nickname: string | null) => void;
  onDataChanged?: () => void;
}) {
  const primaryAddress = walletAddresses[0];
  const [adding, setAdding] = useState(false);
  const [newAddress, setNewAddress] = useState("");
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCustodial, setShowCustodial] = useState(false);

  async function handleAddWallet(e: React.FormEvent) {
    e.preventDefault();
    setMerging(true);
    setError(null);
    try {
      const res = await fetch(`/api/wallets/${primaryAddress}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: newAddress }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to add wallet");
        return;
      }
      setNewAddress("");
      setAdding(false);
      onDataChanged?.();
    } finally {
      setMerging(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <NicknameEditor
          address={primaryAddress}
          nickname={nickname}
          onSaved={onSaved}
        />
        {nickname && (
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            title="Add another wallet under this nickname"
            className="rounded border border-neutral-700 px-1 text-xs leading-4 text-neutral-500 hover:text-neutral-200"
          >
            +
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowCustodial((v) => !v)}
          title="This is a custodial wallet — split its NFTs among named holders"
          className="rounded border border-neutral-700 px-1 text-xs leading-4 text-neutral-500 hover:text-neutral-200"
        >
          C
        </button>
      </div>

      {adding && (
        <form onSubmit={handleAddWallet} className="mt-1 flex gap-1">
          <input
            autoFocus
            value={newAddress}
            onChange={(e) => setNewAddress(e.target.value)}
            placeholder="0x... wallet to merge in"
            disabled={merging}
            className="w-40 rounded border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 text-xs"
          />
          <button
            type="submit"
            disabled={merging}
            className="rounded bg-neutral-100 px-2 text-xs font-medium text-neutral-900 disabled:opacity-50"
          >
            Add
          </button>
        </form>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}

      {showCustodial && (
        <CustodialPanel
          walletAddress={primaryAddress}
          onClose={() => {
            setShowCustodial(false);
            // Refresh the main table only now, not after every click inside
            // the panel -- otherwise every assignment re-sorts the whole
            // table by count and the row (and the open panel with it) jumps
            // around mid-edit.
            onDataChanged?.();
          }}
        />
      )}

      <div className="flex flex-col">
        {walletAddresses.map((addr) => (
          <a
            key={addr}
            href={etherscanAddressUrl(addr)}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-neutral-500 hover:underline"
          >
            {shortenAddress(addr)}
          </a>
        ))}
      </div>
    </div>
  );
}
