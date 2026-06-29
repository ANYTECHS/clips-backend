import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EncryptionModule } from '../encryption/encryption.module';
import { UserPlatformService } from './user-platform.service';
import { UserPlatformController } from './user-platform.controller';
import { StellarModule } from '../stellar/stellar.module';

@Module({
  imports: [PrismaModule, EncryptionModule, StellarModule],
  controllers: [UserPlatformController],
  providers: [UserPlatformService],
  exports: [UserPlatformService],
})
export class UserPlatformModule {}
