import { Test, TestingModule } from '@nestjs/testing';
import { EarningsGateway } from './earnings.gateway';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

describe('EarningsGateway', () => {
  let gateway: EarningsGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EarningsGateway,
        {
          provide: JwtService,
          useValue: { verify: jest.fn().mockReturnValue({ userId: 1 }) },
        },
        {
          provide: PrismaService,
          useValue: {
            earning: {
              aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 100 } }),
              findMany: jest.fn().mockResolvedValue([]),
            },
            payout: {
              aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
            },
          },
        },
        {
          provide: RedisService,
          useValue: { setex: jest.fn(), get: jest.fn() },
        },
      ],
    }).compile();

    gateway = module.get(EarningsGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('emitEarningsUpdated', () => {
    it('does nothing when no sockets for user', async () => {
      await gateway.emitEarningsUpdated(999, { total: 100 });
    });
  });
});