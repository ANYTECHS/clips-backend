/**
 * All Soroban NFT contract event types that the indexer recognises and persists.
 *
 * Event naming convention:
 *  - PascalCase, matching the second topic emitted by the Rust contract.
 *  - Each entry corresponds to a state-changing function in ClipCashNFT.
 *
 * Payload shapes (the event value / data body):
 *
 *  Initialized         { owner, creator_royalty_bps, platform_royalty_bps }
 *  Mint                { token_id, owner, clip_id, metadata_uri, creator_royalty_bps }
 *  Transfer            { token_id, from, to, sale_price, royalty_amount }
 *  Burn                { token_id, owner }
 *  Frozen              { token_id, admin, frozen: true }
 *  Unfrozen            { token_id, admin, frozen: false }
 *  RoyaltyClaimed      { token_id, recipient, amount, asset }
 *  RoyaltyUpdated      { updated_by, old_creator_bps, new_creator_bps,
 *                        old_platform_bps, new_platform_bps }
 *  MetadataRefreshed   { token_id, updated_by, new_metadata_uri }
 *  PauseScheduled      { requested_by, requested_at, scheduled_for, reason }
 *  Paused              { paused_by, activated_at }
 *  Unpaused            { unpaused_by, unpaused_at }
 *  OwnershipTransferred { previous_owner, new_owner }
 *  RoyaltyPaid         { token_id, from, to, creator, creator_royalty,
 *                        platform, platform_royalty, sale_price }
 *  Refunded            { token_id, recipient, amount }
 */
export const SOROBAN_NFT_EVENT_TYPES = [
  'Initialized',
  'Mint',
  'Transfer',
  'Burn',
  'Frozen',
  'Unfrozen',
  'RoyaltyClaimed',
  'RoyaltyUpdated',
  'MetadataRefreshed',
  'PauseScheduled',
  'Paused',
  'Unpaused',
  'OwnershipTransferred',
  'RoyaltyPaid',
  'Refunded',
] as const;

export type SorobanNftEventType = (typeof SOROBAN_NFT_EVENT_TYPES)[number];
