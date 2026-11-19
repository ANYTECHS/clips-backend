import { HttpException, HttpStatus } from '@nestjs/common';
import { throwUnauthorized, throwForbidden } from './auth-error.helper';

describe('auth-error.helper', () => {
  describe('throwUnauthorized', () => {
    it('throws HttpException with 401 status', () => {
      expect(() =>
        throwUnauthorized({ message: 'Not auth', errorCode: 'UNAUTHORIZED' }),
      ).toThrow(HttpException);
    });

    it('response body contains statusCode, errorCode, message', () => {
      try {
        throwUnauthorized({ message: 'Token expired', errorCode: 'TOKEN_EXPIRED' });
      } catch (e) {
        expect(e).toBeInstanceOf(HttpException);
        expect((e as HttpException).getStatus()).toBe(HttpStatus.UNAUTHORIZED);
        expect((e as HttpException).getResponse()).toEqual({
          statusCode: 401,
          errorCode: 'TOKEN_EXPIRED',
          message: 'Token expired',
        });
      }
    });

    it('includes reason when provided', () => {
      try {
        throwUnauthorized({ message: 'Bad token', errorCode: 'UNAUTHORIZED', reason: 'jwt malformed' });
      } catch (e) {
        expect((e as HttpException).getResponse()).toEqual({
          statusCode: 401,
          errorCode: 'UNAUTHORIZED',
          message: 'Bad token',
          reason: 'jwt malformed',
        });
      }
    });

    it('omits reason when not provided', () => {
      try {
        throwUnauthorized({ message: 'No token', errorCode: 'UNAUTHORIZED' });
      } catch (e) {
        const body = (e as HttpException).getResponse() as Record<string, unknown>;
        expect(body).not.toHaveProperty('reason');
      }
    });
  });

  describe('throwForbidden', () => {
    it('throws HttpException with 403 status', () => {
      expect(() =>
        throwForbidden({ message: 'No access', errorCode: 'FORBIDDEN' }),
      ).toThrow(HttpException);
    });

    it('response body contains statusCode, errorCode, message', () => {
      try {
        throwForbidden({ message: 'Admin only', errorCode: 'FORBIDDEN' });
      } catch (e) {
        expect(e).toBeInstanceOf(HttpException);
        expect((e as HttpException).getStatus()).toBe(HttpStatus.FORBIDDEN);
        expect((e as HttpException).getResponse()).toEqual({
          statusCode: 403,
          errorCode: 'FORBIDDEN',
          message: 'Admin only',
        });
      }
    });

    it('includes reason when provided', () => {
      try {
        throwForbidden({ message: 'No access', errorCode: 'FORBIDDEN', reason: 'Required roles: admin' });
      } catch (e) {
        expect((e as HttpException).getResponse()).toEqual({
          statusCode: 403,
          errorCode: 'FORBIDDEN',
          message: 'No access',
          reason: 'Required roles: admin',
        });
      }
    });

    it('omits reason when not provided', () => {
      try {
        throwForbidden({ message: 'No access', errorCode: 'FORBIDDEN' });
      } catch (e) {
        const body = (e as HttpException).getResponse() as Record<string, unknown>;
        expect(body).not.toHaveProperty('reason');
      }
    });
  });
});
