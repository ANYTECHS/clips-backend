import { BadRequestException, Injectable } from '@nestjs/common';
import StellarSdk from '@stellar/stellar-sdk';
import { ConfigService } from '../config/config.service';
import { CLIP_ROYALTY_BPS_MAX } from '../common/validators/is-valid-royalty-bps.validator';

export interface RoyaltyMapEntry {
  key: unknown;
  value: unknown;
}

@Injectable()
export class RoyaltyConfigurationService {
  constructor(private readonly config: ConfigService) {}

  getCreatorRoyaltyBps(clipRoyaltyBps?: number | null): number {
    if (clipRoyaltyBps === undefined || clipRoyaltyBps === null) {
      return this.config.creatorRoyaltyBps;
    }
    this.validateRoyaltyBps(clipRoyaltyBps);
    return clipRoyaltyBps;
  }

  getPlatformRoyaltyBps(): number {
    return this.config.platformRoyaltyBps;
  }

  getPlatformWallet(): string {
    const wallet = this.config.platformWallet;
    if (!wallet) {
      throw new BadRequestException(
        'PLATFORM_WALLET_ADDRESS is not configured for royalty payouts',
      );
    }
    return wallet;
  }

  validateRoyaltyBps(bps: number): void {
    if (!Number.isInteger(bps) || bps < 0 || bps > CLIP_ROYALTY_BPS_MAX) {
      throw new BadRequestException(
        `Invalid royaltyBps: ${bps}. Must be between 0 and ${CLIP_ROYALTY_BPS_MAX}.`,
      );
    }
  }

  buildRoyaltyMap(
    creatorWallet: string,
    clipRoyaltyBps?: number | null,
  ): RoyaltyMapEntry[] {
    const creatorRoyaltyBps = this.getCreatorRoyaltyBps(clipRoyaltyBps);
    const platformWallet = this.getPlatformWallet();

    return [
      {
        key: StellarSdk.Address.fromString(creatorWallet).toScVal(),
        value: StellarSdk.nativeToScVal(creatorRoyaltyBps, { type: 'u32' }),
      },
      {
        key: StellarSdk.Address.fromString(platformWallet).toScVal(),
        value: StellarSdk.nativeToScVal(this.getPlatformRoyaltyBps(), {
          type: 'u32',
        }),
      },
    ];
  }
}
