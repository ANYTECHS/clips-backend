import { PrismaService } from '../../prisma/prisma.service';
import type { VideoProcessingStatsInput } from './types';

/**
 * Persist viral-detection processing stats onto the Video record.
 */
export async function updateVideoProcessingStats(
  prisma: PrismaService,
  videoId: number,
  stats: VideoProcessingStatsInput,
): Promise<void> {
  await prisma.video.update({
    where: { id: videoId },
    data: {
      processingStats: {
        momentsFound: stats.momentsFound,
        inputQuality: stats.inputQuality,
        durationSec: stats.durationSec,
        clipsGenerated: stats.clipsGenerated,
        timeTakenMs: stats.timeTakenMs,
        ...(stats.avgDurationSec !== undefined
          ? { avgDurationSec: stats.avgDurationSec }
          : {}),
        ...(stats.error ? { errorDetails: stats.error } : {}),
        ...(stats.moments ? { moments: stats.moments } : {}),
      },
    },
  });
}
