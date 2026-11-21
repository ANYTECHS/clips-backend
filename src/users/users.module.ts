import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsernameAvailabilityService } from './username-availability.service';
import { UsersController } from './users.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { EncryptionModule } from '../encryption/encryption.module';

@Module({
  imports: [PrismaModule, EncryptionModule],
  providers: [UsersService, UsernameAvailabilityService],
  controllers: [UsersController],
  exports: [UsersService, UsernameAvailabilityService],
})
export class UsersModule {}
