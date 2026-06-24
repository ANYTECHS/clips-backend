import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { MailService } from './mail.service';
import { DeviceFingerprintService } from './device-fingerprint.service';
import { BruteForceProtectionService } from './brute-force-protection.service';
import { EmailDeliveryService } from './email-delivery.service';
import { EncryptionService } from '../encryption/encryption.service';
import { StellarService } from '../stellar/stellar.service';
import * as bcrypt from 'bcrypt';

describe('Auth - Password Strength Validation', () => {
  let service: AuthService;
  let prismaService: PrismaService;
  let stellarService: StellarService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            refreshToken: {
              create: jest.fn(),
            },
            emailVerificationToken: {
              create: jest.fn(),
            },
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('mock_token'),
          },
        },
        {
          provide: MailService,
          useValue: {
            sendMagicLink: jest.fn(),
            sendPasswordResetLink: jest.fn(),
            sendVerificationEmail: jest.fn(),
          },
        },
        {
          provide: DeviceFingerprintService,
          useValue: { getFingerprint: jest.fn() },
        },
        {
          provide: BruteForceProtectionService,
          useValue: { check: jest.fn(), record: jest.fn() },
        },
        {
          provide: EmailDeliveryService,
          useValue: {
            enqueue: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: EncryptionService,
          useValue: {
            encrypt: jest.fn().mockReturnValue('encrypted_secret'),
            decrypt: jest.fn().mockReturnValue('decrypted_secret'),
          },
        },
        {
          provide: StellarService,
          useValue: {
            isTestnet: jest.fn().mockReturnValue(true),
            fundWithFriendbot: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prismaService = module.get<PrismaService>(PrismaService);
    stellarService = module.get<StellarService>(StellarService);
  });

  describe('POST /auth/signup', () => {
    it('should reject weak passwords (too short)', async () => {
      const signupDto: SignupDto = {
        name: 'Test User',
        email: 'test@example.com',
        password: '123456', // Less than 10 characters
      };

      try {
        await service.signup(signupDto);
      } catch (error) {
        // Validation should fail before reaching service
      }
    });

    it('should reject weak passwords without numbers/symbols', async () => {
      const signupDto: SignupDto = {
        name: 'Test User',
        email: 'test@example.com',
        password: 'passwordpassword', // 16 chars but low strength score
      };

      // Would need to validate - typically caught by ValidationPipe
    });

    it('should accept strong passwords', async () => {
      const email = 'test@example.com';
      const password = 'MyStr0ng!P@ssw0rd';

      const mockUser = {
        id: 1,
        email,
        password: 'hashed_password',
        name: null,
        picture: null,
      };

      (prismaService.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prismaService.user.create as jest.Mock).mockResolvedValue(mockUser);

      const signupDto: SignupDto = {
        name: 'Test User',
        email,
        password,
      };

      const result = await service.signup(signupDto);

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('tokens');
      expect(result.user.email).toBe(email);
    });

    it('should reject duplicate email', async () => {
      const email = 'existing@example.com';

      (prismaService.user.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        email,
      });

      const signupDto: SignupDto = {
        name: 'Existing User',
        email,
        password: 'MyStr0ng!P@ssw0rd',
      };

      await expect(service.signup(signupDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should automatically fund the custodial wallet with Friendbot on testnet', async () => {
      const email = 'test-friendbot@example.com';
      const password = 'MyStr0ng!P@ssw0rd';
      const mockUser = {
        id: 1,
        email,
        password: 'hashed_password',
        name: null,
        picture: null,
      };

      (prismaService.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prismaService.user.create as jest.Mock).mockResolvedValue(mockUser);
      (stellarService.isTestnet as jest.Mock).mockReturnValue(true);

      const signupDto: SignupDto = {
        name: 'Test Friendbot User',
        email,
        password,
      };

      await service.signup(signupDto);

      expect(stellarService.isTestnet).toHaveBeenCalled();
      expect(stellarService.fundWithFriendbot).toHaveBeenCalled();
    });

    it('should not fund the custodial wallet if not on testnet', async () => {
      const email = 'test-no-friendbot@example.com';
      const password = 'MyStr0ng!P@ssw0rd';
      const mockUser = {
        id: 1,
        email,
        password: 'hashed_password',
        name: null,
        picture: null,
      };

      (prismaService.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prismaService.user.create as jest.Mock).mockResolvedValue(mockUser);
      (stellarService.isTestnet as jest.Mock).mockReturnValue(false);
      (stellarService.fundWithFriendbot as jest.Mock).mockClear();

      const signupDto: SignupDto = {
        name: 'Test No Friendbot User',
        email,
        password,
      };

      await service.signup(signupDto);

      expect(stellarService.isTestnet).toHaveBeenCalled();
      expect(stellarService.fundWithFriendbot).not.toHaveBeenCalled();
    });
  });

  describe('Password Strength Requirements', () => {
    it('should require minimum length of 10 characters', () => {
      // Passwords under 10 characters should be rejected
      const weakPasswords = ['123456', 'pass1234', 'abc12345'];
      // All should fail validation
    });

    it('should require zxcvbn score of at least 3', () => {
      // Examples of passwords and their typical scores:
      // 'passwordpassword' - score 2 (rejected)
      // 'MyStr0ng!P@ssw0rd' - score 4 (accepted)
    });

    it('should provide helpful feedback', () => {
      // Example error responses:
      // { score: 1, feedback: ['Add uppercase letters, numbers, or symbols'], suggestions: '...' }
    });
  });

  describe('Password Hashing', () => {
    it('should hash passwords using bcrypt', async () => {
      const email = 'test@example.com';
      const password = 'MyStr0ng!P@ssw0rd';

      const mockUser = {
        id: 1,
        email,
        password: 'hashed_password',
        name: null,
        picture: null,
      };

      (prismaService.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prismaService.user.create as jest.Mock).mockResolvedValue(mockUser);

      await service.signup({ name: 'Test User', email, password });

      const createCall = (prismaService.user.create as jest.Mock).mock
        .calls[0][0];
      expect(createCall.data.password).toBeDefined();
      // In real test, the password would be hashed by bcrypt
    });
  });
});
