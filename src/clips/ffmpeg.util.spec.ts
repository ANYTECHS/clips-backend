import ffmpegLib from 'fluent-ffmpeg';
import { cutClip, getVideoMetadata } from './ffmpeg.util';

// ── Mock fluent-ffmpeg ────────────────────────────────────────────────────────
var mockRun = jest.fn();
var mockOn = jest.fn();
var mockOutput = jest.fn();
var mockDuration = jest.fn();
var mockSeekInput = jest.fn();
var mockFfprobe = jest.fn();

// Each builder method returns `this` so calls can be chained
mockSeekInput.mockReturnValue({ duration: mockDuration });
mockDuration.mockReturnValue({ output: mockOutput });
mockOutput.mockReturnValue({ on: mockOn });

// .on() captures the 'end' / 'error' callbacks and exposes them for tests
let capturedCallbacks: Record<string, (...args: unknown[]) => void> = {};
mockOn.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
  capturedCallbacks[event] = cb;
  return { on: mockOn, run: mockRun };
});

mockRun.mockImplementation(() => {
  // Default: simulate successful FFmpeg run
  capturedCallbacks['end']?.();
});

jest.mock('fluent-ffmpeg', () => {
  const mock: any = jest.fn(() => ({ seekInput: mockSeekInput }));
  mock.ffprobe = (...args: any[]) => mockFfprobe(...args);
  return { default: mock, __esModule: true };
});

const ffmpegMock = ffmpegLib as unknown as jest.Mock;

function getSeekArg(): number {
  return mockSeekInput.mock.calls[0][0];
}
function getDurationArg(): number {
  return mockDuration.mock.calls[0][0];
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('cutClip', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedCallbacks = {};

    mockSeekInput.mockReturnValue({ duration: mockDuration });
    mockDuration.mockReturnValue({ output: mockOutput });
    mockOutput.mockReturnValue({ on: mockOn });
    mockOn.mockImplementation(
      (event: string, cb: (...args: unknown[]) => void) => {
        capturedCallbacks[event] = cb;
        return { on: mockOn, run: mockRun };
      },
    );
    mockRun.mockImplementation(() => capturedCallbacks['end']?.());
  });

  it('passes correct seekInput and duration for float times (12.5 → 45.7)', async () => {
    await cutClip({
      inputPath: 'in.mp4',
      outputPath: 'out.mp4',
      startTime: 12.5,
      endTime: 45.7,
    });

    expect(getSeekArg()).toBe(12.5);
    // duration = 45.7 - 12.5 = 33.2 (fixed to 3 d.p.)
    expect(getDurationArg()).toBeCloseTo(33.2, 3);
  });

  it('clamps startTime < 0 to 0', async () => {
    await cutClip({
      inputPath: 'in.mp4',
      outputPath: 'out.mp4',
      startTime: -5,
      endTime: 10,
    });

    expect(getSeekArg()).toBe(0);
    expect(getDurationArg()).toBe(10);
  });

  it('clamps endTime to videoDuration when provided', async () => {
    await cutClip({
      inputPath: 'in.mp4',
      outputPath: 'out.mp4',
      startTime: 10,
      endTime: 999,
      videoDuration: 60,
    });

    expect(getSeekArg()).toBe(10);
    expect(getDurationArg()).toBe(50); // 60 - 10
  });

  it('handles start=0 correctly', async () => {
    await cutClip({
      inputPath: 'in.mp4',
      outputPath: 'out.mp4',
      startTime: 0,
      endTime: 30,
    });

    expect(getSeekArg()).toBe(0);
    expect(getDurationArg()).toBe(30);
  });

  it('throws RangeError when endTime <= startTime', () => {
    expect(() =>
      cutClip({
        inputPath: 'in.mp4',
        outputPath: 'out.mp4',
        startTime: 50,
        endTime: 30,
      }),
    ).toThrow(RangeError);
  });

  it('throws RangeError when endTime equals startTime', () => {
    expect(() =>
      cutClip({
        inputPath: 'in.mp4',
        outputPath: 'out.mp4',
        startTime: 10,
        endTime: 10,
      }),
    ).toThrow(RangeError);
  });

  it('rejects when FFmpeg emits an error', async () => {
    mockRun.mockImplementation(() =>
      capturedCallbacks['error']?.(new Error('ffmpeg failed')),
    );

    await expect(
      cutClip({
        inputPath: 'in.mp4',
        outputPath: 'out.mp4',
        startTime: 0,
        endTime: 10,
      }),
    ).rejects.toThrow('ffmpeg failed');
  });

  it('resolves with the outputPath on success', async () => {
    const result = await cutClip({
      inputPath: 'in.mp4',
      outputPath: 'out.mp4',
      startTime: 12.5,
      endTime: 45.7,
    });
    expect(result).toBe('out.mp4');
  });

  it('normalises floating-point noise to 3 d.p.', async () => {
    // Simulate JS float imprecision
    await cutClip({
      inputPath: 'in.mp4',
      outputPath: 'out.mp4',
      startTime: 12.500000000001,
      endTime: 45.699999999999,
    });

    expect(getSeekArg()).toBe(12.5);
    expect(getDurationArg()).toBeCloseTo(33.2, 3);
  });
});

describe('getVideoMetadata', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns correctly parsed metadata on success', async () => {
    const mockMetadata = {
      format: { duration: '120.5', format_name: 'mov,mp4,m4a,3gp,3g2,mj2' },
      streams: [{ codec_type: 'video', width: 1920, height: 1080 }],
    };
    mockFfprobe.mockImplementation((path, cb) => cb(null, mockMetadata));

    const result = await getVideoMetadata('video.mp4');

    expect(result).toEqual(
      expect.objectContaining({
        duration: 120.5,
        width: 1920,
        height: 1080,
        format: 'mov,mp4,m4a,3gp,3g2,mj2',
        resolution: '1920x1080',
      }),
    );
    expect(mockFfprobe).toHaveBeenCalledWith('video.mp4', expect.any(Function));
  });

  it('rejects when ffprobe fails', async () => {
    mockFfprobe.mockImplementation((path, cb) =>
      cb(new Error('ffprobe error'), null),
    );

    await expect(getVideoMetadata('bad.mp4')).rejects.toThrow('ffprobe error');
  });

  it('rejects when no video stream is found', async () => {
    const mockMetadata = {
      format: { duration: '60', format_name: 'mp3' },
      streams: [{ codec_type: 'audio' }],
    };
    mockFfprobe.mockImplementation((path, cb) => cb(null, mockMetadata));

    await expect(getVideoMetadata('audio.mp3')).rejects.toThrow(
      'No video stream found',
    );
  });
});
