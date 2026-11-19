/**
 * FFmpeg/FFprobe utility functions for video processing.
 *
 * Issue #745: Extracts duration, resolution, format, fps, and bitrate from
 * uploaded videos via ffprobe before queueing clip generation. The extracted
 * data is stored in processingStats.originalDuration and resolution fields.
 * Issue #745: Video metadata extraction via ffprobe.
 */
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface VideoMetadata {
  /** Duration in seconds */
  duration: number;
  /** Video width in pixels */
  width: number;
  /** Video height in pixels */
  height: number;
  /** Container format (e.g. "mp4", "mov", "webm") */
  format: string;
  /** Frames per second */
  fps: number;
  /** Bit rate in bits per second */
  bitrate: number;
  /** Convenience string: "WIDTHxHEIGHT" — e.g. "1920x1080" */
  resolution: string;
}

interface FfprobeStream {
  codec_type?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  duration?: string;
  bit_rate?: string;
}

interface FfprobeFormat {
  format_name?: string;
  duration?: string;
  bit_rate?: string;
}

interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: FfprobeFormat;
}

/**
 * Extract video metadata using ffprobe.
 *
 * Runs: ffprobe -v quiet -print_format json -show_streams -show_format <filePath>
 *
 * @param filePath  Path to the local video file.
 * @returns         Parsed VideoMetadata object.
 * @throws          Error when ffprobe is not installed or the file is invalid.
 */
export async function getVideoMetadata(filePath: string): Promise<VideoMetadata> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v',
    'quiet',
    '-print_format',
    'json',
    '-show_streams',
    '-show_format',
    filePath,
  ]);

  const probe = JSON.parse(stdout) as FfprobeOutput;

  const videoStream = (probe.streams ?? []).find(
    (s) => s.codec_type === 'video',
  );

  const fmt = probe.format ?? {};

  // Duration: prefer stream-level; fall back to format-level
  const durationRaw =
    videoStream?.duration ?? fmt.duration ?? '0';
  const duration = parseFloat(durationRaw) || 0;

  // Resolution
  const width = videoStream?.width ?? 0;
  const height = videoStream?.height ?? 0;
  const resolution = `${width}x${height}`;

  // FPS expressed as a fraction string like "30000/1001" or "25/1"
  const fpsRaw = videoStream?.r_frame_rate ?? '0/1';
  const [num, den] = fpsRaw.split('/').map(Number);
  const fps = den > 0 ? Math.round((num / den) * 100) / 100 : 0;

  // Bitrate in bps (prefer stream; fall back to format)
  const bitrateRaw =
    videoStream?.bit_rate ?? fmt.bit_rate ?? '0';
  const bitrate = parseInt(bitrateRaw, 10) || 0;

  // Container format (may be comma-separated like "mov,mp4,m4a,3gp,3g2,mj2")
  const formatRaw = fmt.format_name ?? '';
  const format = formatRaw.split(',')[0] ?? '';

  return { duration, width, height, resolution, format, fps, bitrate };
  duration: number;
  width: number;
  height: number;
  format: string;
  fps: number;
  bitrate: number;
  resolution: string;
}

export async function getVideoMetadata(filePath: string): Promise<VideoMetadata> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', filePath,
  ]);
import { execFile } from 'child_process';
import { promisify } from 'util';
const execFileAsync = promisify(execFile);
export interface VideoMetadata { duration: number; width: number; height: number; format: string; fps: number; bitrate: number; resolution: string }
export async function getVideoMetadata(filePath: string): Promise<VideoMetadata> {
  const { stdout } = await execFileAsync('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', filePath]);
  const probe = JSON.parse(stdout) as any;
  const vs = (probe.streams ?? []).find((s: any) => s.codec_type === 'video') ?? {};
  const fmt = probe.format ?? {};
  const duration = parseFloat(vs.duration ?? fmt.duration ?? '0') || 0;
  const width = vs.width ?? 0;
  const height = vs.height ?? 0;
  const width = vs.width ?? 0; const height = vs.height ?? 0;
  const [num, den] = (vs.r_frame_rate ?? '0/1').split('/').map(Number);
  const fps = den > 0 ? Math.round((num / den) * 100) / 100 : 0;
  const bitrate = parseInt(vs.bit_rate ?? fmt.bit_rate ?? '0', 10) || 0;
  const format = (fmt.format_name ?? '').split(',')[0] ?? '';
  return { duration, width, height, resolution: `${width}x${height}`, format, fps, bitrate };
}
export interface CutClipOptions { inputPath: string; outputPath: string; startTime: number; endTime: number; videoDuration?: number }
export async function cutClip(options: CutClipOptions): Promise<string> {
  const { inputPath, outputPath, startTime } = options;
  const endTime = options.videoDuration ? Math.min(options.endTime, options.videoDuration) : options.endTime;
  await execFileAsync('ffmpeg', ['-y', '-ss', String(startTime), '-to', String(endTime), '-i', inputPath, '-c', 'copy', outputPath]);
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
  /** Total video duration — used to clamp endTime to a valid range */
  videoDuration?: number;
}

/**
 * Cut a segment from a video file using FFmpeg.
 *
 * Uses stream-copy (-c copy) for fast cutting without re-encoding.
 *
 * @param options  Cut options including source path, destination path,
 *                 start time, and end time.
 * @returns        The output file path.
 */
export async function cutClip(options: CutClipOptions): Promise<string> {
  const { inputPath, outputPath, startTime } = options;

  // Clamp endTime to avoid going beyond the file end
  const endTime = options.videoDuration
    ? Math.min(options.endTime, options.videoDuration)
    : options.endTime;

  await execFileAsync('ffmpeg', [
    '-y',
    '-ss',
    String(startTime),
    '-to',
    String(endTime),
    '-i',
    inputPath,
    '-c',
    'copy',
    outputPath,
  ]);

  videoDuration?: number;
}

export async function cutClip(options: CutClipOptions): Promise<string> {
  const { inputPath, outputPath, startTime } = options;
  const endTime = options.videoDuration
    ? Math.min(options.endTime, options.videoDuration)
    : options.endTime;
  await execFileAsync('ffmpeg', [
    '-y', '-ss', String(startTime), '-to', String(endTime), '-i', inputPath, '-c', 'copy', outputPath,
  ]);
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
