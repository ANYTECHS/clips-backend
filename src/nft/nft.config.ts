import { Injectable } from '@nestjs/common';
import { ConfigService } from '../config/config.service';

/**
 * Royalty and wallet configuration for the NFT minting pipeline.
 *
 * This class is kept for **backward compatibility** so that existing consumers
 * can continue to inject `NftConfig` without modification. All values are now
 * sourced from `ConfigService`, which is the single source of truth for
 * environment-derived configuration.
 *
 * Basis points (bps): 100 bps = 1%
 *   platformRoyaltyBps  — share kept by ClipCash (default: 100 = 1%)
 *   creatorRoyaltyBps   — share paid to the clip creator (default: 1000 = 10%)
 *   platformWallet      — ClipCash treasury wallet address
 */
@Injectable()
export class NftConfig {
  /** ClipCash platform royalty in basis points (default 100 = 1%). Delegated from ConfigService. */
  readonly platformRoyaltyBps: number;

  /** Creator royalty in basis points (default 1000 = 10%). Delegated from ConfigService. */
  readonly creatorRoyaltyBps: number;

  /** ClipCash treasury wallet address (Stellar). Delegated from ConfigService. */
  readonly platformWallet: string;

  constructor(private readonly configService: ConfigService) {
    this.platformRoyaltyBps = configService.platformRoyaltyBps;
    this.creatorRoyaltyBps = configService.creatorRoyaltyBps;
    this.platformWallet = configService.platformWallet;
  }
}
