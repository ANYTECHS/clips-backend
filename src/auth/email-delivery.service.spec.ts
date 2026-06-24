import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { EmailDeliveryService } from './email-delivery.service';
import { EMAIL_DELIVERY_QUEUE } from './email-delivery.queue';

describe('EmailDeliveryService', () => {
  it('enqueues email with retry/backoff settings', async () => {
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const module = await Test.createTestingModule({
      providers: [
        EmailDeliveryService,
        { provide: getQueueToken(EMAIL_DELIVERY_QUEUE), useValue: queue },
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
