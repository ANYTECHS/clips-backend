import { JobsService } from './jobs.service';
import { CLIP_GENERATION_QUEUE } from '../clips/clip-generation.queue';

function makeJob(progress: number | Record<string, unknown>) {
  return {
    id: 'clip-123',
    progress,
    opts: { attempts: 3 },
    attemptsMade: 1,
    getState: jest.fn().mockResolvedValue('active'),
  };
}

function makeService(progress: number | Record<string, unknown>) {
  const clipQueue = {
    name: CLIP_GENERATION_QUEUE,
    getJob: jest.fn().mockResolvedValue(makeJob(progress)),
  };
  const emptyQueue = { name: 'other', getJob: jest.fn().mockResolvedValue(null) };
  return new JobsService(clipQueue as any, emptyQueue as any, emptyQueue as any);
}

describe('JobsService progress normalization', () => {
  it('returns the explicitly persisted stage even when it differs from percentage thresholds', async () => {
    const service = makeService({ percent: 10, stage: 'ai_analysis', step: 'ai_analysis' });

    await expect(service.getJobProgress('clip-123', CLIP_GENERATION_QUEUE)).resolves.toMatchObject({
      jobId: 'clip-123',
      progress: 10,
      stage: 'ai_analysis',
      queue: CLIP_GENERATION_QUEUE,
    });
  });

  it('normalizes the legacy ffmpeg_cut stage to ffmpeg_processing', async () => {
    const service = makeService({ percent: 65, stage: 'ffmpeg_cut' });

    await expect(service.getJobProgress('clip-123', CLIP_GENERATION_QUEUE)).resolves.toMatchObject({
      progress: 65,
      stage: 'ffmpeg_processing',
    });
  });

  it('infers a stage for legacy numeric progress values', async () => {
    const service = makeService(65);

    await expect(service.getJobProgress('clip-123', CLIP_GENERATION_QUEUE)).resolves.toMatchObject({
      progress: 65,
      stage: 'upload',
    });
  });
});
