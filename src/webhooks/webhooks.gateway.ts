import {
  WebSocketGateway,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { OnEvent } from '@nestjs/event-emitter';

export interface EarningCreatedEvent {
  id: number;
  clipId: number;
  amount: number;
  currency: string;
  date: Date;
  source: string | null;
  platform: string;
  userId?: number;
}

@WebSocketGateway({
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    credentials: true,
  },
  namespace: '/webhooks',
})
export class WebhooksGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(WebhooksGateway.name);
  private server: Server | null = null;

  afterInit(server: Server): void {
    this.server = server;
    this.logger.log('Webhooks WebSocket gateway initialized');
  }

  handleConnection(client: Socket): void {
    this.logger.debug(`Client connected to webhooks namespace: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(
      `Client disconnected from webhooks namespace: ${client.id}`,
    );
  }

  @OnEvent('earning.created')
  handleEarningCreated(event: EarningCreatedEvent): void {
    if (!this.server) {
      this.logger.warn(
        'WebSocket server not available, skipping earning notification',
      );
      return;
    }

    this.server.emit('earning.created', {
      id: event.id,
      clipId: event.clipId,
      amount: event.amount,
      currency: event.currency,
      date: event.date,
      source: event.source,
      platform: event.platform,
      userId: event.userId,
    });

    this.logger.log(`Emitted earning.created event for earning ${event.id}`);
  }

  emitToUser(userId: number, event: string, data: any): void {
    if (!this.server) {
      return;
    }
    this.server.to(`user:${userId}`).emit(event, data);
  }
}
