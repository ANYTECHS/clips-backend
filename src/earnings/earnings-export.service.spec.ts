import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EarningsExportService } from './earnings-export.service';
import { PrismaService } from '../prisma/prisma.service';

describe('EarningsExportService', () => {
  let service: EarningsExportService;
  const findMany = jest.fn();

  beforeEach(async () => {
    findMany.mockReset();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EarningsExportService,
        {
          provide: PrismaService,
          useValue: { earning: { findMany } },
        },
      ],
    }).compile();

    service = module.get(EarningsExportService);
  });

  it('exports only the authenticated user earnings as CSV', async () => {
    findMany.mockResolvedValue([
      {
        id: 42,
        date: new Date('2025-03-01T12:00:00.000Z'),
        amount: 25.5,
        currency: 'USD',
        source: 'royalty',
        clip: { title: 'My Clip' },
      },
    ]);

    const result = await service.exportEarningsCsv(7, {
      startDate: '2025-01-01',
      endDate: '2025-12-31',
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clip: { video: { userId: 7 } },
          deletedAt: null,
        }),
      }),
    );
    expect(result.filename).toMatch(/^earnings-export-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(result.content).toContain(
      'date,clipTitle,amount,currency,source,transactionId',
    );
    expect(result.content).toContain('My Clip');
    expect(result.content).toContain(',42');
  });

  it('returns header-only CSV when there are no earnings', async () => {
    findMany.mockResolvedValue([]);

    const result = await service.exportEarningsCsv(1, {});

    expect(result.content).toBe(
      'date,clipTitle,amount,currency,source,transactionId\n',
    );
  });

  it('rejects invalid date ranges', async () => {
    await expect(
      service.exportEarningsCsv(1, {
        startDate: '2025-12-31',
        endDate: '2025-01-01',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects malformed dates', async () => {
    await expect(
      service.exportEarningsCsv(1, { startDate: 'not-a-date' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('escapes clip titles with commas', async () => {
    findMany.mockResolvedValue([
      {
        id: 1,
        date: new Date('2025-01-01T00:00:00.000Z'),
        amount: 1,
        currency: 'USD',
        source: 'royalty',
        clip: { title: 'Clip, Part 2' },
      },
    ]);

    const result = await service.exportEarningsCsv(1, {});
    expect(result.content).toContain('"Clip, Part 2"');
  });
});
