import { generateCaption } from './caption.util';

const EMOJI_RE = /^[\p{Extended_Pictographic}\p{Emoji_Component}\s]+$/u;

const captionEmojis = (caption: string) => caption.trim().split(/\s+/);

describe('caption.util (#1026)', () => {
  describe('generateCaption with a title', () => {
    it('appends emojis to a trimmed title', () => {
      const caption = generateCaption('My Awesome Video', 'clip-1');

      expect(caption.startsWith('My Awesome Video ')).toBe(true);
      expect(captionEmojis(caption)).toHaveLength(5); // 3 title words + 2 emojis
    });

    it('trims surrounding whitespace from the title', () => {
      expect(generateCaption('   Padded   ', 'clip-1')).toBe(
        generateCaption('Padded', 'clip-1'),
      );
    });

    it('ignores a blank title and falls through to the transcript', () => {
      const caption = generateCaption('   ', 'clip-1', 'spoken words');

      expect(caption.startsWith('spoken words')).toBe(true);
    });

    it('prefers the title over the transcript when both are present', () => {
      const caption = generateCaption(
        'Title wins',
        'clip-1',
        'transcript loses',
      );

      expect(caption.startsWith('Title wins')).toBe(true);
      expect(caption).not.toContain('transcript loses');
    });
  });

  describe('generateCaption with a transcript only', () => {
    it('uses the transcript as a teaser when no title is given', () => {
      const caption = generateCaption(undefined, 'clip-2', 'a short teaser');

      expect(caption.startsWith('a short teaser ')).toBe(true);
      expect(captionEmojis(caption)).toHaveLength(5); // 3 words + 2 emojis
    });

    it('truncates a transcript longer than 80 characters and adds an ellipsis', () => {
      const transcript = 'x'.repeat(120);
      const caption = generateCaption(undefined, 'clip-2', transcript);

      expect(caption).toContain(`${'x'.repeat(80)}... `);
      expect(caption).not.toContain('x'.repeat(81));
    });

    it('does not add an ellipsis at exactly 80 characters', () => {
      const transcript = 'y'.repeat(80);
      const caption = generateCaption(undefined, 'clip-2', transcript);

      expect(caption).toContain(`${'y'.repeat(80)} `);
      expect(caption).not.toContain('...');
    });

    it('trims the transcript before measuring its length', () => {
      const caption = generateCaption(
        undefined,
        'clip-2',
        `  ${'z'.repeat(80)}  `,
      );

      expect(caption).toContain(`${'z'.repeat(80)} `);
      expect(caption).not.toContain('...');
    });

    it('falls back to emojis when the transcript is blank', () => {
      const caption = generateCaption(undefined, 'clip-2', '   ');

      expect(captionEmojis(caption)).toHaveLength(2);
    });
  });

  describe('generateCaption with neither title nor transcript', () => {
    it('returns only the emojis', () => {
      const caption = generateCaption(undefined, 'clip-3');

      expect(captionEmojis(caption)).toHaveLength(2);
    });

    it('returns only the emojis for an empty string title', () => {
      const caption = generateCaption('', 'clip-3');

      expect(captionEmojis(caption)).toHaveLength(2);
    });
  });

  describe('emoji selection', () => {
    it('is deterministic for the same clip id', () => {
      expect(generateCaption('Same', 'clip-deterministic')).toBe(
        generateCaption('Same', 'clip-deterministic'),
      );
    });

    it('always emits exactly two distinct emoji slots', () => {
      for (let id = 0; id < 30; id += 1) {
        const caption = generateCaption(undefined, `clip-${id}`);
        const emojis = captionEmojis(caption);

        expect(emojis).toHaveLength(2);
        expect(EMOJI_RE.test(caption)).toBe(true);
      }
    });

    it('varies the emojis across different clip ids', () => {
      const captions = new Set(
        Array.from({ length: 25 }, (_, i) =>
          generateCaption(undefined, `clip-${i}`),
        ),
      );

      expect(captions.size).toBeGreaterThan(1);
    });

    it('never repeats the same emoji twice for any clip id', () => {
      for (let id = 0; id < 40; id += 1) {
        const [first, second] = captionEmojis(
          generateCaption(undefined, `id-${id}`),
        );
        expect(first).not.toBe(second);
      }
    });
  });
});
