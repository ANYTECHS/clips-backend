import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EarningsController } from './earnings.controller';
import { LeaderboardService } from './leaderboard.service';

@Module({
  controllers: [EarningsController],
  providers: [LeaderboardService, PrismaService],
  exports: [LeaderboardService],
})
export class EarningsModule {}
