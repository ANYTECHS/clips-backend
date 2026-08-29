import type { ViralMoment } from './types';

export function safeParseJson(text: string): any {
  if (!text) return null;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const candidate = jsonMatch ? jsonMatch[0] : text;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

/**
 * Parse Claude message content into viral moments, enforcing clip count bounds.
 */
export function parseClaudeResponse(
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

  const parsed = safeParseJson(text);
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

/**
 * Clamp, sort, and remove overlapping viral moments within the video duration.
 */
export function normalizeMoments(
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

/**
 * Deterministic fallback when AI detection is unavailable.
 */
export function fallbackFixedChunks(
  totalDuration: number | null,
): ViralMoment[] {
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

export function computeAverageClipDuration(moments: ViralMoment[]): number {
  if (moments.length === 0) return 0;
  return (
    Math.round(
      (moments.reduce((acc, m) => acc + (m.end - m.start), 0) /
        moments.length) *
        100,
    ) / 100
  );
}
