const ALCHEMY_BASE = "https://eth-mainnet.g.alchemy.com/nft/v3";

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
