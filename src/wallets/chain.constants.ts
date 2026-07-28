export const SUPPORTED_CHAINS = ['stellar', 'solana', 'base'] as const;

export type SupportedChain = (typeof SUPPORTED_CHAINS)[number];

export const DEFAULT_CHAIN: SupportedChain = 'stellar';

export function isSupportedChain(value: string): value is SupportedChain {
  return (SUPPORTED_CHAINS as readonly string[]).includes(value);
}

export function assertSupportedChain(value: string): SupportedChain {
  if (!isSupportedChain(value)) {
    throw new Error(
      `Unsupported chain "${value}". Supported chains: ${SUPPORTED_CHAINS.join(', ')}`,
    );
  }
  return value;
}
