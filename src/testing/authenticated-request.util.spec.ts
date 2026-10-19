import { Test } from '@nestjs/testing';
import { Controller, Get, INestApplication, Req } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Auth, Public } from '../auth/decorators';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import {
  authCookieFor,
  authHeadersFor,
  authenticatedRequest,
  buildTestJwtPayload,
  createAuthenticatedRequest,
  getTestJwtExpiresIn,
  getTestJwtSecret,
  overrideJwtAuthGuard,
  resetTestJwtService,
  signTestAccessToken,
  TEST_USERS,
} from './authenticated-request.util';

/** A `super` stub so the factory can be asserted without a real HTTP server. */
function stubAgent() {
  const created: Array<{ method: string; url: string }> = [];
  const make = (method: string) =>
    jest.fn((url: string) => {
      created.push({ method, url });
      const test = { set: jest.fn() } as unknown as Record<string, unknown>;
      test.set = jest.fn(() => test);
      return test as never;
    });

  return {
    created,
    agent: {
      get: make('get'),
      post: make('post'),
      put: make('put'),
      patch: make('patch'),
      delete: make('delete'),
      head: make('head'),
      options: make('options'),
    } as never,
  };
}

interface DecodedJwt {
  sub: number;
  email: string | null;
  emailVerified: boolean;
  iat: number;
  exp: number;
  [claim: string]: unknown;
}

const decode = (token: string): DecodedJwt =>
  JSON.parse(
    Buffer.from(token.split('.')[1], 'base64url').toString('utf8'),
  ) as DecodedJwt;

describe('authenticated request test utility (#1025)', () => {
  const originalSecret = process.env.JWT_SECRET;
  const originalExpires = process.env.JWT_EXPIRES;

  beforeEach(() => {
    delete process.env.JWT_SECRET;
    delete process.env.JWT_EXPIRES;
    resetTestJwtService();
  });

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
    if (originalExpires === undefined) delete process.env.JWT_EXPIRES;
    else process.env.JWT_EXPIRES = originalExpires;
    resetTestJwtService();
  });

  describe('secret and expiry resolution', () => {
    it('falls back to the same defaults as JwtStrategy / AuthModule', () => {
      expect(getTestJwtSecret()).toBe('dev_jwt_secret');
      expect(getTestJwtExpiresIn()).toBe(3600);
    });

    it('honours JWT_SECRET and JWT_EXPIRES from the environment', () => {
      process.env.JWT_SECRET = 'unit-test-secret';
      process.env.JWT_EXPIRES = '120';
      resetTestJwtService();

      expect(getTestJwtSecret()).toBe('unit-test-secret');
      expect(getTestJwtExpiresIn()).toBe(120);
    });

    it('ignores a non-positive JWT_EXPIRES', () => {
      process.env.JWT_EXPIRES = '0';
      expect(getTestJwtExpiresIn()).toBe(3600);
    });
  });

  describe('buildTestJwtPayload', () => {
    it('mirrors the production claim shape', () => {
      expect(buildTestJwtPayload({ id: 7, email: 'a@b.test' })).toEqual({
        sub: 7,
        email: 'a@b.test',
        emailVerified: true,
      });
    });

    it('defaults email to null and respects an explicit emailVerified', () => {
      expect(buildTestJwtPayload({ id: 7 })).toEqual({
        sub: 7,
        email: null,
        emailVerified: true,
      });
      expect(
        buildTestJwtPayload({ id: 7, emailVerified: false }),
      ).toMatchObject({ emailVerified: false });
    });

    it('lets options override the user emailVerified flag', () => {
      expect(
        buildTestJwtPayload(
          { id: 7, emailVerified: true },
          { emailVerified: false },
        ),
      ).toMatchObject({ emailVerified: false });
    });

    it('merges extra claims but never lets them replace sub', () => {
      expect(
        buildTestJwtPayload(
          { id: 7 },
          { extraClaims: { sub: 999, scope: 'test' } },
        ),
      ).toEqual({ sub: 7, email: null, emailVerified: true, scope: 'test' });
    });

    it('rejects a user without a numeric id', () => {
      expect(() =>
        buildTestJwtPayload({ id: 'seven' } as unknown as { id: number }),
      ).toThrow('numeric user.id');
    });
  });

  describe('signTestAccessToken', () => {
    it('produces a token signed with the configured secret', () => {
      const token = signTestAccessToken(TEST_USERS.user);
      const [header, , signature] = token.split('.');

      expect(header).toBeDefined();
      expect(signature).toBeDefined();
      expect(decode(token)).toMatchObject({
        sub: 1,
        email: 'user@clipcash.test',
        emailVerified: true,
      });

      const jwt = new JwtService({ secret: getTestJwtSecret() });
      expect(jwt.verify(token)).toMatchObject({ sub: 1 });
    });

    it('rejects a token signed with a different secret', () => {
      const token = signTestAccessToken(TEST_USERS.user);
      const jwt = new JwtService({ secret: 'some-other-secret' });
      expect(() => {
        jwt.verify(token);
      }).toThrow();
    });

    it('applies the default access-token lifetime', () => {
      const claims = decode(signTestAccessToken(TEST_USERS.user));
      expect(claims.exp - claims.iat).toBe(3600);
    });

    it('honours a per-token expiresIn override', () => {
      const claims = decode(
        signTestAccessToken(TEST_USERS.user, { expiresIn: 60 }),
      );
      expect(claims.exp - claims.iat).toBe(60);
    });

    it('supports unverified users so 401 paths can be asserted', () => {
      const claims = decode(signTestAccessToken(TEST_USERS.unverified));
      expect(claims.emailVerified).toBe(false);
    });
  });

  describe('authHeadersFor / authCookieFor', () => {
    it('attaches the bearer token for the Swagger access-token scheme', () => {
      const headers = authHeadersFor(TEST_USERS.admin);
      expect(headers.Authorization).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
      expect(
        decode(headers.Authorization.replace('Bearer ', '')),
      ).toMatchObject({
        sub: TEST_USERS.admin.id,
      });
    });

    it('mirrors the access_token cookie set by CookieService', () => {
      const cookie = authCookieFor(TEST_USERS.user);
      expect(cookie.Cookie).toMatch(/^access_token=/);
    });
  });

  describe('createAuthenticatedRequest', () => {
    it('exposes the token, headers and user it was built from', () => {
      const { agent } = stubAgent();
      const http = createAuthenticatedRequest(TEST_USERS.user, { agent });

      expect(http.user).toBe(TEST_USERS.user);
      expect(http.token.split('.')).toHaveLength(3);
      expect(http.headers.Authorization).toBe(`Bearer ${http.token}`);
      expect(decode(http.token)).toMatchObject({
        sub: TEST_USERS.user.id,
        email: TEST_USERS.user.email,
      });
    });

    it('applies the auth header to every HTTP method', () => {
      const { agent, created } = stubAgent();
      const http = createAuthenticatedRequest(TEST_USERS.user, { agent });

      const methods = [
        'get',
        'post',
        'put',
        'patch',
        'delete',
        'head',
        'options',
      ] as const;

      for (const method of methods) {
        const test = http[method]('/payouts') as unknown as {
          set: jest.Mock;
        };
        expect(test.set).toHaveBeenCalledWith(
          'Authorization',
          http.headers.Authorization,
        );
      }
      expect(created.map((c) => c.method)).toEqual(methods);
    });

    it('supports a different user per factory', () => {
      const { agent } = stubAgent();
      const asUser = createAuthenticatedRequest(TEST_USERS.user, { agent });
      const asAdmin = createAuthenticatedRequest(TEST_USERS.admin, { agent });

      expect(decode(asUser.token).sub).toBe(TEST_USERS.user.id);
      expect(decode(asAdmin.token).sub).toBe(TEST_USERS.admin.id);
    });

    it('optionally sends the access_token cookie alongside the header', () => {
      const { agent } = stubAgent();
      const http = createAuthenticatedRequest(TEST_USERS.user, {
        agent,
        cookie: true,
      });

      expect(http.headers.Cookie).toMatch(/^access_token=/);
    });

    it('merges caller supplied headers', () => {
      const { agent } = stubAgent();
      const http = createAuthenticatedRequest(TEST_USERS.user, {
        agent,
        headers: { 'X-Request-Id': 'req-1' },
      });

      expect(http.headers['X-Request-Id']).toBe('req-1');
      expect(http.headers.Authorization).toBeDefined();
    });

    it('derives a factory with extra headers via with()', () => {
      const { agent } = stubAgent();
      const http = createAuthenticatedRequest(TEST_USERS.user, { agent });
      const withCsrf = http.with({ 'X-CSRF-Token': 'csrf-1' });

      expect(withCsrf.headers['X-CSRF-Token']).toBe('csrf-1');
      expect(withCsrf.headers.Authorization).toBe(http.headers.Authorization);
      expect(http.headers['X-CSRF-Token']).toBeUndefined();
    });

    it('strips credentials with unauthenticated()', () => {
      const { agent } = stubAgent();
      const http = createAuthenticatedRequest(TEST_USERS.user, {
        agent,
        cookie: true,
      });
      const anon = http.unauthenticated();

      expect(anon.headers.Authorization).toBeUndefined();
      expect(anon.headers.Cookie).toBeUndefined();
      expect(http.headers.Authorization).toBeDefined();
    });

    it('can build an anonymous factory directly', () => {
      const { agent } = stubAgent();
      const http = createAuthenticatedRequest(TEST_USERS.user, {
        agent,
        anonymous: true,
      });

      expect(http.token).toBe('');
      expect(http.headers.Authorization).toBeUndefined();
    });

    it('throws a helpful error when no app is bound', () => {
      const http = createAuthenticatedRequest(TEST_USERS.user);
      expect(() => http.get('/health')).toThrow('No supertest target bound');
    });

    it('binds a supertest target with forApp()', () => {
      const http = createAuthenticatedRequest(TEST_USERS.user).forApp('app');
      const test = http.get('/health') as unknown as { set: jest.Mock };
      expect(typeof test.set).toBe('function');
    });

    it('accepts the app per call', () => {
      const http = createAuthenticatedRequest(TEST_USERS.user);
      const test = http.get('app-instance', '/health') as unknown as {
        set: jest.Mock;
      };
      expect(typeof test.set).toBe('function');
    });
  });

  describe('authenticatedRequest', () => {
    it('defaults to TEST_USERS.user', () => {
      const { agent } = stubAgent();
      const http = authenticatedRequest(undefined, { agent });
      expect(http.user).toBe(TEST_USERS.user);
    });
  });

  describe('overrideJwtAuthGuard', () => {
    let app: INestApplication;

    beforeEach(async () => {
      const moduleRef = await overrideJwtAuthGuard(
        Test.createTestingModule({ controllers: [RoleProbeController] }),
        TEST_USERS.admin,
      ).compile();

      app = moduleRef.createNestApplication();
      await app.listen(0);
    });

    afterEach(async () => {
      await app.close();
    });

    it('lets an admin through a role guarded route', async () => {
      const http = createAuthenticatedRequest(TEST_USERS.admin, {
        app: app.getHttpServer(),
      });

      await http.get('/role-probe/admin').expect(200);
    });

    it('attaches the role to request.user for the guard', async () => {
      const http = createAuthenticatedRequest(TEST_USERS.admin, {
        app: app.getHttpServer(),
      });

      const response = await http.get('/role-probe/admin').expect(200);
      expect(response.body).toMatchObject({
        user: { id: TEST_USERS.admin.id, role: 'admin' },
      });
    });

    it('keeps the bearer header on the bound factory', () => {
      const http = createAuthenticatedRequest(TEST_USERS.admin, {
        app: app.getHttpServer(),
      });

      expect(http.headers.Authorization).toBe(`Bearer ${http.token}`);
      expect(decode(http.token)).toMatchObject({
        sub: TEST_USERS.admin.id,
        email: TEST_USERS.admin.email,
      });
    });
  });

  describe('integration with the real JwtAuthGuard', () => {
    let app: INestApplication;

    beforeAll(async () => {
      // JwtStrategy reads process.env.JWT_SECRET (default 'dev_jwt_secret'),
      // which is exactly what signTestAccessToken() signs with.
      const moduleRef = await Test.createTestingModule({
        imports: [PassportModule.register({ session: false })],
        controllers: [ProbeController],
        providers: [JwtStrategy],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.listen(0);
    });

    afterAll(async () => {
      await app.close();
    });

    it('accepts a token created by createAuthenticatedRequest', async () => {
      const http = createAuthenticatedRequest(TEST_USERS.user, {
        app: app.getHttpServer(),
      });

      const response = await http.get('/probe/private').expect(200);
      expect((response.body as { user: unknown }).user).toMatchObject({
        id: TEST_USERS.user.id,
        userId: TEST_USERS.user.id,
        email: TEST_USERS.user.email,
      });
    });

    it('rejects a request with no Authorization header', async () => {
      const http = createAuthenticatedRequest(TEST_USERS.user, {
        app: app.getHttpServer(),
        anonymous: true,
      });

      await http.get('/probe/private').expect(401);
    });

    it('rejects a request whose token is stripped via unauthenticated()', async () => {
      const http = createAuthenticatedRequest(TEST_USERS.user, {
        app: app.getHttpServer(),
      }).unauthenticated();

      await http.get('/probe/private').expect(401);
    });

    it('rejects a token for a user that has not verified their email', async () => {
      const http = createAuthenticatedRequest(TEST_USERS.unverified, {
        app: app.getHttpServer(),
      });

      await http.get('/probe/private').expect(401);
    });

    it('still allows public routes without credentials', async () => {
      const http = createAuthenticatedRequest(TEST_USERS.user, {
        app: app.getHttpServer(),
        anonymous: true,
      });

      await http.get('/probe/open').expect(200);
    });
  });
});

@Controller('probe')
class ProbeController {
  @Get('open')
  @Public()
  open() {
    return { ok: true };
  }

  @Get('private')
  @Auth()
  privateRoute(@Req() req: { user?: Record<string, unknown> }) {
    return { user: req.user };
  }
}

@Controller('role-probe')
class RoleProbeController {
  /** `@Auth('admin')` applies `JwtAuthGuard` then `RolesGuard`. */
  @Get('admin')
  @Auth('admin')
  adminRoute(@Req() req: { user?: Record<string, unknown> }) {
    return { user: req.user };
  }
}
