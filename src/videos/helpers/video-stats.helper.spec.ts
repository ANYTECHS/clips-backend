import { updateVideoProcessingStats } from './video-stats.helper';
import { PrismaService } from '../../prisma/prisma.service';
import type { VideoProcessingStatsInput } from './types';

const asPrisma = (video: { update: jest.Mock }) =>
  ({ video }) as unknown as PrismaService;

interface UpdateArgs {
  where: { id: number };
  data: { processingStats: Record<string, unknown> };
}

describe('updateVideoProcessingStats (#1026)', () => {
  let video: { update: jest.Mock };
  let baseStats: VideoProcessingStatsInput;

  beforeEach(() => {
    video = { update: jest.fn().mockResolvedValue({ id: 1 }) };
    baseStats = {
      momentsFound: 12,
      inputQuality: '1080p',
      durationSec: 600,
      clipsGenerated: 4,
      timeTakenMs: 1234,
    };
  });

  const lastStats = (): Record<string, unknown> => {
    const calls = video.update.mock.calls as unknown as [UpdateArgs][];
    return calls[calls.length - 1][0].data.processingStats;
  };

  it('persists the video processing stats onto the Video row', async () => {
    await updateVideoProcessingStats(asPrisma(video), 1, baseStats);

    expect(video.update).toHaveBeenCalledTimes(1);
    expect(video.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        processingStats: {
          momentsFound: 12,
          inputQuality: '1080p',
          durationSec: 600,
          clipsGenerated: 4,
          timeTakenMs: 1234,
        },
      },
    });
  });

  it('targets the requested video id', async () => {
    await updateVideoProcessingStats(asPrisma(video), 99, baseStats);

    const [[args]] = video.update.mock.calls as unknown as [UpdateArgs][];
    expect(args.where).toEqual({ id: 99 });
  });

  it('omits avgDurationSec when it is not provided', async () => {
    await updateVideoProcessingStats(asPrisma(video), 1, baseStats);

    const processingStats = lastStats();
    expect(processingStats).not.toHaveProperty('avgDurationSec');
  });

  it('includes avgDurationSec when supplied', async () => {
    await updateVideoProcessingStats(asPrisma(video), 1, {
      ...baseStats,
      avgDurationSec: 42.5,
    });

    expect(lastStats().avgDurationSec).toBe(42.5);
  });

  it('includes a zero avgDurationSec (uses an explicit undefined check)', async () => {
    await updateVideoProcessingStats(asPrisma(video), 1, {
      ...baseStats,
      avgDurationSec: 0,
    });

    expect(lastStats().avgDurationSec).toBe(0);
  });

  it('omits errorDetails when there is no error', async () => {
    await updateVideoProcessingStats(asPrisma(video), 1, baseStats);

    expect(lastStats()).not.toHaveProperty('errorDetails');
  });

  it('persists errorDetails when an error string is present', async () => {
    await updateVideoProcessingStats(asPrisma(video), 1, {
      ...baseStats,
      error: 'ffprobe failed',
    });

    expect(lastStats().errorDetails).toBe('ffprobe failed');
  });

  it('omits moments when the array is not provided', async () => {
    await updateVideoProcessingStats(asPrisma(video), 1, baseStats);

    expect(lastStats()).not.toHaveProperty('moments');
  });

  it('persists the detected moments when provided', async () => {
    const moments = [{ start: 0, end: 30, reason: 'hook', score: 0.9 }];

    await updateVideoProcessingStats(asPrisma(video), 1, {
      ...baseStats,
      moments,
    });

    expect(lastStats().moments).toEqual(moments);
  });

  it('persists every optional field together', async () => {
    const moments = [{ start: 1, end: 2, reason: 'r', score: 1 }];

    await updateVideoProcessingStats(asPrisma(video), 5, {
      ...baseStats,
      avgDurationSec: 15,
      error: 'partial failure',
      moments,
    });

    expect(lastStats()).toEqual({
      momentsFound: 12,
      inputQuality: '1080p',
      durationSec: 600,
      clipsGenerated: 4,
      timeTakenMs: 1234,
      avgDurationSec: 15,
      errorDetails: 'partial failure',
      moments,
    });
  });

  it('propagates a Prisma failure to the caller', async () => {
    video.update.mockRejectedValue(new Error('prisma unavailable'));

    await expect(
      updateVideoProcessingStats(asPrisma(video), 1, baseStats),
    ).rejects.toThrow('prisma unavailable');
  });

  it('preserves zero-valued counters rather than dropping them', async () => {
    await updateVideoProcessingStats(asPrisma(video), 1, {
      momentsFound: 0,
      inputQuality: 'unknown',
      durationSec: 0,
      clipsGenerated: 0,
      timeTakenMs: 0,
    });

    expect(lastStats()).toEqual({
      momentsFound: 0,
      inputQuality: 'unknown',
      durationSec: 0,
      clipsGenerated: 0,
      timeTakenMs: 0,
    });
  });
});
