import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import ffmpeg from 'fluent-ffmpeg';

type ViralMoment = { start: number; end: number; reason: string };

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
      const video = await this.validateAndFetchVideo(videoId);
      const metadata = await this.extractMetadata(video);
      durationSec = metadata.durationSec;
      inputQuality = metadata.inputQuality;

      const aiResult = await this.callClaudeApi(video.sourceUrl);
      let moments: ViralMoment[] | null = aiResult.moments;
      let provider = aiResult.provider;
      let error = aiResult.error;
      let usage = aiResult.usage;

      if (!moments) {
        moments = this.fallbackFixedChunks(durationSec);
        provider = 'fallback-fixed-chunks';
      }

      momentsFound = moments.length;
      const normalized = this.normalizeMoments(moments, durationSec);
      clipsGenerated = normalized.length;

      const timeTakenMs = Date.now() - startTime;

      await this.updateProcessingStats(videoId, {
        momentsFound,
        inputQuality,
        durationSec,
        clipsGenerated,
        timeTakenMs,
        error,
        moments: normalized,
      });

      this.logUsage(videoId, provider, usage);

      return normalized;
    } catch (e: any) {
      const timeTakenMs = Date.now() - startTime;
      const errorDetails = String(e?.message ?? e);

      try {
        await this.updateProcessingStats(videoId, {
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

  private async validateAndFetchVideo(videoId: number) {
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
    });
    if (!video) throw new Error(`Video ${videoId} not found`);
    return video;
  }

  private async extractMetadata(video: any) {
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
      this.logger.warn(`ffprobe metadata extraction failed: ${err.message}`);
      durationSec = video.duration || 0;
    }

    return { durationSec, inputQuality };
  }

  private async callClaudeApi(videoUrl: string) {
    const apiKey =
      this.config.get<string>('ANTHROPIC_API_KEY') ||
      process.env.ANTHROPIC_API_KEY;
    const model = this.config.get<string>('ANTHROPIC_MODEL') || 'claude-4.1';
    const maxClips = 30;
    const minClips = 10;

    let moments: ViralMoment[] | null = null;
    let usage: { inputTokens?: number; outputTokens?: number } | undefined;
    let error: string | undefined;

    if (!apiKey || !videoUrl) {
      return { moments: null, provider: 'none', usage, error };
    }

    try {
      const moduleName: string = '@anthropic-ai/sdk';
      const mod: any = await (
        Function('m', 'return import(m)') as (m: string) => Promise<any>
      )(moduleName);
      const Anthropic: any = mod.default ?? mod;
      const client = new Anthropic({ apiKey });

      const prompt =
        'Analyze the video and return 10–30 high-engagement short-form moments. ' +
        'Output strict JSON only with key "clips": an array of objects with "start" (seconds), "end" (seconds), and "reason" (string). ' +
        'Clips should be 15–60 seconds where possible and non-overlapping. ' +
        'Use precise timestamps with seconds resolution. No markdown or extra text.';

      const content = [
        { type: 'text', text: prompt },
        { type: 'media', source: { type: 'video', url: videoUrl } },
      ];

      const result: any = await client.messages.create({
        model,
        max_tokens: 1200,
        temperature: 0,
        messages: [{ role: 'user', content }],
      });

      moments = this.parseClaudeResponse(result, maxClips, minClips);

      usage = {
        inputTokens: Number(result?.usage?.input_tokens) || undefined,
        outputTokens: Number(result?.usage?.output_tokens) || undefined,
      };
    } catch (e: any) {
      error = String(e?.message ?? e);
    }

    return { moments, provider: 'anthropic', usage, error };
  }

  private parseClaudeResponse(
    result: any,
    maxClips: number,
    minClips: number,
  ): ViralMoment[] | null {
    let text = '';
    if (Array.isArray(result?.content)) {
      text = result.content
        .map((c: any) => (typeof c?.text === 'string' ? c.text : ''))
        .filter(Boolean)
        .join('\n');
    } else if (typeof result?.output_text === 'string') {
      text = result.output_text;
    }

    const parsed = this.safeParseJson(text);
    const clips: any[] = Array.isArray(parsed?.clips) ? parsed.clips : [];

    const moments = clips
      .map((c) => ({
        start: Number(c?.start),
        end: Number(c?.end),
        reason: String(c?.reason ?? ''),
      }))
      .filter(
        (m) =>
          Number.isFinite(m.start) &&
          Number.isFinite(m.end) &&
          m.end > m.start,
      )
      .slice(0, maxClips);

    return moments.length >= minClips ? moments : null;
  }

  private async updateProcessingStats(
    videoId: number,
    stats: {
      momentsFound: number;
      inputQuality: string;
      durationSec: number;
      clipsGenerated: number;
      timeTakenMs: number;
      error?: string;
      moments?: any[]; // optional array of viral moments
    },
  ) {
    await this.prisma.video.update({
      where: { id: videoId },
      data: {
        processingStats: {
          momentsFound: stats.momentsFound,
          inputQuality: stats.inputQuality,
          durationSec: stats.durationSec,
          clipsGenerated: stats.clipsGenerated,
          timeTakenMs: stats.timeTakenMs,
          ...(stats.error ? { errorDetails: stats.error } : {}),
          ...(stats.moments ? { moments: stats.moments } : {}),
        },
      },
    });
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

  private safeParseJson(text: string): any {
    if (!text) return null;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const candidate = jsonMatch ? jsonMatch[0] : text;
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  }

  private normalizeMoments(
    m: ViralMoment[],
    totalDuration: number | null,
  ): ViralMoment[] {
    const max =
      typeof totalDuration === 'number' && Number.isFinite(totalDuration)
        ? totalDuration
        : null;
    const cleaned = m
      .map((x) => {
        const start = Math.max(0, x.start);
        const end = max != null ? Math.min(x.end, max) : x.end;
        return { start, end, reason: x.reason?.toString() || '' };
      })
      .filter((x) => x.end > x.start);
    cleaned.sort((a, b) => a.start - b.start);
    const nonOverlap: ViralMoment[] = [];
    let lastEnd = -Infinity;
    for (const x of cleaned) {
      const s = Math.max(x.start, lastEnd);
      if (x.end > s) {
        nonOverlap.push({ start: s, end: x.end, reason: x.reason });
        lastEnd = x.end;
      }
    }
    return nonOverlap;
  }

  private fallbackFixedChunks(totalDuration: number | null): ViralMoment[] {
    const chunk = 30;
    const maxClips = 30;
    const limit =
      typeof totalDuration === 'number' && Number.isFinite(totalDuration)
        ? totalDuration
        : chunk * maxClips;
    const out: ViralMoment[] = [];
    let t = 0;
    while (t < limit && out.length < maxClips) {
      const start = t;
      const end = Math.min(t + chunk, limit);
      if (end > start) out.push({ start, end, reason: 'fallback-fixed-chunk' });
      t = end;
    }
    return out;
  }
}
