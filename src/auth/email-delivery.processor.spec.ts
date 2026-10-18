import { Job } from 'bullmq';
import { EmailDeliveryJobData, EMAIL_JOB_OPTIONS } from './email-delivery.queue';

jest.mock('../metrics/metrics.service', () => ({ MetricsService: class {} }));
jest.mock('../config/bullmq.config', () => ({
  getBullMQWorkerConfig: jest.fn().mockReturnValue({ emailDeliveryConcurrency: 5 }),
}));
jest.mock('../common/shutdown/graceful-shutdown.service', () => ({
  GracefulShutdownService: class {
    register() {}
  },
}));

import { EmailDeliveryProcessor } from './email-delivery.processor';

const mockMailService = {
  sendTemplatedEmail: jest.fn(),
};
const mockMetricsService = {
  recordJobStart: jest.fn(),
  recordJobCompletion: jest.fn(),
  recordJobFailure: jest.fn(),
};
const mockShutdownService = {
  register: jest.fn(),
};

function makeProcessor() {
  return new EmailDeliveryProcessor(
    mockMailService as any,
    mockMetricsService as any,
    mockShutdownService as any,
  );
}

function makeJob(overrides: Partial<Job<EmailDeliveryJobData>> = {}): Job<EmailDeliveryJobData> {
  return {
    id: 'job-1',
    attemptsMade: 0,
    opts: { attempts: EMAIL_JOB_OPTIONS.attempts },
    data: {
      to: 'user@example.com',
      subject: 'Verify your email address',
      template: 'verification',
      context: { token: 'abc' },
    },
    ...overrides,
  } as Job<EmailDeliveryJobData>;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('EmailDeliveryProcessor', () => {
  it('throws when SMTP send fails so BullMQ can retry', async () => {
    mockMailService.sendTemplatedEmail.mockRejectedValue(
      new Error('SMTP temporarily unavailable'),
    );
    const processor = makeProcessor();

    await expect(processor.process(makeJob())).rejects.toThrow(
      'SMTP temporarily unavailable',
    );
    expect(mockMetricsService.recordJobFailure).toHaveBeenCalled();
  });
});

describe('EmailDeliveryProcessor.onFailed()', () => {
  it('does not record final_failure on intermediate attempts', () => {
    const processor = makeProcessor();
    const job = makeJob({ attemptsMade: 1 });

    processor.onFailed(job, new Error('transient'));

    expect(mockMetricsService.recordJobFailure).not.toHaveBeenCalledWith(
      'email-delivery',
      'final_failure',
    );
  });

  it('records final_failure metric after all attempts are exhausted', () => {
    const processor = makeProcessor();
    const job = makeJob({ attemptsMade: EMAIL_JOB_OPTIONS.attempts });

    processor.onFailed(job, new Error('permanent failure'));

    expect(mockMetricsService.recordJobFailure).toHaveBeenCalledWith(
      'email-delivery',
      'final_failure',
    );
  });
});

describe('EMAIL_JOB_OPTIONS', () => {
  it('configures 5 attempts with exponential backoff at 500ms', () => {
    expect(EMAIL_JOB_OPTIONS.attempts).toBe(5);
    expect(EMAIL_JOB_OPTIONS.backoff.type).toBe('exponential');
    expect(EMAIL_JOB_OPTIONS.backoff.delay).toBe(500);
  });

  it('removes completed jobs and keeps failed ones', () => {
    expect(EMAIL_JOB_OPTIONS.removeOnComplete).toBe(true);
    expect(EMAIL_JOB_OPTIONS.removeOnFail).toBe(false);
  });
});
