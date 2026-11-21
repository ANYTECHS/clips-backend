import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClipsService } from './clips.service';
import {
  CLIP_GENERATION_JOB,
  CLIP_GENERATION_JOB_OPTIONS,
} from './clip-generation.queue';

describe('ClipsService.enqueueClip', () => {
  const dto = {
    videoId: 'video-1',
    inputPath: '/tmp/video.mp4',
    outputPath: '/tmp/clip.mp4',
    startTime: 10,
    endTime: 25,
    positionRatio: 0.5,
  };

  function makeService(queue?: { add?: jest.Mock; getJob?: jest.Mock }) {
    return new ClipsService(
      {} as any,
      {} as any,
      new EventEmitter2(),
      queue as any,
    );
  }

  it('enqueues a clip generation job and returns its jobId', async () => {
    const queue = {
      add: jest.fn().mockResolvedValue({ id: 'job-123' }),
    };
    const service = makeService(queue);

    await expect(service.enqueueClip(dto)).resolves.toEqual({
      jobId: 'job-123',
      status: 'queued',
    });
    expect(queue.add).toHaveBeenCalledWith(
      CLIP_GENERATION_JOB,
      dto,
      CLIP_GENERATION_JOB_OPTIONS,
    );
  });

  it('rejects incomplete generation requests', async () => {
    const service = makeService({ add: jest.fn() });

    await expect(
      service.enqueueClip({ ...dto, outputPath: '' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects invalid clip ranges', async () => {
    const service = makeService({ add: jest.fn() });

    await expect(
      service.enqueueClip({ ...dto, startTime: 30, endTime: 30 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('fails clearly when the queue is unavailable', async () => {
    const service = makeService();

    await expect(service.enqueueClip(dto)).rejects.toThrow(
      'Clip generation queue is unavailable',
    );
  });

  it('returns asynchronous job status', async () => {
    const queue = {
      getJob: jest.fn().mockResolvedValue({
        attemptsMade: 1,
        failedReason: undefined,
        returnvalue: { status: 'success' },
        getState: jest.fn().mockResolvedValue('active'),
        getProgress: jest.fn().mockResolvedValue({ percent: 60, step: 'ffmpeg_processing' }),
      }),
    };
    const service = makeService(queue);

    await expect(service.getClipGenerationStatus('job-123')).resolves.toEqual({
      jobId: 'job-123',
      state: 'active',
      attemptsMade: 1,
      failedReason: undefined,
      result: { status: 'success' },
      progress: { percent: 60, step: 'ffmpeg_processing' },
    });
  });

  it('returns 404 for an unknown clip generation job', async () => {
    const service = makeService({ getJob: jest.fn().mockResolvedValue(undefined) });

    await expect(
      service.getClipGenerationStatus('missing-job'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
