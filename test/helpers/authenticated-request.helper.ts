/**
 * Stable import path for E2E / integration specs that live under `test/`.
 *
 * The implementation lives in `src/testing/authenticated-request.util.ts` so it
 * is covered by the unit-test runner (`npm test`) and the coverage report,
 * following the same convention as `src/prisma/prisma-test-utils.ts`.
 *
 * See `docs/testing-strategy.md` for usage examples.
 */
export * from '../../src/testing/authenticated-request.util';
