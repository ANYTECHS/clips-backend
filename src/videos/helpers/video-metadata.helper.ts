import { Logger } from '@nestjs/common';
import ffmpeg from 'fluent-ffmpeg';
import type { VideoMetadataResult } from './types';

/**
 * Extract duration and quality from a video source via ffprobe.
 * Falls back to the stored duration when probing fails.
 */
export async function extractVideoMetadata(
  video: { sourceUrl: string; duration?: number | null },
  logger: Logger,
): Promise<VideoMetadataResult> {
  let durationSec = 0;
  let inputQuality = 'unknown';

  try {
    const metadata: any = await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(video.sourceUrl, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    durationSec = metadata.format?.duration
      ? Math.round(metadata.format.duration)
      : video.duration || 0;

    const videoStream = metadata.streams?.find(
      (s: any) => s.codec_type === 'video',
    );
    inputQuality = videoStream?.height
      ? `${videoStream.height}p`
      : 'unknown';
  } catch (err: any) {
    logger.warn(`ffprobe metadata extraction failed: ${err.message}`);
    durationSec = video.duration || 0;
  }

  return { durationSec, inputQuality };
}
