/**
 * Heuristic Virality Score  (0–100)
 * ===================================
 * Three weighted components — replace this entire function with an AI model call
 * once real scoring is integrated.
 *
 * 1. Duration Score  (max 40 pts)
 *    Social platforms favour 15–60 s clips.
 *    15–60 s          → 40 pts
 *    10–14 s / 61–90s → 25 pts
 *    < 10 s / > 90 s  → 10 pts
 *
 * 2. Position Score  (max 35 pts)
 *    Mid-video content (30–70 % through) is typically the most engaging.
 *    positionRatio 0.30–0.70 → 35 pts
 *    positionRatio 0.15–0.85 → 20 pts
 *    positionRatio outside   → 10 pts
 *
 * 3. Keyword Density Score  (max 25 pts)
 *    Counts high-engagement trigger words found in the transcript.
 *    ≥ 5 matches → 25 pts
 *    3–4 matches → 18 pts
 *    1–2 matches → 10 pts
 *    0 matches   →  0 pts
 *
 * Total is clamped to [0, 100].
 *
 * Example: 30 s clip at 50 % position with 5 keywords → 40 + 35 + 25 = 100
 */

const VIRAL_KEYWORDS = [
  'amazing',
  'incredible',
  'shocking',
  'unbelievable',
  'secret',
  'hack',
  'trick',
  'tip',
  'mistake',
  'never',
  'always',
  'best',
  'worst',
  'first',
  'last',
  'exclusive',
  'breaking',
  'urgent',
  'must',
  'need',
  'free',
  'win',
  'lose',
  'fail',
  'success',
];

export interface ViralityInput {
  durationSeconds: number;
  positionRatio: number;
  transcript?: string;
}

/** Returns an integer score in [0, 100]. */
export function calculateViralityScore(input: ViralityInput): number {
  const total =
    getDurationScore(input.durationSeconds) +
    getPositionScore(input.positionRatio) +
    getKeywordScore(input.transcript);

  return Math.min(100, Math.max(0, total));
}

function getDurationScore(seconds: number): number {
  if (seconds >= 15 && seconds <= 60) return 40;
  if (seconds >= 10 && seconds <= 90) return 25;
  return 10;
}

function getPositionScore(ratio: number): number {
  if (ratio >= 0.3 && ratio <= 0.7) return 35;
  if (ratio >= 0.15 && ratio <= 0.85) return 20;
  return 10;
}

function getKeywordScore(transcript?: string): number {
  if (!transcript) return 0;
  const lower = transcript.toLowerCase();
  const hits = VIRAL_KEYWORDS.filter((kw) => lower.includes(kw)).length;
  if (hits >= 5) return 25;
  if (hits >= 3) return 18;
  if (hits >= 1) return 10;
  return 0;
}
