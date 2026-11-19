import { BullModule } from '@nestjs/bullmq';
import { registerQueue } from './queue-registration.helper';
import {
  CLIP_GENERATION_QUEUE,
  CLIP_GENERATION_QUEUE_PRIORITY,
} from '../../clips/clip-generation.queue';
import {
  NFT_MINT_QUEUE,
  NFT_MINT_QUEUE_PRIORITY,
} from '../../clips/nft-mint.queue';
import {
  CLIP_POSTING_QUEUE,
  CLIP_POSTING_QUEUE_PRIORITY,
} from '../../clips/clip-posting.queue';
import {
  ANOMALY_DETECTION_QUEUE,
  ANOMALY_DETECTION_QUEUE_PRIORITY,
} from '../../earnings/anomaly-detection.queue';
import {
  EMAIL_DELIVERY_QUEUE,
  EMAIL_DELIVERY_QUEUE_PRIORITY,
} from '../../auth/email-delivery.queue';

jest.mock('@nestjs/bullmq', () => ({
  BullModule: {
    registerQueue: jest.fn((options: unknown) => ({
      module: class FakeBullModule {},
      providers: [],
      exports: [],
      __options: options,
    })),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/unbound-method
const registerQueueMock: jest.Mock = BullModule.registerQueue;

interface RegisterQueueOptions {
  name: string;
  defaultJobOptions: { priority: number };
}

const optionsFor = (name: string): RegisterQueueOptions | undefined => {
  const calls = registerQueueMock.mock.calls as unknown as [
    [RegisterQueueOptions],
  ][];
  const seen = calls.map((call) => call[0]);
  return seen.find((options) => options.name === name);
};

describe('registerQueue', () => {
  beforeEach(() => {
    registerQueueMock.mockClear();
  });

  it('registers a BullMQ dynamic module for the given queue name', () => {
    const dynamicModule = registerQueue(CLIP_GENERATION_QUEUE);

    expect(dynamicModule).toBeDefined();
    expect(registerQueueMock).toHaveBeenCalledTimes(1);
    expect(optionsFor(CLIP_GENERATION_QUEUE)).toBeDefined();
  });

  it('uses the declared priority for the clip-generation queue', () => {
    registerQueue(CLIP_GENERATION_QUEUE);

    expect(optionsFor(CLIP_GENERATION_QUEUE)?.defaultJobOptions.priority).toBe(
      CLIP_GENERATION_QUEUE_PRIORITY,
    );
  });

  it('uses the declared priority for the nft-mint queue', () => {
    registerQueue(NFT_MINT_QUEUE);

    expect(optionsFor(NFT_MINT_QUEUE)?.defaultJobOptions.priority).toBe(
      NFT_MINT_QUEUE_PRIORITY,
    );
  });

  it('uses the declared priority for the clip-posting queue', () => {
    registerQueue(CLIP_POSTING_QUEUE);

    expect(optionsFor(CLIP_POSTING_QUEUE)?.defaultJobOptions.priority).toBe(
      CLIP_POSTING_QUEUE_PRIORITY,
    );
  });

  it('uses the declared priority for the anomaly-detection queue', () => {
    registerQueue(ANOMALY_DETECTION_QUEUE);

    expect(
      optionsFor(ANOMALY_DETECTION_QUEUE)?.defaultJobOptions.priority,
    ).toBe(ANOMALY_DETECTION_QUEUE_PRIORITY);
  });

  it('uses the declared priority for the email-delivery queue', () => {
    registerQueue(EMAIL_DELIVERY_QUEUE);

    expect(optionsFor(EMAIL_DELIVERY_QUEUE)?.defaultJobOptions.priority).toBe(
      EMAIL_DELIVERY_QUEUE_PRIORITY,
    );
  });

  it('falls back to priority 5 for an unregistered queue name', () => {
    registerQueue('some-unknown-queue');

    expect(optionsFor('some-unknown-queue')).toEqual({
      name: 'some-unknown-queue',
      defaultJobOptions: { priority: 5 },
    });
  });

  it('does not alias one queue name onto another', () => {
    registerQueue(CLIP_GENERATION_QUEUE);
    registerQueue(NFT_MINT_QUEUE);

    expect(optionsFor(CLIP_GENERATION_QUEUE)?.name).toBe(CLIP_GENERATION_QUEUE);
    expect(optionsFor(NFT_MINT_QUEUE)?.name).toBe(NFT_MINT_QUEUE);
  });
});
