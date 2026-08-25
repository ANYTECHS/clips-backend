import * as ffmpegLib from 'fluent-ffmpeg';

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  format: string;
  fps: number;
  bitrate: number;
  /** Convenience string e.g. "1920x1080" */
  resolution: string;
}

export interface CutClipOptions {
  inputPath: string;
  outputPath: string;
  startTime: number;
  endTime: number;
  /** Full duration of the source video (used for clamping) */
  videoDuration?: number;
}

/**
 * Extract metadata from a video file using FFprobe.
 */
export function getVideoMetadata(filePath: string): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    ffmpegLib.ffprobe(filePath, (err, data) => {
      if (err) {
        return reject(new Error(`FFprobe error: ${err.message}`));
      }

      const videoStream = data.streams.find((s) => s.codec_type === 'video');
      if (!videoStream) {
        return reject(new Error('No video stream found'));
      }

      const duration = parseFloat(String(data.format.duration ?? 0));
      const width = videoStream.width ?? 0;
      const height = videoStream.height ?? 0;
      const format = data.format.format_name ?? 'unknown';
      const bitrate = parseInt(String(data.format.bit_rate ?? '0'), 10);

      let fps = 0;
      if (videoStream.r_frame_rate) {
        const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
        fps = den ? Math.round(num / den) : num;
      }

      resolve({
        duration,
        width,
        height,
        format,
        fps,
        bitrate,
        resolution: `${width}x${height}`,
      });
    });
  });
}

/**
 * Cut a segment from a video file using FFmpeg.
 * Returns the output path on success.
 */
export function cutClip(options: CutClipOptions): Promise<string> {
  const { inputPath, outputPath, videoDuration } = options;

  // Clamp times to valid range
  const start = Math.max(0, options.startTime);
  const maxEnd = videoDuration ?? Infinity;
  const end = Math.min(options.endTime, maxEnd);

  if (start >= end) {
    return Promise.reject(
      new Error(
        `Invalid time range: startTime (${start}) must be less than endTime (${end})`,
      ),
    );
  }

  const duration = end - start;

  return new Promise((resolve, reject) => {
    ffmpegLib(inputPath)
      .setStartTime(start)
      .setDuration(duration)
      .output(outputPath)
      .videoCodec('copy')
      .audioCodec('copy')
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(new Error(`FFmpeg error: ${err.message}`)))
      .run();
  });
}
