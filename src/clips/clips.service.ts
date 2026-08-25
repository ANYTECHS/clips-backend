import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * ClipsService — basic CRUD and query operations for Clip records.
 *
 * Mint-specific logic lives in NftMintService; this service handles
 * general clip management (listing, status queries, deletion, etc.).
 */
@Injectable()
export class ClipsService {
  private readonly logger = new Logger(ClipsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Return all clips belonging to a user's videos.
   */
  async getClipsForUser(userId: number) {
    return this.prisma.clip.findMany({
      where: { video: { userId } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Return a single clip, throwing NotFoundException when absent.
   */
  async getClipById(clipId: number) {
    const clip = await this.prisma.clip.findUnique({ where: { id: clipId } });
    if (!clip) {
      throw new NotFoundException(`Clip ${clipId} not found`);
    }
    return clip;
  }

  /**
   * Soft-marks a clip's status as "deleted".
   * The clip record is retained for audit / earnings history.
   */
  async deleteClip(clipId: number, userId: number): Promise<void> {
    const clip = await this.prisma.clip.findFirst({
      where: { id: clipId, video: { userId } },
    });

    if (!clip) {
      throw new NotFoundException(`Clip ${clipId} not found or does not belong to user`);
    }

    await this.prisma.clip.update({
      where: { id: clipId },
      data: { status: 'deleted', updatedAt: new Date() },
    });

    this.logger.log(`Clip ${clipId} deleted by user ${userId}`);
  }
}
