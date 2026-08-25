import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Core service for clip lifecycle management.
 * Handles CRUD, cancellation, and caption generation for clips.
 */
@Injectable()
export class ClipsService {
  private readonly logger = new Logger(ClipsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cancel pending clip generation for a video.
   * Only the video owner can cancel their own video.
   */
  async cancelVideo(videoId: string, userId: number): Promise<{ message: string }> {
    const video = await this.prisma.video.findUnique({
      where: { id: Number(videoId) },
    });

    if (!video || video.userId !== userId) {
      throw new NotFoundException('Video not found');
    }

    await this.prisma.video.update({
      where: { id: Number(videoId) },
      data: { status: 'cancelled' },
    });

    this.logger.log(`Video ${videoId} cancelled by user ${userId}`);
    return { message: `Video ${videoId} processing cancelled` };
  }

  /**
   * Auto-generate a caption placeholder for a clip from its title.
   *
   * Issue #743: caption = title + contextual emojis.
   * Returns a sensible default when title is absent.
   *
   * @param title - The clip title
   * @returns Formatted caption with emojis
   */
  generateCaptionFromTitle(title?: string | null): string {
    if (!title || title.trim().length === 0) {
      return '🎬 Check out this clip! 🔥 #ClipCash #Viral';
    }

    const trimmed = title.trim();
    return `🎬 ${trimmed} 🔥 #ClipCash #Viral`;
  }

  /**
   * Create a new clip record, auto-generating a caption from the title if
   * no caption is provided (Issue #743).
   */
  async createClip(data: {
    videoId: number;
    clipUrl: string;
    title?: string;
    caption?: string;
    startTime: number;
    endTime: number;
    duration: number;
    viralityScore?: number;
    platform?: string;
    thumbnail?: string;
  }) {
    const caption =
      data.caption !== undefined && data.caption !== null
        ? data.caption
        : this.generateCaptionFromTitle(data.title);

    return this.prisma.clip.create({
      data: {
        videoId: data.videoId,
        clipUrl: data.clipUrl,
        title: data.title,
        caption,
        startTime: data.startTime,
        endTime: data.endTime,
        duration: data.duration,
        viralityScore: data.viralityScore,
        platform: data.platform,
        thumbnail: data.thumbnail,
      },
    });
  }

  /**
   * Update caption for an existing clip (makes it user-editable).
   */
  async updateCaption(clipId: number, caption: string) {
    return this.prisma.clip.update({
      where: { id: clipId },
      data: { caption },
    });
  }

  /**
   * Get a single clip by ID.
   */
  async findById(clipId: number) {
    return this.prisma.clip.findUnique({ where: { id: clipId } });
  }
}
