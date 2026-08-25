/**
 * FFmpeg/FFprobe utility functions for video processing.
 *
 * Issue #745: Extracts duration, resolution, format, fps, and bitrate from
 * uploaded videos via ffprobe before queueing clip generation. The extracted
 * data is stored in processingStats.originalDuration and resolution fields.
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

  return outputPath;
}
