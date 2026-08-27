import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { DailyEarningsProcessor } from './daily-earnings.processor';
import { DailyEarningsAggregationService } from './daily-earnings-aggregation.service';
import {
  DAILY_EARNINGS_CRON,
  DAILY_EARNINGS_JOB,
  DAILY_EARNINGS_QUEUE,
  DAILY_EARNINGS_TIMEZONE,
} from './daily-earnings.queue';

describe('DailyEarningsProcessor (Issue #767)', () => {
  let processor: DailyEarningsProcessor;
  let queue: { add: jest.Mock };
  let aggregation: { aggregateDay: jest.Mock };

  beforeEach(async () => {
    queue = { add: jest.fn().mockResolvedValue({ id: 'repeat:1' }) };
    aggregation = {
      aggregateDay: jest.fn().mockResolvedValue({
        date: new Date('2026-03-14T00:00:00.000Z'),
        bucketsWritten: 2,
        earningsProcessed: 5,
        usersUpdated: 2,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DailyEarningsProcessor,
        { provide: getQueueToken(DAILY_EARNINGS_QUEUE), useValue: queue },
        { provide: DailyEarningsAggregationService, useValue: aggregation },
      ],
    }).compile();

    processor = module.get(DailyEarningsProcessor);
  });

  describe('onModuleInit', () => {
    it('registers a daily repeatable job at midnight UTC', async () => {
      await processor.onModuleInit();

      expect(queue.add).toHaveBeenCalledWith(
        DAILY_EARNINGS_JOB,
        {},
        expect.objectContaining({
          repeat: {
            pattern: DAILY_EARNINGS_CRON,
            tz: DAILY_EARNINGS_TIMEZONE,
          },
          jobId: `${DAILY_EARNINGS_JOB}-recurring`,
        }),
      );
    });

    it('schedules in UTC with the midnight cron expression', () => {
      expect(DAILY_EARNINGS_CRON).toBe('0 0 * * *');
      expect(DAILY_EARNINGS_TIMEZONE).toBe('UTC');
    });

    it('uses a stable jobId so restarts do not stack duplicate schedules', async () => {
      await processor.onModuleInit();
      await processor.onModuleInit();

      const jobIds = queue.add.mock.calls.map(([, , opts]) => opts.jobId);
      expect(new Set(jobIds).size).toBe(1);
    });
  });

  describe('process', () => {
    it('aggregates the previous day when the job carries no date', async () => {
      await processor.process({ id: '1', data: {} } as Job);

      expect(aggregation.aggregateDay).toHaveBeenCalledWith(undefined);
    });

    it('aggregates an explicit date when one is supplied (backfill)', async () => {
      await processor.process({
        id: '2',
        data: { date: '2026-03-01' },
      } as Job);

      const [passed] = aggregation.aggregateDay.mock.calls[0];
      expect(passed.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    });

    it('fails loudly on an unparseable date rather than aggregating the wrong day', async () => {
      await expect(
        processor.process({ id: '3', data: { date: 'not-a-date' } } as Job),
      ).rejects.toThrow('Invalid date');

      expect(aggregation.aggregateDay).not.toHaveBeenCalled();
    });

    it('propagates aggregation failures so BullMQ retries the job', async () => {
      aggregation.aggregateDay.mockRejectedValueOnce(new Error('db down'));

      await expect(
        processor.process({ id: '4', data: {} } as Job),
      ).rejects.toThrow('db down');
    });
  });
});
