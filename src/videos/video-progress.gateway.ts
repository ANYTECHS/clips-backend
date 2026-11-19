import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';

interface AuthenticatedSocket extends Socket {
  userId?: number;
}

export interface VideoProgressPayload {
  videoId: number;
  /** 0–100 */
  percent: number;
  /** Number of clips generated so far */
  clipsGenerated: number;
  /** Total clips expected (if known) */
  totalClips?: number;
  /** Human-readable status message */
  message: string;
  /** ISO timestamp */
  timestamp: string;
}

/**
 * WebSocket gateway for real-time video processing progress events.
 *
 * Namespace: /video-progress
 *
 * Events emitted to client:
 *  - video.progress     — periodic progress update
 *  - video.completed    — processing finished successfully
 *  - video.failed       — processing failed or was cancelled
 *
 * Events received from client:
 *  - video.subscribe    — subscribe to progress for a specific videoId
 *  - video.unsubscribe  — unsubscribe from a specific videoId
 *
 * Closes #738
 */
@WebSocketGateway({
  namespace: '/video-progress',
  cors: { origin: '*' },
})
export class VideoProgressGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(VideoProgressGateway.name);

  /**
   * Maps userId → set of socket IDs.
   * Used to push progress events to all tabs/devices of a user.
   */
  private readonly userSockets = new Map<number, Set<string>>();

  /**
   * Maps videoId → set of subscribing socket IDs.
   * Allows targeted pushes to only those clients interested in a specific video.
   */
  private readonly videoSubscribers = new Map<number, Set<string>>();

  constructor(private readonly jwtService: JwtService) {}

  // ─────────────────────────────────────────────────────────────
  // Connection lifecycle
  // ─────────────────────────────────────────────────────────────

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(
          'VideoProgress WS connection without token, disconnecting',
        );
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      const userId: number = payload.userId ?? payload.sub;

      if (!userId) {
        this.logger.warn(
          'VideoProgress WS connection with invalid token payload',
        );
        client.disconnect();
        return;
      }

      client.userId = userId;

      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(client.id);

      this.logger.log(
        `User ${userId} connected to video-progress WS (socket: ${client.id})`,
      );
      client.emit('video.connected', { message: 'Connected to progress stream' });
    } catch (error) {
      this.logger.error(`VideoProgress WS auth failed: ${error.message}`);
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
        `User ${client.userId} disconnected from video-progress WS (socket: ${client.id})`,
      );
    }

    // Remove socket from all video subscriber sets
    for (const [videoId, subscribers] of this.videoSubscribers.entries()) {
      subscribers.delete(client.id);
      if (subscribers.size === 0) {
        this.videoSubscribers.delete(videoId);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Client-driven subscription management
  // ─────────────────────────────────────────────────────────────

  @SubscribeMessage('video.subscribe')
  handleSubscribe(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { videoId: number },
  ): void {
    const videoId = Number(data?.videoId);
    if (!videoId || isNaN(videoId)) return;

    if (!this.videoSubscribers.has(videoId)) {
      this.videoSubscribers.set(videoId, new Set());
    }
    this.videoSubscribers.get(videoId)!.add(client.id);

    this.logger.log(
      `Socket ${client.id} subscribed to progress for video ${videoId}`,
    );
    client.emit('video.subscribed', { videoId });
  }

  @SubscribeMessage('video.unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { videoId: number },
  ): void {
    const videoId = Number(data?.videoId);
    if (!videoId || isNaN(videoId)) return;

    const subscribers = this.videoSubscribers.get(videoId);
    if (subscribers) {
      subscribers.delete(client.id);
      if (subscribers.size === 0) {
        this.videoSubscribers.delete(videoId);
      }
    }

    this.logger.log(
      `Socket ${client.id} unsubscribed from progress for video ${videoId}`,
    );
    client.emit('video.unsubscribed', { videoId });
  }

  // ─────────────────────────────────────────────────────────────
  // Server-driven emission methods (called by BullMQ processors)
  // ─────────────────────────────────────────────────────────────

  /**
   * Emit a progress update to all sockets subscribed to this video AND to
   * all sockets belonging to the video owner.
   *
   * Called by the clip-generation BullMQ processor as clips are generated.
   *
   * @param userId  — Owner of the video (used to push to all user sessions)
   * @param payload — Progress details
   */
  emitProgress(userId: number, payload: VideoProgressPayload): void {
    const eventName = 'video.progress';
    const targetSockets = this.resolveTargetSockets(userId, payload.videoId);

    for (const socketId of targetSockets) {
      try {
        this.server?.to(socketId).emit(eventName, payload);
      } catch (err) {
        this.logger.warn(`Failed to emit ${eventName} to socket ${socketId}`);
      }
    }

    this.logger.log(
      `Progress ${payload.percent}% for video ${payload.videoId} → ${targetSockets.size} socket(s)`,
    );
  }

  /**
   * Emit a completion event when all clips have been generated.
   */
  emitCompleted(
    userId: number,
    videoId: number,
    clipsGenerated: number,
  ): void {
    const payload = {
      videoId,
      percent: 100,
      clipsGenerated,
      message: `Processing complete — ${clipsGenerated} clip(s) ready`,
      timestamp: new Date().toISOString(),
    };

    const targetSockets = this.resolveTargetSockets(userId, videoId);
    for (const socketId of targetSockets) {
      try {
        this.server?.to(socketId).emit('video.completed', payload);
      } catch (err) {
        this.logger.warn(`Failed to emit video.completed to socket ${socketId}`);
      }
    }
  }

  /**
   * Emit a failure event when a job fails (including timeout).
   */
  emitFailed(userId: number, videoId: number, reason: string): void {
    const payload = {
      videoId,
      reason,
      message: `Processing failed: ${reason}`,
      timestamp: new Date().toISOString(),
    };

    const targetSockets = this.resolveTargetSockets(userId, videoId);
    for (const socketId of targetSockets) {
      try {
        this.server?.to(socketId).emit('video.failed', payload);
      } catch (err) {
        this.logger.warn(`Failed to emit video.failed to socket ${socketId}`);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Internal helpers
  // ─────────────────────────────────────────────────────────────

  /**
   * Merge the user's connected sockets with explicit video subscribers into a
   * deduplicated set of socket IDs to emit to.
   */
  private resolveTargetSockets(
    userId: number,
    videoId: number,
  ): Set<string> {
    const result = new Set<string>();

    const userSockets = this.userSockets.get(userId);
    if (userSockets) {
      for (const id of userSockets) result.add(id);
    }

    const videoSubs = this.videoSubscribers.get(videoId);
    if (videoSubs) {
      for (const id of videoSubs) result.add(id);
    }

    return result;
  }
}
