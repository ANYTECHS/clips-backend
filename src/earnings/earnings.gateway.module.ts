import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { EarningsGateway } from './earnings.gateway';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '1h' },
    }),
  ],
  providers: [EarningsGateway],
  exports: [EarningsGateway],
})
export class EarningsGatewayModule {}