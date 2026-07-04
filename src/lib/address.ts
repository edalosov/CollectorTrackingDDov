const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function isValidAddress(address: string): boolean {
  return ADDRESS_RE.test(address);
}

export function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}
