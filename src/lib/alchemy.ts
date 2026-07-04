const ALCHEMY_BASE = "https://eth-mainnet.g.alchemy.com/nft/v3";
const ALCHEMY_CORE_BASE = "https://eth-mainnet.g.alchemy.com/v2";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function getApiKey(): string {
  const key = process.env.ALCHEMY_API_KEY;
  if (!key) {
    throw new Error("ALCHEMY_API_KEY environment variable is not set");
  }
  return key;
}

async function alchemyFetch<T>(
  endpoint: string,
  params: Record<string, string>,
): Promise<T> {
  const url = new URL(`${ALCHEMY_BASE}/${getApiKey()}/${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Alchemy ${endpoint} request failed: ${res.status} ${res.statusText} ${body}`,
    );
  }
  return res.json() as Promise<T>;
}

// Alchemy returns token IDs as hex strings; store/display them as decimal.
function hexToDecimalString(tokenId: string): string {
  if (/^0x[0-9a-fA-F]+$/.test(tokenId)) {
    return BigInt(tokenId).toString(10);
  }
  return tokenId;
}

export interface ContractMetadata {
  name: string | null;
  symbol: string | null;
  tokenType: string | null;
  totalSupply: string | null;
}

export async function getContractMetadata(
  contractAddress: string,
): Promise<ContractMetadata> {
  const data = await alchemyFetch<{
    address: string;
    name?: string;
    symbol?: string;
    tokenType?: string;
    totalSupply?: string;
  }>("getContractMetadata", { contractAddress });

  return {
    name: data.name ?? null,
    symbol: data.symbol ?? null,
    tokenType: data.tokenType ?? null,
    totalSupply: data.totalSupply ?? null,
  };
}

export interface OwnerHolding {
  ownerAddress: string;
  tokenId: string;
  balance: number;
}

interface GetOwnersForContractResponse {
  owners: Array<{
    ownerAddress: string;
    tokenBalances: Array<{ tokenId: string; balance: string | number }>;
  }>;
  pageKey?: string;
}

// Fetches every (owner, tokenId, balance) tuple for a contract, following pagination.
export async function getOwnersForContract(
  contractAddress: string,
): Promise<OwnerHolding[]> {
  const results: OwnerHolding[] = [];
  let pageKey: string | undefined;

  do {
    const params: Record<string, string> = {
      contractAddress,
      withTokenBalances: "true",
    };
    if (pageKey) {
      params.pageKey = pageKey;
    }

    const data = await alchemyFetch<GetOwnersForContractResponse>(
      "getOwnersForContract",
      params,
    );

    for (const owner of data.owners) {
      for (const tb of owner.tokenBalances) {
        results.push({
          ownerAddress: owner.ownerAddress.toLowerCase(),
          tokenId: hexToDecimalString(tb.tokenId),
          balance: Number(tb.balance) || 1,
        });
      }
    }

    pageKey = data.pageKey;
  } while (pageKey);

  return results;
}

export interface TokenMetadata {
  tokenId: string;
  name: string | null;
  imageUrl: string | null;
}

interface AlchemyNftMetadataItem {
  tokenId: string;
  name?: string;
  image?: {
    cachedUrl?: string;
    thumbnailUrl?: string;
    originalUrl?: string;
  };
  raw?: { metadata?: { name?: string } };
}

const METADATA_BATCH_SIZE = 100;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

// Fetches name + thumbnail image for a specific set of token IDs (as opposed
// to paging through the whole contract), since we already know which token
// IDs are actually owned from getOwnersForContract.
export async function getNFTMetadataBatch(
  contractAddress: string,
  tokenIds: string[],
): Promise<TokenMetadata[]> {
  const results: TokenMetadata[] = [];

  for (const group of chunk(tokenIds, METADATA_BATCH_SIZE)) {
    const res = await fetch(
      `${ALCHEMY_BASE}/${getApiKey()}/getNFTMetadataBatch`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokens: group.map((tokenId) => ({ contractAddress, tokenId })),
        }),
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Alchemy getNFTMetadataBatch request failed: ${res.status} ${res.statusText} ${body}`,
      );
    }

    const data = (await res.json()) as { nfts: AlchemyNftMetadataItem[] };
    for (const nft of data.nfts) {
      results.push({
        tokenId: hexToDecimalString(nft.tokenId),
        name: nft.name ?? nft.raw?.metadata?.name ?? null,
        imageUrl:
          nft.image?.thumbnailUrl ??
          nft.image?.cachedUrl ??
          nft.image?.originalUrl ??
          null,
      });
    }
  }

  return results;
}

export interface TransferEvent {
  tokenId: string;
  fromAddress: string;
  toAddress: string;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  blockTimestamp: string | null; // ISO string
}

interface AlchemyTransferItem {
  blockNum: string; // hex
  hash: string;
  from: string;
  to: string | null;
  erc721TokenId?: string;
  erc1155Metadata?: Array<{ tokenId: string; value: string }>;
  uniqueId?: string;
  metadata?: { blockTimestamp?: string };
}

// Alchemy's transfer objects don't expose a plain numeric log index; if
// present in uniqueId (e.g. "<hash>:log:<n>") we extract it, otherwise we
// fall back to a synthetic per-fetch counter. Either way it's only used to
// keep (txHash, logIndex, tokenId) unique in our own table, not as ground truth.
function parseLogIndexFromUniqueId(uniqueId: string | undefined): number | null {
  if (!uniqueId) return null;
  const match = uniqueId.match(/log:(\d+)/i);
  return match ? Number(match[1]) : null;
}

const TRANSFERS_MAX_COUNT_HEX = "0x3e8"; // 1000, Alchemy's per-page cap

// Fetches the most recent transfers for a contract (single page, newest
// first). This intentionally does not paginate back through full history —
// for a manually-synced personal tool, "most recent ~1000 events" is enough;
// extremely high-volume collections may skip older events between syncs.
export async function getRecentTransfers(
  contractAddress: string,
): Promise<TransferEvent[]> {
  const res = await fetch(`${ALCHEMY_CORE_BASE}/${getApiKey()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "alchemy_getAssetTransfers",
      params: [
        {
          fromBlock: "0x0",
          toBlock: "latest",
          contractAddresses: [contractAddress],
          category: ["erc721", "erc1155"],
          withMetadata: true,
          order: "desc",
          maxCount: TRANSFERS_MAX_COUNT_HEX,
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Alchemy alchemy_getAssetTransfers request failed: ${res.status} ${res.statusText} ${body}`,
    );
  }

  const data = (await res.json()) as {
    error?: { message?: string };
    result?: { transfers: AlchemyTransferItem[] };
  };

  if (data.error) {
    throw new Error(
      `Alchemy alchemy_getAssetTransfers error: ${data.error.message ?? "unknown error"}`,
    );
  }

  const transfers = data.result?.transfers ?? [];
  const events: TransferEvent[] = [];

  transfers.forEach((t, i) => {
    const blockNumber = Number.parseInt(t.blockNum, 16);
    if (!Number.isFinite(blockNumber)) return;

    const blockTimestamp = t.metadata?.blockTimestamp ?? null;
    const fromAddress = t.from.toLowerCase();
    const toAddress = (t.to ?? ZERO_ADDRESS).toLowerCase();
    const baseLogIndex = parseLogIndexFromUniqueId(t.uniqueId) ?? i;

    if (t.erc1155Metadata && t.erc1155Metadata.length > 0) {
      t.erc1155Metadata.forEach((m, j) => {
        events.push({
          tokenId: hexToDecimalString(m.tokenId),
          fromAddress,
          toAddress,
          txHash: t.hash,
          logIndex: baseLogIndex * 1000 + j,
          blockNumber,
          blockTimestamp,
        });
      });
    } else if (t.erc721TokenId) {
      events.push({
        tokenId: hexToDecimalString(t.erc721TokenId),
        fromAddress,
        toAddress,
        txHash: t.hash,
        logIndex: baseLogIndex,
        blockNumber,
        blockTimestamp,
      });
    }
  });

  return events;
}

export interface SaleEvent {
  tokenId: string;
  txHash: string;
  marketplace: string | null;
  priceWei: string | null;
  priceSymbol: string | null;
}

interface AlchemyNftSaleItem {
  marketplace?: string;
  tokenId: string;
  transactionHash: string;
  sellerFee?: { amount?: string; symbol?: string };
  protocolFee?: { amount?: string };
  royaltyFee?: { amount?: string };
}

const SALES_PAGE_LIMIT = 100;
const SALES_MAX_PAGES = 3; // caps at ~300 recent sales per sync

// Fetches recent marketplace sales (with price) for a contract, used to tag
// which transfers were actual sales vs plain transfers/mints/gifts.
export async function getRecentSales(
  contractAddress: string,
): Promise<SaleEvent[]> {
  const results: SaleEvent[] = [];
  let pageKey: string | undefined;
  let pages = 0;

  do {
    const params: Record<string, string> = {
      contractAddress,
      order: "desc",
      limit: String(SALES_PAGE_LIMIT),
    };
    if (pageKey) {
      params.pageKey = pageKey;
    }

    const data = await alchemyFetch<{
      nftSales: AlchemyNftSaleItem[];
      pageKey?: string;
    }>("getNFTSales", params);

    for (const sale of data.nftSales) {
      try {
        const sellerAmount = BigInt(sale.sellerFee?.amount ?? "0");
        const protocolAmount = BigInt(sale.protocolFee?.amount ?? "0");
        const royaltyAmount = BigInt(sale.royaltyFee?.amount ?? "0");
        const total = sellerAmount + protocolAmount + royaltyAmount;

        results.push({
          tokenId: hexToDecimalString(sale.tokenId),
          txHash: sale.transactionHash,
          marketplace: sale.marketplace ?? null,
          priceWei: total > BigInt(0) ? total.toString() : null,
          priceSymbol: sale.sellerFee?.symbol ?? "ETH",
        });
      } catch {
        // Skip a malformed sale entry rather than failing the whole batch.
        continue;
      }
    }

    pageKey = data.pageKey;
    pages += 1;
  } while (pageKey && pages < SALES_MAX_PAGES);

  return results;
}
