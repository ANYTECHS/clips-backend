# Pull Request: Virality Score Placeholder & Earnings Dashboard Fix

## Description
This PR implements the placeholder virality score calculation and fixes the earnings dashboard implementation.

- Added `calculateViralityScore` utility based on clip duration, position, and keyword density.
- Updated `EarningsService.getEarningsDashboard` to compute total earnings, pending payouts, paid earnings, and current balance.
- Fixed syntax errors in `nft-mint.service.spec.ts` to ensure test suites run.
- Updated related DTOs and service methods to store and sort by `viralityScore`.

## Related Issue
Closes #372
