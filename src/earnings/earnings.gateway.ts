import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger, UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

interface AuthenticatedSocket extends Socket {
  userId?: number;
}

@WebSocketGateway({
  namespace: '/earnings',
  cors: { origin: '*' },
})
export class EarningsGateway implements OnGatewayConnection, OnGatewayDisconnect {
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
      const userId = payload.userId ?? payload.sub;

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

      this.logger.log(User  connected to earnings WebSocket (socket: ));

      const earnings = await this.getUserEarnings(userId);
      client.emit('earnings.initial', earnings);
    } catch (error) {
      this.logger.error(
        WebSocket authentication failed: ,
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
      this.logger.log(User  disconnected from earnings WebSocket (socket: ));
    }
  }

  @SubscribeMessage('earnings.refresh')
  async handleRefresh(@ConnectedSocket() client: AuthenticatedSocket): Promise<void> {
    if (!client.userId) return;

    try {
      const earnings = await this.getUserEarnings(client.userId);
      client.emit('earnings.updated', earnings);
    } catch (error) {
      this.logger.error(
        Failed to refresh earnings for user : ,
      );
      client.emit('earnings.error', { message: 'Failed to refresh earnings' });
    }
  }

  async emitEarningsUpdated(userId: number, data: any): Promise<void> {
    const sockets = this.userSockets.get(userId);
    if (!sockets || sockets.size === 0) return;

    for (const socketId of sockets) {
      try {
        this.server?.to(socketId).emit('earnings.updated', data);
      } catch (error) {
        this.logger.warn(
          Failed to emit to socket : ,
        );
      }
    }

    await this.updateCachedEarnings(userId, data);
  }

  private async updateCachedEarnings(userId: number, data: any): Promise<void> {
    try {
      const cacheKey = earnings:realtime:;
      await this.redis.setex(cacheKey, 300, JSON.stringify(data));
    } catch (error) {
      this.logger.warn(
        Failed to cache earnings for user : ,
      );
    }
  }

  private async getUserEarnings(userId: number): Promise<{
    totalEarned: number;
    totalPaidOut: number;
    availableBalance: number;
    recentEarnings: any[];
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
      recentEarnings,
    };
  }
}