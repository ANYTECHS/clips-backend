import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { getVideoMetadata } from '../clips/ffmpeg.util';
import { CLIP_GENERATION_QUEUE } from '../clips/clip-generation.queue';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

export interface VideoValidationResult {
  valid: boolean;
  error?: string;
  code?: string;
  metadata?: {
    duration: number;
    width: number;
    height: number;
    format: string;
    fps: number;
    bitrate: number;
  };
}

export interface UploadResult {
  jobId: string;
  videoId: number;
  status: string;
  message: string;
  estimatedProcessingTime?: number;
}

@Injectable()
export class VideoUploadService {
  private readonly logger = new Logger(VideoUploadService.name);

  // Allowed video formats (mime types and extensions)
  private readonly ALLOWED_FORMATS = ['mp4', 'mov', 'avi', 'webm'];
  private readonly ALLOWED_MIME_TYPES = [
    'video/mp4',
    'video/quicktime', // mov
    'video/x-msvideo', // avi
    'video/webm',
  ];

  // Limits
  private readonly MAX_FILE_SIZE_MB = 500;
  private readonly MAX_FILE_SIZE_BYTES = this.MAX_FILE_SIZE_MB * 1024 * 1024;
  private readonly MAX_DURATION_HOURS = 4;
  private readonly MAX_DURATION_SECONDS = this.MAX_DURATION_HOURS * 60 * 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @InjectQueue(CLIP_GENERATION_QUEUE)
    private readonly clipQueue: Queue,
  ) {}

  /**
   * Validate uploaded video file
   * - Format check (mp4, mov, avi, webm)
   * - Size check (max 500 MB)
   * - Duration check (max 4 hours) using FFmpeg
   */
  async validateVideoFile(
    filePath: string,
    originalName: string,
    size: number,
    mimetype?: string,
  ): Promise<VideoValidationResult> {
    // 1. Validate file size
    if (size > this.MAX_FILE_SIZE_BYTES) {
      return {
        valid: false,
        error: `File too large. Maximum size is ${this.MAX_FILE_SIZE_MB} MB`,
        code: 'FILE_TOO_LARGE',
      };
    }

    // 2. Validate file format by extension
    const ext = path.extname(originalName).toLowerCase().replace('.', '');
    if (!this.ALLOWED_FORMATS.includes(ext)) {
      return {
        valid: false,
        error: `Invalid file format "${ext}". Allowed formats: ${this.ALLOWED_FORMATS.join(', ')}`,
        code: 'INVALID_FORMAT',
      };
    }

    // 3. Validate MIME type if provided
    if (mimetype && !this.ALLOWED_MIME_TYPES.includes(mimetype)) {
      return {
        valid: false,
        error: `Invalid MIME type "${mimetype}". Allowed: ${this.ALLOWED_MIME_TYPES.join(', ')}`,
        code: 'INVALID_FORMAT',
      };
    }

    // 4. Extract metadata using FFmpeg and validate duration
    try {
      const metadata = await getVideoMetadata(filePath);

      if (metadata.duration > this.MAX_DURATION_SECONDS) {
        return {
          valid: false,
          error: `Video duration (${this.formatDuration(metadata.duration)}) exceeds maximum allowed (${this.MAX_DURATION_HOURS} hours)`,
          code: 'DURATION_EXCEEDED',
          metadata: {
            duration: metadata.duration,
            width: metadata.width,
            height: metadata.height,
            format: metadata.format,
            fps: metadata.fps,
            bitrate: metadata.bitrate,
          },
        };
      }

      return {
        valid: true,
        metadata: {
          duration: metadata.duration,
          width: metadata.width,
          height: metadata.height,
          format: metadata.format,
          fps: metadata.fps,
          bitrate: metadata.bitrate,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to extract video metadata: ${error.message}`);
      return {
        valid: false,
        error: 'Failed to validate video. Please ensure the file is a valid video.',
        code: 'INVALID_FORMAT',
      };
    }
  }

  /**
   * Process video upload and enqueue for clip generation
   */
  async processUpload(
    tempFilePath: string,
    originalName: string,
    userId: number,
    title?: string,
  ): Promise<UploadResult> {
    try {
      // Get file stats
      const stats = await fs.stat(tempFilePath);

      // Validate the video
      const validation = await this.validateVideoFile(
        tempFilePath,
        originalName,
        stats.size,
      );

      if (!validation.valid) {
        // Clean up temp file
        await this.cleanupTempFile(tempFilePath);
        throw new BadRequestException({
          status: 'error',
          message: validation.error,
          code: validation.code,
        });
      }

      // Create video record in database
      const video = await this.prisma.video.create({
        data: {
          userId,
          title: title || originalName,
          sourceType: 'upload',
          sourceUrl: tempFilePath, // Temporary path, will be updated after Cloudinary upload
          status: 'pending',
          duration: Math.round(validation.metadata!.duration),
          fileSize: BigInt(stats.size),
          metadata: {
            duration: validation.metadata!.duration,
            width: validation.metadata!.width,
            height: validation.metadata!.height,
            format: validation.metadata!.format,
            fps: validation.metadata!.fps,
            bitrate: validation.metadata!.bitrate,
          },
          processingStats: {
            inputQuality: `${validation.metadata!.height}p`,
            durationSec: validation.metadata!.duration,
            uploadStarted: new Date().toISOString(),
          },
        },
      });

      // Enqueue clip generation job
      const jobId = `video-upload-${video.id}-${crypto.randomUUID()}`;
      const job = await this.clipQueue.add(
        'process-uploaded-video',
        {
          videoId: String(video.id),
          inputPath: tempFilePath,
          userId,
          originalName,
          metadata: validation.metadata,
        },
        {
          jobId,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
        },
      );

      this.logger.log(
        `Video ${video.id} uploaded and queued for processing (job: ${job.id})`,
      );

      // Estimate processing time (rough heuristic: ~2 min per minute of video)
      const estimatedSeconds = Math.max(
        60,
        Math.round(validation.metadata!.duration * 2),
      );

      return {
        jobId: String(job.id),
        videoId: video.id,
        status: 'accepted',
        message: 'Video upload accepted and queued for processing',
        estimatedProcessingTime: estimatedSeconds,
      };
    } catch (error) {
      // Clean up temp file on any error
      await this.cleanupTempFile(tempFilePath);

      if (error instanceof BadRequestException) {
        throw error;
      }

      this.logger.error(`Upload processing failed: ${error.message}`);
      throw new InternalServerErrorException({
        status: 'error',
        message: 'Failed to process upload',
        code: 'UPLOAD_FAILED',
      });
    }
  }

  /**
   * Clean up temporary file
   */
  async cleanupTempFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
      this.logger.debug(`Cleaned up temp file: ${filePath}`);
    } catch (error) {
      // Ignore errors - file may not exist
      this.logger.debug(`Failed to cleanup temp file (may not exist): ${filePath}`);
    }
  }

  /**
   * Schedule cleanup of temp file after job completion
   * This should be called by the job processor
   */
  async scheduleCleanup(filePath: string, delayMs: number = 60000): Promise<void> {
    setTimeout(async () => {
      await this.cleanupTempFile(filePath);
    }, delayMs);
  }

  /**
   * Format duration in seconds to human-readable string
   */
  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
  }
}
