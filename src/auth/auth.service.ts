import {
  Injectable,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { EmailDeliveryService } from './email-delivery.service';
import {
  DeviceFingerprintService,
  DeviceFingerprint,
} from './device-fingerprint.service';
import { BruteForceProtectionService } from './brute-force-protection.service';
import { EncryptionService } from '../encryption/encryption.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Keypair } from '@stellar/stellar-sdk';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import { StellarService } from '../stellar/stellar.service';

type JwtUser = {
  id: number;
  email: string | null;
  emailVerified?: Date | null;
};

const REFRESH_TOKEN_EXPIRES_DAYS =
  Number(process.env.JWT_REFRESH_EXPIRES_DAYS) > 0
    ? Number(process.env.JWT_REFRESH_EXPIRES_DAYS)
    : 14;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly emailDeliveryService: EmailDeliveryService,
    private readonly deviceFingerprintService: DeviceFingerprintService,
    private readonly bruteForceService: BruteForceProtectionService,
    private readonly encryption: EncryptionService,
    private readonly stellarService: StellarService,
  ) {}

  /** Generate a custodial Stellar keypair and persist it on the user record. */
  private async assignStellarWallet(userId: number): Promise<void> {
    const keypair = Keypair.random();
    const publicKey = keypair.publicKey();
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        stellarPublicKey: publicKey,
        walletType: 'custodial',
        encryptedStellarSecret: this.encryption.encrypt(keypair.secret()),
      },
    });

    if (this.stellarService.isTestnet()) {
      try {
        await this.stellarService.fundWithFriendbot(publicKey);
      } catch (error) {
        this.logger.error(
          `Friendbot automated funding failed for user ${userId} and wallet ${publicKey}: ${error.message}`,
        );
      }
    }
  }

  async findOrCreateGoogleUser(params: {
    provider: string;
    providerId: string;
    email?: string | null;
    name?: string | null;
    picture?: string | null;
  }) {
    const { provider, providerId, email, name, picture } = params;

    const existingByProvider = await this.prisma.user.findUnique({
      where: { provider_providerId: { provider, providerId } },
    });
    if (existingByProvider) {
      return existingByProvider;
    }

    if (email) {
      const existingByEmail = await this.prisma.user.findUnique({
        where: { email },
      });
      if (existingByEmail) {
        if (!existingByEmail.provider || !existingByEmail.providerId) {
          return this.prisma.user.update({
            where: { id: existingByEmail.id },
            data: {
              provider,
              providerId,
              emailVerified: existingByEmail.emailVerified || new Date(),
            },
          });
        }
        return existingByEmail;
      }
    }

    // Create user atomically — wallet update follows outside the transaction
    // because assignStellarWallet may call an external service (Stellar friendbot)
    const newUser = await this.prisma.user.create({
      data: {
        email: email || `google_${providerId}@no-email.google`,
        provider,
        providerId,
        name: name || undefined,
        picture: picture || undefined,
        emailVerified: new Date(), // Auto verify oauth
      },
    });

    // Auto-generate custodial Stellar wallet (#168)
    await this.assignStellarWallet(newUser.id);
    return newUser;
  }

  issueTokens(user: JwtUser) {
    const payload = {
      sub: user.id,
      email: user.email,
      emailVerified: !!user.emailVerified,
    };
    const accessToken = this.jwtService.sign(payload);
    return { accessToken };
  }

  async issueTokensWithRefresh(
    user: JwtUser,
    deviceFingerprint?: DeviceFingerprint,
  ) {
    const { accessToken } = this.issueTokens(user);

    // Generate opaque refresh token
    const rawToken = crypto.randomBytes(40).toString('hex');
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');
    const expiresAt = new Date(
      Date.now() + REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
    );

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        userAgentHash: deviceFingerprint?.userAgentHash,
        ipAddress: deviceFingerprint?.ipAddress,
        acceptLanguage: deviceFingerprint?.acceptLanguage,
      },
    });

    return { accessToken, refreshToken: rawToken };
  }

  async refreshTokens(
    rawToken: string,
    currentDeviceFingerprint?: DeviceFingerprint,
  ) {
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    // Performance: Use select to fetch only needed user fields for JWT generation (optimization #326)
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        expiresAt: true,
        revokedAt: true,
        user: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
      },
    });

    if (!stored || stored.revokedAt) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    // Validate device fingerprint if available
    if (currentDeviceFingerprint && stored.userAgentHash) {
      const storedFingerprint: DeviceFingerprint = {
        userAgentHash: stored.userAgentHash,
        ipAddress: stored.ipAddress || '',
        acceptLanguage: stored.acceptLanguage || '',
      };

      if (
        !this.deviceFingerprintService.compareFingerprints(
          storedFingerprint,
          currentDeviceFingerprint,
        )
      ) {
        // Revoke all tokens for this user due to potential hijacking
        await this.prisma.refreshToken.updateMany({
          where: { userId: stored.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        throw new UnauthorizedException(
          'Device fingerprint mismatch - potential session hijacking detected',
        );
      }
    }

    // Rotate: revoke old token
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const { user } = stored;
    return this.issueTokensWithRefresh({
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
    });
  }

  async logout(rawToken: string) {
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!stored) {
      // Idempotent — already deleted or doesn't exist
      return;
    }

    await this.prisma.refreshToken.delete({
      where: { id: stored.id },
    });
  }

  async signup(signupDto: SignupDto) {
    const { email, password } = signupDto;

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new BadRequestException('Email already registered');
    }

    // Hash the password before the transaction (CPU work outside DB round-trip)
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate email verification token values before transaction
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Create user + email verification token atomically
    const { user } = await this.prisma.withTransaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, password: hashedPassword },
      });
      await tx.emailVerificationToken.create({
        data: { userId: user.id, tokenHash, expiresAt },
      });
      return { user };
    });

    // Auto-generate custodial Stellar wallet outside transaction (may call external Stellar API)
    await this.assignStellarWallet(user.id);

    void this.emailDeliveryService.enqueue({
      to: email,
      subject: 'Verify your email address',
      template: 'verification',
      context: { token: rawToken },
    });

    // Issue tokens
    const tokens = await this.issueTokensWithRefresh({
      id: user.id,
      email: user.email,
      emailVerified: null,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        emailVerified: false,
      },
      tokens,
    };
  }

  async verifyEmail(rawToken: string) {
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    const verificationToken =
      await this.prisma.emailVerificationToken.findUnique({
        where: { tokenHash },
      });

    if (!verificationToken) {
      throw new NotFoundException('Invalid or expired verification link');
    }

    if (verificationToken.usedAt) {
      throw new UnauthorizedException(
        'Verification link has already been used',
      );
    }

    if (verificationToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Verification link has expired');
    }

    // Mark as used and update user
    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.update({
        where: { id: verificationToken.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: verificationToken.userId },
        data: { emailVerified: new Date() },
      }),
    ]);

    return { message: 'Email successfully verified' };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user?.password) {
      // Record failed attempt for non-existent user to prevent enumeration
      await this.bruteForceService.recordFailedAttempt(dto.email);
      throw new UnauthorizedException('Invalid credentials');
    }

    const matches = await bcrypt.compare(dto.password, user.password);
    if (!matches) {
      const result = await this.bruteForceService.recordFailedAttempt(
        dto.email,
      );

      if (result.isLocked) {
        throw new UnauthorizedException(
          `Account locked. Try again in ${result.lockoutTimeLeft} seconds.`,
        );
      }

      throw new UnauthorizedException(
        `Invalid credentials. ${result.remainingAttempts} attempts remaining.`,
      );
    }

    // Clear failed attempts on successful login
    await this.bruteForceService.clearFailedAttempts(dto.email);

    if (user.mfaEnabled) {
      if (!dto.totpCode || !user.mfaSecret) {
        throw new UnauthorizedException('TOTP code is required');
      }

      const isTotpValid = speakeasy.totp.verify({
        secret: user.mfaSecret,
        encoding: 'base32',
        token: dto.totpCode,
        window: 1,
      });

      if (!isTotpValid) {
        throw new UnauthorizedException('Invalid TOTP code');
      }
    }

    const tokens = await this.issueTokensWithRefresh({
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
    });
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        mfaEnabled: user.mfaEnabled,
        emailVerified: !!user.emailVerified,
      },
      tokens,
    };
  }

  async requestMagicLink(email: string): Promise<void> {
    // Generate token values before the transaction (no DB work needed yet)
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Find or create user + create magic link atomically
    await this.prisma.withTransaction(async (tx) => {
      let user = await tx.user.findUnique({ where: { email } });
      if (!user) {
        user = await tx.user.create({ data: { email } });
      }
      await tx.magicLink.create({
        data: { userId: user.id, tokenHash, expiresAt },
      });
    });

    void this.emailDeliveryService.enqueue({
      to: email,
      subject: 'Your magic login link',
      template: 'magic-link',
      context: { token: rawToken },
    });
  }

  async verifyMagicLink(
    rawToken: string,
    deviceFingerprint?: DeviceFingerprint,
  ) {
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    // Performance: Use select to fetch only needed user fields (optimization #326)
    const magicLink = await this.prisma.magicLink.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        usedAt: true,
        expiresAt: true,
        user: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
      },
    });

    if (!magicLink) {
      throw new NotFoundException('Invalid or expired magic link');
    }

    if (magicLink.usedAt) {
      throw new UnauthorizedException('Magic link has already been used');
    }

    if (magicLink.expiresAt < new Date()) {
      throw new UnauthorizedException('Magic link has expired');
    }

    const { user } = magicLink;

    // Prepare refresh token values before transaction
    const rawRefreshToken = crypto.randomBytes(40).toString('hex');
    const refreshTokenHash = crypto
      .createHash('sha256')
      .update(rawRefreshToken)
      .digest('hex');
    const refreshExpiresAt = new Date(
      Date.now() + REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
    );

    // Mark magic link used + create refresh token atomically
    await this.prisma.withTransaction(async (tx) => {
      await tx.magicLink.update({
        where: { id: magicLink.id },
        data: { usedAt: new Date() },
      });
      await tx.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: refreshTokenHash,
          expiresAt: refreshExpiresAt,
          userAgentHash: deviceFingerprint?.userAgentHash,
          ipAddress: deviceFingerprint?.ipAddress,
          acceptLanguage: deviceFingerprint?.acceptLanguage,
        },
      });
    });

    const { accessToken } = this.issueTokens({
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        emailVerified: !!user.emailVerified,
      },
      tokens: { accessToken, refreshToken: rawRefreshToken },
    };
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return;

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    void this.emailDeliveryService.enqueue({
      to: email,
      subject: 'Reset your password',
      template: 'password-reset',
      context: { token: rawToken },
    });
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');
    // Performance: Use select to fetch only needed fields (optimization #326)
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        expiresAt: true,
        usedAt: true,
        user: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!resetToken) {
      throw new UnauthorizedException('Invalid reset token');
    }

    if (resetToken.usedAt) {
      throw new UnauthorizedException('Reset token already used');
    }

    if (resetToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Reset token expired');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: { password: hashedPassword },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.refreshToken.deleteMany({
        where: { userId: resetToken.userId },
      }),
    ]);
  }

  async setupMfa(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const secret = speakeasy.generateSecret({
      name: `ClipCash (${user.email})`,
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: secret.base32, mfaEnabled: false },
    });

    const qrCodeDataUrl = secret.otpauth_url
      ? await QRCode.toDataURL(secret.otpauth_url)
      : null;

    return {
      secret: secret.base32,
      otpauthUrl: secret.otpauth_url,
      qrCodeDataUrl,
    };
  }

  async enableMfa(userId: number, code: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.mfaSecret) {
      throw new BadRequestException('MFA setup is required before enabling');
    }

    const valid = speakeasy.totp.verify({
      secret: user.mfaSecret,
      encoding: 'base32',
      token: code,
      window: 1,
    });

    if (!valid) {
      throw new UnauthorizedException('Invalid TOTP code');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true },
    });
  }

  async disableMfa(userId: number): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: false, mfaSecret: null },
    });
  }
}
