/**
 * ClipsService — CRUD and configuration for clip records.
 *
 * Issue #747: setRoyaltyBps() stores a per-clip royalty (0–1500 bps)
 *             on the Clip model so the value is available at mint time.
 */
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const ROYALTY_BPS_MIN = 0;
export const ROYALTY_BPS_MAX = 1500;
export const ROYALTY_BPS_DEFAULT = 1000;

@Injectable()
export class ClipsService {
  private readonly logger = new Logger(ClipsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ──────────────────────────────────────────────────────────────────────────
  // Issue #747 — Royalty BPS configuration per clip
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Set (or reset) the royalty basis points for a clip.
   *
   * Acceptance criteria:
   *  ✓ royaltyBps Int? field on Clip model (0–1500 = 0–15%)
   *  ✓ Validate range: throws BadRequestException outside [0, 1500]
   *  ✓ Store default 1000 (10%) when royaltyBps is undefined / null
   *  ✓ Value is passed to Soroban mint transaction via NftMintService
   *
   * @param clipId     Clip to configure.
   * @param userId     Authenticated user — must own the clip.
   * @param royaltyBps Royalty in BPS (0–1500). Pass undefined to use default.
   */
  async setRoyaltyBps(
    clipId: number,
    userId: number,
    royaltyBps?: number,
  ): Promise<{ clipId: number; royaltyBps: number }> {
    // Default to 1000 when not provided.
    const bps = royaltyBps ?? ROYALTY_BPS_DEFAULT;

    // Validate range (DTO decorators already guard this on the HTTP layer;
    // this check guards programmatic calls from other services).
    if (!Number.isInteger(bps) || bps < ROYALTY_BPS_MIN || bps > ROYALTY_BPS_MAX) {
      throw new BadRequestException(
        `royaltyBps must be an integer between ${ROYALTY_BPS_MIN} and ${ROYALTY_BPS_MAX} (received: ${bps})`,
      );
    }

    // Fetch clip and verify ownership.
    const clip = await this.prisma.clip.findUnique({
      where: { id: clipId },
      include: { video: { select: { userId: true } } },
    });

    if (!clip) {
      throw new NotFoundException(`Clip ${clipId} not found`);
    }

    if (clip.video.userId !== userId) {
      throw new ForbiddenException(
        `You do not own clip ${clipId}`,
      );
    }

    // Persist the value.
    await this.prisma.clip.update({
      where: { id: clipId },
      data: { royaltyBps: bps },
    });

    this.logger.log(`Clip ${clipId} royaltyBps set to ${bps} by user ${userId}`);

    return { clipId, royaltyBps: bps };
  }

  /**
   * Get the current royaltyBps for a clip.
   * Returns the schema default (1000) when the field is null.
   */
  async getRoyaltyBps(clipId: number): Promise<{ clipId: number; royaltyBps: number }> {
    const clip = await this.prisma.clip.findUnique({
      where: { id: clipId },
      select: { id: true, royaltyBps: true },
    });

    if (!clip) {
      throw new NotFoundException(`Clip ${clipId} not found`);
    }

    return { clipId: clip.id, royaltyBps: clip.royaltyBps ?? ROYALTY_BPS_DEFAULT };
  }
}
