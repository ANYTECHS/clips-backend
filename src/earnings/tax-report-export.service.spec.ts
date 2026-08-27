import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TaxReportExportService } from './tax-report-export.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TaxReportExportService', () => {
  let service: TaxReportExportService;

  const mockPrisma = {
    earning: {
      findMany: jest.fn(),
    },
    payout: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaxReportExportService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(TaxReportExportService);
    jest.clearAllMocks();
  });

  it('builds a yearly CSV with earnings and payout history', async () => {
    mockPrisma.earning.findMany.mockResolvedValue([
      {
        date: new Date('2024-03-15T00:00:00.000Z'),
        amount: 120,
        currency: 'USD',
        source: 'royalty',
        clip: { title: 'March Clip' },
      },
    ]);
    mockPrisma.payout.findMany.mockResolvedValue([
      {
        createdAt: new Date('2024-04-01T00:00:00.000Z'),
        amount: 80,
        currency: 'USD',
        status: 'completed',
        transactionId: 'abc123',
        onChainTxHash: null,
        method: 'stellar',
      },
    ]);

    const result = await service.exportTaxReportCsv(9, 2024);

    expect(result.filename).toBe('tax-report-2024.csv');
    expect(result.totalEarnings).toBe(120);
    expect(result.totalPayouts).toBe(80);
    expect(result.content).toContain('recordType,date,description,amount,currency,status,transactionId');
    expect(result.content).toContain('earning,2024-03-15T00:00:00.000Z,March Clip,120,USD,recorded,');
    expect(result.content).toContain('payout,2024-04-01T00:00:00.000Z,Payout via stellar,80,USD,completed,abc123');
  });

  it('rejects invalid years', async () => {
    await expect(service.exportTaxReportCsv(1, 1999)).rejects.toThrow(
      BadRequestException,
    );
  });
});
