import { REGISTERED_QUEUE_NAMES } from './queue.module';

describe('QueueModule', () => {
  it('registers every application queue in one place', () => {
    expect(REGISTERED_QUEUE_NAMES).toEqual([
      'clip-generation',
      'clip-posting',
      'nft-mint',
      'email-delivery',
      'anomaly-detection',
    ]);
    expect(new Set(REGISTERED_QUEUE_NAMES).size).toBe(
      REGISTERED_QUEUE_NAMES.length,
    );
  });
});
