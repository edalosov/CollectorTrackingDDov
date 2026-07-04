export function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function etherscanAddressUrl(address: string): string {
  return `https://etherscan.io/address/${address}`;
}

export function etherscanTokenUrl(
  contractAddress: string,
  tokenId: string,
): string {
  return `https://etherscan.io/nft/${contractAddress}/${tokenId}`;
}
