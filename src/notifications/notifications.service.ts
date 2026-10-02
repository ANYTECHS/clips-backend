import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { VideoProgressGateway } from '../videos/video-progress.gateway';
import { EmailDeliveryService } from '../auth/email-delivery.service';
import { JOB_COMPLETED_EVENT } from '../clips/clips.events';
import type { JobCompletedEvent } from '../clips/clips.events';

export interface JobCompletionInput {
  jobId: string;
  /** e.g. 'clip-generation' | 'clip-posting' | 'nft-mint' */
  type: string;
  userId: number;
  title: string;
  body?: string;
  /** Deep link to the generated clips, included in-app, over WS and by email. */
  link?: string;
}

/**
 * NotificationsService (#917)
 *
 * Single entry point for job-completion fan-out: persists an in-app
 * notification, emits a per-user WebSocket event, and enqueues a
 * completion email. Dedupe is enforced by the `@@unique([jobId, type])`
 * constraint — a second completion for the same job is a no-op so users
 * never receive duplicate notifications.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly progressGateway: VideoProgressGateway,
    private readonly emailDeliveryService: EmailDeliveryService,
  ) {}

  @OnEvent(JOB_COMPLETED_EVENT)
  async handleJobCompletedEvent(event: JobCompletedEvent) {
    await this.notifyJobCompleted(event);
  }

  async notifyJobCompleted(input: JobCompletionInput) {
    const existing = await this.prisma.notification.findUnique({
      where: { jobId_type: { jobId: input.jobId, type: input.type } },
    });
    if (existing) {
      this.logger.debug(
        `Duplicate completion for job ${input.jobId} (${input.type}) suppressed`,
      );
      return { notification: existing, duplicate: true as const };
    }

    const notification = await this.prisma.notification.create({
      data: {
        userId: input.userId,
        jobId: input.jobId,
        type: input.type,
        title: input.title,
        body: input.body,
        link: input.link,
      },
    });

    this.progressGateway.emitNotification(input.userId, {
      id: notification.id,
      jobId: input.jobId,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link,
    });

    try {
      const user = await this.prisma.user.findUnique({
        where: { id: input.userId },
        select: { email: true },
      });
      if (user?.email) {
        await this.emailDeliveryService.enqueue({
          to: user.email,
          subject: input.title,
          template: 'job-completed',
          context: { token: input.link ?? input.jobId, link: input.link },
        });
      }
    } catch (err) {
      // Email is best-effort: the in-app notification + WS event already
      // landed, so a mail failure must not fail the completion path.
      this.logger.warn(
        `Completion email for job ${input.jobId} failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return { notification, duplicate: false as const };
  }

  async listForUser(userId: number, opts: { limit?: number; unreadOnly?: boolean } = {}) {
    const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
    return this.prisma.notification.findMany({
      where: {
        userId,
        ...(opts.unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async markRead(userId: number, id: number) {
    return this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
