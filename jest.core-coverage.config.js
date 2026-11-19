/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Coverage audit for the core modules targeted by #1026.
 *
 * The repository-wide `npm run test:cov` gate stays at the existing 35%
 * threshold. This config is a *focused* gate: it runs only the suites that
 * cover the critical backend modules and enforces 80%+ on the modules
 * themselves, so regressions in Clips / Videos / Web3 / Earnings / Payouts /
 * queue-processor code are caught without waiting for the global report.
 *
 * Usage: `npm run test:cov:core`
 */
const CORE_MODULE_COVERAGE_PATTERNS = [
  'payouts/payout-state-machine.service.ts',
  'payouts/payout-retry-strategy.service.ts',
  'queue/retry-backoff-config.service.ts',
  'common/helpers/queue-registration.helper.ts',
  'videos/helpers/video-stats.helper.ts',
  'videos/helpers/video-validation.helper.ts',
  'videos/helpers/video-metadata.helper.ts',
  'clips/caption.util.ts',
  'nft/gas-metrics.service.ts',
  'earnings/currency-conversion.service.ts',
];

const CORE_SUITE_PATTERN =
  '(payout-state-machine|payout-retry-strategy|retry-backoff-config|queue-registration|video-stats|video-validation|video-metadata|caption|gas-metrics|currency-conversion)(\\.[a-z-]+)?\\.spec\\.ts$';

const base = require('./package.json').jest;

module.exports = {
  ...base,
  rootDir: 'src',
  testRegex: CORE_SUITE_PATTERN,
  collectCoverage: true,
  collectCoverageFrom: CORE_MODULE_COVERAGE_PATTERNS,
  coverageReporters: ['text', 'json-summary', 'lcov'],
  coverageDirectory: '../coverage/core-modules',
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80,
    },
  },
};
