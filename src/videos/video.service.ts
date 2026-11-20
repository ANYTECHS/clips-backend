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

      const { moments, provider, usage } = await this.runAiDetection(video.sourceUrl, durationSec);
      momentsFound = moments.length;

      const normalized = normalizeMoments(moments, durationSec);
      clipsGenerated = normalized.length;

      await this.saveSuccessStats(videoId, {
        startTime,
        durationSec,
        inputQuality,
        momentsFound,
        clipsGenerated,
        moments: normalized,
        provider,
        usage,
      });

      return normalized;
    } catch (e: any) {
      await this.saveErrorStats(videoId, {
        startTime,
        durationSec,
        inputQuality,
        momentsFound,
        clipsGenerated,
        error: String(e?.message ?? e),
      });
      throw e;
    }
  }

  private async runAiDetection(sourceUrl: string, durationSec: number) {
    const aiResult = await detectMomentsWithClaude(this.config, sourceUrl);
    let moments: ViralMoment[] = aiResult.moments;
    let provider = aiResult.provider;

    if (!moments) {
      moments = fallbackFixedChunks(durationSec);
      provider = 'fallback-fixed-chunks';
    }

    return { moments, provider, usage: aiResult.usage, error: aiResult.error };
  }

  private async saveSuccessStats(
    videoId: number,
    stats: {
      startTime: number;
      durationSec: number;
      inputQuality: string;
      momentsFound: number;
      clipsGenerated: number;
      moments: ViralMoment[];
      provider: string;
      usage?: { inputTokens?: number; outputTokens?: number };
    },
  ) {
    const timeTakenMs = Date.now() - stats.startTime;
    const avgDurationSec = computeAverageClipDuration(stats.moments);

    await updateVideoProcessingStats(this.prisma, videoId, {
      momentsFound: stats.momentsFound,
      inputQuality: stats.inputQuality,
      durationSec: stats.durationSec,
      clipsGenerated: stats.clipsGenerated,
      timeTakenMs,
      avgDurationSec,
      moments: stats.moments,
    });

    this.logUsage(videoId, stats.provider, stats.usage);
  }

  private async saveErrorStats(
    videoId: number,
    stats: {
      startTime: number;
      durationSec: number;
      inputQuality: string;
      momentsFound: number;
      clipsGenerated: number;
      error: string;
    },
  ) {
    const timeTakenMs = Date.now() - stats.startTime;

    try {
      await updateVideoProcessingStats(this.prisma, videoId, {
        momentsFound: stats.momentsFound,
        inputQuality: stats.inputQuality,
        durationSec: stats.durationSec,
        clipsGenerated: stats.clipsGenerated,
        timeTakenMs,
        error: stats.error,
      });
    } catch (updateError) {
      this.logger.error(
        `Failed to update processingStats on error: ${updateError}`,
      );
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
