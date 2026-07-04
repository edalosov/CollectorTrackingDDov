"use client";

import { useState } from "react";
import { etherscanTokenUrl } from "@/lib/format";

interface HeldToken {
  tokenId: string;
  name: string | null;
  imageUrl: string | null;
}

function Thumbnail({
  contractAddress,
  token,
}: {
  contractAddress: string;
  token: HeldToken;
}) {
  const [failed, setFailed] = useState(false);
  const label = token.name ?? `#${token.tokenId}`;

  return (
    <a
      href={etherscanTokenUrl(contractAddress, token.tokenId)}
      target="_blank"
      rel="noreferrer"
      title={label}
      className="block h-10 w-10 shrink-0 overflow-hidden rounded border border-neutral-700 bg-neutral-800"
    >
      {token.imageUrl && !failed ? (
        // Images come from arbitrary collection-specific hosts, so a plain
        // <img> is used instead of next/image to avoid a fixed domain allowlist.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={token.imageUrl}
          alt={label}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center px-0.5 text-center text-[9px] leading-tight text-neutral-500">
          #{token.tokenId}
        </span>
      )}
    </a>
  );
}

export function TokenThumbnails({
  contractAddress,
  tokens,
  max = 12,
}: {
  contractAddress: string;
  tokens: HeldToken[];
  max?: number;
}) {
  const visible = tokens.slice(0, max);
  const remaining = tokens.length - visible.length;

  return (
    <div className="flex max-w-md flex-wrap gap-1.5">
      {visible.map((token) => (
        <Thumbnail
          key={token.tokenId}
          contractAddress={contractAddress}
          token={token}
        />
      ))}
      {remaining > 0 && (
        <span className="flex h-10 items-center px-1 text-xs text-neutral-500">
          +{remaining} more
        </span>
      )}
    </div>
  );
}
