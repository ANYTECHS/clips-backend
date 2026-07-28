import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { GoogleStrategy } from './strategies/google.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { IsStrongPasswordConstraint } from './validators/is-strong-password.validator';
import { MailService } from './mail.service';
import { CookieService } from './cookie.service';
import { DeviceFingerprintService } from './device-fingerprint.service';
import { BruteForceProtectionService } from './brute-force-protection.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CsrfModule } from '../csrf/csrf.module';
import { BullModule } from '@nestjs/bullmq';
import {
  EMAIL_DELIVERY_QUEUE,
  EMAIL_DELIVERY_QUEUE_PRIORITY,
} from './email-delivery.queue';
import { EmailDeliveryService } from './email-delivery.service';
import { EmailDeliveryProcessor } from './email-delivery.processor';
import { EncryptionModule } from '../encryption/encryption.module';
import { StellarModule } from '../stellar/stellar.module';
import { RedisModule } from '../redis/redis.module';
import { AdminGuard } from './guards/admin.guard';
import { registerQueue } from '../common';
import { QueueOverflowService } from '../common/queue/queue-overflow.service';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    EncryptionModule,
    StellarModule,
    RedisModule,
    PassportModule.register({ session: false }),
    JwtModule.registerAsync({
      useFactory: () => {
        const expires =
          Number(process.env.JWT_EXPIRES) && Number(process.env.JWT_EXPIRES) > 0
            ? Number(process.env.JWT_EXPIRES)
            : 3600;
        return {
          secret: process.env.JWT_SECRET || 'dev_jwt_secret',
          signOptions: { expiresIn: expires },
        };
      },
    }),
    CsrfModule,
    registerQueue(EMAIL_DELIVERY_QUEUE),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    GoogleStrategy,
    JwtStrategy,
    IsStrongPasswordConstraint,
    MailService,
    CookieService,
    DeviceFingerprintService,
    BruteForceProtectionService,
    EmailDeliveryService,
    EmailDeliveryProcessor,
    AdminGuard,
    QueueOverflowService,
  ],
})
export class AuthModule {}
