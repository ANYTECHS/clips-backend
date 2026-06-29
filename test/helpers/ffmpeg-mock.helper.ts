/**
 * Test helper for FFmpeg mock configuration
 * 
 * Provides convenience functions for setting up FFmpeg mock behavior in tests
 */

import {
  configureFFmpegMock,
  resetFFmpegMock,
} from '../__mocks__/fluent-ffmpeg';

/**
 * Configure FFmpeg mock to simulate a successful video cut
 */
export function mockFFmpegSuccess(options: {
  stderrLines?: string[];
  createOutputFile?: boolean;
  fileContent?: Buffer;
} = {}): void {
  configureFFmpegMock({
    shouldFail: false,
    stderrLines: options.stderrLines || [
      'frame=   30 fps= 60 q=-1.0 Lsize=N/A time=00:00:30.00 bitrate=N/A speed=2.0x',
      'frame=   60 fps= 60 q=-1.0 Lsize=N/A time=01:00:00.00 bitrate=N/A speed=2.0x',
    ],
    createOutputFile: options.createOutputFile ?? false,
    fileContent: options.fileContent,
  });
}

/**
 * Configure FFmpeg mock to simulate a failed video cut
 */
export function mockFFmpegError(errorMessage: string = 'FFmpeg process error'): void {
  configureFFmpegMock({
    shouldFail: true,
    errorMessage,
    stderrLines: [
      'ffmpeg version N-12345-g...',
      errorMessage,
      'Exiting normally, received signal 1.',
    ],
  });
}

/**
 * Configure FFmpeg mock to simulate an out-of-memory error
 */
export function mockFFmpegOOM(): void {
  mockFFmpegError('Cannot allocate memory: Out of memory');
}

/**
 * Configure FFmpeg mock to simulate ffprobe failure (metadata extraction)
 */
export function mockFFmpegProbeError(
  message: string = 'ffprobe not found'
): void {
  configureFFmpegMock({
    shouldFail: true,
    errorMessage: `probe:${message}`,
    stderrLines: [message],
  });
}

/**
 * Configure FFmpeg mock to simulate a timeout
 */
export function mockFFmpegTimeout(): void {
  mockFFmpegError('FFmpeg process timeout - killed after 30s');
}

/**
 * Configure FFmpeg mock to simulate codec unavailable error
 */
export function mockFFmpegCodecError(codec: string = 'libx264'): void {
  mockFFmpegError(`Unknown encoder '${codec}'`);
}

/**
 * Reset FFmpeg mock to default state (success)
 */
export function resetFFmpegMockToDefault(): void {
  mockFFmpegSuccess();
}

/**
 * Completely reset FFmpeg mock
 */
export function cleanupFFmpegMock(): void {
  resetFFmpegMock();
}

/**
 * Create a mock video buffer for testing
 */
export function createMockVideoBuffer(sizeBytes: number = 1024): Buffer {
  return Buffer.alloc(sizeBytes, 'mock-video-content');
}

/**
 * Helper for test setup - call in beforeEach or beforeAll
 */
export function setupFFmpegMock(options: {
  shouldSucceed?: boolean;
  errorMessage?: string;
} = {}): void {
  if (options.shouldSucceed === false) {
    mockFFmpegError(options.errorMessage || 'FFmpeg error');
  } else {
    mockFFmpegSuccess();
  }
}

/**
 * Helper for test cleanup - call in afterEach
 */
export function cleanupFFmpegMockAfterTest(): void {
  cleanupFFmpegMock();
}
