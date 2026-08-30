import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as StellarSdk from '@stellar/stellar-sdk';
import { checkedRoyaltyAmount } from '../common/helpers/safe-math.helper';

export const MAX_ROYALTY_BPS = 1500; // 15%

export interface ClipRoyaltyDetails {
  clipId: number;
  recipientAddress: string;
  basisPoints: number;
  platformFeeBps: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Service for managing clip-level royalty configuration
 * Supports setting and retrieving royalty recipients and basis points
 */
@Injectable()
export class ClipRoyaltyService {
  constructor(private prisma: PrismaService) {}

  /**
   * Set royalty for a clip
   * Validates BPS (max 1500 = 15%) and recipient address format
   * @param clipId The clip ID
   * @param recipientAddress Stellar wallet address for royalty recipient
   * @param basisPoints Royalty basis points (0-1500)
   * @param platformFeeBps Optional platform fee in basis points
   * @returns Created or updated royalty record
   */
  async setRoyalty(
    clipId: number,
    recipientAddress: string,
    basisPoints: number,
    platformFeeBps?: number,
  ): Promise<ClipRoyaltyDetails> {
    // Validate BPS
    if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > MAX_ROYALTY_BPS) {
      throw new BadRequestException(
        `Invalid royalty BPS: ${basisPoints}. Must be between 0 and ${MAX_ROYALTY_BPS} (15%).`,
      );
    }

    // Validate platform fee BPS if provided
    if (platformFeeBps !== undefined && platformFeeBps !== null) {
      if (!Number.isInteger(platformFeeBps) || platformFeeBps < 0) {
        throw new BadRequestException(
          `Invalid platform fee BPS: ${platformFeeBps}. Must be a non-negative integer.`,
        );
      }
    }

    // Validate Stellar address
    if (!StellarSdk.StrKey.isValidEd25519PublicKey(recipientAddress)) {
      throw new BadRequestException(
        `Invalid Stellar address: ${recipientAddress}. Must be a valid Stellar Ed25519 public key.`,
      );
    }

    // Verify clip exists
    const clip = await this.prisma.clip.findUnique({
      where: { id: clipId },
    });

    if (!clip) {
      throw new NotFoundException(`Clip with ID ${clipId} not found.`);
    }

    // Create or update royalty
    const royalty = await this.prisma.clipRoyalty.upsert({
      where: { clipId },
      create: {
        clipId,
        recipientAddress,
        basisPoints,
        platformFeeBps: platformFeeBps ?? 0,
      },
      update: {
        recipientAddress,
        basisPoints,
        platformFeeBps: platformFeeBps ?? 0,
        updatedAt: new Date(),
      },
    });

    return {
      clipId: royalty.clipId,
      recipientAddress: royalty.recipientAddress,
      basisPoints: royalty.basisPoints,
      platformFeeBps: royalty.platformFeeBps,
      createdAt: royalty.createdAt,
      updatedAt: royalty.updatedAt,
    };
  }

  /**
   * Get royalty configuration for a clip
   * @param clipId The clip ID
   * @returns Royalty details or null if not set
   */
  async getRoyalty(clipId: number): Promise<ClipRoyaltyDetails | null> {
    const royalty = await this.prisma.clipRoyalty.findUnique({
      where: { clipId },
    });

    if (!royalty) {
      return null;
    }

    return {
      clipId: royalty.clipId,
      recipientAddress: royalty.recipientAddress,
      basisPoints: royalty.basisPoints,
      platformFeeBps: royalty.platformFeeBps,
      createdAt: royalty.createdAt,
      updatedAt: royalty.updatedAt,
    };
  }

  /**
   * Get royalties for multiple clips
   * @param clipIds Array of clip IDs
   * @returns Map of clip ID to royalty details
   */
  async getRoyaltiesForClips(clipIds: number[]): Promise<Map<number, ClipRoyaltyDetails>> {
    const royalties = await this.prisma.clipRoyalty.findMany({
      where: { clipId: { in: clipIds } },
    });

    const map = new Map<number, ClipRoyaltyDetails>();
    for (const royalty of royalties) {
      map.set(royalty.clipId, {
        clipId: royalty.clipId,
        recipientAddress: royalty.recipientAddress,
        basisPoints: royalty.basisPoints,
        platformFeeBps: royalty.platformFeeBps,
        createdAt: royalty.createdAt,
        updatedAt: royalty.updatedAt,
      });
    }

    return map;
  }

  /**
   * Calculate royalty payout for a sale
   * @param salePrice The sale price in stroops or smallest unit
   * @param royaltyBps Royalty basis points
   * @returns Royalty amount
   */
  calculateRoyaltyAmount(salePrice: number, royaltyBps: number): number {
    if (!Number.isInteger(salePrice) || salePrice < 0) {
      throw new BadRequestException(
        `Invalid sale price: ${salePrice}. Must be a non-negative integer.`,
      );
    }

    if (!Number.isInteger(royaltyBps) || royaltyBps < 0 || royaltyBps > MAX_ROYALTY_BPS) {
      throw new BadRequestException(
        `Invalid royalty BPS: ${royaltyBps}. Must be between 0 and ${MAX_ROYALTY_BPS}.`,
      );
    }

    // Checked BigInt arithmetic — see safe-math.helper.ts (Issue #836).
    return checkedRoyaltyAmount(salePrice, royaltyBps);
  }

  /**
   * Validate royalty configuration
   * @param basisPoints Royalty basis points
   * @param platformFeeBps Platform fee basis points (optional)
   */
  validateRoyaltyConfiguration(basisPoints: number, platformFeeBps?: number): void {
    if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > MAX_ROYALTY_BPS) {
      throw new BadRequestException(
        `Invalid royalty BPS: ${basisPoints}. Must be between 0 and ${MAX_ROYALTY_BPS} (15%).`,
      );
    }

    if (platformFeeBps !== undefined && platformFeeBps !== null) {
      if (!Number.isInteger(platformFeeBps) || platformFeeBps < 0) {
        throw new BadRequestException(
          `Invalid platform fee BPS: ${platformFeeBps}. Must be a non-negative integer.`,
        );
      }
    }
  }

  /**
   * Get all royalties for a recipient address (audit query)
   * @param recipientAddress Stellar wallet address
   * @returns Array of royalty records for this recipient
   */
  async getRoyaltiesForRecipient(recipientAddress: string): Promise<ClipRoyaltyDetails[]> {
    const royalties = await this.prisma.clipRoyalty.findMany({
      where: { recipientAddress },
    });

    return royalties.map((r) => ({
      clipId: r.clipId,
      recipientAddress: r.recipientAddress,
      basisPoints: r.basisPoints,
      platformFeeBps: r.platformFeeBps,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  /**
   * Remove royalty configuration for a clip
   * @param clipId The clip ID
   */
  async deleteRoyalty(clipId: number): Promise<void> {
    await this.prisma.clipRoyalty.delete({
      where: { clipId },
    });
  }
}
