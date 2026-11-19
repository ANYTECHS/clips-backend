import { Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import type {
  ClipProgressPayload,
  ClipCompletedPayload,
  ClipFailedPayload,
} from './clips.events';
import { WS_CLIP_PROGRESS, WS_CLIP_COMPLETED, WS_CLIP_FAILED } from './clips.events';

/**
 * WebSocket gateway for real-time clip-generation progress.
 *
 * Namespace : /clips
 * Authentication: clients must pass a valid JWT in the handshake.
 *   - As handshake auth  : { auth: { token: '<jwt>' } }
 *   - As a query param   : ?token=<jwt>
 *   - As Authorization   : Bearer <jwt>
 *
 * Once authenticated the socket is joined to the room `user:<userId>`.
 * All progress / completion / failure events are targeted to that room
 * so each user only receives events for their own jobs.
 *
 * Client-side connection example:
 */
@WebSocketGateway({
  namespace: '/clips',
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3000'],
    credentials: true,
  },
})
export class ClipsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ClipsGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(private readonly jwtService: JwtService) {}

  // ── Connection lifecycle ─────────────────────────────────────────────────

  handleConnection(client: Socket): void {
    const userId = this.authenticateSocket(client);
    if (!userId) {
      this.logger.warn(
        `Unauthorized WebSocket connection — disconnecting ${client.id}`,
      );
      client.disconnect(true);
      return;
    }

    const room = this.roomFor(userId);
    void client.join(room);
    this.logger.log(`Client ${client.id} joined room ${room}`);
    client.emit('connected', { room });
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Client ${client.id} disconnected`);
  }

  // ── Emit helpers (called from ClipGenerationProcessor) ──────────────────

  emitProgress(userId: string, payload: ClipProgressPayload): void {
    this.server.to(this.roomFor(userId)).emit(WS_CLIP_PROGRESS, payload);
  }

  /** @deprecated Use emitProgress — kept for backwards compatibility */
  emitProgressToUser(userId: string, payload: any): void {
    this.server.to(this.roomFor(userId)).emit(WS_CLIP_PROGRESS, payload);
  }

  emitCompleted(userId: string, payload: ClipCompletedPayload): void {
    this.server.to(this.roomFor(userId)).emit(WS_CLIP_COMPLETED, payload);
  }

  emitFailed(userId: string, payload: ClipFailedPayload): void {
    this.server.to(this.roomFor(userId)).emit(WS_CLIP_FAILED, payload);
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private roomFor(userId: string): string {
    return `user:${userId}`;
  }

  /**
   * Extracts and verifies the JWT from the socket handshake.
   * Accepts the token from:
   *   1. handshake.auth.token
   *   2. handshake.query.token
   *   3. handshake.headers.authorization  (Bearer <token>)
   *
   * Returns the userId string on success, or null on failure.
   */
  private authenticateSocket(client: Socket): string | null {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ??
        (client.handshake.query?.token as string | undefined) ??
        this.extractBearerToken(client.handshake.headers?.authorization as string | undefined);

      if (!token) return null;

      const payload = this.jwtService.verify<{ sub?: number | string }>(token);
      const userId = String(payload?.sub ?? '');
      if (!userId) return null;

      // Attach userId to socket data for later use
      client.data.userId = userId;
      return userId;
    } catch {
      return null;
    }
  }

  private extractBearerToken(header: string | undefined): string | undefined {
    if (!header) return undefined;
    const parts = header.split(' ');
    return parts.length === 2 && parts[0].toLowerCase() === 'bearer'
      ? parts[1]
      : undefined;
  }
}
