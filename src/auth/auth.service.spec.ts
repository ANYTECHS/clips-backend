import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as speakeasy from 'speakeasy';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { EmailDeliveryService } from './email-delivery.service';
import { DeviceFingerprintService } from './device-fingerprint.service';
import { BruteForceProtectionService } from './brute-force-protection.service';
import { EncryptionService } from '../encryption/encryption.service';
import { StellarService } from '../stellar/stellar.service';

jest.mock('@stellar/stellar-sdk', () => require('../../test/mocks/stellar-sdk.mock'));

const mockPrisma: any = {
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
    deleteMany: jest.fn(),
  },
  emailVerificationToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  magicLink: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  passwordResetToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  withTransaction: jest.fn(async (callback: (tx: any) => unknown) =>
    callback(mockPrisma),
  ),
};

const mockJwt = { sign: jest.fn().mockReturnValue('mock.jwt.token') };

const mockEmailDelivery = { enqueue: jest.fn().mockResolvedValue(undefined) };

const mockDeviceFingerprint = {
  compareFingerprints: jest.fn().mockReturnValue(true),
};

const mockBruteForce = {
  recordFailedAttempt: jest.fn().mockResolvedValue({
    isLocked: false,
    remainingAttempts: 4,
    lockoutTimeLeft: 0,
  }),
  clearFailedAttempts: jest.fn().mockResolvedValue(undefined),
};

const mockEncryption = {
  encrypt: jest.fn().mockReturnValue('encrypted-secret'),
  decrypt: jest.fn().mockReturnValue('decrypted-secret'),
};

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
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: dto.email },
      });
    });

    it('creates user, hashes password, assigns stellar wallet, and returns tokens', async () => {
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
      expect(result.user.emailVerified).toBe(false);
      expect(result.tokens.accessToken).toBe('mock.jwt.token');
      expect(result.tokens.refreshToken).toBeDefined();

      // Password must be hashed before persisting
      const createCall = mockPrisma.user.create.mock.calls[0][0];
      expect(createCall.data.password).not.toBe(dto.password);
      const isHashed = await bcrypt.compare(dto.password, createCall.data.password);
      expect(isHashed).toBe(true);

      // Stellar wallet assignment
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            walletType: 'custodial',
            stellarPublicKey: expect.any(String),
            encryptedStellarSecret: 'encrypted-secret',
          }),
        }),
      );
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

    it('funds wallet with friendbot on testnet', async () => {
      mockStellarService.isTestnet.mockReturnValue(true);
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 3,
        email: dto.email,
        name: dto.name,
        picture: null,
        emailVerified: null,
      });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.emailVerificationToken.create.mockResolvedValue({});
      mockPrisma.refreshToken.create.mockResolvedValue({});

      await service.signup(dto);

      expect(mockStellarService.fundWithFriendbot).toHaveBeenCalledWith(
        expect.any(String),
      );
    });

    it('handles friendbot funding failure gracefully without throwing', async () => {
      mockStellarService.isTestnet.mockReturnValue(true);
      mockStellarService.fundWithFriendbot.mockRejectedValueOnce(
        new Error('Friendbot service unavailable'),
      );
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 4,
        email: dto.email,
        name: dto.name,
        picture: null,
        emailVerified: null,
      });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.emailVerificationToken.create.mockResolvedValue({});
      mockPrisma.refreshToken.create.mockResolvedValue({});

      await expect(service.signup(dto)).resolves.toBeDefined();
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

    it('throws UnauthorizedException for unknown email and records failed attempt', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.login({ email: 'nobody@example.com', password }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockBruteForce.recordFailedAttempt).toHaveBeenCalledWith(
        'nobody@example.com',
      );
    });

    it('throws UnauthorizedException when user has no password set (OAuth-only account)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...baseUser(),
        password: null,
      });

      await expect(
        service.login({ email: 'alice@example.com', password }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockBruteForce.recordFailedAttempt).toHaveBeenCalledWith(
        'alice@example.com',
      );
    });

    it('throws UnauthorizedException for wrong password and records failed attempt', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser());
      await expect(
        service.login({ email: 'alice@example.com', password: 'WrongPass1!' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockBruteForce.recordFailedAttempt).toHaveBeenCalledWith(
        'alice@example.com',
      );
    });

    it('returns user and tokens on valid credentials', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser());
      mockPrisma.refreshToken.create.mockResolvedValue({});
      mockBruteForce.clearFailedAttempts.mockResolvedValue(undefined);

      const result = await service.login({ email: 'alice@example.com', password });

      expect(result.user.email).toBe('alice@example.com');
      expect(result.user.name).toBe('Alice');
      expect(result.user.emailVerified).toBe(true);
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

    describe('MFA validation during login', () => {
      it('throws UnauthorizedException when MFA is enabled but no totpCode provided', async () => {
        mockPrisma.user.findUnique.mockResolvedValue({
          ...baseUser(),
          mfaEnabled: true,
          mfaSecret: 'JBSWY3DPEHPK3PXP',
        });

        await expect(
          service.login({ email: 'alice@example.com', password }),
        ).rejects.toThrow('TOTP code is required');
      });

      it('throws UnauthorizedException when MFA is enabled and totpCode is invalid', async () => {
        mockPrisma.user.findUnique.mockResolvedValue({
          ...baseUser(),
          mfaEnabled: true,
          mfaSecret: 'JBSWY3DPEHPK3PXP',
        });

        jest.spyOn(speakeasy.totp, 'verify').mockReturnValue(false);

        await expect(
          service.login({
            email: 'alice@example.com',
            password,
            totpCode: '000000',
          }),
        ).rejects.toThrow('Invalid TOTP code');
      });

      it('logs in successfully when MFA is enabled and totpCode is valid', async () => {
        mockPrisma.user.findUnique.mockResolvedValue({
          ...baseUser(),
          mfaEnabled: true,
          mfaSecret: 'JBSWY3DPEHPK3PXP',
        });
        mockPrisma.refreshToken.create.mockResolvedValue({});
        jest.spyOn(speakeasy.totp, 'verify').mockReturnValue(true);

        const result = await service.login({
          email: 'alice@example.com',
          password,
          totpCode: '123456',
        });

        expect(result.user.mfaEnabled).toBe(true);
        expect(result.tokens.accessToken).toBe('mock.jwt.token');
      });
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
        role: 'USER',
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

    it('throws UnauthorizedException and revokes all tokens on device fingerprint mismatch', async () => {
      const storedWithFingerprint = {
        ...storedToken,
        userAgentHash: 'agent-hash-1',
        ipAddress: '127.0.0.1',
        acceptLanguage: 'en',
      };
      mockPrisma.refreshToken.findUnique.mockResolvedValue(storedWithFingerprint);
      mockDeviceFingerprint.compareFingerprints.mockReturnValue(false);

      await expect(
        service.refreshTokens(rawToken, {
          userAgentHash: 'different-agent-hash',
          ipAddress: '192.168.1.1',
          acceptLanguage: 'fr',
        }),
      ).rejects.toThrow('Device fingerprint mismatch - potential session hijacking detected');

      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: storedWithFingerprint.userId, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  // ─── findOrCreateGoogleUser (OAuth) ────────────────────────────────────────

  describe('findOrCreateGoogleUser (OAuth)', () => {
    const oauthParams = {
      provider: 'google',
      providerId: 'google-123456',
      email: 'googleuser@example.com',
      name: 'Google User',
      picture: 'https://example.com/photo.jpg',
    };

    it('returns existing user if matched by provider and providerId', async () => {
      const existingUser = {
        id: 1,
        provider: 'google',
        providerId: 'google-123456',
        email: 'googleuser@example.com',
        name: 'Google User',
      };
      mockPrisma.user.findUnique.mockResolvedValueOnce(existingUser);

      const result = await service.findOrCreateGoogleUser(oauthParams);

      expect(result).toEqual(existingUser);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: {
          provider_providerId: {
            provider: oauthParams.provider,
            providerId: oauthParams.providerId,
          },
        },
      });
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('links OAuth provider when user exists by email without provider', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(null) // by provider_providerId
        .mockResolvedValueOnce({
          id: 5,
          email: 'googleuser@example.com',
          provider: null,
          providerId: null,
          emailVerified: null,
        }); // by email
      const updatedUser = {
        id: 5,
        email: 'googleuser@example.com',
        provider: 'google',
        providerId: 'google-123456',
        emailVerified: expect.any(Date),
      };
      mockPrisma.user.update.mockResolvedValue(updatedUser);

      const result = await service.findOrCreateGoogleUser(oauthParams);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: {
          provider: 'google',
          providerId: 'google-123456',
          emailVerified: expect.any(Date),
        },
      });
      expect(result).toEqual(updatedUser);
    });

    it('returns existing user if found by email and already has provider set', async () => {
      const existingOAuthUser = {
        id: 6,
        email: 'googleuser@example.com',
        provider: 'google',
        providerId: 'google-123456',
      };
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(null) // by provider_providerId
        .mockResolvedValueOnce(existingOAuthUser); // by email

      const result = await service.findOrCreateGoogleUser(oauthParams);

      expect(result).toEqual(existingOAuthUser);
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('creates new user and assigns Stellar wallet when user does not exist', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(null) // by provider_providerId
        .mockResolvedValueOnce(null); // by email

      const newUser = {
        id: 10,
        email: oauthParams.email,
        provider: oauthParams.provider,
        providerId: oauthParams.providerId,
        name: oauthParams.name,
        picture: oauthParams.picture,
        emailVerified: expect.any(Date),
      };
      mockPrisma.user.create.mockResolvedValue(newUser);
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.findOrCreateGoogleUser(oauthParams);

      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          email: oauthParams.email,
          provider: oauthParams.provider,
          providerId: oauthParams.providerId,
          name: oauthParams.name,
          picture: oauthParams.picture,
          emailVerified: expect.any(Date),
        },
      });
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 10 },
          data: expect.objectContaining({
            walletType: 'custodial',
            stellarPublicKey: expect.any(String),
            encryptedStellarSecret: 'encrypted-secret',
          }),
        }),
      );
      expect(result).toEqual(newUser);
    });

    it('uses fallback email when email is omitted in OAuth profile', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const paramsWithoutEmail = {
        provider: 'google',
        providerId: 'google-999',
        name: 'No Email User',
      };
      const createdUser = {
        id: 11,
        email: 'google_google-999@no-email.google',
        provider: 'google',
        providerId: 'google-999',
      };
      mockPrisma.user.create.mockResolvedValue(createdUser);
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.findOrCreateGoogleUser(paramsWithoutEmail);

      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'google_google-999@no-email.google',
        }),
      });
      expect(result).toEqual(createdUser);
    });
  });

  // ─── logout ────────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('deletes refresh token if found', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({ id: 25 });
      mockPrisma.refreshToken.delete.mockResolvedValue({});

      await service.logout('raw-token');

      expect(mockPrisma.refreshToken.delete).toHaveBeenCalledWith({
        where: { id: 25 },
      });
    });

    it('is idempotent and does nothing if token not found', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.logout('nonexistent-token')).resolves.toBeUndefined();
      expect(mockPrisma.refreshToken.delete).not.toHaveBeenCalled();
    });
  });

  // ─── verifyEmail & resendVerification ──────────────────────────────────────

  describe('verifyEmail & resendVerification', () => {
    it('verifies email and marks token as used', async () => {
      mockPrisma.emailVerificationToken.findUnique.mockResolvedValue({
        id: 1,
        userId: 10,
        usedAt: null,
        expiresAt: new Date(Date.now() + 3600000),
      });

      const result = await service.verifyEmail('raw-verification-token');

      expect(result).toEqual({ message: 'Email successfully verified' });
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('throws NotFoundException if verification token does not exist', async () => {
      mockPrisma.emailVerificationToken.findUnique.mockResolvedValue(null);
      await expect(service.verifyEmail('invalid-token')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws UnauthorizedException if verification token already used', async () => {
      mockPrisma.emailVerificationToken.findUnique.mockResolvedValue({
        id: 1,
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
      });
      await expect(service.verifyEmail('used-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException if verification token has expired', async () => {
      mockPrisma.emailVerificationToken.findUnique.mockResolvedValue({
        id: 1,
        usedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.verifyEmail('expired-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('resends verification email for unverified user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 12,
        email: 'unverified@example.com',
        emailVerified: null,
      });
      mockPrisma.emailVerificationToken.create.mockResolvedValue({});

      await service.resendVerification('unverified@example.com');

      expect(mockPrisma.emailVerificationToken.create).toHaveBeenCalled();
      expect(mockEmailDelivery.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'unverified@example.com',
          template: 'verification',
        }),
      );
    });

    it('does not resend verification if user already verified or not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 12,
        email: 'verified@example.com',
        emailVerified: new Date(),
      });

      await service.resendVerification('verified@example.com');
      expect(mockPrisma.emailVerificationToken.create).not.toHaveBeenCalled();
    });
  });

  // ─── magicLink ─────────────────────────────────────────────────────────────

  describe('magicLink', () => {
    it('requests magic link and enqueues email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ id: 20, email: 'magic@example.com' });
      mockPrisma.magicLink.create.mockResolvedValue({});

      await service.requestMagicLink('magic@example.com');

      expect(mockEmailDelivery.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'magic@example.com',
          template: 'magic-link',
        }),
      );
    });

    it('verifies magic link and returns tokens', async () => {
      const storedMagicLink = {
        id: 1,
        usedAt: null,
        expiresAt: new Date(Date.now() + 600000),
        user: {
          id: 20,
          email: 'magic@example.com',
          name: 'Magic User',
          picture: null,
          role: 'USER',
          emailVerified: new Date(),
        },
      };
      mockPrisma.magicLink.findUnique.mockResolvedValue(storedMagicLink);
      mockPrisma.magicLink.update.mockResolvedValue({});
      mockPrisma.refreshToken.create.mockResolvedValue({});

      const result = await service.verifyMagicLink('valid-magic-token');

      expect(result.user.email).toBe('magic@example.com');
      expect(result.tokens.accessToken).toBe('mock.jwt.token');
      expect(result.tokens.refreshToken).toBeDefined();
    });

    it('throws NotFoundException for invalid magic link', async () => {
      mockPrisma.magicLink.findUnique.mockResolvedValue(null);
      await expect(service.verifyMagicLink('bad-token')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws UnauthorizedException for already used magic link', async () => {
      mockPrisma.magicLink.findUnique.mockResolvedValue({
        id: 1,
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 600000),
      });
      await expect(service.verifyMagicLink('used-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException for expired magic link', async () => {
      mockPrisma.magicLink.findUnique.mockResolvedValue({
        id: 1,
        usedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.verifyMagicLink('expired-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ─── password reset ────────────────────────────────────────────────────────

  describe('forgotPassword & resetPassword', () => {
    it('creates password reset token and enqueues email if user exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 30,
        email: 'reset@example.com',
      });
      mockPrisma.passwordResetToken.create.mockResolvedValue({});

      await service.forgotPassword('reset@example.com');

      expect(mockPrisma.passwordResetToken.create).toHaveBeenCalled();
      expect(mockEmailDelivery.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'reset@example.com',
          template: 'password-reset',
        }),
      );
    });

    it('does nothing if user does not exist on forgotPassword', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.forgotPassword('unknown@example.com'),
      ).resolves.toBeUndefined();
      expect(mockPrisma.passwordResetToken.create).not.toHaveBeenCalled();
    });

    it('resets password, updates user, and revokes all refresh tokens', async () => {
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 1,
        userId: 30,
        usedAt: null,
        expiresAt: new Date(Date.now() + 3600000),
        user: { id: 30 },
      });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.passwordResetToken.update.mockResolvedValue({});
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({});

      await service.resetPassword('valid-reset-token', 'BrandNewPass123!');

      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('throws UnauthorizedException if reset token not found', async () => {
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue(null);
      await expect(
        service.resetPassword('bad-token', 'NewPass123!'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException if reset token already used', async () => {
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 1,
        userId: 30,
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
      });
      await expect(
        service.resetPassword('used-token', 'NewPass123!'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException if reset token expired', async () => {
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 1,
        userId: 30,
        usedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(
        service.resetPassword('expired-token', 'NewPass123!'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── MFA management ────────────────────────────────────────────────────────

  describe('MFA management (setup, enable, disable)', () => {
    it('sets up MFA and returns secret and QR code data URL', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 40,
        email: 'mfa@example.com',
      });
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.setupMfa(40);

      expect(result.secret).toBeDefined();
      expect(result.otpauthUrl).toBeDefined();
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 40 },
        data: expect.objectContaining({
          mfaSecret: expect.any(String),
          mfaEnabled: false,
        }),
      });
    });

    it('throws NotFoundException on setupMfa if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.setupMfa(999)).rejects.toThrow(NotFoundException);
    });

    it('enables MFA on valid TOTP code', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 40,
        mfaSecret: 'JBSWY3DPEHPK3PXP',
      });
      mockPrisma.user.update.mockResolvedValue({});
      jest.spyOn(speakeasy.totp, 'verify').mockReturnValue(true);

      await service.enableMfa(40, '123456');

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 40 },
        data: { mfaEnabled: true },
      });
    });

    it('throws BadRequestException if enabling MFA without setup first', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 40,
        mfaSecret: null,
      });

      await expect(service.enableMfa(40, '123456')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws UnauthorizedException if TOTP code is invalid when enabling MFA', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 40,
        mfaSecret: 'JBSWY3DPEHPK3PXP',
      });
      jest.spyOn(speakeasy.totp, 'verify').mockReturnValue(false);

      await expect(service.enableMfa(40, '999999')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('disables MFA successfully', async () => {
      mockPrisma.user.update.mockResolvedValue({});

      await service.disableMfa(40);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 40 },
        data: { mfaEnabled: false, mfaSecret: null },
      });
    });
  });
});
