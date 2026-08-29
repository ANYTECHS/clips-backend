import { ConfigService } from '@nestjs/config';
import type { ClaudeDetectionResult, ViralMoment } from './types';
import { parseClaudeResponse } from './viral-moments.helper';

/**
 * Call Anthropic Claude to detect high-engagement clip moments.
 * Returns null moments (caller should fall back) when the API key or URL is missing.
 */
export async function detectMomentsWithClaude(
  config: ConfigService,
  videoUrl: string,
): Promise<ClaudeDetectionResult> {
  const apiKey =
    config.get<string>('ANTHROPIC_API_KEY') || process.env.ANTHROPIC_API_KEY;
  const model = config.get<string>('ANTHROPIC_MODEL') || 'claude-4.1';
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

    moments = parseClaudeResponse(result, maxClips, minClips);

    usage = {
      inputTokens: Number(result?.usage?.input_tokens) || undefined,
      outputTokens: Number(result?.usage?.output_tokens) || undefined,
    };
  } catch (e: any) {
    error = String(e?.message ?? e);
  }

  return { moments, provider: 'anthropic', usage, error };
}
