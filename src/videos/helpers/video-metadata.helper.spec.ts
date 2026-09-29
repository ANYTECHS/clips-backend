import ffmpeg from 'fluent-ffmpeg';
import { extractVideoMetadata } from './video-metadata.helper';

jest.mock('fluent-ffmpeg', () => {
  const mock: Record<string, unknown> = { __esModule: true };
  mock.ffprobe = jest.fn();
  return { default: mock, ...mock };
});

const ffmpegMock = ffmpeg as unknown as { ffprobe: jest.Mock };

type ProbeCallback = (err: Error | null, data?: unknown) => void;

/** Stub the ffprobe callback with a fixed payload (or error). */
const stubProbe = (data?: unknown, err?: Error) => {
  ffmpegMock.ffprobe.mockImplementation((_path: string, cb: ProbeCallback) => {
    cb(err ?? null, data);
  });
};

const video = (
  overrides: { sourceUrl?: string; duration?: number | null } = {},
) => ({
  sourceUrl: overrides.sourceUrl ?? 'https://cdn.test/video.mp4',
  duration: overrides.duration === undefined ? 300 : overrides.duration,
});

describe('extractVideoMetadata (#1026)', () => {
  let logger: { warn: jest.Mock; log: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    logger = { warn: jest.fn(), log: jest.fn() };
  });

  it('rounds the ffprobe duration and derives the quality label', async () => {
    stubProbe({
      format: { duration: '120.6' },
      streams: [{ codec_type: 'video', height: 1080 }],
    });

    await expect(extractVideoMetadata(video(), logger)).resolves.toEqual({
      durationSec: 121,
      inputQuality: '1080p',
    });
  });

  it('probes the video sourceUrl', async () => {
    stubProbe({ format: { duration: '10' }, streams: [] });

    await extractVideoMetadata(
      video({ sourceUrl: 'https://cdn.test/other.mp4' }),
      logger,
    );

    expect(ffmpegMock.ffprobe).toHaveBeenCalledWith(
      'https://cdn.test/other.mp4',
      expect.any(Function),
    );
  });

  it('falls back to the stored duration when ffprobe omits it', async () => {
    stubProbe({ format: {}, streams: [{ codec_type: 'video', height: 720 }] });

    await expect(
      extractVideoMetadata(video({ duration: 480 }), logger),
    ).resolves.toEqual({ durationSec: 480, inputQuality: '720p' });
  });

  it('reports unknown quality when there is no video stream', async () => {
    stubProbe({
      format: { duration: '60' },
      streams: [{ codec_type: 'audio' }],
    });

    await expect(extractVideoMetadata(video(), logger)).resolves.toEqual({
      durationSec: 60,
      inputQuality: 'unknown',
    });
  });

  it('reports unknown quality when the video stream has no height', async () => {
    stubProbe({
      format: { duration: '60' },
      streams: [{ codec_type: 'video' }],
    });

    await expect(extractVideoMetadata(video(), logger)).resolves.toEqual({
      durationSec: 60,
      inputQuality: 'unknown',
    });
  });

  it('logs a warning and falls back when ffprobe fails', async () => {
    stubProbe(undefined, new Error('ffprobe binary missing'));

    await expect(
      extractVideoMetadata(video({ duration: 90 }), logger),
    ).resolves.toEqual({ durationSec: 90, inputQuality: 'unknown' });

    expect(logger.warn).toHaveBeenCalledWith(
      'ffprobe metadata extraction failed: ffprobe binary missing',
    );
  });

  it('falls back to 0 when both ffprobe fails and no duration is stored', async () => {
    stubProbe(undefined, new Error('boom'));

    await expect(
      extractVideoMetadata(video({ duration: null }), logger),
    ).resolves.toEqual({ durationSec: 0, inputQuality: 'unknown' });
  });

  it('handles a 480p source', async () => {
    stubProbe({
      format: { duration: '30.2' },
      streams: [{ codec_type: 'video', height: 480 }],
    });

    await expect(extractVideoMetadata(video(), logger)).resolves.toEqual({
      durationSec: 30,
      inputQuality: '480p',
    });
  });

  it('does not warn when ffprobe succeeds', async () => {
    stubProbe({ format: { duration: '5' }, streams: [] });

    await extractVideoMetadata(video(), logger);

    expect(logger.warn).not.toHaveBeenCalled();
  });
});
