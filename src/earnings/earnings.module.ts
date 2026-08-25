import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EarningsController } from './earnings.controller';
import { LeaderboardService } from './leaderboard.service';

@Module({
  controllers: [EarningsController],
  providers: [LeaderboardService, PrismaService],
  exports: [LeaderboardService],
import { EarningsService } from './earnings.service';
import { EarningsController } from './earnings.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { CommonModule } from '../common/common.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, RedisModule, CommonModule, AuthModule],
  controllers: [EarningsController],
  providers: [EarningsService],
  exports: [EarningsService],
})
export class EarningsModule {}
