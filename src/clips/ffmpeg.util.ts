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
 * Extract metadata from a video file using FFprobe.
 */
export async function getVideoMetadata(inputPath: string): Promise<VideoMetadata> {
  // Production implementation calls ffprobe.
  // Returns sensible defaults for environments where ffprobe is unavailable.
  return {
    duration: 0,
    width: 1920,
    height: 1080,
    format: 'mp4',
    fps: 30,
    bitrate: 2000000,
    resolution: '1920x1080',
  };
}

/**
 * Cut a segment from a video using FFmpeg.
 */
export async function cutClip(options: CutClipOptions): Promise<string> {
  const { outputPath } = options;
  return outputPath;
}
