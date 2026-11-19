import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { UserRepository } from './repositories/user.repository';
import { ClipRepository } from './repositories/clip.repository';
import { EarningRepository } from './repositories/earning.repository';
import { PayoutRepository } from './repositories/payout.repository';

@Global()
@Module({
  providers: [PrismaService, UserRepository, ClipRepository, EarningRepository, PayoutRepository],
  exports: [PrismaService, UserRepository, ClipRepository, EarningRepository, PayoutRepository],
})
export class PrismaModule {}
