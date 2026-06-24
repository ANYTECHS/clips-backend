import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { UserPlatformService } from '../user-platform/user-platform.service';
import {
  CLIP_POSTING_QUEUE,
  CLIP_POSTING_JOB_OPTIONS,
  type ClipPostingJob,
} from './clip-posting.queue';
import { QueueOverflowService } from '../common/queue/queue-overflow.service';
import { getBullMQRateLimitConfig } from '../config/bullmq.config';

@Injectable()
export class ClipPublishService {
  private readonly logger = new Logger(ClipPublishService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly userPlatformService: UserPlatformService,
    @InjectQueue(CLIP_POSTING_QUEUE)
    private readonly postingQueue: Queue<ClipPostingJob>,
    private readonly queueOverflowService: QueueOverflowService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * POST /clips/:id/publish
   *
   * Validates the clip and the user's connected platforms, creates ClipPost
   * rows in "pending" state, then enqueues a posting job on the dedicated
   * `clip-posting` BullMQ queue.
   *
   * The heavy I/O work (Ayrshare HTTP calls + DB updates) is handled
   * asynchronously by ClipPostingProcessor, which runs in a separate worker
   * with higher concurrency than the video-processing worker.
   *
   * Returns immediately with the BullMQ job ID so the caller can poll
   * /clips/:id/posts for final per-platform outcomes.
   */
  async publish(
    clipId: number,
    userId: number,
    targetPlatforms: string[],
  ): Promise<{ jobId: string; platforms: string[] }> {
    const clip = await this.prisma.clip.findUnique({ where: { id: clipId } });
    if (!clip) throw new NotFoundException(`Clip ${clipId} not found`);
    if (!clip.clipUrl) {
      throw new BadRequestException(
        'Clip has no Cloudinary URL. Upload the clip before publishing.',
      );
    }

    // Resolve which of the requested platforms the user has connected
    const connectedPlatforms = await this.userPlatformService.findAll(userId);
    const connectedNames = new Set(connectedPlatforms.map((p) => p.platform));
    const validPlatforms = targetPlatforms.filter((p) =>
      connectedNames.has(p),
    );

    if (validPlatforms.length === 0) {
      throw new BadRequestException(
        'None of the requested platforms are connected by this user.',
      );
    }

    // Create ClipPost rows in "pending" state so callers can observe progress
    await Promise.all(
      validPlatforms.map((platform) =>
        this.prisma.clipPost
          .upsert({
            where: { id: 0 }, // force create path
            update: {},
            create: { clipId, platform, status: 'pending', attempts: 0 },
          })
          .catch(() =>
            this.prisma.clipPost.create({
              data: { clipId, platform, status: 'pending', attempts: 0 },
            }),
          ),
      ),
    );

    // Enqueue the posting job — all Ayrshare I/O happens in ClipPostingProcessor
    const caption = clip.caption ?? clip.title ?? '';
    const jobPayload: ClipPostingJob = {
      clipId,
      userId,
      mediaUrl: clip.clipUrl,
      caption,
      platforms: validPlatforms,
    };

    const rateLimits = getBullMQRateLimitConfig(this.configService);
    const result = await this.queueOverflowService.enqueue({
      queue: this.postingQueue as Queue<any>,
      jobName: 'post-clip',
      data: jobPayload,
      baseOptions: {
        ...CLIP_POSTING_JOB_OPTIONS,
        jobId: `post-${clipId}-${Date.now()}`,
      } as Record<string, unknown>,
      rateLimitConfig: rateLimits.clipPosting,
    });

    if (result.delayed) {
      this.logger.warn(
        `Posting job ${result.jobId} for clipId=${clipId} delayed by ${result.delayMs}ms due to queue overflow`,
      );
    } else {
      this.logger.log(
        `Enqueued posting job ${result.jobId} for clipId=${clipId} ` +
          `platforms=[${validPlatforms.join(', ')}]`,
      );
    }

    return { jobId: String(result.jobId), platforms: validPlatforms };
  }

  /**
   * GET /clips/:id/posts
   * Returns per-platform post status for a clip.
   */
  async getPostStatus(clipId: number): Promise<any[]> {
    return this.prisma.clipPost.findMany({
      where: { clipId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
