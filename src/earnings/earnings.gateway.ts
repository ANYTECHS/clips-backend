import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

interface AuthenticatedSocket extends Socket {
  userId?: number;
}

export interface EarningsUpdatedEvent {
  userId: number;
  earningId?: number;
  amount: number;
  currency?: string;
  total?: number;
}

/**
 * Real-time earnings updates for creator dashboards.
 *
 * Namespace: /earnings
 * Auth: JWT via handshake.auth.token or Authorization Bearer header
 * Events emitted to clients:
 *   - earnings.initial  — snapshot on connect
 *   - earnings.updated  — when new earnings are recorded
 *   - earnings.error    — refresh failures
 *
 * REST companion for current totals: GET /earnings
 */
@WebSocketGateway({
  namespace: '/earnings',
  cors: { origin: '*' },
})
export class EarningsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(EarningsGateway.name);
  private readonly userSockets = new Map<number, Set<string>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn('WebSocket connection without token, disconnecting');
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      const userId = Number(payload.userId ?? payload.sub);

      if (!userId) {
        this.logger.warn('WebSocket connection with invalid token payload');
        client.disconnect();
        return;
      }

      client.userId = userId;

      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(client.id);

      this.logger.log(
        `User ${userId} connected to earnings WebSocket (socket: ${client.id})`,
      );

      const earnings = await this.getUserEarnings(userId);
      client.emit('earnings.initial', earnings);
    } catch (error) {
      this.logger.error(
        `WebSocket authentication failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket): void {
    if (client.userId) {
      const sockets = this.userSockets.get(client.userId);
      if (sockets) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.userSockets.delete(client.userId);
        }
      }
      this.logger.log(
        `User ${client.userId} disconnected from earnings WebSocket (socket: ${client.id})`,
      );
    }
  }

  @SubscribeMessage('earnings.refresh')
  async handleRefresh(
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<void> {
    if (!client.userId) return;

    try {
      const earnings = await this.getUserEarnings(client.userId);
      client.emit('earnings.updated', {
        event: 'earnings.updated',
        userId: `user_${client.userId}`,
        currency: earnings.currency,
        amount: 0,
        total: earnings.totalEarned,
      });
    } catch (error) {
      this.logger.error(
        `Failed to refresh earnings for user ${client.userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      client.emit('earnings.error', { message: 'Failed to refresh earnings' });
    }
  }

  /**
   * Listens for earnings.updated domain events (emitted when a new earning
   * is recorded) and broadcasts only to the affected user's sockets.
   */
  @OnEvent('earnings.updated')
  async handleEarningsUpdated(payload: EarningsUpdatedEvent): Promise<void> {
    const { userId, amount, currency } = payload;

    await this.invalidateCachedTotals(userId);
    const summary = await this.getUserEarnings(userId);

    const data = {
      event: 'earnings.updated' as const,
      userId: `user_${userId}`,
      currency: currency ?? summary.currency,
      amount,
      total: summary.totalEarned,
    };

    await this.emitEarningsUpdated(userId, data);
  }

  async emitEarningsUpdated(
    userId: number,
    data: Record<string, unknown>,
  ): Promise<void> {
    const sockets = this.userSockets.get(userId);
    if (!sockets || sockets.size === 0) {
      this.logger.debug(
        `No connected sockets for user ${userId}; skipping earnings.updated broadcast`,
      );
      await this.updateCachedEarnings(userId, data);
      return;
    }

    for (const socketId of sockets) {
      try {
        this.server?.to(socketId).emit('earnings.updated', data);
      } catch (error) {
        this.logger.warn(
          `Failed to emit to socket ${socketId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    await this.updateCachedEarnings(userId, data);
  }

  private async invalidateCachedTotals(userId: number): Promise<void> {
    try {
      await this.redis.del(
        `earnings:total:${userId}`,
        `earnings:user:${userId}:total`,
        `earnings:realtime:${userId}`,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to invalidate earnings cache for user ${userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async updateCachedEarnings(
    userId: number,
    data: Record<string, unknown>,
  ): Promise<void> {
    try {
      const cacheKey = `earnings:realtime:${userId}`;
      await this.redis.setex(cacheKey, 300, JSON.stringify(data));

      // Keep the REST GET /earnings cache consistent with the live total
      if (typeof data.total === 'number') {
        await this.redis.setex(
          `earnings:user:${userId}:total`,
          3600,
          JSON.stringify({
            total: data.total,
            currency: data.currency ?? 'USD',
          }),
        );
      }
    } catch (error) {
      this.logger.warn(
        `Failed to cache earnings for user ${userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async getUserEarnings(userId: number): Promise<{
    totalEarned: number;
    totalPaidOut: number;
    availableBalance: number;
    currency: string;
    recentEarnings: unknown[];
  }> {
    const totalEarnings = await this.prisma.earning.aggregate({
      where: { clip: { video: { userId } }, deletedAt: null },
      _sum: { amount: true },
    });

    const totalPaidOut = await this.prisma.payout.aggregate({
      where: { userId, status: { in: ['completed', 'processing'] } },
      _sum: { amount: true },
    });

    const recentEarnings = await this.prisma.earning.findMany({
      where: { clip: { video: { userId } }, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        amount: true,
        currency: true,
        date: true,
        source: true,
        createdAt: true,
      },
    });

    const totalEarned = totalEarnings._sum.amount ?? 0;
    const paid = totalPaidOut._sum.amount ?? 0;

    return {
      totalEarned,
      totalPaidOut: paid,
      availableBalance: totalEarned - paid,
      currency: 'USD',
      recentEarnings,
    };
  }
}
