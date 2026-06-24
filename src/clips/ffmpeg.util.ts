import ffmpeg from 'fluent-ffmpeg';
import { Logger } from '@nestjs/common';

const logger = new Logger('FfmpegUtil');

export interface CutClipOptions {
  inputPath: string;
  outputPath: string;
  /** Start time in seconds — may be a float e.g. 12.5 */
  startTime: number;
  /** End time in seconds — may be a float e.g. 45.7 */
  endTime: number;
  /** Total duration of the source video in seconds (used for edge-case clamping) */
  videoDuration?: number;
  signal?: AbortSignal;
}

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  format: string;
  resolution: string;
  fps: number;
  bitrate: number;
}

/**
 * Extracts video metadata using ffprobe.
 * Returns duration, width, height, format, and resolution.
 */
export async function getVideoMetadata(
  inputPath: string,
): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) {
        return reject(err);
      }

      const format = metadata.format;
      const stream = metadata.streams.find((s) => s.codec_type === 'video');

      if (!stream) {
        return reject(new Error('No video stream found'));
      }

      const duration = parseFloat(format.duration?.toString() || '0');
      const width = stream.width || 0;
      const height = stream.height || 0;
      const formatName = format.format_name || 'unknown';

      // Parse frame rate from "num/den" string (e.g. "30/1" or "30000/1001")
      let fps = 0;
      if (stream.r_frame_rate) {
        const parts = stream.r_frame_rate.split('/');
        if (parts.length === 2) {
          const num = parseFloat(parts[0]);
          const den = parseFloat(parts[1]);
          fps = den > 0 ? Math.round((num / den) * 100) / 100 : 0;
        }
      }

      const bitrate = parseInt(format.bit_rate?.toString() || '0', 10);

      resolve({
        duration,
        width,
        height,
        format: formatName,
        resolution: `${width}x${height}`,
        fps,
        bitrate,
      });
    });
  });
}

/**
 * Sanitises float startTime/endTime values before passing them to FFmpeg.
 *
 * Problem: FFmpeg's -ss / -t flags choke on raw JS floats that may carry
 * floating-point noise (e.g. 12.500000000001). We normalise to a fixed
 * 3-decimal-place string so FFmpeg always receives a clean value like "12.500".
 *
 * Rules applied:
 *  - startTime is clamped to >= 0
 *  - endTime is clamped to <= videoDuration (when provided)
 *  - endTime must be > startTime; throws otherwise
 *  - duration = endTime - startTime, formatted to 3 d.p.
 *
 * FFmpeg invocation uses:
 *  .seekInput(startSeconds)  — maps to -ss (input seek, frame-accurate)
 *  .duration(durationSeconds) — maps to -t (output duration)
 */
export function cutClip(options: CutClipOptions): Promise<string> {
  const { inputPath, outputPath, videoDuration } = options;

  // --- Sanitise & clamp ---
  const start = Math.max(0, options.startTime);
  const end =
    videoDuration != null
      ? Math.min(options.endTime, videoDuration)
      : options.endTime;

  if (end <= start) {
    throw new RangeError(
      `endTime (${end}) must be greater than startTime (${start})`,
    );
  }

  // Fixed-precision strings — avoids floating-point noise in FFmpeg args
  const startSeconds = parseFloat(start.toFixed(3));
  const durationSeconds = parseFloat((end - start).toFixed(3));

  logger.log(
    `Cutting clip: input=${inputPath} start=${startSeconds}s duration=${durationSeconds}s output=${outputPath}`,
  );

  return new Promise((resolve, reject) => {
    const stderrLines: string[] = [];
    const MAX_STDERR_LINES = 10;

    const cmd = ffmpeg(inputPath)
      .seekInput(startSeconds)
      .duration(durationSeconds)
      .output(outputPath)
      .on('stderr', (line: string) => {
        stderrLines.push(line);
        if (stderrLines.length > MAX_STDERR_LINES) {
          stderrLines.shift();
        }
        logger.debug(`[ffmpeg stderr] ${line}`);
      })
      .on('end', () => {
        resolve(outputPath);
      })
      .on('error', (err: Error) => {
        const stderrSummary =
          stderrLines.length > 0
            ? `\nLast FFmpeg output:\n${stderrLines.join('\n')}`
            : '';
        const detailedError = new Error(`${err.message}${stderrSummary}`);
        reject(detailedError);
      });

    if (options.signal) {
      const onAbort = () => {
        try {
          cmd.kill('SIGKILL');
        } catch {}
        reject(new Error('Aborted'));
      };
      if (options.signal.aborted) {
        onAbort();
        return;
      }
      options.signal.addEventListener('abort', onAbort, { once: true });
    }

    cmd.run();
  });
}
