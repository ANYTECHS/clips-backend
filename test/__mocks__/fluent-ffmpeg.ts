/**
 * Controlled mock for fluent-ffmpeg.
 * 
 * Features:
 * - Simulate successful and failed cuts
 * - Create predictable output files
 * - Capture stderr for debugging
 * - Support AbortSignal for cancellation
 * - Full fluent-ffmpeg API shape for testing
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface FFmpegMockConfig {
  shouldFail?: boolean;
  errorMessage?: string;
  stderrLines?: string[];
  createOutputFile?: boolean;
  fileContent?: Buffer;
}

class FFmpegMockCommand {
  private seekInputValue: number = 0;
  private durationValue: number = 0;
  private outputPath: string = '';
  private stderr: string[] = [];
  private handlers: Map<string, Function[]> = new Map();
  private signal?: AbortSignal;

  constructor(private config: FFmpegMockConfig = {}) {}

  seekInput(seconds: number): this {
    this.seekInputValue = seconds;
    return this;
  }

  duration(seconds: number): this {
    this.durationValue = seconds;
    return this;
  }

  output(path: string): this {
    this.outputPath = path;
    return this;
  }

  on(event: string, callback: Function): this {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push(callback);
    return this;
  }

  kill(_signal?: string): void {
    this.emit('error', new Error('Process killed'));
  }

  async run(): Promise<void> {
    // Check if already aborted
    if (this.signal?.aborted) {
      this.emit('error', new Error('Aborted'));
      return;
    }

    // Simulate abort listener if signal provided
    if (this.signal && !this.signal.aborted) {
      const onAbort = () => {
        this.emit('error', new Error('Aborted'));
      };
      this.signal.addEventListener('abort', onAbort, { once: true });
    }

    // Simulate FFmpeg stderr output
    await this.simulateStderr();

    // Handle configured failure
    if (this.config.shouldFail) {
      this.emit('error', new Error(this.config.errorMessage || 'FFmpeg error'));
      return;
    }

    // Handle success
    try {
      await this.createOutputFile();
      this.emit('end');
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
    }
  }

  private async simulateStderr(): Promise<void> {
    const lines = this.config.stderrLines || [
      "frame=   30 fps= 60 q=-1.0 Lsize=N/A time=00:00:30.00 bitrate=N/A speed=2.0x",
      "frame=   60 fps= 60 q=-1.0 Lsize=N/A time=01:00:00.00 bitrate=N/A speed=2.0x",
    ];

    for (const line of lines) {
      this.emit('stderr', line);
      // Small delay to simulate actual FFmpeg output
      await new Promise((r) => setImmediate(r));
    }
  }

  private async createOutputFile(): Promise<void> {
    if (!this.config.createOutputFile && this.outputPath) {
      // Don't actually create files by default in tests
      return;
    }

    if (!this.outputPath) {
      return;
    }

    const content = this.config.fileContent || Buffer.from('mock-video-content');
    const dir = path.dirname(this.outputPath);

    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.outputPath, content);
    } catch (err) {
      // If file creation fails, just log it - tests often use fake paths
      if (process.env.MOCK_FFMPEG_DEBUG) {
        console.error(`[FFmpeg Mock] Could not create file ${this.outputPath}:`, err);
      }
    }
  }

  private emit(event: string, ...args: any[]): void {
    const callbacks = this.handlers.get(event) || [];
    for (const callback of callbacks) {
      callback(...args);
    }
  }

  setSignal(signal: AbortSignal): this {
    this.signal = signal;
    return this;
  }
}

/**
 * Global state for mock configuration
 */
let globalConfig: FFmpegMockConfig = {};

/**
 * Configure the FFmpeg mock for all subsequent commands.
 * Reset with configureFFmpegMock({}) between tests.
 */
export function configureFFmpegMock(config: FFmpegMockConfig): void {
  globalConfig = { ...config };
}

/**
 * Reset mock to default state
 */
export function resetFFmpegMock(): void {
  globalConfig = {};
}

/**
 * FFmpeg command factory (main export)
 */
function ffmpeg(input: string): FFmpegMockCommand {
  const cmd = new FFmpegMockCommand(globalConfig);
  if (globalConfig.stderrLines) {
    cmd['input'] = input;
  }
  return cmd;
}

/**
 * Mock ffprobe - extracts video metadata
 */
ffmpeg.ffprobe = (
  input: string,
  callback: (err: Error | null, metadata?: any) => void,
): void => {
  // Simulate async behavior
  setImmediate(() => {
    if (globalConfig.shouldFail && globalConfig.errorMessage?.includes('probe')) {
      callback(new Error(globalConfig.errorMessage));
      return;
    }

    const metadata = {
      format: {
        duration: '30',
        format_name: 'mp4',
      },
      streams: [
        {
          codec_type: 'video',
          width: 1920,
          height: 1080,
        },
      ],
    };

    callback(null, metadata);
  });
};

/**
 * Set the FFmpeg binary path (no-op for mock)
 */
ffmpeg.setFfmpegPath = (_path: string): void => {
  // no-op
};

/**
 * Set the ffprobe path (no-op for mock)
 */
ffmpeg.setFfprobePath = (_path: string): void => {
  // no-op
};

export default ffmpeg;
