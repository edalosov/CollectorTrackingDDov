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
