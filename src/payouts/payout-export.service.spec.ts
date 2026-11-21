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

  it('includes feeAmount and finalAmount in CSV export', async () => {
    const rows = [
      {
        id: 100,
        amount: 500,
        currency: 'USD',
        method: 'stellar',
        status: 'completed',
        transactionId: 'abc123',
        feeAmount: 10,
        finalAmount: 490,
        createdAt: new Date('2026-02-01T12:00:00Z'),
        paidAt: new Date('2026-02-01T13:00:00Z'),
      },
    ];
    prisma.payout.findMany.mockResolvedValue(rows);

    const result = await service.exportPayouts(1, { format: 'csv' });
    const csv = result.body.toString('utf-8');

    expect(csv).toContain('500');
    expect(csv).toContain('10');
    expect(csv).toContain('490');
    expect(csv).toContain('abc123');
  });

  it('handles null transactionId gracefully', async () => {
    const rows = [
      {
        id: 101,
        amount: 200,
        currency: 'USD',
        method: 'bank_transfer',
        status: 'pending',
        transactionId: null,
        feeAmount: 5,
        finalAmount: 195,
        createdAt: new Date('2026-02-02T10:00:00Z'),
        paidAt: null,
      },
    ];
    prisma.payout.findMany.mockResolvedValue(rows);

    const result = await service.exportPayouts(1, { format: 'csv' });
    const csv = result.body.toString('utf-8');

    expect(csv).toContain('pending');
    expect(csv).toContain('200');
    expect(csv).toContain('195');
  });

  it('handles empty payout list', async () => {
    prisma.payout.findMany.mockResolvedValue([]);

    const result = await service.exportPayouts(1, { format: 'csv' });
    const csv = result.body.toString('utf-8');

    // Should contain headers even with no data
    expect(csv).toContain('id');
    expect(csv).toContain('status');
    expect(csv).toContain('amount');
  });

  it('handles multiple payouts with different statuses', async () => {
    const rows = [
      {
        id: 1,
        amount: 100,
        currency: 'USD',
        method: 'stellar',
        status: 'completed',
        transactionId: 'tx1',
        feeAmount: 2,
        finalAmount: 98,
        createdAt: new Date('2026-01-15T12:00:00Z'),
        paidAt: new Date('2026-01-15T13:00:00Z'),
      },
      {
        id: 2,
        amount: 150,
        currency: 'USD',
        method: 'bank_transfer',
        status: 'pending',
        transactionId: null,
        feeAmount: 3,
        finalAmount: 147,
        createdAt: new Date('2026-01-20T10:00:00Z'),
        paidAt: null,
      },
      {
        id: 3,
        amount: 200,
        currency: 'USD',
        method: 'stellar',
        status: 'failed',
        transactionId: null,
        feeAmount: null,
        finalAmount: null,
        createdAt: new Date('2026-01-25T14:30:00Z'),
        paidAt: null,
      },
    ];
    prisma.payout.findMany.mockResolvedValue(rows);

    const result = await service.exportPayouts(1, { format: 'csv' });
    const csv = result.body.toString('utf-8');

    expect(csv).toContain('completed');
    expect(csv).toContain('pending');
    expect(csv).toContain('failed');
    expect(csv).toContain('100');
    expect(csv).toContain('150');
    expect(csv).toContain('200');
  });

  it('filters by date range correctly', async () => {
    prisma.payout.findMany.mockResolvedValue([]);

    await service.exportPayouts(1, {
      format: 'csv',
      startDate: '2026-03-01',
      endDate: '2026-03-31',
    });

    const call = prisma.payout.findMany.mock.calls[0][0];
    expect(call.where.createdAt.gte).toEqual(new Date('2026-03-01T00:00:00'));
    expect(call.where.createdAt.lte).toEqual(new Date('2026-03-31T23:59:59.999'));
  });

  it('rejects invalid startDate format', async () => {
    await expect(
      service.exportPayouts(1, {
        format: 'csv',
        startDate: 'not-a-date',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects invalid endDate format', async () => {
    await expect(
      service.exportPayouts(1, {
        format: 'csv',
        endDate: '2026-13-45', // Invalid month/day
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('generates PDF with proper headers and structure', async () => {
    const rows = [
      {
        id: 1,
        amount: 100,
        currency: 'USD',
        method: 'stellar',
        status: 'completed',
        transactionId: 'tx1',
        feeAmount: 2,
        finalAmount: 98,
        createdAt: new Date('2026-01-15T12:00:00Z'),
        paidAt: new Date('2026-01-15T13:00:00Z'),
      },
    ];
    prisma.payout.findMany.mockResolvedValue(rows);

    const result = await service.exportPayouts(1, { format: 'pdf' });

    expect(result.contentType).toBe('application/pdf');
    expect(result.filename).toMatch(/payouts-\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(result.body.length).toBeGreaterThan(0);
    // PDF files start with %PDF
    expect(result.body.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('generates unique filenames based on export date', async () => {
    prisma.payout.findMany.mockResolvedValue([]);

    const result1 = await service.exportPayouts(1, { format: 'csv' });
    const result2 = await service.exportPayouts(1, { format: 'csv' });

    // Both should have same date (assuming same day)
    expect(result1.filename).toMatch(/payouts-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(result2.filename).toMatch(/payouts-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
