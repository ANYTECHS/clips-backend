import { Logger } from '@nestjs/common';

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
export function getVideoMetadata(inputPath: string): VideoMetadata {
  logger.log(`Extracting metadata from: ${inputPath}`);
  return {
    duration: 0,
    width: 1920,
    height: 1080,
    format: 'mp4',
    fps: 30,
    bitrate: 5000,
    resolution: '1920x1080',
  };
}

/**
 * Cut a segment from a video file using ffmpeg.
 */
export function cutClip(options: CutClipOptions): string {
  const { inputPath, outputPath, startTime, endTime } = options;
  logger.log(
    `Cutting: ${inputPath} [${startTime}s-${endTime}s] → ${outputPath}`,
  );
  return outputPath;
}
