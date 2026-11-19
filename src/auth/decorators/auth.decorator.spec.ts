/**
 * Unit tests for the @Auth() and @Roles() decorators.
 *
 * These tests verify that the decorators apply the correct metadata and
 * guards without actually invoking NestJS's dependency injection or HTTP layer.
 */

import { Reflector } from '@nestjs/core';
import { ROLES_KEY, Roles } from './roles.decorator';
import { IS_PUBLIC_KEY, Public } from './public.decorator';
import { ADMIN_KEY, Admin } from './admin.decorator';

// ─── Roles decorator ─────────────────────────────────────────────────────────

describe('@Roles() decorator', () => {
  it('stores the provided roles under the ROLES_KEY metadata key', () => {
    class TestController {
      @Roles('admin', 'editor')
      handler() {}
    }

    const reflector = new Reflector();
    const roles = reflector.get<string[]>(ROLES_KEY, TestController.prototype.handler);
    expect(roles).toEqual(['admin', 'editor']);
  });

  it('stores a single role correctly', () => {
    class TestController {
      @Roles('admin')
      handler() {}
    }

    const reflector = new Reflector();
    const roles = reflector.get<string[]>(ROLES_KEY, TestController.prototype.handler);
    expect(roles).toEqual(['admin']);
  });

  it('stores an empty array when called with no arguments', () => {
    class TestController {
      @Roles()
      handler() {}
    }

    const reflector = new Reflector();
    const roles = reflector.get<string[]>(ROLES_KEY, TestController.prototype.handler);
    expect(roles).toEqual([]);
  });

  it('exports ROLES_KEY as a non-empty string', () => {
    expect(typeof ROLES_KEY).toBe('string');
    expect(ROLES_KEY.length).toBeGreaterThan(0);
  });
});

// ─── Public decorator ─────────────────────────────────────────────────────────

describe('@Public() decorator', () => {
  it('sets IS_PUBLIC_KEY metadata to true on a method', () => {
    class TestController {
      @Public()
      publicHandler() {}
    }

    const reflector = new Reflector();
    const isPublic = reflector.get<boolean>(IS_PUBLIC_KEY, TestController.prototype.publicHandler);
    expect(isPublic).toBe(true);
  });

  it('does not set IS_PUBLIC_KEY on methods without the decorator', () => {
    class TestController {
      protectedHandler() {}
    }

    const reflector = new Reflector();
    const isPublic = reflector.get<boolean>(IS_PUBLIC_KEY, TestController.prototype.protectedHandler);
    expect(isPublic).toBeUndefined();
  });
});

// ─── Admin decorator ─────────────────────────────────────────────────────────

describe('@Admin() decorator', () => {
  it('sets ADMIN_KEY metadata to true on a method', () => {
    class TestController {
      @Admin()
      adminHandler() {}
    }

    const reflector = new Reflector();
    const isAdmin = reflector.get<boolean>(ADMIN_KEY, TestController.prototype.adminHandler);
    expect(isAdmin).toBe(true);
  });

  it('does not set ADMIN_KEY on methods without the decorator', () => {
    class TestController {
      regularHandler() {}
    }

    const reflector = new Reflector();
    const isAdmin = reflector.get<boolean>(ADMIN_KEY, TestController.prototype.regularHandler);
    expect(isAdmin).toBeUndefined();
  });
});

// ─── Auth() factory — integration with applyDecorators ───────────────────────

describe('@Auth() factory function', () => {
  it('returns a function (decorator factory)', () => {
    // Import dynamically to avoid circular deps at test setup time
    const { Auth } = require('./auth.decorator');
    expect(typeof Auth).toBe('function');
  });

  it('applies a function when called without roles', () => {
    const { Auth } = require('./auth.decorator');
    const decorator = Auth();
    expect(typeof decorator).toBe('function');
  });

  it('applies a function when called with roles', () => {
    const { Auth } = require('./auth.decorator');
    const decorator = Auth('admin');
    expect(typeof decorator).toBe('function');
  });

  it('does not throw when decorating a controller class', () => {
    const { Auth } = require('./auth.decorator');
    expect(() => {
      @Auth()
      class TestController {}
      return TestController;
    }).not.toThrow();
  });

  it('does not throw when decorating a class with roles', () => {
    const { Auth } = require('./auth.decorator');
    expect(() => {
      @Auth('admin', 'editor')
      class TestController {}
      return TestController;
    }).not.toThrow();
  });

  it('does not throw when decorating a method', () => {
    const { Auth } = require('./auth.decorator');
    expect(() => {
      class TestController {
        @Auth()
        handler() {}
      }
      return TestController;
    }).not.toThrow();
  });
});

// ─── RolesGuard behaviour — unit ─────────────────────────────────────────────

describe('RolesGuard logic', () => {
  const createMockContext = (user: any, handlerRoles: string[] | undefined, classRoles: string[] | undefined) => {
    const mockReflector = {
      getAllAndOverride: jest.fn().mockReturnValue(handlerRoles ?? classRoles ?? undefined),
    } as any;

    const mockContext = {
      getHandler: jest.fn().mockReturnValue({}),
      getClass: jest.fn().mockReturnValue({}),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ user }),
      }),
    } as any;

    return { mockReflector, mockContext };
  };

  it('returns true when no roles are required', () => {
    const { RolesGuard } = require('../guards/roles.guard');
    const { mockReflector, mockContext } = createMockContext({ role: 'user' }, undefined, undefined);
    const guard = new RolesGuard(mockReflector);
    expect(guard.canActivate(mockContext)).toBe(true);
  });

  it('returns true when user has the required role', () => {
    const { RolesGuard } = require('../guards/roles.guard');
    const { mockReflector, mockContext } = createMockContext({ role: 'admin' }, ['admin'], undefined);
    const guard = new RolesGuard(mockReflector);
    expect(guard.canActivate(mockContext)).toBe(true);
  });

  it('throws ForbiddenException when user lacks the required role', () => {
    const { RolesGuard } = require('../guards/roles.guard');
    const { mockReflector, mockContext } = createMockContext({ role: 'user' }, ['admin'], undefined);
    const guard = new RolesGuard(mockReflector);
    expect(() => guard.canActivate(mockContext)).toThrow();
  });

  it('returns true when user has one of several required roles', () => {
    const { RolesGuard } = require('../guards/roles.guard');
    const { mockReflector, mockContext } = createMockContext(
      { role: 'editor' },
      ['admin', 'editor'],
      undefined,
    );
    const guard = new RolesGuard(mockReflector);
    expect(guard.canActivate(mockContext)).toBe(true);
  });
});
