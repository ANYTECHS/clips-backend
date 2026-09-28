import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EarningsAggregationService } from './earnings-aggregation.service';
import { PrismaService } from '../prisma/prisma.service';
import { CurrencyConversionService } from './currency-conversion.service';
import { RedisService } from '../redis/redis.service';
import { ConfigService } from '../config/config.service';

describe('EarningsAggregationService soft delete', () => {
  let service: EarningsAggregationService;
  let prisma: any;
  let redis: { del: jest.Mock };

  beforeEach(async () => {
    prisma = {
      earning: {
        findUnique: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        aggregate: jest.fn(),
      },
    };
    redis = { del: jest.fn().mockResolvedValue(1) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EarningsAggregationService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: CurrencyConversionService,
          useValue: {
            convert: jest.fn((amount: number) => amount),
          },
        },
        { provide: RedisService, useValue: redis },
        {
          provide: ConfigService,
          useValue: { earningsCacheTtlSeconds: 3600, leaderboardEnabled: true },
        },
      ],
    }).compile();

    service = module.get(EarningsAggregationService);
  });

  it('soft-deletes by setting deletedAt', async () => {
    prisma.earning.findUnique.mockResolvedValue({
      id: 1,
      deletedAt: null,
      clip: { video: { userId: 42 } },
    });
    prisma.earning.update.mockResolvedValue({
      id: 1,
      deletedAt: new Date(),
    });

    const result = await service.softDelete(1, 42);

    expect(result.message).toMatch(/deleted/i);
    expect(prisma.earning.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { deletedAt: expect.any(Date) },
    });
    expect(redis.del).toHaveBeenCalled();
  });

  it('returns 404 for missing, foreign, or already-deleted earnings', async () => {
    prisma.earning.findUnique.mockResolvedValue(null);
    await expect(service.softDelete(1, 42)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    prisma.earning.findUnique.mockResolvedValue({
      id: 1,
      deletedAt: null,
      clip: { video: { userId: 99 } },
    });
    await expect(service.softDelete(1, 42)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    prisma.earning.findUnique.mockResolvedValue({
      id: 1,
      deletedAt: new Date(),
      clip: { video: { userId: 42 } },
    });
    await expect(service.softDelete(1, 42)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('restores a soft-deleted earning for admin recovery', async () => {
    prisma.earning.findUnique.mockResolvedValue({
      id: 5,
      deletedAt: new Date(),
      clip: { video: { userId: 7 } },
    });
    prisma.earning.update.mockResolvedValue({ id: 5, deletedAt: null });

    const result = await service.restore(5);

    expect(result).toEqual({
      message: 'Earning restored successfully',
      id: 5,
      deletedAt: null,
    });
    expect(prisma.earning.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { deletedAt: null },
    });
  });

  it('restore returns 404 when earning is not soft-deleted', async () => {
    prisma.earning.findUnique.mockResolvedValue({
      id: 5,
      deletedAt: null,
      clip: { video: { userId: 7 } },
    });

    await expect(service.restore(5)).rejects.toBeInstanceOf(NotFoundException);
  });
});
