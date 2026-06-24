import { Injectable } from '@nestjs/common';

/**
 * Royalty configuration loaded from environment variables.
 *
 * Basis points (bps): 100 bps = 1%
 *   PLATFORM_ROYALTY_BPS  — share kept by ClipCash (default: 100 = 1%)
 *   CREATOR_ROYALTY_BPS   — share paid to the clip creator (default: 1000 = 10%)
 *   PLATFORM_WALLET       — ClipCash treasury wallet address
 */
@Injectable()
export class NftConfig {
  /** ClipCash platform royalty in basis points (default 100 = 1%) */
  readonly platformRoyaltyBps: number;

  /** Creator royalty in basis points (default 1000 = 10%) */
  readonly creatorRoyaltyBps: number;

  /** ClipCash treasury wallet address (Stellar or Solana) */
  readonly platformWallet: string;

  constructor() {
    this.platformRoyaltyBps = parseInt(
      process.env.PLATFORM_ROYALTY_BPS ?? '100',
      10,
    );
    this.creatorRoyaltyBps = parseInt(
      process.env.CREATOR_ROYALTY_BPS ?? '1000',
      10,
    );
    this.platformWallet = process.env.PLATFORM_WALLET_ADDRESS ?? '';
  }
}
