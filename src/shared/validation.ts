export const STELLAR_PUBLIC_KEY_REGEX = /^G[A-Z2-7]{55}$/;
export const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const EVM_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

export type SupportedChain = 'stellar' | 'solana' | 'base';

export function validateAddressForChain(
  address: string,
  chain: SupportedChain,
): boolean {
  switch (chain) {
    case 'stellar':
      return STELLAR_PUBLIC_KEY_REGEX.test(address);
    case 'solana':
      return SOLANA_ADDRESS_REGEX.test(address);
    case 'base':
      return EVM_ADDRESS_REGEX.test(address);
    default:
      return false;
  }
}

export function chainDisplayName(chain: SupportedChain): string {
  switch (chain) {
    case 'stellar':
      return 'Stellar (G-prefix, Base32, 56 chars)';
    case 'solana':
      return 'Solana (base58, 32–44 chars)';
    case 'base':
      return 'Base (0x-prefixed hex, 42 chars)';
    default:
      return chain;
  }
}
