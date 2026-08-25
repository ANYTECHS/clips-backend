import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ClipsService {
  private readonly logger = new Logger(ClipsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cancel all pending clip generation jobs for a video.
   */
  async cancelVideo(videoId: string, userId: number): Promise<{ cancelled: boolean }> {
    const id = parseInt(videoId, 10);
    if (!Number.isFinite(id)) {
      throw new NotFoundException(`Video ${videoId} not found`);
    }

    const video = await this.prisma.video.findUnique({ where: { id } });
    if (!video) {
      throw new NotFoundException(`Video ${videoId} not found`);
    }

    if (video.userId !== userId) {
      throw new ForbiddenException('You do not own this video');
    }

    await this.prisma.video.update({
      where: { id },
      data: { status: 'cancelled' },
    });

    this.logger.log(`Video ${id} cancelled by user ${userId}`);
    return { cancelled: true };
  }

  /**
   * Find clips belonging to a user's videos.
   */
  async findByUser(userId: number) {
    return this.prisma.clip.findMany({
      where: {
        video: { userId },
        status: { not: 'deleted' },
      },
      include: { video: { select: { id: true, title: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
