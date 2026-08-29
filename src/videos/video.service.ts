import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  ViralMoment,
  validateAndFetchVideo,
  extractVideoMetadata,
  updateVideoProcessingStats,
  detectMomentsWithClaude,
  normalizeMoments,
  fallbackFixedChunks,
  computeAverageClipDuration,
} from './helpers';

/**
 * Orchestrates viral-moment detection for a video.
 * Validation, metadata, AI detection, stats updates, and moment math live in helpers.
 */
@Injectable()
export class VideoService {
  private readonly logger = new Logger(VideoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async detectViralTimestamps(videoId: number): Promise<ViralMoment[]> {
    const startTime = Date.now();
    let durationSec = 0;
    let inputQuality = 'unknown';
    let momentsFound = 0;
    let clipsGenerated = 0;

    try {
      const video = await validateAndFetchVideo(this.prisma, videoId);
      const metadata = await extractVideoMetadata(video, this.logger);
      durationSec = metadata.durationSec;
      inputQuality = metadata.inputQuality;

      const aiResult = await detectMomentsWithClaude(
        this.config,
        video.sourceUrl,
      );
      let moments: ViralMoment[] | null = aiResult.moments;
      let provider = aiResult.provider;
      const error = aiResult.error;
      const usage = aiResult.usage;

      if (!moments) {
        moments = fallbackFixedChunks(durationSec);
        provider = 'fallback-fixed-chunks';
      }

      momentsFound = moments.length;
      const normalized = normalizeMoments(moments, durationSec);
      clipsGenerated = normalized.length;
      const avgDurationSec = computeAverageClipDuration(normalized);
      const timeTakenMs = Date.now() - startTime;

      await updateVideoProcessingStats(this.prisma, videoId, {
        momentsFound,
        inputQuality,
        durationSec,
        clipsGenerated,
        timeTakenMs,
        avgDurationSec,
        error,
        moments: normalized,
      });

      this.logUsage(videoId, provider, usage);

      return normalized;
    } catch (e: any) {
      const timeTakenMs = Date.now() - startTime;
      const errorDetails = String(e?.message ?? e);

      try {
        await updateVideoProcessingStats(this.prisma, videoId, {
          momentsFound,
          inputQuality,
          durationSec,
          clipsGenerated,
          timeTakenMs,
          error: errorDetails,
        });
      } catch (updateError) {
        this.logger.error(
          `Failed to update processingStats on error: ${updateError}`,
        );
      }

      throw e;
    }
  }

  private logUsage(
    videoId: number,
    provider: string,
    usage?: { inputTokens?: number; outputTokens?: number },
  ) {
    const model = this.config.get<string>('ANTHROPIC_MODEL') || 'claude-4.1';

    if (usage?.inputTokens || usage?.outputTokens) {
      this.logger.log(
        `ai_usage videoId=${videoId} provider=${provider} model=${model} input_tokens=${usage?.inputTokens ?? 0} output_tokens=${usage?.outputTokens ?? 0}`,
      );
    } else {
      this.logger.log(
        `ai_usage videoId=${videoId} provider=${provider} model=${model}`,
      );
    }
  }
}
