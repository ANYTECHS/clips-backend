// Manual mock for cockatiel (ESM-only package — not compatible with Jest's CommonJS transform)

export class SamplingBreaker {
  constructor(public readonly opts: { threshold: number; duration: number }) {}
}

type BreakerState = {
  totalCalls: number;
  failures: number;
  isOpen: boolean;
  onBreakCb?: () => void;
  onResetCb?: () => void;
  onHalfOpenCb?: () => void;
};

export const circuitBreaker = jest.fn(
  (_handler: unknown, opts: { breaker?: SamplingBreaker }) => {
    const threshold = opts?.breaker?.opts?.threshold ?? 0.5;
    const state: BreakerState = {
      totalCalls: 0,
      failures: 0,
      isOpen: false,
    };

    return {
      execute: jest.fn(async (fn: () => Promise<unknown>) => {
        if (state.isOpen) {
          const err = new Error('Circuit is open');
          err.name = 'BrokenCircuitError';
          throw err;
        }
        state.totalCalls++;
        try {
          return await fn();
        } catch (e) {
          state.failures++;
          const rate = state.failures / state.totalCalls;
          if (state.failures > 0 && rate >= threshold) {
            state.isOpen = true;
            state.onBreakCb?.();
          }
          throw e;
        }
      }),
      onBreak: jest.fn((cb: () => void) => {
        state.onBreakCb = cb;
      }),
      onReset: jest.fn((cb: () => void) => {
        state.onResetCb = cb;
        state.isOpen = false;
        state.failures = 0;
        state.totalCalls = 0;
      }),
      onHalfOpen: jest.fn((cb: () => void) => {
        state.onHalfOpenCb = cb;
      }),
    };
  },
);

export const handleAll = {};

export class ConsecutiveBreaker {
  constructor(_count: number) {}
}

export type CircuitBreakerPolicy = ReturnType<typeof circuitBreaker>;
