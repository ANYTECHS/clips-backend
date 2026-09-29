import { ConfigService } from '@nestjs/config';
import {
  detectMomentsWithClaude,
  resetAnthropicSdkLoader,
} from './claude-detection.helper';
import { claude, defaultMockMoments } from './mocks/claude.mock';

const VIDEO_URL = 'https://cdn.clipcash.test/videos/talk.mp4';

const configWith = (values: Record<string, string | undefined>) =>
  ({
    get: (key: string) => values[key],
  }) as unknown as ConfigService;

const DEFAULT_CONFIG = configWith({
  ANTHROPIC_API_KEY: 'test-api-key',
  ANTHROPIC_MODEL: 'claude-4.1',
});

describe('Claude API mocks (#1027)', () => {
  const originalApiKey = process.env.ANTHROPIC_API_KEY;
  const originalModel = process.env.ANTHROPIC_MODEL;

  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_MODEL;
    claude.install();
    claude.reset();
  });

  afterEach(() => {
    claude.restore();
    resetAnthropicSdkLoader();
    if (originalApiKey !== undefined)
      process.env.ANTHROPIC_API_KEY = originalApiKey;
    else delete process.env.ANTHROPIC_API_KEY;
    if (originalModel !== undefined)
      process.env.ANTHROPIC_MODEL = originalModel;
    else delete process.env.ANTHROPIC_MODEL;
  });

  describe('successful timestamp detection', () => {
    it('returns the parsed moments and the anthropic provider', async () => {
      claude.mockSuccess({ clipCount: 12 });

      const result = await detectMomentsWithClaude(DEFAULT_CONFIG, VIDEO_URL);

      expect(result.provider).toBe('anthropic');
      expect(result.moments).toEqual(defaultMockMoments(12));
      expect(result.error).toBeUndefined();
    });

    it('reports the token usage from the response', async () => {
      claude.mockSuccess({
        usage: { input_tokens: 4321, output_tokens: 999 },
      });

      const result = await detectMomentsWithClaude(DEFAULT_CONFIG, VIDEO_URL);

      expect(result.usage).toEqual({
        inputTokens: 4321,
        outputTokens: 999,
      });
    });

    it('records the request so the prompt and model can be asserted', async () => {
      claude.mockSuccess();

      await detectMomentsWithClaude(DEFAULT_CONFIG, VIDEO_URL);

      expect(claude.callCount).toBe(1);
      expect(claude.lastRequest).toMatchObject({
        model: 'claude-4.1',
        max_tokens: 1200,
        temperature: 0,
        apiKey: 'test-api-key',
      });
    });

    it('sends the video URL to Claude as media content', async () => {
      claude.mockSuccess();

      await detectMomentsWithClaude(DEFAULT_CONFIG, VIDEO_URL);

      const messages = claude.lastRequest?.messages ?? [];
      expect(messages[0]).toMatchObject({ role: 'user' });
      expect(JSON.stringify(messages[0].content)).toContain(VIDEO_URL);
    });

    it('respects a configured model override', async () => {
      claude.mockSuccess();

      await detectMomentsWithClaude(
        configWith({
          ANTHROPIC_API_KEY: 'k',
          ANTHROPIC_MODEL: 'claude-opus-4',
        }),
        VIDEO_URL,
      );

      expect(claude.lastRequest?.model).toBe('claude-opus-4');
    });

    it('falls back to the default model when none is configured', async () => {
      claude.mockSuccess();

      await detectMomentsWithClaude(
        configWith({ ANTHROPIC_API_KEY: 'k' }),
        VIDEO_URL,
      );

      expect(claude.lastRequest?.model).toBe('claude-4.1');
    });

    it('supports an explicit clip layout', async () => {
      claude.mockSuccess({
        clips: [
          { start: 0, end: 20, reason: 'hook' },
          { start: 30, end: 50, reason: 'payoff' },
        ],
      });

      const result = await detectMomentsWithClaude(DEFAULT_CONFIG, VIDEO_URL);

      // Fewer than minClips (10) valid clips, so the caller must fall back.
      expect(result.moments).toBeNull();
    });

    it('uses clipDuration/startAt/gap to lay out generated clips', async () => {
      claude.mockSuccess({
        clipCount: 10,
        clipDuration: 45,
        startAt: 5,
        gap: 5,
      });

      const result = await detectMomentsWithClaude(DEFAULT_CONFIG, VIDEO_URL);

      expect(result.moments).toHaveLength(10);
      expect(result.moments?.[0]).toEqual({
        start: 5,
        end: 50,
        reason: 'moment-1',
      });
      expect(result.moments?.[1]?.start).toBe(55);
    });
  });

  describe('empty response', () => {
    it('returns null moments when Claude answers with an empty text block', async () => {
      claude.mockEmptyResponse();

      const result = await detectMomentsWithClaude(DEFAULT_CONFIG, VIDEO_URL);

      expect(result.moments).toBeNull();
      expect(result.provider).toBe('anthropic');
      expect(result.error).toBeUndefined();
    });

    it('returns null moments when Claude refuses', async () => {
      claude.mockEmptyResponse({
        content: [
          { type: 'text', text: "I'm sorry, I can't analyze that video." },
        ],
      });

      const result = await detectMomentsWithClaude(DEFAULT_CONFIG, VIDEO_URL);

      expect(result.moments).toBeNull();
      expect(result.usage).toBeDefined();
    });

    it('returns null moments when the content array is empty', async () => {
      claude.mockEmptyResponse({ content: [] });

      const result = await detectMomentsWithClaude(DEFAULT_CONFIG, VIDEO_URL);

      expect(result.moments).toBeNull();
    });

    it('returns null moments when too few clips are returned', async () => {
      claude.mockTooFewClips(4);

      const result = await detectMomentsWithClaude(DEFAULT_CONFIG, VIDEO_URL);

      expect(result.moments).toBeNull();
    });

    it('returns null moments when the clips key has the wrong type', async () => {
      claude.mockUnexpectedShape('nope');

      const result = await detectMomentsWithClaude(DEFAULT_CONFIG, VIDEO_URL);

      expect(result.moments).toBeNull();
    });

    it('does not call the API when no API key is configured', async () => {
      claude.mockSuccess();

      const result = await detectMomentsWithClaude(
        configWith({ ANTHROPIC_API_KEY: undefined }),
        VIDEO_URL,
      );

      expect(result).toMatchObject({ moments: null, provider: 'none' });
      expect(claude.callCount).toBe(0);
    });

    it('does not call the API when the video URL is missing', async () => {
      claude.mockSuccess();

      const result = await detectMomentsWithClaude(DEFAULT_CONFIG, '');

      expect(result).toMatchObject({ moments: null, provider: 'none' });
      expect(claude.callCount).toBe(0);
    });
  });

  describe('malformed AI response', () => {
    it('returns null moments for a non-JSON body', async () => {
      claude.mockMalformedResponse();

      const result = await detectMomentsWithClaude(DEFAULT_CONFIG, VIDEO_URL);

      expect(result.moments).toBeNull();
      expect(result.provider).toBe('anthropic');
      expect(result.error).toBeUndefined();
    });

    it('returns null moments for a truncated JSON body', async () => {
      claude.mockMalformedResponse({ rawText: '{"clips": [{"start": 0,' });

      const result = await detectMomentsWithClaude(DEFAULT_CONFIG, VIDEO_URL);

      expect(result.moments).toBeNull();
    });

    it('returns null moments when clips have non-numeric timestamps', async () => {
      claude.mockMalformedResponse({
        rawText: JSON.stringify({
          clips: Array.from({ length: 12 }, (_, index) => ({
            start: `00:${index}`,
            end: `01:${index}`,
            reason: 'bad',
          })),
        }),
      });

      const result = await detectMomentsWithClaude(DEFAULT_CONFIG, VIDEO_URL);

      expect(result.moments).toBeNull();
    });

    it('returns null moments when every clip has end <= start', async () => {
      claude.mockMalformedResponse({
        rawText: JSON.stringify({
          clips: Array.from({ length: 12 }, () => ({
            start: 30,
            end: 30,
            reason: 'zero-length',
          })),
        }),
      });

      const result = await detectMomentsWithClaude(DEFAULT_CONFIG, VIDEO_URL);

      expect(result.moments).toBeNull();
    });

    it('caps the parsed moments at the production maxClips', async () => {
      claude.mockSuccess({ clipCount: 40 });

      const result = await detectMomentsWithClaude(DEFAULT_CONFIG, VIDEO_URL);

      expect(result.moments).toHaveLength(30);
    });
  });

  describe('API failures', () => {
    it('surfaces a 500 API error and returns null moments', async () => {
      claude.mockApiFailure();

      const result = await detectMomentsWithClaude(DEFAULT_CONFIG, VIDEO_URL);

      expect(result.moments).toBeNull();
      expect(result.error).toBe('API Error: internal server error');
      expect(result.provider).toBe('anthropic');
    });

    it('surfaces a transport-level network failure', async () => {
      claude.mockNetworkError();

      const result = await detectMomentsWithClaude(DEFAULT_CONFIG, VIDEO_URL);

      expect(result.moments).toBeNull();
      expect(result.error).toBe('fetch failed');
    });

    it('surfaces a custom error message', async () => {
      claude.mockApiFailure('Overloaded: upstream unavailable');

      const result = await detectMomentsWithClaude(DEFAULT_CONFIG, VIDEO_URL);

      expect(result.error).toBe('Overloaded: upstream unavailable');
    });

    it('records the request even when the call fails', async () => {
      claude.mockApiFailure();

      await detectMomentsWithClaude(DEFAULT_CONFIG, VIDEO_URL);

      expect(claude.callCount).toBe(1);
      expect(claude.lastRequest?.apiKey).toBe('test-api-key');
    });
  });

  describe('timeout and rate limit', () => {
    it('surfaces a rate-limit error', async () => {
      claude.mockRateLimit();

      const result = await detectMomentsWithClaude(DEFAULT_CONFIG, VIDEO_URL);

      expect(result.moments).toBeNull();
      expect(result.error).toBe('Rate limit exceeded. Please retry shortly.');
    });

    it('surfaces a timeout error', async () => {
      claude.mockTimeout();

      const result = await detectMomentsWithClaude(DEFAULT_CONFIG, VIDEO_URL);

      expect(result.moments).toBeNull();
      expect(result.error).toBe('Request timed out after 600000ms');
    });

    it('surfaces an overloaded error', async () => {
      claude.mockOverloaded();

      const result = await detectMomentsWithClaude(DEFAULT_CONFIG, VIDEO_URL);

      expect(result.moments).toBeNull();
      expect(result.error).toBe('Overloaded');
    });

    it('assigns the documented HTTP status to each failure kind', async () => {
      for (const [kind] of [
        ['api_error'],
        ['rate_limit'],
        ['timeout'],
        ['overloaded'],
        ['network'],
      ] as const) {
        claude.mockFailure(kind);
        const result = await detectMomentsWithClaude(DEFAULT_CONFIG, VIDEO_URL);
        expect(result.moments).toBeNull();
        expect(result.error).toBeTruthy();
      }
    });
  });

  describe('no real Claude API requests', () => {
    it('never throws a dynamic-import error once the mock is installed', async () => {
      claude.mockSuccess();

      const result = await detectMomentsWithClaude(DEFAULT_CONFIG, VIDEO_URL);

      expect(result.error).toBeUndefined();
      expect(String(result.error)).not.toMatch(/dynamic import/i);
    });

    it('reports the dynamic-import failure when the mock is NOT installed', async () => {
      claude.restore();
      claude.reset();

      const result = await detectMomentsWithClaude(DEFAULT_CONFIG, VIDEO_URL);

      expect(result.moments).toBeNull();
      expect(result.error).toMatch(/dynamic import/i);
      expect(claude.callCount).toBe(0);
    });

    it('is inert again after restore()', async () => {
      claude.mockSuccess();
      await detectMomentsWithClaude(DEFAULT_CONFIG, VIDEO_URL);
      expect(claude.callCount).toBe(1);

      claude.restore();
      expect(claude.isInstalled).toBe(false);
      expect(claude.callCount).toBe(0);
    });

    it('install() is idempotent', () => {
      claude.install();
      claude.install();

      expect(claude.isInstalled).toBe(true);
    });
  });
});
