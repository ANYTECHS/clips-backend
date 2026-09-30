export const SOROBAN_NFT_EVENT_TYPES = [
  'Mint',
  'Transfer',
  'RoyaltyUpdated',
  'ConfigurationUpdated',
  'MetadataRefreshed',
  'Paused',
  'Unpaused',
  'Frozen',
  'Unfrozen',
  'Burn',
  'RoyaltyPaid',
  'RoyaltyClaimed',
] as const;

export type SorobanNftEventType = (typeof SOROBAN_NFT_EVENT_TYPES)[number];
