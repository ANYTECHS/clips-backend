import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * Issue #1359 — YouTube URL validation & video ID extraction.
 *
 * Supported formats:
 *  - https://www.youtube.com/watch?v=VIDEO_ID
 *  - https://m.youtube.com/watch?v=VIDEO_ID
 *  - https://music.youtube.com/watch?v=VIDEO_ID
 *  - https://youtu.be/VIDEO_ID
 *  - https://www.youtube.com/shorts/VIDEO_ID
 *  - https://www.youtube.com/embed/VIDEO_ID
 *  - https://www.youtube.com/live/VIDEO_ID
 *  - https://www.youtube-nocookie.com/embed/VIDEO_ID
 */
export const YOUTUBE_URL_FORMATS = [
  'https://www.youtube.com/watch?v=VIDEO_ID',
  'https://youtu.be/VIDEO_ID',
  'https://www.youtube.com/shorts/VIDEO_ID',
  'https://www.youtube.com/embed/VIDEO_ID',
  'https://www.youtube.com/live/VIDEO_ID',
];

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const YT_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);
const PATH_PREFIXES = ['shorts', 'embed', 'live', 'v'];

/** Returns the 11-char video ID, or null if the URL is not a supported YouTube URL. */
export function extractYouTubeVideoId(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 2048) return null;
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password || url.port) return null;

  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split('/').filter(Boolean);
  let id: string | null = null;

  if (host === 'youtu.be' || host === 'www.youtu.be') {
    id = segments.length === 1 ? segments[0] : null;
  } else if (YT_HOSTS.has(host)) {
    if (segments.length === 1 && segments[0] === 'watch') {
      id = url.searchParams.get('v');
    } else if (segments.length === 2 && PATH_PREFIXES.includes(segments[0])) {
      id = segments[1];
    }
  }
  return id && VIDEO_ID_RE.test(id) ? id : null;
}

export function IsYouTubeUrl(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isYouTubeUrl',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be a valid YouTube video URL (${YOUTUBE_URL_FORMATS.join(', ')})`,
        ...validationOptions,
      },
      validator: {
        validate: (value: unknown) => extractYouTubeVideoId(value) !== null,
      },
    });
  };
}
