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

export function etherscanTxUrl(txHash: string): string {
  return `https://etherscan.io/tx/${txHash}`;
}

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Formats a wei amount (as a decimal string, to stay safe past JS number
// precision) into a human-friendly ETH amount with a bounded decimal count.
export function weiToEth(weiStr: string, decimals = 4): string {
  try {
    const wei = BigInt(weiStr);
    const negative = wei < BigInt(0);
    const abs = negative ? -wei : wei;
    const base = BigInt(10) ** BigInt(18);
    const whole = abs / base;
    const remainder = abs % base;
    const fraction = remainder
      .toString()
      .padStart(18, "0")
      .slice(0, decimals)
      .replace(/0+$/, "");
    const result = fraction ? `${whole}.${fraction}` : whole.toString();
    return negative ? `-${result}` : result;
  } catch {
    return "?";
  }
}

export function formatRelativeTime(date: string | Date | null): string {
  if (!date) return "";
  const target = typeof date === "string" ? new Date(date) : date;
  const diffSec = Math.floor((Date.now() - target.getTime()) / 1000);

  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMonth = Math.floor(diffDay / 30);
  return `${diffMonth}mo ago`;
}
