import { Logger } from '@nestjs/common';
import * as Ffmpeg from 'fluent-ffmpeg';

const logger = new Logger('ffmpeg.util');

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  format: string;
  fps: number;
  bitrate: number;
  resolution: string;
}

export interface CutClipOptions {
  inputPath: string;
  outputPath: string;
  startTime: number;
  endTime: number;
  videoDuration?: number;
}

/**
 * Extract metadata from a video file using ffprobe.
 */
export function getVideoMetadata(inputPath: string): Promise<VideoMetadata> {
  logger.log(`Extracting metadata from: ${inputPath}`);

  return new Promise((resolve, reject) => {
    Ffmpeg.ffprobe(inputPath, (err, data) => {
      if (err) {
        logger.error(`ffprobe error for ${inputPath}: ${err.message}`);
        return reject(err);
      }

      const videoStream = data.streams?.find((s) => s.codec_type === 'video');
      const duration = parseFloat(String(data.format?.duration ?? '0'));
      const width = videoStream?.width ?? 0;
      const height = videoStream?.height ?? 0;
      const format = data.format?.format_name ?? 'unknown';
      const bitrate = Math.round(
        parseFloat(String(data.format?.bit_rate ?? '0')) / 1000,
      );

      // Parse frame rate (e.g. "30/1" or "30000/1001")
      let fps = 0;
      if (videoStream?.r_frame_rate) {
        const parts = videoStream.r_frame_rate.split('/');
        fps =
          parts.length === 2
            ? parseFloat(parts[0]) / parseFloat(parts[1])
            : parseFloat(parts[0]);
      }

      const metadata: VideoMetadata = {
        duration,
        width,
        height,
        format,
        fps: Math.round(fps * 100) / 100,
        bitrate,
        resolution: `${width}x${height}`,
      };

      logger.log(
        `Metadata for ${inputPath}: duration=${duration}s, ${metadata.resolution}, fps=${metadata.fps}`,
      );

      resolve(metadata);
    });
  });
}

/**
 * Cut a segment from a video file using ffmpeg.
 * Captures stderr for debugging (#740) and probes the output file to get
 * the actual duration after cutting (#742).
 *
 * Returns the outputPath on success.
 */
export function cutClip(options: CutClipOptions): Promise<string> {
  const { inputPath, outputPath, startTime, endTime } = options;
  const duration = endTime - startTime;

  logger.log(
    `Cutting: ${inputPath} [${startTime}s-${endTime}s] (${duration}s) → ${outputPath}`,
  );

  // Issue #740: store last 10 lines of stderr for debugging
  const stderrLines: string[] = [];

  return new Promise((resolve, reject) => {
    Ffmpeg(inputPath)
      .setStartTime(startTime)
      .setDuration(duration)
      .output(outputPath)
      // Issue #740: capture every stderr line emitted by FFmpeg
      .on('stderr', (line: string) => {
        logger.debug(`[ffmpeg stderr] ${line}`);
        stderrLines.push(line);
        // Keep only the last 10 lines to limit memory use
        if (stderrLines.length > 10) {
          stderrLines.shift();
        }
      })
      .on('error', (err: Error) => {
        const last10 = stderrLines.slice(-10).join('\n');
        logger.error(
          `FFmpeg cut failed for ${inputPath}: ${err.message}\nLast stderr lines:\n${last10}`,
          // Attach last 10 lines to the error object so callers can persist them
          // to processingError (as required by #740).
          { processingError: last10 },
        );
        // Augment the error so the caller can read `err.processingError`
        (err as any).processingError = last10;
        reject(err);
      })
      .on('end', () => {
        logger.log(`FFmpeg cut completed: ${outputPath}`);
        resolve(outputPath);
      })
      .run();
  });
}

/**
 * Probe an already-written output file and return its actual duration in seconds.
 * Issue #742: use this after cutClip() to get the real duration (avoids FFmpeg
 * rounding discrepancies when updating Clip.duration).
 */
export function probeOutputDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    Ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) {
        logger.error(
          `ffprobe failed for output file ${filePath}: ${err.message}`,
        );
        return reject(err);
      }
      const duration = parseFloat(String(data.format?.duration ?? '0'));
      logger.log(`Probed duration of ${filePath}: ${duration}s`);
      resolve(duration);
    });
  });
}
