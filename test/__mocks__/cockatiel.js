// Minimal stub for the cockatiel ESM package used by CircuitBreakerService.
// This allows e2e tests to run without needing ESM support in Jest.
const noop = () => {};
const passthrough = (fn) => fn();

module.exports = {
  circuitBreaker: () => ({ execute: passthrough, onBreak: noop, onReset: noop }),
  SamplingBreaker: class SamplingBreaker {},
  CircuitBreakerPolicy: class CircuitBreakerPolicy {
    execute(fn) { return fn(); }
    onBreak() {}
    onReset() {}
  },
  ConsecutiveBreaker: class ConsecutiveBreaker {},
  handleAll: { orWhenResult: () => ({}) },
};
