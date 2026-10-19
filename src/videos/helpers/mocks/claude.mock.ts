/**
 * Reusable Claude (Anthropic) API mocks for AI tests (#1027).
 *
 * `detectMomentsWithClaude()` loads the SDK through an indirect dynamic import
 * (`Function('m', 'return import(m)')`) so that `@anthropic-ai/sdk` stays an
 * optional runtime dependency and Jest's CommonJS transform never has to
 * resolve it. The side effect is that the import always throws inside a test
 * run — the SDK cannot be loaded without `--experimental-vm-modules` — so
 * every AI test silently exercised the "API unavailable" fallback instead of
 * the success path.
 *
 * This mock closes that gap: it plugs a fake SDK into the loader seam exposed
 * by `setAnthropicSdkLoader`, so the production success, empty, malformed,
 * API-failure, rate-limit and timeout paths can all be exercised. No real
 * Claude API request is ever made and `@anthropic-ai/sdk` is never installed.
 *
 * @example
 * ```ts
 * import { claude } from './mocks/claude.mock';
 *
 * beforeEach(() => claude.install());
 * afterEach(() => claude.restore());
 *
 * it('uses the AI moments', async () => {
 *   claude.mockSuccess({ clipCount: 12 });
 *   const result = await detectMomentsWithClaude(config, VIDEO_URL);
 *   expect(result.provider).toBe('anthropic');
 *   expect(result.moments).toHaveLength(12);
 * });
 * ```
 */
import {
  resetAnthropicSdkLoader,
  setAnthropicSdkLoader,
  type AnthropicSdkLoader,
} from '../claude-detection.helper';
import type { ViralMoment } from '../types';

/** Shape of the `clips` array Claude is asked to return. */
export interface ClaudeClip {
  start: number;
  end: number;
  reason?: string;
}

export interface ClaudeUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface ClaudeMessageResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  model: string;
  content: Array<{ type: 'text'; text: string }>;
  stop_reason: 'end_turn' | 'max_tokens' | null;
  usage: ClaudeUsage;
}

/** Options for {@link ClaudeMock.mockSuccess}. */
export interface ClaudeSuccessOptions {
  /** How many `clips` to generate. Must be >= 10 to clear the production `minClips`. */
  clipCount?: number;
  /** Length of each generated clip, in seconds. */
  clipDuration?: number;
  /** Offset of the first clip, in seconds. */
  startAt?: number;
  /** Gap between generated clips, in seconds. */
  gap?: number;
  /** Optional explicit clips; overrides the generated list. */
  clips?: ClaudeClip[];
  /** Token usage reported on the response. */
  usage?: Partial<ClaudeUsage>;
  /** Model echoed back on the response. */
  model?: string;
  /** Replace the default JSON body with an exact string. */
  rawText?: string;
}

/** Options for {@link ClaudeMock.mockEmptyResponse}. */
export interface ClaudeEmptyOptions {
  /** Content blocks to emit. Defaults to a single empty text block. */
  content?: Array<{ type: 'text'; text: string }>;
  /** Model echoed back on the response. */
  model?: string;
  usage?: Partial<ClaudeUsage>;
}

/** Options for {@link ClaudeMock.mockMalformedResponse}. */
export interface ClaudeMalformedOptions {
  /** Garbage body. Defaults to non-JSON prose. */
  rawText?: string;
  usage?: Partial<ClaudeUsage>;
}

/** Error scenarios the mock can raise. */
export type ClaudeFailureKind =
  | 'api_error'
  | 'rate_limit'
  | 'timeout'
  | 'overloaded'
  | 'network';

const DEFAULT_USAGE: ClaudeUsage = { input_tokens: 1200, output_tokens: 480 };
const DEFAULT_MODEL = 'claude-4.1';
const DEFAULT_CLIP_COUNT = 12;
const DEFAULT_CLIP_DURATION = 30;

const FAILURE_MESSAGES: Record<ClaudeFailureKind, string> = {
  api_error: 'API Error: internal server error',
  rate_limit: 'Rate limit exceeded. Please retry shortly.',
  timeout: 'Request timed out after 600000ms',
  overloaded: 'Overloaded',
  network: 'fetch failed',
};

const FAILURE_STATUS: Record<ClaudeFailureKind, number> = {
  api_error: 500,
  rate_limit: 429,
  timeout: 408,
  overloaded: 529,
  network: 0,
};

/** The request `client.messages.create()` received, for assertions. */
export interface RecordedClaudeRequest {
  model: string;
  max_tokens: number;
  temperature: number;
  messages: Array<{ role: string; content: unknown }>;
  apiKey: string;
}

/**
 * Stateful fake of the Anthropic SDK.
 *
 * Each scenario helper configures the next `messages.create()` outcome, and the
 * mock records every request so tests can assert the prompt, model and API key
 * the production code actually used.
 */
export class ClaudeMock {
  /** Requests seen since the last {@link reset}, oldest first. */
  readonly requests: RecordedClaudeRequest[] = [];

  /** Number of times `messages.create()` was called. */
  get callCount(): number {
    return this.requests.length;
  }

  /** The most recent request, or `undefined` before the first call. */
  get lastRequest(): RecordedClaudeRequest | undefined {
    return this.requests[this.requests.length - 1];
  }

  private handler: (request: RecordedClaudeRequest) => Promise<unknown> = () =>
    Promise.resolve(this.success());

  private active = false;

  /** Reset recorded requests and restore the default success scenario. */
  reset(): void {
    this.requests.length = 0;
    this.handler = () => Promise.resolve(this.success());
  }

  /**
   * Route `detectMomentsWithClaude()` at this mock.
   *
   * Idempotent — calling it twice does not stack restore handlers.
   */
  install(): this {
    if (this.active) return this;
    setAnthropicSdkLoader(this.sdkLoader);
    this.active = true;
    return this;
  }

  /** Detach the mock and restore the production lazy dynamic import. */
  restore(): void {
    if (!this.active) return;
    resetAnthropicSdkLoader();
    this.active = false;
    this.requests.length = 0;
  }

  /** True while the mock is wired into the loader seam. */
  get isInstalled(): boolean {
    return this.active;
  }

  /**
   * The loader function itself, for specs that prefer to install it manually
   * (`setAnthropicSdkLoader(claude.sdkLoader)`) instead of calling `install()`.
   */
  get sdkLoader(): AnthropicSdkLoader {
    return () => Promise.resolve(this.createModule());
  }

  // ── Scenarios ────────────────────────────────────────────────────────────

  /**
   * Successful detection: enough clips for `parseClaudeResponse` to keep them.
   * Defaults to 12 clips so the result clears the production `minClips` of 10.
   */
  mockSuccess(options: ClaudeSuccessOptions = {}): this {
    this.handler = () => Promise.resolve(this.success(options));
    return this;
  }

  /**
   * Successful HTTP call whose body contains no usable clips — a refusal, an
   * empty content block, or a model that answered with prose. The caller falls
   * back to fixed chunks.
   */
  mockEmptyResponse(options: ClaudeEmptyOptions = {}): this {
    this.handler = () =>
      Promise.resolve({
        id: 'msg_empty',
        type: 'message',
        role: 'assistant',
        model: options.model ?? DEFAULT_MODEL,
        content: options.content ?? [{ type: 'text', text: '' }],
        stop_reason: 'end_turn',
        usage: { ...DEFAULT_USAGE, ...options.usage },
      });
    return this;
  }

  /**
   * Successful HTTP call whose body is not valid JSON, exercising the
   * `safeParseJson` failure path.
   */
  mockMalformedResponse(options: ClaudeMalformedOptions = {}): this {
    this.handler = () =>
      Promise.resolve({
        id: 'msg_malformed',
        type: 'message',
        role: 'assistant',
        model: DEFAULT_MODEL,
        content: [
          {
            type: 'text',
            text:
              options.rawText ??
              'Sure! Here are the moments you asked for:\n\n' +
                '1. 0:00 - 0:30 (hook)\n2. 1:00 - 1:30 (payoff)',
          },
        ],
        stop_reason: 'end_turn',
        usage: { ...DEFAULT_USAGE, ...options.usage },
      });
    return this;
  }

  /**
   * JSON that parses but contains fewer than `minClips` usable clips, so
   * `parseClaudeResponse` returns `null` and the caller falls back.
   */
  mockTooFewClips(clipCount = 3, options: ClaudeMalformedOptions = {}): this {
    this.handler = () =>
      Promise.resolve(
        this.buildResponse(
          JSON.stringify({ clips: buildClips(clipCount) }),
          options.usage,
        ),
      );
    return this;
  }

  /** JSON with a `clips` key holding the wrong type. */
  mockUnexpectedShape(clipsValue: unknown = 'not-an-array'): this {
    this.handler = () =>
      Promise.resolve(
        this.buildResponse(JSON.stringify({ clips: clipsValue })),
      );
    return this;
  }

  /** Reject the request with an SDK-style API error (HTTP 500). */
  mockApiFailure(message?: string): this {
    return this.mockFailure('api_error', message);
  }

  /** Reject with a 429 rate-limit error. */
  mockRateLimit(message?: string): this {
    return this.mockFailure('rate_limit', message);
  }

  /** Reject with a request-timeout error. */
  mockTimeout(message?: string): this {
    return this.mockFailure('timeout', message);
  }

  /** Reject with a 529 overloaded error. */
  mockOverloaded(message?: string): this {
    return this.mockFailure('overloaded', message);
  }

  /** Reject with a transport-level failure (no HTTP status). */
  mockNetworkError(message?: string): this {
    return this.mockFailure('network', message);
  }

  /** Reject with the requested failure kind. */
  mockFailure(kind: ClaudeFailureKind, message?: string): this {
    this.handler = () => {
      const error = new Error(message ?? FAILURE_MESSAGES[kind]) as Error & {
        status?: number;
      };
      error.name = 'APIError';
      error.status = FAILURE_STATUS[kind];
      return Promise.reject(error);
    };
    return this;
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private buildResponse(text: string, usage?: Partial<ClaudeUsage>) {
    return {
      id: 'msg_mock',
      type: 'message',
      role: 'assistant',
      model: DEFAULT_MODEL,
      content: [{ type: 'text', text }],
      stop_reason: 'end_turn',
      usage: { ...DEFAULT_USAGE, ...usage },
    };
  }

  private success(options: ClaudeSuccessOptions = {}): ClaudeMessageResponse {
    if (options.rawText !== undefined) {
      return this.buildResponse(
        options.rawText,
        options.usage,
      ) as ClaudeMessageResponse;
    }

    const clips =
      options.clips ??
      buildClips(options.clipCount ?? DEFAULT_CLIP_COUNT, {
        duration: options.clipDuration ?? DEFAULT_CLIP_DURATION,
        startAt: options.startAt ?? 0,
        gap: options.gap ?? 0,
      });

    return this.buildResponse(
      JSON.stringify({ clips }),
      options.usage,
    ) as ClaudeMessageResponse;
  }

  private createModule() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const mock = this;

    class Anthropic {
      apiKey: string;

      messages: {
        create: (
          request: Omit<RecordedClaudeRequest, 'apiKey'>,
        ) => Promise<unknown>;
      };

      constructor(options: { apiKey: string }) {
        this.apiKey = options.apiKey;
        this.messages = {
          create: (request) => {
            const recorded: RecordedClaudeRequest = {
              ...request,
              apiKey: options.apiKey,
            };
            mock.requests.push(recorded);
            return mock.handler(recorded);
          },
        };
      }
    }

    return { __esModule: true, default: Anthropic, Anthropic };
  }
}

interface BuildClipsOptions {
  duration?: number;
  startAt?: number;
  gap?: number;
}

/** Deterministic clip list used by the default success scenario. */
export function buildClips(
  count: number,
  options: BuildClipsOptions = {},
): ClaudeClip[] {
  const duration = options.duration ?? DEFAULT_CLIP_DURATION;
  const startAt = options.startAt ?? 0;
  const gap = options.gap ?? 0;

  return Array.from({ length: count }, (_, index) => {
    const start = startAt + index * (duration + gap);
    return {
      start,
      end: start + duration,
      reason: `moment-${index + 1}`,
    };
  });
}

/** The moments the default success scenario produces, as `ViralMoment`s. */
export function defaultMockMoments(
  clipCount = DEFAULT_CLIP_COUNT,
  options: BuildClipsOptions = {},
): ViralMoment[] {
  return buildClips(clipCount, options).map((clip, index) => ({
    start: clip.start,
    end: clip.end,
    reason: clip.reason ?? `moment-${index + 1}`,
  }));
}

/** Shared instance — reset in `beforeEach`, restored in `afterEach`. */
export const claude = new ClaudeMock();

/**
 * Install the mock and return it, for specs that prefer a single call in
 * `beforeAll` rather than `beforeEach`.
 */
export function mockAnthropicSdk(): ClaudeMock {
  return claude.install();
}

/** Detach the mock and drop anything it recorded. */
export function restoreAnthropicSdk(): void {
  claude.restore();
  claude.reset();
}
