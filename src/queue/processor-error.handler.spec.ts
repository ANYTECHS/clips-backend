import { UnrecoverableError } from 'bullmq';
import {
  computeBackoffDelayMs,
  getMaxAttempts,
  handleFailedEvent,
  handleProcessingError,
  isFinalAttempt,
  isPermanentFailure,
  logProcessorFailure,
  wrapProcessorError,
} from './processor-error.handler';

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    attemptsMade: 1,
    opts: { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
    data: {},
    failedReason: undefined,
    ...overrides,
  } as never;
}

describe('processor-error.handler (Issue #1235)', () => {
  describe('getMaxAttempts / isFinalAttempt', () => {
    it('defaults max attempts to 1 when unset', () => {
      expect(getMaxAttempts({ opts: {} } as never)).toBe(1);
    });

    it('marks the job final once attemptsMade >= attempts', () => {
      expect(isFinalAttempt(makeJob({ attemptsMade: 2 }))).toBe(false);
      expect(isFinalAttempt(makeJob({ attemptsMade: 3 }))).toBe(true);
      expect(isFinalAttempt(makeJob({ attemptsMade: 5 }))).toBe(true);
    });
  });

  describe('computeBackoffDelayMs', () => {
    it('computes exponential backoff delay * 2^(n-1)', () => {
      expect(computeBackoffDelayMs(makeJob({ attemptsMade: 1 }))).toBe(1000);
      expect(computeBackoffDelayMs(makeJob({ attemptsMade: 2 }))).toBe(2000);
      expect(computeBackoffDelayMs(makeJob({ attemptsMade: 3 }))).toBe(4000);
    });

    it('returns 0 when no backoff is configured', () => {
      expect(computeBackoffDelayMs(makeJob({ opts: { attempts: 3 } }))).toBe(0);
    });
  });

  describe('isPermanentFailure', () => {
    it('treats UnrecoverableError as permanent', () => {
      expect(isPermanentFailure(new UnrecoverableError('nope'))).toBe(true);
    });

    it('treats validation errors as permanent', () => {
      expect(isPermanentFailure(new Error('Invalid date in job'))).toBe(true);
      expect(isPermanentFailure(new Error('Not Found'))).toBe(true);
    });

    it('treats transient errors as retryable', () => {
      expect(isPermanentFailure(new Error('ECONNRESET'))).toBe(false);
      expect(isPermanentFailure(new Error('Cloudinary timeout'))).toBe(false);
    });
  });

  describe('wrapProcessorError', () => {
    it('prefixes errors with [queue:jobId] consistently', () => {
      const wrapped = wrapProcessorError('clip-generation', { id: 'abc' } as never, new Error('boom'));
      expect(wrapped.message).toBe('[clip-generation:abc] boom');
    });

    it('converts permanent failures to UnrecoverableError', () => {
      const wrapped = wrapProcessorError('daily-earnings', { id: '1' } as never, new Error('Invalid date'));
      expect(wrapped).toBeInstanceOf(UnrecoverableError);
    });
  });

  describe('logProcessorFailure / handleFailedEvent', () => {
    it('warns on retryable attempts and errors only on final failure', () => {
      const logger = { warn: jest.fn(), error: jest.fn() };
      logProcessorFailure(logger, 'email-delivery', makeJob({ attemptsMade: 1 }), new Error('smtp down'));
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.error).not.toHaveBeenCalled();

      const finalLogger = { warn: jest.fn(), error: jest.fn() };
      logProcessorFailure(finalLogger, 'email-delivery', makeJob({ attemptsMade: 3 }), new Error('smtp down'));
      expect(finalLogger.error).toHaveBeenCalledTimes(1);
      expect(finalLogger.warn).not.toHaveBeenCalled();
    });

    it('records final_failure metrics exactly once', () => {
      const logger = { warn: jest.fn(), error: jest.fn() };
      const metrics = { recordJobFailure: jest.fn() };
      handleFailedEvent(logger, metrics, 'nft-mint', makeJob({ attemptsMade: 1 }), new Error('rpc down'));
      expect(metrics.recordJobFailure).not.toHaveBeenCalled();
      handleFailedEvent(logger, metrics, 'nft-mint', makeJob({ attemptsMade: 3 }), new Error('rpc down'));
      expect(metrics.recordJobFailure).toHaveBeenCalledWith('nft-mint', 'final_failure');
    });
  });

  describe('handleProcessingError', () => {
    it('records metrics, logs, and rethrows a wrapped error', () => {
      const logger = { error: jest.fn() };
      const metrics = { recordJobCompletion: jest.fn(), recordJobFailure: jest.fn() };
      expect(() =>
        handleProcessingError(logger, metrics, 'payout-retry', makeJob(), 'payout-retry:job-1', new Error('boom')),
      ).toThrow('[payout-retry:job-1] boom');
      expect(metrics.recordJobCompletion).toHaveBeenCalledWith('payout-retry:job-1', 'payout-retry', 'failure');
      expect(metrics.recordJobFailure).toHaveBeenCalledWith('payout-retry', 'boom');
      expect(logger.error).toHaveBeenCalledTimes(1);
    });
  });
});
