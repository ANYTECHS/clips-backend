# Contributing to ClipCash Backend

Thanks for contributing! This guide covers the general workflow and how bounty-eligible issues work.

## Getting Started

1. Read [docs/onboarding.md](./docs/onboarding.md) to set up the project locally.
2. Fork the repo and create a branch from `main`: `feature/<your-handle>-<issue-number>`.
3. Follow the existing code style (`npm run lint`, `npm run format`).

## Bounty Labels

Bounty-eligible issues are identified by labels:

| Label | Meaning |
|---|---|
| `Stellar Wave` | Part of a Stellar Wave campaign. Eligible for a reward when completed and merged. |
| `GrantFox OSS` | Funded through the GrantFox OSS program. Eligible for a reward when completed and merged. |
| `Third Campaign` | Belongs to the current (third) bounty campaign. |
| `Maybe Rewarded` | May be rewarded at maintainer discretion, based on quality and impact. |
| `good first issue` | Small, well-scoped task, good for new contributors. Can be combined with a bounty label. |

Issues without a bounty label are welcome contributions but are **not** bounty-eligible.

## Eligibility Requirements

To be eligible for a bounty:

- The issue must carry a bounty label at the time you claim it.
- You must be assigned to the issue (or have it confirmed by a maintainer) before opening a PR.
- The PR must be opened by the assigned contributor and merged into `main`.
- The work must be original. Copied or AI-generated work submitted without review may be rejected.
- Only one contributor is rewarded per issue unless maintainers agree otherwise.

## Claiming an Issue

1. Comment on the issue asking to be assigned, with a short note on how you will solve it.
2. Wait for a maintainer to assign you. **Do not start a PR for an issue assigned to someone else.**
3. If you have made no progress or sent no update within **7 days**, the issue may be unassigned and given to someone else.
4. If you can no longer work on it, comment so it can be reassigned.

## Pull Request Requirements

- Reference the issue in the PR description with a closing keyword (`Closes #123`). One PR may close several related issues.
- Keep the PR focused on the issue scope. Avoid unrelated refactors.
- Describe **what** changed and **why**, and list any follow-up work.
- Code must compile (`npm run build`) and pass lint.
- Add or update tests for behaviour changes when the issue asks for them.
- Update documentation (`docs/`, README) when behaviour or configuration changes.
- Do not commit secrets, `.env` files or build output (`dist/`).

## API Issues: Swagger Is Part of the Definition of Done

For any issue that adds or changes an API endpoint, request body or response:

- Every endpoint must have `@ApiOperation`, `@ApiTags` and response decorators (`@ApiOkResponse`, `@ApiBadRequestResponse`, etc. or `@ApiStandardErrors()`).
- Every DTO property must have `@ApiProperty()` / `@ApiPropertyOptional()` with a `description`, an `example`, and constraints (`minimum`, `maximum`, `enum`, …) that match the class-validator decorators.
- Validation decorators should include a clear, user-facing `message`.
- Protected endpoints must declare `@ApiBearerAuth()`.

**Endpoints that are undocumented or documented wrongly in Swagger may not be considered complete**, and the bounty may be held until the documentation is fixed. See [docs/swagger.md](./docs/swagger.md).

## Review Requirements

- At least one maintainer approval is required before merge.
- Address all review comments. Push follow-up commits rather than force-pushing over reviewed work.
- Keep your branch up to date with `main` and resolve conflicts yourself.
- CI checks must pass.

## Completion Criteria

An issue counts as complete, and its bounty payable, when:

1. All tasks and acceptance criteria in the issue are met (or explicitly waived by a maintainer).
2. Swagger documentation is updated for API issues.
3. The PR has been approved and **merged** into `main`.
4. The issue is closed by the merged PR.

Rewards are processed by the campaign program (e.g. Stellar Wave, GrantFox) after merge, following that program's payout rules.
