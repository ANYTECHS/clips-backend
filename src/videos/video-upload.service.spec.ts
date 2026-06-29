jest.mock('fs/promises', () => ({
  stat: jest.fn(),
  unlink: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { VideoUploadService } from './video-upload.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { CLIP_GENERATION_QUEUE } from '../clips/clip-generation.queue';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock fluent-ffmpeg first
jest.mock('fluent-ffmpeg', () => require('../../test/__mocks__/fluent-ffmpeg'));

// Mock ffmpeg.util
jest.mock('../clips/ffmpeg.util', () => {
  const actual = jest.requireActual('../clips/ffmpeg.util');
  return {
    ...actual,
    getVideoMetadata: jest.fn(actual.getVideoMetadata),
  };
});

import { getVideoMetadata } from '../clips/ffmpeg.util';
import { mockFFmpegSuccess, cleanupFFmpegMockAfterTest } from '../../test/helpers/ffmpeg-mock.helper';

describe('VideoUploadService', () => {
  let service: VideoUploadService;
  let prismaService: PrismaService;
  let mockQueue: any;

  const mockPrismaService = {
    video: {
      create: jest.fn(),
    },
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, any> = {
        'MAX_FILE_SIZE_MB': 500,
        'MAX_DURATION_HOURS': 4,
      };
      return config[key];
    }),
  };

  const mockQueueMethods = {
    add: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockFFmpegSuccess(); // Ensure FFmpeg mock is in success state

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VideoUploadService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
        {
          provide: getQueueToken(CLIP_GENERATION_QUEUE),
          useValue: mockQueueMethods,
        },
      ],
    }).compile();

    service = module.get<VideoUploadService>(VideoUploadService);
    prismaService = module.get<PrismaService>(PrismaService);
    mockQueue = module.get(getQueueToken(CLIP_GENERATION_QUEUE));
  });

  afterEach(() => {
    cleanupFFmpegMockAfterTest();
  });

  describe('validateVideoFile', () => {
    it('should validate valid video file', async () => {
      const mockMetadata = {
        duration: 300, // 5 minutes
        width: 1920,
        height: 1080,
        format: 'mp4',
        resolution: '1920x1080',
      };
      (getVideoMetadata as jest.Mock).mockResolvedValue(mockMetadata);

      const result = await service.validateVideoFile(
        '/tmp/test.mp4',
        'test.mp4',
        100 * 1024 * 1024, // 100 MB
        'video/mp4',
      );

      expect(result.valid).toBe(true);
      expect(result.metadata).toEqual({
        duration: 300,
        width: 1920,
        height: 1080,
        format: 'mp4',
      });
    });

    it('should reject file with invalid format', async () => {
      const result = await service.validateVideoFile(
        '/tmp/test.xyz',
        'test.xyz',
        100 * 1024 * 1024,
        'application/octet-stream',
      );

      expect(result.valid).toBe(false);
      expect(result.code).toBe('INVALID_FORMAT');
      expect(result.error).toContain('xyz');
    });

    it('should reject file with invalid MIME type', async () => {
      const result = await service.validateVideoFile(
        '/tmp/test.mp4',
        'test.mp4',
        100 * 1024 * 1024,
        'image/jpeg',
      );

      expect(result.valid).toBe(false);
      expect(result.code).toBe('INVALID_FORMAT');
    });

    it('should reject file that exceeds size limit', async () => {
      const result = await service.validateVideoFile(
        '/tmp/test.mp4',
        'test.mp4',
        600 * 1024 * 1024, // 600 MB > 500 MB limit
        'video/mp4',
      );

      expect(result.valid).toBe(false);
      expect(result.code).toBe('FILE_TOO_LARGE');
      expect(result.error).toContain('500 MB');
    });

    it('should reject video that exceeds duration limit', async () => {
      const mockMetadata = {
        duration: 5 * 60 * 60, // 5 hours > 4 hour limit
        width: 1920,
        height: 1080,
        format: 'mp4',
        resolution: '1920x1080',
      };
      (getVideoMetadata as jest.Mock).mockResolvedValue(mockMetadata);

      const result = await service.validateVideoFile(
        '/tmp/test.mp4',
        'test.mp4',
        100 * 1024 * 1024,
        'video/mp4',
      );

      expect(result.valid).toBe(false);
      expect(result.code).toBe('DURATION_EXCEEDED');
      expect(result.error).toContain('4 hours');
    });

    it('should handle FFmpeg metadata extraction failure', async () => {
      (getVideoMetadata as jest.Mock).mockRejectedValue(
        new Error('FFmpeg error'),
      );

      const result = await service.validateVideoFile(
        '/tmp/test.mp4',
        'test.mp4',
        100 * 1024 * 1024,
        'video/mp4',
      );

      expect(result.valid).toBe(false);
      expect(result.code).toBe('INVALID_FORMAT');
    });

    it('should accept valid MOV file', async () => {
      const mockMetadata = {
        duration: 180,
        width: 1080,
        height: 1920,
        format: 'mov,mp4,m4a',
        resolution: '1080x1920',
      };
      (getVideoMetadata as jest.Mock).mockResolvedValue(mockMetadata);

      const result = await service.validateVideoFile(
        '/tmp/test.mov',
        'test.mov',
        50 * 1024 * 1024,
        'video/quicktime',
      );

      expect(result.valid).toBe(true);
    });

    it('should accept valid AVI file', async () => {
      const mockMetadata = {
        duration: 120,
        width: 1280,
        height: 720,
        format: 'avi',
        resolution: '1280x720',
      };
      (getVideoMetadata as jest.Mock).mockResolvedValue(mockMetadata);

      const result = await service.validateVideoFile(
        '/tmp/test.avi',
        'test.avi',
        75 * 1024 * 1024,
        'video/x-msvideo',
      );

      expect(result.valid).toBe(true);
    });

    it('should accept valid WebM file', async () => {
      const mockMetadata = {
        duration: 240,
        width: 1920,
        height: 1080,
        format: 'webm',
        resolution: '1920x1080',
      };
      (getVideoMetadata as jest.Mock).mockResolvedValue(mockMetadata);

      const result = await service.validateVideoFile(
        '/tmp/test.webm',
        'test.webm',
        30 * 1024 * 1024,
        'video/webm',
      );

      expect(result.valid).toBe(true);
    });
  });

  describe('processUpload', () => {
    const mockMetadata = {
      duration: 300,
      width: 1920,
      height: 1080,
      format: 'mp4',
      resolution: '1920x1080',
    };

    beforeEach(() => {
      (fs.stat as jest.Mock).mockResolvedValue({
        size: 100 * 1024 * 1024,
      });
      (getVideoMetadata as jest.Mock).mockResolvedValue(mockMetadata);
    });

    it('should process valid upload and enqueue job', async () => {
      mockPrismaService.video.create.mockResolvedValue({
        id: 123,
        userId: 1,
        status: 'pending',
      });

      mockQueue.add.mockResolvedValue({ id: 'job_abc123' });

      const result = await service.processUpload(
        '/tmp/upload-123.mp4',
        'my-video.mp4',
        1,
        'My Awesome Video',
      );

      expect(result.status).toBe('accepted');
      expect(result.videoId).toBe(123);
      expect(result.jobId).toBe('job_abc123');
      expect(result.estimatedProcessingTime).toBe(600); // ~2 min per min of video

      expect(mockPrismaService.video.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 1,
          title: 'My Awesome Video',
          sourceType: 'upload',
          status: 'pending',
          duration: 300,
          fileSize: BigInt(100 * 1024 * 1024),
        }),
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        'process-uploaded-video',
        expect.objectContaining({
          videoId: '123',
          inputPath: '/tmp/upload-123.mp4',
          userId: 1,
          originalName: 'my-video.mp4',
        }),
        expect.objectContaining({
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        }),
      );
    });

    it('should use filename as title when title not provided', async () => {
      mockPrismaService.video.create.mockResolvedValue({ id: 124 });
      mockQueue.add.mockResolvedValue({ id: 'job_def456' });

      await service.processUpload(
        '/tmp/upload-124.mp4',
        'original-filename.mp4',
        1,
        undefined,
      );

      expect(mockPrismaService.video.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: 'original-filename.mp4',
        }),
      });
    });

    it('should throw BadRequestException for invalid video', async () => {
      (getVideoMetadata as jest.Mock).mockResolvedValue({
        duration: 5 * 60 * 60, // 5 hours - exceeds limit
        width: 1920,
        height: 1080,
        format: 'mp4',
        resolution: '1920x1080',
      });

      await expect(
        service.processUpload('/tmp/upload-125.mp4', 'too-long.mp4', 1),
      ).rejects.toThrow(BadRequestException);

      // Verify temp file cleanup
      // Note: actual fs.unlink mock would verify this
    });

    it('should throw BadRequestException for file too large', async () => {
      (fs.stat as jest.Mock).mockResolvedValue({
        size: 600 * 1024 * 1024, // 600 MB
      });

      await expect(
        service.processUpload('/tmp/upload-126.mp4', 'huge.mp4', 1),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('cleanupTempFile', () => {
    it('should delete temp file successfully', async () => {
      (fs.unlink as jest.Mock).mockResolvedValue(undefined);

      await service.cleanupTempFile('/tmp/test.mp4');

      expect(fs.unlink).toHaveBeenCalledWith('/tmp/test.mp4');
    });

    it('should not throw if file does not exist', async () => {
      const error = new Error('ENOENT: file not found');
      (error as any).code = 'ENOENT';
      (fs.unlink as jest.Mock).mockRejectedValue(error);

      await expect(
        service.cleanupTempFile('/tmp/nonexistent.mp4'),
      ).resolves.not.toThrow();
    });
  });
});
