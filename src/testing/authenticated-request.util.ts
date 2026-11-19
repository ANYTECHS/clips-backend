/**
 * Reusable helpers for authenticated API requests in unit, integration and
 * E2E tests (#1025).
 *
 * Before this helper existed every spec re-implemented the same three steps:
 * sign a JWT, hand it to supertest as an `Authorization: Bearer` header and
 * (for role based specs) stub the guard that inspects `request.user`. This
 * module centralises that setup so an authenticated request is written as
 * `createAuthenticatedRequest(user).get('/payouts')`.
 *
 * The helper authenticates against exactly the security scheme documented by
 * Swagger: `@Auth()` applies `ApiBearerAuth('access-token')` and
 * `JwtStrategy` reads the token back with
 * `ExtractJwt.fromAuthHeaderAsBearerToken()` using
 * `process.env.JWT_SECRET || 'dev_jwt_secret'`. Tokens are signed with the
 * same secret, lifetime and claim shape (`JwtPayload`) used in production, so
 * requests built here pass the real `JwtAuthGuard` untouched.
 */
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import type { Test } from 'supertest';
import type { TestingModuleBuilder } from '@nestjs/testing';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/** Roles understood by `RolesGuard` and the `role` column on `User`. */
export type TestUserRole = 'user' | 'admin' | 'editor';

/** Per-token overrides, for the cases that need to break the defaults. */
export interface TestTokenOptions {
  /** Access-token lifetime in seconds. Defaults to `JWT_EXPIRES` or 3600. */
  expiresIn?: number | string;
  /** Force a specific `emailVerified` claim (`false` is rejected upstream). */
  emailVerified?: boolean;
  /** Extra claims merged into the payload. `sub`, `email` and `emailVerified` always win. */
  extraClaims?: Record<string, unknown>;
}

/** A user to authenticate as. */
export interface AuthenticatedTestUser {
  id: number;
  email?: string | null;
  emailVerified?: boolean;
  /**
   * Attached to `request.user` by {@link overrideJwtAuthGuard}. Roles are
   * intentionally *not* JWT claims (see SECURITY.md), so role based specs need
   * the guard override rather than a different token.
   */
  role?: TestUserRole;
  name?: string;
}

const DEFAULT_JWT_SECRET = 'dev_jwt_secret';
const DEFAULT_JWT_EXPIRES_SECONDS = 3600;

const HTTP_METHODS = [
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'head',
  'options',
] as const;

let cachedJwtService: JwtService | undefined;
let cachedSecret: string | undefined;
let cachedExpires: number | undefined;

/** Resolve the signing secret exactly the way `JwtStrategy` does. */
export function getTestJwtSecret(): string {
  return process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
}

/** Resolve the access-token lifetime exactly the way `AuthModule` does. */
export function getTestJwtExpiresIn(): number {
  const configured = Number(process.env.JWT_EXPIRES);
  return configured > 0 ? configured : DEFAULT_JWT_EXPIRES_SECONDS;
}

function getJwtService(): JwtService {
  const secret = getTestJwtSecret();
  const expiresIn = getTestJwtExpiresIn();

  if (
    !cachedJwtService ||
    cachedSecret !== secret ||
    cachedExpires !== expiresIn
  ) {
    cachedJwtService = new JwtService({
      secret,
      signOptions: { expiresIn },
    });
    cachedSecret = secret;
    cachedExpires = expiresIn;
  }

  return cachedJwtService;
}

/** Drop the memoised signer — call after mutating `process.env.JWT_SECRET`. */
export function resetTestJwtService(): void {
  cachedJwtService = undefined;
  cachedSecret = undefined;
  cachedExpires = undefined;
}

/** Build the claim set `AuthService.issueTokens` produces for `user`. */
export function buildTestJwtPayload(
  user: AuthenticatedTestUser,
  options: TestTokenOptions = {},
): JwtPayload & Record<string, unknown> {
  if (!user || typeof user.id !== 'number' || Number.isNaN(user.id)) {
    throw new Error('createAuthenticatedRequest requires a numeric user.id');
  }

  return {
    ...(options.extraClaims ?? {}),
    sub: user.id,
    email: user.email ?? null,
    emailVerified: options.emailVerified ?? user.emailVerified ?? true,
  };
}

/**
 * Sign a real access token for `user`.
 *
 * The result is accepted by `JwtAuthGuard` exactly like a token minted by
 * `POST /auth/login`.
 */
export function signTestAccessToken(
  user: AuthenticatedTestUser,
  options: TestTokenOptions = {},
): string {
  const payload = buildTestJwtPayload(user, options);
  const signOptions: JwtSignOptions = {
    expiresIn: options.expiresIn ?? getTestJwtExpiresIn(),
  };

  return getJwtService().sign(payload, signOptions);
}

/** `Authorization: Bearer …` header for the Swagger `access-token` scheme. */
export function authHeadersFor(
  user: AuthenticatedTestUser,
  options: TestTokenOptions = {},
): Record<string, string> {
  return { Authorization: `Bearer ${signTestAccessToken(user, options)}` };
}

/**
 * Cookie fallback mirroring `CookieService.setTokenCookies`, for specs that
 * exercise the `?use_cookies=true` flows.
 */
export function authCookieFor(
  user: AuthenticatedTestUser,
  options: TestTokenOptions = {},
): Record<string, string> {
  return { Cookie: `access_token=${signTestAccessToken(user, options)}` };
}

/**
 * The subset of the supertest surface this helper wraps. `supertest` exports a
 * factory (`request(app)`), so an "agent" is any object exposing the HTTP verb
 * helpers — either `request(app)` itself or a test double.
 */
export interface SuperTestLike {
  [method: string]: (url: string) => Test;
}

/** Object returned by {@link createAuthenticatedRequest}. */
export interface AuthenticatedRequestFactory {
  /** The signed token used for every request created by this factory. */
  readonly token: string;
  /** Headers attached to every request. */
  readonly headers: Record<string, string>;
  /** The user this factory authenticates as. */
  readonly user: AuthenticatedTestUser;
  /**
   * Every verb accepts either `(url)` when the factory was given an app/agent,
   * or `(app, url)` so the app can be supplied per call.
   */
  get(...args: [string] | [unknown, string]): Test;
  head(...args: [string] | [unknown, string]): Test;
  options(...args: [string] | [unknown, string]): Test;
  post(...args: [string] | [unknown, string]): Test;
  put(...args: [string] | [unknown, string]): Test;
  patch(...args: [string] | [unknown, string]): Test;
  delete(...args: [string] | [unknown, string]): Test;
  /**
   * Derive a factory with extra headers merged in — handy for per-request
   * fixtures such as CSRF tokens or idempotency keys.
   */
  with(extraHeaders: Record<string, string>): AuthenticatedRequestFactory;
  /** Same factory with the credentials stripped, to assert a 401. */
  unauthenticated(): AuthenticatedRequestFactory;
  /**
   * Bind a Nest/Express app (or a `request(app)` instance) so verbs can be
   * called with just the URL: `createAuthenticatedRequest(u).forApp(app)`.
   */
  forApp(app: unknown): AuthenticatedRequestFactory;
}

/** Options for {@link createAuthenticatedRequest}. */
export interface AuthenticatedRequestOptions extends TestTokenOptions {
  /**
   * Also send the token as an `access_token` cookie. Off by default because
   * `JwtStrategy` only reads the bearer header.
   */
  cookie?: boolean;
  /** Additional headers merged on top of the auth headers. */
  headers?: Record<string, string>;
  /**
   * A supertest instance (e.g. `request(app)`) to wrap. When omitted, verbs
   * must be called as `http.get(app, '/path')` or the factory must first be
   * bound with {@link AuthenticatedRequestFactory.forApp}.
   */
  agent?: SuperTestLike;
  /** Convenience wrapper around `agent`: a Nest/Express app to bind. */
  app?: unknown;
  /** Skip the `Authorization` header entirely. */
  anonymous?: boolean;
}

function resolveSuperTest(): (app: unknown) => SuperTestLike {
  // `supertest` is a devDependency, so it is required lazily: this module
  // stays importable from contexts that never run HTTP tests.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod: unknown = require('supertest');
  const resolved = (mod as { default?: unknown })?.default ?? mod;
  const factory = resolved as (app: unknown) => SuperTestLike;
  return (app: unknown) => factory(app);
}

function applyHeaders(test: Test, headers: Record<string, string>): Test {
  let result = test;
  for (const [name, value] of Object.entries(headers)) {
    result = result.set(name, value);
  }
  return result;
}

/**
 * Create a supertest factory that authenticates every request as `user`.
 *
 * ```ts
 * import { createAuthenticatedRequest } from '../src/testing';
 *
 * const http = createAuthenticatedRequest(
 *   { id: 1, email: 'user@test.dev' },
 *   { app },
 * );
 * await http.get('/payouts').expect(200);
 * await http.post('/payouts/request').send({ amount: 50, currency: 'USD' });
 *
 * // …or bind the app later, or per call:
 * createAuthenticatedRequest(user).forApp(app).get('/payouts');
 * createAuthenticatedRequest(user).get(app, '/payouts');
 * ```
 *
 * For `@Roles` / `@Admin` routes pair this with
 * {@link overrideJwtAuthGuard}, because the role is resolved from the database
 * rather than from the token.
 */
export function createAuthenticatedRequest(
  user: AuthenticatedTestUser,
  options: AuthenticatedRequestOptions = {},
): AuthenticatedRequestFactory {
  const supertest = resolveSuperTest();
  const tokenOptions: TestTokenOptions = {
    expiresIn: options.expiresIn,
    emailVerified: options.emailVerified,
    extraClaims: options.extraClaims,
  };

  const baseHeaders: Record<string, string> = {
    ...(options.anonymous ? {} : authHeadersFor(user, tokenOptions)),
    ...(options.cookie ? authCookieFor(user, tokenOptions) : {}),
    ...(options.headers ?? {}),
  };

  const token = options.anonymous
    ? ''
    : signTestAccessToken(user, tokenOptions);

  const build = (
    merged: Record<string, string>,
    agent?: SuperTestLike,
  ): AuthenticatedRequestFactory => {
    const resolve = (
      args: unknown[],
    ): { agent: SuperTestLike; url: string } => {
      if (args.length === 2) {
        const [app, url] = args as [unknown, string];
        return { agent: supertest(app), url };
      }
      if (!agent) {
        throw new Error(
          'No supertest target bound. Pass `app` to createAuthenticatedRequest(), call forApp(app), or use http.get(app, url).',
        );
      }
      return { agent, url: args[0] as string };
    };

    const factory: Partial<AuthenticatedRequestFactory> = {
      token,
      headers: merged,
      user,
      with(extraHeaders: Record<string, string>) {
        return build({ ...merged, ...extraHeaders }, agent);
      },
      unauthenticated() {
        const rest = { ...merged };
        delete rest.Authorization;
        delete rest.Cookie;
        return build(rest, agent);
      },
      forApp(app: unknown) {
        return build(merged, supertest(app));
      },
    };

    for (const method of HTTP_METHODS) {
      (factory as Record<string, (...args: never[]) => Test>)[method] = (
        ...args: never[]
      ) => {
        const { agent: bound, url } = resolve(args);
        return applyHeaders(bound[method](url), merged);
      };
    }

    return factory as AuthenticatedRequestFactory;
  };

  return build(
    baseHeaders,
    options.agent ?? (options.app ? supertest(options.app) : undefined),
  );
}

/** Ready-made users so specs do not have to repeat ids and emails. */
export const TEST_USERS = {
  user: { id: 1, email: 'user@clipcash.test', role: 'user' },
  otherUser: { id: 2, email: 'other@clipcash.test', role: 'user' },
  editor: { id: 3, email: 'editor@clipcash.test', role: 'editor' },
  admin: { id: 4, email: 'admin@clipcash.test', role: 'admin' },
  unverified: {
    id: 5,
    email: 'unverified@clipcash.test',
    role: 'user',
    emailVerified: false,
  },
} as const satisfies Record<string, AuthenticatedTestUser>;

/** Shorthand for `createAuthenticatedRequest` with a sensible default user. */
export function authenticatedRequest(
  user: AuthenticatedTestUser = TEST_USERS.user,
  options: AuthenticatedRequestOptions = {},
): AuthenticatedRequestFactory {
  return createAuthenticatedRequest(user, options);
}

/**
 * Replace `JwtAuthGuard` on a testing module builder with an authenticating
 * stub so role based specs can run without a database round-trip.
 *
 * The `Authorization` header produced by {@link createAuthenticatedRequest} is
 * still sent, so the request exercises the real header plumbing while the
 * guard resolves the role from `user.role`.
 *
 * ```ts
 * const moduleRef = await overrideJwtAuthGuard(
 *   Test.createTestingModule({ controllers: [PayoutsController], providers }),
 *   TEST_USERS.admin,
 * ).compile();
 * ```
 */
export function overrideJwtAuthGuard<TBuilder extends TestingModuleBuilder>(
  moduleBuilder: TBuilder,
  user: AuthenticatedTestUser = TEST_USERS.user,
): TBuilder {
  const requestUser = {
    id: user.id,
    userId: user.id,
    email: user.email ?? null,
    emailVerified: user.emailVerified ?? true,
    role: user.role ?? 'user',
  };

  const authenticatedGuardStub = {
    canActivate(context: {
      switchToHttp(): { getRequest(): { user?: unknown } };
    }): boolean {
      context.switchToHttp().getRequest().user = requestUser;
      return true;
    },
  };

  return moduleBuilder
    .overrideGuard(JwtAuthGuard)
    .useValue(authenticatedGuardStub);
}
