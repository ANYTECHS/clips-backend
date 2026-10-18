import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { EmailDeliveryService } from './email-delivery.service';
import { EMAIL_DELIVERY_QUEUE } from './email-delivery.queue';
import { QueueOverflowService } from '../common/queue/queue-overflow.service';

describe('EmailDeliveryService', () => {
  it('enqueues email with retry/backoff settings', async () => {
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const queueOverflowService = {
      enqueue: jest.fn(async ({ queue: q, jobName, data, baseOptions }) => {
        await q.add(jobName, data, baseOptions);
        return { jobId: 'job-1', delayed: false, delayMs: 0 };
      }),
    };

    const module = await Test.createTestingModule({
      providers: [
        EmailDeliveryService,
        { provide: getQueueToken(EMAIL_DELIVERY_QUEUE), useValue: queue },
        { provide: QueueOverflowService, useValue: queueOverflowService },
        {
          provide: ConfigService,
          useValue: { get: jest.fn(() => undefined) },
        },
      ],
    }).compile();

    const service = module.get(EmailDeliveryService);
    await service.enqueue({
      to: 'user@example.com',
      subject: 'Verify your email address',
      template: 'verification',
      context: { token: 'abc' },
    });

    expect(queue.add).toHaveBeenCalledWith(
      'deliver-email',
      expect.any(Object),
      expect.objectContaining({
        attempts: 5,
        backoff: { type: 'exponential', delay: 500 },
      }),
    );
  });
});
