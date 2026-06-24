import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { EmailDeliveryService } from './email-delivery.service';
import { DeviceFingerprintService } from './device-fingerprint.service';
import { BruteForceProtectionService } from './brute-force-protection.service';
import { EncryptionService } from '../encryption/encryption.service';
import { StellarService } from '../stellar/stellar.service';

jest.mock('@stellar/stellar-sdk', () => require('../../test/mocks/stellar-sdk.mock'));

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  refreshToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  },
  emailVerificationToken: {
    create: jest.fn(),
  },
};

mockPrisma.withTransaction = jest.fn(async (callback: (tx: typeof mockPrisma) => unknown) =>
  callback(mockPrisma),
);

const mockJwt = { sign: jest.fn().mockReturnValue('mock.jwt.token') };

const mockEmailDelivery = { enqueue: jest.fn() };

const mockDeviceFingerprint = {
  compareFingerprints: jest.fn().mockReturnValue(true),
};

const mockBruteForce = {
  recordFailedAttempt: jest.fn().mockResolvedValue({
    isLocked: false,
    remainingAttempts: 4,
    lockoutTimeLeft: 0,
  }),
  clearFailedAttempts: jest.fn(),
};

const mockEncryption = { encrypt: jest.fn().mockReturnValue('encrypted-secret') };

const mockStellarService = {
  isTestnet: jest.fn().mockReturnValue(false),
  fundWithFriendbot: jest.fn().mockResolvedValue(undefined),
};

async function buildService(): Promise<AuthService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      AuthService,
      { provide: PrismaService, useValue: mockPrisma },
      { provide: JwtService, useValue: mockJwt },
      { provide: EmailDeliveryService, useValue: mockEmailDelivery },
      { provide: DeviceFingerprintService, useValue: mockDeviceFingerprint },
      { provide: BruteForceProtectionService, useValue: mockBruteForce },
      { provide: EncryptionService, useValue: mockEncryption },
      { provide: StellarService, useValue: mockStellarService },
    ],
  }).compile();
  return module.get<AuthService>(AuthService);
}

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    service = await buildService();
  });

  // ─── signup ────────────────────────────────────────────────────────────────

  describe('signup', () => {
    const dto = { name: 'Alice', email: 'alice@example.com', password: 'Str0ng!Pass' };

    it('throws BadRequestException when email is already registered', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 1, email: dto.email });
      await expect(service.signup(dto)).rejects.toThrow(BadRequestException);
    });

    it('creates user, hashes password, and returns tokens', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 1,
        email: dto.email,
        name: dto.name,
        picture: null,
        emailVerified: null,
      });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.emailVerificationToken.create.mockResolvedValue({});
      mockPrisma.refreshToken.create.mockResolvedValue({});

      const result = await service.signup(dto);

      expect(result.user.email).toBe(dto.email);
      expect(result.tokens.accessToken).toBe('mock.jwt.token');
      expect(result.tokens.refreshToken).toBeDefined();

      // Password must be hashed before persisting
      const createCall = mockPrisma.user.create.mock.calls[0][0];
      expect(createCall.data.password).not.toBe(dto.password);
      const isHashed = await bcrypt.compare(dto.password, createCall.data.password);
      expect(isHashed).toBe(true);
    });

    it('enqueues a verification email after signup', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 2,
        email: dto.email,
        name: dto.name,
        picture: null,
        emailVerified: null,
      });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.emailVerificationToken.create.mockResolvedValue({});
      mockPrisma.refreshToken.create.mockResolvedValue({});

      await service.signup(dto);

      expect(mockEmailDelivery.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ to: dto.email, template: 'verification' }),
      );
    });
  });

  // ─── login ─────────────────────────────────────────────────────────────────

  describe('login', () => {
    const password = 'Str0ng!Pass';
    let hashedPassword: string;

    beforeAll(async () => {
      hashedPassword = await bcrypt.hash(password, 10);
    });

    const baseUser = () => ({
      id: 1,
      email: 'alice@example.com',
      password: hashedPassword,
      name: 'Alice',
      picture: null,
      emailVerified: new Date(),
      mfaEnabled: false,
      mfaSecret: null,
    });

    it('throws UnauthorizedException for unknown email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.login({ email: 'nobody@example.com', password }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for wrong password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser());
      await expect(
        service.login({ email: 'alice@example.com', password: 'WrongPass1!' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('returns user and tokens on valid credentials', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser());
      mockPrisma.refreshToken.create.mockResolvedValue({});
      mockBruteForce.clearFailedAttempts.mockResolvedValue(undefined);

      const result = await service.login({ email: 'alice@example.com', password });

      expect(result.user.email).toBe('alice@example.com');
      expect(result.tokens.accessToken).toBe('mock.jwt.token');
      expect(result.tokens.refreshToken).toBeDefined();
    });

    it('clears brute-force counter on successful login', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser());
      mockPrisma.refreshToken.create.mockResolvedValue({});
      mockBruteForce.clearFailedAttempts.mockResolvedValue(undefined);

      await service.login({ email: 'alice@example.com', password });

      expect(mockBruteForce.clearFailedAttempts).toHaveBeenCalledWith('alice@example.com');
    });

    it('records failed attempt on wrong password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser());

      await expect(
        service.login({ email: 'alice@example.com', password: 'BadPass1!' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockBruteForce.recordFailedAttempt).toHaveBeenCalledWith('alice@example.com');
    });

    it('throws UnauthorizedException with lockout message when account is locked', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser());
      mockBruteForce.recordFailedAttempt.mockResolvedValue({
        isLocked: true,
        lockoutTimeLeft: 120,
        remainingAttempts: 0,
      });

      await expect(
        service.login({ email: 'alice@example.com', password: 'BadPass1!' }),
      ).rejects.toThrow(/locked/i);
    });
  });

  // ─── refreshTokens ─────────────────────────────────────────────────────────

  describe('refreshTokens', () => {
    const rawToken = 'some-raw-refresh-token';
    const storedToken = {
      id: 10,
      userId: 1,
      tokenHash: 'will-be-overridden',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      userAgentHash: null,
      ipAddress: null,
      acceptLanguage: null,
      user: {
        id: 1,
        email: 'alice@example.com',
        emailVerified: new Date(),
      },
    };

    it('throws UnauthorizedException for unknown token', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(service.refreshTokens(rawToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException for revoked token', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        ...storedToken,
        revokedAt: new Date(),
      });
      await expect(service.refreshTokens(rawToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException for expired token', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        ...storedToken,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.refreshTokens(rawToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rotates token and returns new tokens on valid input', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue(storedToken);
      mockPrisma.refreshToken.update.mockResolvedValue({});
      mockPrisma.refreshToken.create.mockResolvedValue({});

      const result = await service.refreshTokens(rawToken);

      expect(result.accessToken).toBe('mock.jwt.token');
      expect(result.refreshToken).toBeDefined();
      // Old token must be revoked
      expect(mockPrisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: storedToken.id },
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
    });
  });
});
