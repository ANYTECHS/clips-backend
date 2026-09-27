import { BadRequestException } from '@nestjs/common';
import { PayoutExportService } from './payout-export.service';

describe('PayoutExportService', () => {
  let service: PayoutExportService;
  let prisma: { payout: { findMany: jest.Mock } };

  const sampleRows = [
    {
      id: 1,
      amount: 100,
      currency: 'USD',
      method: 'stellar',
      status: 'completed',
      transactionId: 'tx_abc',
      feeAmount: 2,
      finalAmount: 98,
      createdAt: new Date('2026-01-15T12:00:00.000Z'),
      paidAt: new Date('2026-01-15T13:00:00.000Z'),
    },
  ];

  beforeEach(() => {
    prisma = { payout: { findMany: jest.fn().mockResolvedValue(sampleRows) } };
    service = new PayoutExportService(prisma as any);
  });

  it('exports CSV with status, amount, currency, method, transactionId', async () => {
    const result = await service.exportPayouts(7, { format: 'csv' });

    expect(result.contentType).toContain('text/csv');
    expect(result.filename).toMatch(/\.csv$/);
    const text = result.body.toString('utf-8');
    expect(text).toContain('status');
    expect(text).toContain('completed');
    expect(text).toContain('stellar');
    expect(text).toContain('tx_abc');
    expect(text).toContain('100');
    expect(prisma.payout.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 7 }),
      }),
    );
  });

  it('exports PDF buffer', async () => {
    const result = await service.exportPayouts(7, { format: 'pdf' });
    expect(result.contentType).toBe('application/pdf');
    expect(result.filename).toMatch(/\.pdf$/);
    expect(result.body.length).toBeGreaterThan(0);
    expect(result.body.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('rejects invalid format', async () => {
    await expect(
      service.exportPayouts(1, { format: 'xlsx' as any }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('applies date filters', async () => {
    await service.exportPayouts(1, {
      format: 'csv',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    });

    const arg = prisma.payout.findMany.mock.calls[0][0];
    expect(arg.where.createdAt.gte).toBeInstanceOf(Date);
    expect(arg.where.createdAt.lte).toBeInstanceOf(Date);
  });

  it('escapes CSV fields with commas', () => {
    const csv = service.toCsv([
      {
        ...sampleRows[0],
        method: 'bank, transfer',
        transactionId: 'a,"b"',
      },
    ]);
    expect(csv).toContain('"bank, transfer"');
    expect(csv).toContain('"a,""b"""');
  });
});
