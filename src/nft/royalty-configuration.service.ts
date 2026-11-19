import { BadRequestException, Injectable } from '@nestjs/common';
import StellarSdk from '@stellar/stellar-sdk';
import { ConfigService } from '../config/config.service';
import {
  CLIP_ROYALTY_BPS_MAX,
  DEFAULT_ROYALTY_BPS_MAX,
} from '../common/validators/is-valid-royalty-bps.validator';
import {
  checkedRoyaltyAmount,
  checkedBpsAdd,
} from '../common/helpers/safe-math.helper';

export const ROYALTY_PROTOCOL_MAX_BPS = DEFAULT_ROYALTY_BPS_MAX;

export interface RoyaltyMapEntry {
  key: unknown;
  value: unknown;
  /** Human-readable label for this recipient, e.g. "Creator" or "Platform" */
  label?: string;
  /** Description of why this recipient receives this share */
  description?: string;
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

  /**
   * The Stellar asset royalties are paid in: `"native"` (XLM) or a Stellar
   * Asset Contract (SAC) address (e.g. USDC) configured via
   * `ROYALTY_ASSET_CODE` / `ROYALTY_ASSET_CONTRACT_ID`.
   */
  getRoyaltyAsset(): { code: string; contractId?: string } {
    const code = this.config.royaltyAssetCode;
    const contractId = this.config.royaltyAssetContractId || undefined;
    return code === 'native' ? { code } : { code, contractId };
  }

  /**
   * Calculate the royalty amount owed on `salePrice` at `royaltyBps` basis
   * points (Issue #680). Mirrors the Soroban contract's `calculate_royalty`
   * helper so estimates returned by the API match what the chain will
   * actually pay out.
   *
   * Rounding: truncates toward zero (`Math.floor`), matching the contract's
   * integer-division semantics — any fractional stroop is rounded down.
   *
   * Overflow protection: the intermediate product `salePrice × royaltyBps` is
   * computed with `BigInt` arithmetic to prevent IEEE-754 precision loss for
   * large sale prices (see `checkedRoyaltyAmount` in safe-math.helper.ts).
   * A `BadRequestException` is thrown if the result exceeds
   * `Number.MAX_SAFE_INTEGER`.
   */
  calculateRoyalty(salePrice: number, royaltyBps: number): number {
    this.validateRoyaltyBps(royaltyBps);
    if (!Number.isInteger(salePrice) || salePrice < 0) {
      throw new BadRequestException(
        `Invalid salePrice: ${salePrice}. Must be a non-negative integer.`,
      );
    }
    if (salePrice === 0 || royaltyBps === 0) {
      return 0;
    }
    return checkedRoyaltyAmount(salePrice, royaltyBps);
  }

  validateRoyaltyBps(bps: number): void {
    if (!Number.isInteger(bps) || bps < 0 || bps > CLIP_ROYALTY_BPS_MAX) {
      throw new BadRequestException(
        `Invalid royaltyBps: ${bps}. Must be between 0 and ${CLIP_ROYALTY_BPS_MAX}.`,
      );
    }
  }

  validatePlatformRoyaltyBps(bps: number): void {
    if (!Number.isInteger(bps) || isNaN(bps) || bps < 0) {
      throw new BadRequestException(
        `Invalid platformRoyaltyBps: ${bps}. Must be a non-negative integer.`,
      );
    }
  }

  validateCombinedRoyaltyBps(creatorBps: number, platformBps: number): void {
    // checkedBpsAdd validates both operands are non-negative integers and that
    // the sum fits within Number.MAX_SAFE_INTEGER before comparing to the cap.
    const total = checkedBpsAdd(creatorBps, platformBps);
    if (total > ROYALTY_PROTOCOL_MAX_BPS) {
      throw new BadRequestException(
        `Combined royalty (${total} bps = ${creatorBps} creator + ${platformBps} platform) exceeds protocol maximum of ${ROYALTY_PROTOCOL_MAX_BPS} bps.`,
      );
    }
  }

  /**
   * Full startup validation of royalty environment configuration.
   * Throws Error (not BadRequestException) so bootstrap can catch it and exit.
   */
  validateRoyaltyConfiguration(): void {
    const platformWallet = this.config.platformWallet;
    if (!platformWallet) {
      throw new Error('PLATFORM_WALLET_ADDRESS must be configured');
    }
    if (!StellarSdk.StrKey.isValidEd25519PublicKey(platformWallet)) {
      throw new Error(
        `PLATFORM_WALLET_ADDRESS "${platformWallet}" is not a valid Stellar Ed25519 public key`,
      );
    }

    const platformBps = this.config.platformRoyaltyBps;
    if (
      !Number.isInteger(platformBps) ||
      isNaN(platformBps) ||
      platformBps < 0
    ) {
      throw new Error(
        `PLATFORM_ROYALTY_BPS must be a non-negative integer, got: ${platformBps}`,
      );
    }

    const creatorBps = this.config.creatorRoyaltyBps;
    if (!Number.isInteger(creatorBps) || isNaN(creatorBps) || creatorBps < 0) {
      throw new Error(
        `CREATOR_ROYALTY_BPS must be a non-negative integer, got: ${creatorBps}`,
      );
    }

    const total = checkedBpsAdd(creatorBps, platformBps);
    if (total > ROYALTY_PROTOCOL_MAX_BPS) {
      throw new Error(
        `Combined royalty (${total} bps = ${creatorBps} creator + ${platformBps} platform) exceeds protocol maximum of ${ROYALTY_PROTOCOL_MAX_BPS} bps`,
      );
    }
  }

  buildRoyaltyMap(
    creatorWallet: string,
    clipRoyaltyBps?: number | null,
    options?: { creatorLabel?: string; royaltyDescription?: string },
  ): RoyaltyMapEntry[] {
    const creatorRoyaltyBps = this.getCreatorRoyaltyBps(clipRoyaltyBps);
    const platformWallet = this.getPlatformWallet();
    const platformBps = this.getPlatformRoyaltyBps();

    this.validatePlatformRoyaltyBps(platformBps);
    this.validateCombinedRoyaltyBps(creatorRoyaltyBps, platformBps);

    return [
      {
        key: StellarSdk.Address.fromString(creatorWallet).toScVal(),
        value: StellarSdk.nativeToScVal(creatorRoyaltyBps, { type: 'u32' }),
        label: options?.creatorLabel ?? 'Creator',
        description:
          options?.royaltyDescription ??
          `${(creatorRoyaltyBps / 100).toFixed(1)}% creator royalty + ${(platformBps / 100).toFixed(1)}% platform fee on every secondary sale.`,
      },
      {
        key: StellarSdk.Address.fromString(platformWallet).toScVal(),
        value: StellarSdk.nativeToScVal(platformBps, { type: 'u32' }),
        label: 'Platform',
        description: `${(platformBps / 100).toFixed(1)}% platform fee`,
      },
    ];
  }
}
