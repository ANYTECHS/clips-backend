import { extractYouTubeVideoId } from './is-youtube-url.validator';

describe('extractYouTubeVideoId', () => {
  const ID = 'dQw4w9WgXcQ';
  it.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}&t=42s`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://music.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=abc`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube.com/live/${ID}`,
    `https://www.youtube-nocookie.com/embed/${ID}`,
  ])('accepts %s', (url) => expect(extractYouTubeVideoId(url)).toBe(ID));

  it.each([
    'not a url',
    `https://evil.com/watch?v=${ID}`,
    `https://youtube.com.evil.com/watch?v=${ID}`,
    `ftp://youtube.com/watch?v=${ID}`,
    'https://www.youtube.com/watch?v=short',
    'https://www.youtube.com/watch',
    'https://www.youtube.com/channel/UC123',
    `https://user:pass@youtube.com/watch?v=${ID}`,
    '',
    null,
  ])('rejects %s', (url) => expect(extractYouTubeVideoId(url)).toBeNull());
});
