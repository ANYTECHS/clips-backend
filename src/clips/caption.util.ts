/**
 * Emojis appended to auto-generated captions.
 * Rotated based on a simple hash of the clip ID so each clip gets a
 * consistent but varied set of emojis.
 */
const CAPTION_EMOJIS = [
  '🔥',
  '🎬',
  '✨',
  '💥',
  '🚀',
  '🎯',
  '💡',
  '🎉',
  '👀',
  '⚡',
];

/**
 * Pick two emojis deterministically from the clip ID (or fall back to random).
 */
function pickEmojis(seed: string): string {
  const hash = seed.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const first = CAPTION_EMOJIS[hash % CAPTION_EMOJIS.length];
  const second = CAPTION_EMOJIS[(hash + 3) % CAPTION_EMOJIS.length];
  return `${first} ${second}`;
}

/**
 * Generate a caption placeholder from a title (or transcript fallback).
 *
 * Examples:
 *   generateCaption('My Awesome Video', 'clip-1') → 'My Awesome Video 🔥 🎯'
 *   generateCaption(undefined, 'clip-2', 'some transcript text') → 'some transcript text... ✨ 💡'
 */
export function generateCaption(
  title: string | undefined,
  clipId: string,
  transcript?: string,
): string {
  const emojis = pickEmojis(clipId);

  if (title?.trim()) {
    return `${title.trim()} ${emojis}`;
  }

  if (transcript?.trim()) {
    // Use first 80 chars of transcript as a teaser
    const teaser = transcript.trim().slice(0, 80);
    const suffix = transcript.trim().length > 80 ? '...' : '';
    return `${teaser}${suffix} ${emojis}`;
  }

  return emojis;
}
