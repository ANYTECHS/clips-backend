import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UserPlatformService } from './user-platform.service';

@Module({
  imports: [PrismaModule],
  providers: [UserPlatformService],
  exports: [UserPlatformService],
})
export class UserPlatformModule {}
