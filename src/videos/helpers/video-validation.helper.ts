import { PrismaService } from '../../prisma/prisma.service';

/**
 * Fetch a video by ID or throw if it does not exist.
 */
export async function validateAndFetchVideo(
  prisma: PrismaService,
  videoId: number,
) {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
  });
  if (!video) throw new Error(`Video ${videoId} not found`);
  return video;
}
