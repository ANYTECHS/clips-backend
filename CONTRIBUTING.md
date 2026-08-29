# Contributing to Clips Backend

Welcome to the Clips Backend project! We appreciate your interest in contributing. This guide explains how you can contribute, specifically focusing on bounty-eligible issues.

## Bounty Labels
We use specific labels to identify issues that have an active bounty. Look for labels such as `bounty`, `grantfox`, or `stellar` on our issues. These indicate that a financial reward is available for successfully completing the task.

## Eligibility Requirements
To be eligible for a bounty, you must:
- Have a valid GitHub account.
- Not be a core maintainer of the project.
- Follow all contribution guidelines outlined in this document.
- Claim the issue before starting work.

## How to Claim an Issue
If you find a bounty-eligible issue that you would like to work on, follow these steps:
1. Ensure the issue has not already been assigned or claimed by someone else. Check the comments for any `/claim` or `/try` statements.
2. Comment `/try` or state your intent to work on the issue.
3. Wait for a maintainer to assign the issue to you or acknowledge your claim before you begin working.

## PR Requirements
When submitting a Pull Request for a bounty-eligible issue:
- Your PR must reference the issue number (e.g., `Fixes #123`).
- Include tests that cover your changes.
- Ensure all CI/CD checks pass.
- Write clear, descriptive commit messages.

## Review Requirements
- All PRs must be reviewed by at least one core maintainer.
- You are expected to address any feedback or requested changes promptly.
- A PR is only considered complete when it is approved and merged into the main branch.

## Completion Criteria
A bounty is considered complete and eligible for payout when:
- The PR has been reviewed, approved, and merged.
- All acceptance criteria listed in the original issue are met.
- **For API-related issues:** Swagger/OpenAPI documentation is fully updated. (See below).

## Swagger / API Integration
For any issue that involves creating or modifying API endpoints, the following requirements apply:
- **Swagger Updates:** You MUST include updates to the Swagger documentation where applicable.
- **Definition of Done:** Swagger documentation is explicitly part of the "Definition of Done" for all API-related issues.
- **Undocumented Endpoints:** Any new or modified endpoints that lack proper Swagger documentation will not be considered complete, and the bounty will not be paid until the documentation is added.
