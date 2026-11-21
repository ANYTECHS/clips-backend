import { EventEmitter2 } from '@nestjs/event-emitter';
import { Job } from 'bullmq';
import { cutClip, getVideoMetadata } from './ffmpeg.util';
import {
  ClipGenerationProcessor,
  ClipGenerationJob,
} from './clip-generation.processor';
import { CLIP_GENERATION_FAILED_EVENT } from './clips.events';
import {
  CLIP_GENERATION_QUEUE,
  CLIP_JOB_OPTIONS,
} from './clip-generation.queue';

jest.mock('../videos/video.service', () => ({
  VideoService: class VideoService {},
}));
jest.mock('../config/bullmq.config', () => ({
  getBullMQWorkerConfig: jest.fn().mockReturnValue({
    clipGenerationConcurrency: 1,
  }),
}));
jest.mock('../common/shutdown/graceful-shutdown.service', () => ({
  GracefulShutdownService: class GracefulShutdownService {},
}));
jest.mock('../metrics/metrics.service', () => ({
  MetricsService: class MetricsService {},
}));
jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));
jest.mock('./cloudinary.service', () => ({
  CloudinaryService: class CloudinaryService {},
}));
jest.mock('./clips.gateway', () => ({
  ClipsGateway: class ClipsGateway {},
}));
jest.mock('./clips.service', () => ({
  ClipsService: class ClipsService {},
}));
jest.mock('./dto/create-clip.dto', () => ({
  DEFAULT_CLIP_ROYALTY_BPS: 1000,
}));

jest.mock('./virality-score.util', () => ({
  calculateViralityScore: jest.fn().mockReturnValue(75),
}));

jest.mock('./ffmpeg.util', () => ({
  cutClip: jest.fn().mockResolvedValue('/tmp/out.mp4'),
  getVideoMetadata: jest.fn().mockResolvedValue({
    duration: 33.2,
    width: 1920,
    height: 1080,
    format: 'mp4',
    fps: 30,
    bitrate: 5000,
    resolution: '1920x1080',
  }),
}));

import { MockCloudinaryService } from '../../test/mocks/cloudinary.mock';

// ── Helpers ───────────────────────────────────────────────────────────────────

const JOB_DATA: ClipGenerationJob = {
  videoId: 'video-1',
  inputPath: '/tmp/in.mp4',
  outputPath: '/tmp/out.mp4',
  startTime: 12.5,
  endTime: 45.7,
  positionRatio: 0.5,
};

function makeJob(
  overrides: Partial<Job<ClipGenerationJob>> = {},
): Job<ClipGenerationJob> {
  return {
    id: 'job-1',
    data: JOB_DATA,
    attemptsMade: 0,
    failedReason: undefined,
    opts: { attempts: CLIP_JOB_OPTIONS.attempts },
    updateProgress: jest.fn(),
    ...overrides,
  } as unknown as Job<ClipGenerationJob>;
}

function makeProcessor() {
  const emitter = new EventEmitter2();
  const cloudinaryService = new MockCloudinaryService();
  const clipsGateway = {
    emitProgressToUser: jest.fn(),
    emitProgress: jest.fn(),
    emitCompleted: jest.fn(),
    emitFailed: jest.fn(),
  };
  const videoService = {
    detectViralTimestamps: jest.fn().mockResolvedValue([]),
  };
  const clipsService = {
    videoService,
    _registerJobController: jest.fn(),
    _clearJobController: jest.fn(),
    _isVideoCancelled: jest.fn().mockReturnValue(false),
    _getVideo: jest.fn().mockReturnValue({ userId: 1 }),
    updateClip: jest.fn().mockResolvedValue(undefined),
    refreshQueueDepth: jest.fn().mockResolvedValue(undefined),
  };
  const metricsService = {
    incrementClipsGenerated: jest.fn(),
    recordJobStart: jest.fn(),
    recordJobCompletion: jest.fn(),
    recordJobFailure: jest.fn(),
  };
  const prisma = {
    video: {
      findUnique: jest.fn().mockResolvedValue({ userId: 1 }),
    },
  };
  jest.spyOn(emitter, 'emit');
  jest.spyOn(cloudinaryService, 'uploadVideoFromBuffer');
  jest.spyOn(cloudinaryService, 'deleteLocalFile');
  const shutdownService = {
    register: jest.fn(),
  };

  const processor = new ClipGenerationProcessor(
    videoService as any,
    cloudinaryService as any,
    emitter,
    clipsGateway as any,
    clipsService as any,
    metricsService as any,
    prisma as any,
    shutdownService as any,
  );
  return {
    processor,
    emitter,
    cloudinaryService,
    clipsGateway,
    clipsService,
    metricsService,
    prisma,
    videoService,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ClipGenerationProcessor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (cutClip as jest.Mock).mockResolvedValue('/tmp/out.mp4');
    (getVideoMetadata as jest.Mock).mockResolvedValue({
      duration: 33.2,
      width: 1920,
      height: 1080,
      format: 'mp4',
      fps: 30,
      bitrate: 5000,
      resolution: '1920x1080',
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('process()', () => {
    it('cuts and uploads a clip using the controlled FFmpeg output', async () => {
      const { processor, cloudinaryService } = makeProcessor();
      const readFileSpy = jest.spyOn(cloudinaryService, 'readFileToBuffer');
      const uploadSpy = jest.spyOn(
        cloudinaryService,
        'uploadVideoFromBuffer',
      );
      const job = makeJob();

      await processor.process(job);

      expect(cutClip).toHaveBeenCalledWith(
        expect.objectContaining({
          inputPath: '/tmp/in.mp4',
          outputPath: '/tmp/out.mp4',
          startTime: 12.5,
          endTime: 45.7,
        }),
      );
      expect(getVideoMetadata).toHaveBeenCalledWith('/tmp/out.mp4');
      expect(readFileSpy).toHaveBeenCalledWith('/tmp/out.mp4');
      expect(uploadSpy).toHaveBeenCalledWith(
        Buffer.from('mock-video-data'),
        'video-1-12.5-45.7',
        { folder: 'clips', resourceType: 'video' },
        1,
      );
      expect(job.updateProgress).toHaveBeenNthCalledWith(1, {
        percent: 10,
        step: 'video_download',
      });
      expect(job.updateProgress).toHaveBeenNthCalledWith(2, {
        percent: 60,
        step: 'ffmpeg_processing',
      });
      expect(job.updateProgress).toHaveBeenNthCalledWith(3, {
        percent: 80,
        step: 'upload',
      });
      expect(job.updateProgress).toHaveBeenNthCalledWith(4, {
        percent: 100,
        step: 'done',
      });
    });

    it('returns a Clip with viralityScore populated', async () => {
      const { processor } = makeProcessor();
      const clip = await processor.process(makeJob());

      expect(clip.viralityScore).toBe(75);
      expect(clip.videoId).toBe('video-1');
      expect(clip.selected).toBe(false);
      expect(clip.postStatus).toBeNull();
    });

    it('propagates errors so BullMQ can retry', async () => {
      (cutClip as jest.Mock).mockRejectedValueOnce(
        new Error('FFmpeg process failed: OOM'),
      );
      const { processor, cloudinaryService, metricsService } = makeProcessor();
      const loggerError = jest.spyOn(processor['logger'], 'error');

      await expect(processor.process(makeJob())).rejects.toThrow(
        'FFmpeg process failed: OOM',
      );
      expect(cloudinaryService.uploadVideoFromBuffer).not.toHaveBeenCalled();
      expect(cloudinaryService.deleteLocalFile).toHaveBeenCalledWith(
        '/tmp/out.mp4',
      );
      expect(metricsService.recordJobFailure).toHaveBeenCalledWith(
        CLIP_GENERATION_QUEUE,
        'FFmpeg process failed: OOM',
      );
      expect(loggerError).toHaveBeenCalledWith(
        expect.stringContaining('Clip generation failed'),
        expect.any(String),
      );
    });

    it('returns clip with upload_failed status when Cloudinary upload fails', async () => {
      const { processor, cloudinaryService, clipsService } = makeProcessor();
      jest.useFakeTimers();
      const loggerError = jest.spyOn(processor['logger'], 'error');
      const uploadSpy = jest
        .spyOn(cloudinaryService, 'uploadVideoFromBuffer')
        .mockResolvedValue({
          secure_url: '',
          public_id: 'test-clip',
          error: 'Network timeout',
        } as any);

      const job = makeJob({ data: { ...JOB_DATA, clipId: 42 } });
      const processing = processor.process(job);
      await jest.advanceTimersByTimeAsync(3000);
      const clip = await processing;
      await processor.onCompleted(job, clip);

      expect(clip.status).toBe('upload_failed');
      expect(clip.error).toContain('Cloudinary upload failed');
      expect(clip.localFilePath).toBe('/tmp/out.mp4');
      expect(clip.clipUrl).toBe('');
      expect(uploadSpy).toHaveBeenCalledTimes(3);
      expect(loggerError).toHaveBeenCalledWith(
        expect.stringContaining('Cloudinary upload failed after 3 attempts'),
      );
      expect(clipsService.updateClip).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ status: 'upload_failed' }),
      );
    });

    it('keeps local file when upload fails', async () => {
      const { processor, cloudinaryService } = makeProcessor();
      jest.useFakeTimers();
      jest.spyOn(cloudinaryService, 'uploadVideoFromBuffer').mockResolvedValue({
        secure_url: '',
        public_id: 'test-clip',
        error: 'Upload failed',
      } as any);
      const deleteLocalFileSpy = jest.spyOn(
        cloudinaryService,
        'deleteLocalFile',
      );

      const processing = processor.process(makeJob());
      await jest.advanceTimersByTimeAsync(3000);
      await processing;

      // Should NOT delete local file when upload fails
      expect(deleteLocalFileSpy).not.toHaveBeenCalled();
    });

    it('deletes local file after successful upload', async () => {
      const { processor, cloudinaryService } = makeProcessor();
      const deleteLocalFileSpy = jest.spyOn(
        cloudinaryService,
        'deleteLocalFile',
      );

      await processor.process(makeJob());

      expect(deleteLocalFileSpy).toHaveBeenCalledWith('/tmp/out.mp4');
    });

    it('runs AI moment detection for an uploaded video without external calls', async () => {
      const { processor, videoService, cloudinaryService } = makeProcessor();
      const job = makeJob({
        data: {
          videoId: '9',
          inputPath: '/tmp/uploaded.mov',
          userId: 7,
        } as unknown as ClipGenerationJob,
      });

      const result = await processor.process(job);

      expect(videoService.detectViralTimestamps).toHaveBeenCalledWith(9);
      expect(cloudinaryService.deleteLocalFile).toHaveBeenCalledWith(
        '/tmp/uploaded.mov',
      );
      expect(result.status).toBe('upload_processed');
      expect(job.updateProgress).toHaveBeenNthCalledWith(2, {
        percent: 30,
        step: 'ai_analysis',
      });
    });
  });

  describe('onCompleted()', () => {
    it('persists generated clip data and resolves the WebSocket recipient via Prisma', async () => {
      const { processor, clipsService, clipsGateway, prisma } = makeProcessor();
      clipsService._getVideo.mockReturnValue(null);
      const job = makeJob({
        data: { ...JOB_DATA, videoId: '1', clipId: 42 },
      });
      const clip = await processor.process(job);

      await processor.onCompleted(job, clip);

      expect(clipsService.updateClip).toHaveBeenCalledWith(
        42,
        expect.objectContaining({
          clipUrl: clip.clipUrl,
          thumbnail: clip.thumbnail,
          status: 'success',
          duration: 33.2,
          royaltyBps: expect.any(Number),
        }),
      );
      expect(prisma.video.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        select: { userId: true },
      });
      expect(clipsGateway.emitCompleted).toHaveBeenCalledWith(
        '1',
        expect.objectContaining({ clipUrl: clip.clipUrl }),
      );
    });
  });

  describe('onFailed() — @OnWorkerEvent("failed")', () => {
    it('emits CLIP_GENERATION_FAILED_EVENT on the final attempt', () => {
      const { processor, emitter } = makeProcessor();
      const job = makeJob({
        attemptsMade: CLIP_JOB_OPTIONS.attempts, // equals max → final failure
        failedReason: 'FFmpeg OOM after 3 attempts',
      });

      processor.onFailed(job, new Error('FFmpeg OOM after 3 attempts'));

      expect(emitter.emit).toHaveBeenCalledWith(
        CLIP_GENERATION_FAILED_EVENT,
        expect.objectContaining({
          jobId: 'job-1',
          videoId: 'video-1',
          failedReason: 'FFmpeg OOM after 3 attempts',
          attemptsMade: CLIP_JOB_OPTIONS.attempts,
        }),
      );
    });

    it('does NOT emit event on intermediate failures (BullMQ will retry)', () => {
      const { processor, emitter } = makeProcessor();
      // attemptsMade=1 < attempts=3 → still has retries left
      const job = makeJob({ attemptsMade: 1 });

      processor.onFailed(job, new Error('transient network error'));

      expect(emitter.emit).not.toHaveBeenCalled();
    });

    it('uses job.failedReason over error.message when available', () => {
      const { processor, emitter } = makeProcessor();
      const job = makeJob({
        attemptsMade: CLIP_JOB_OPTIONS.attempts,
        failedReason: 'rate limit exceeded',
      });

      processor.onFailed(job, new Error('different message'));

      expect(emitter.emit).toHaveBeenCalledWith(
        CLIP_GENERATION_FAILED_EVENT,
        expect.objectContaining({ failedReason: 'rate limit exceeded' }),
      );
    });

    it('records and logs final failures and updates the clip status', async () => {
      const { processor, clipsService, clipsGateway, metricsService } =
        makeProcessor();
      const loggerError = jest.spyOn(processor['logger'], 'error');
      const job = makeJob({
        data: { ...JOB_DATA, clipId: 42 },
        attemptsMade: CLIP_JOB_OPTIONS.attempts,
      });
      const error = new Error('Cloudinary upload failed');

      processor.onFailed(job, error);
      await Promise.resolve();

      expect(metricsService.recordJobFailure).toHaveBeenCalledWith(
        CLIP_GENERATION_QUEUE,
        'final_failure',
      );
      expect(clipsService.updateClip).toHaveBeenCalledWith(42, {
        status: 'upload_failed',
        error: error.message,
      });
      expect(clipsGateway.emitFailed).toHaveBeenCalledWith(
        '1',
        expect.objectContaining({ reason: error.message }),
      );
      expect(loggerError).toHaveBeenCalledWith(
        expect.stringContaining('[FINAL FAILURE] Clip job job-1'),
        error.stack,
      );
    });
  });

  describe('CLIP_JOB_OPTIONS', () => {
    it('configures 3 attempts with exponential backoff at 5000ms', () => {
      expect(CLIP_JOB_OPTIONS.attempts).toBe(3);
      expect(CLIP_JOB_OPTIONS.backoff.type).toBe('exponential');
      expect(CLIP_JOB_OPTIONS.backoff.delay).toBe(5000);
    });
  });
});
