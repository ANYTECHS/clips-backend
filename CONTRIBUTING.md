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
# Contributing to ClipCash

Thanks for helping improve ClipCash. This project is built by contributors across backend, blockchain, documentation, and platform integrations, and we want to make it easy to understand which issues are open for bounty work and what the bar is for a complete contribution.

## Bounty labels

Bounty-eligible work is identified by labels on GitHub issues. When you see an issue that is marked with one or more of the following, it is typically intended for contributor work and may be eligible for bounty rewards:

- `bounty` or `bounty-eligible`: the issue is explicitly marked for bounty participation.
- `good-first-issue`: intended for contributors who are newer to the codebase.
- `documentation`: docs, process, onboarding, or contributor guides.
- `stellar`: blockchain, wallet, payment, or Stellar-related work.
- `api`: backend or API changes that require integration or documentation updates.

If an issue is labeled with a combination of these labels, the scope and expectations are usually broader than a casual fix. Read the issue description carefully and confirm the task requirements before claiming it.

## Eligibility requirements

Before claiming an issue, please confirm that you meet the stated requirements and can complete the work without creating scope creep or breaking existing behavior.

Contributors should:

- review the issue description and acceptance criteria fully;
- confirm the issue is still open and unclaimed;
- check whether the issue requires backend, docs, UI, or blockchain changes;
- make sure the work can be completed with a focused, reviewable patch;
- confirm any dependency or setup steps needed to reproduce or validate the task;
- avoid claiming issues that depend on missing design decisions or approval from maintainers unless the issue explicitly invites that work.

For bounty issues, claims should be based on the issue scope, not assumptions. If an issue is unclear, ask for clarification before working on it.

## How to claim an issue

1. Read the issue description and acceptance criteria in full.
2. Check whether the issue is labeled as bounty-eligible, beginner-friendly, or API/docs-related.
3. Leave a short comment stating your intent to work on it, for example:
   - "I’d like to work on this issue. I’ll review the requirements and submit a focused patch."
4. Wait for confirmation from maintainers if the issue is actively managed or if there are ownership expectations.
5. Start work only after the issue is clearly assigned or the maintainers have indicated the task is open for contribution.

Do not begin work on a bounty issue if the scope is ambiguous or if the issue has already been claimed by another contributor without a clear handoff.

## Pull request requirements

All contributions should follow these baseline requirements:

- keep the patch focused on the issue being solved;
- do not include unrelated refactors or unrelated cleanup in the same change;
- preserve current behavior outside the intended scope;
- include clear commit messages and a concise PR description;
- link the PR to the relevant issue when applicable;
- explain what changed and why it was needed.

For bounty work, the PR should clearly explain:

- the issue that was addressed;
- the chosen implementation approach;
- any assumptions or constraints;
- what was verified or intentionally not changed.

## Review requirements

Contribution review is part of the expected quality bar. Before a PR is considered ready:

- ensure the change matches the issue scope and acceptance criteria;
- verify the implementation is understandable and maintainable;
- avoid hidden side effects or broad behavior changes;
- keep code, documentation, and tests aligned with the issue when relevant.

If a reviewer asks for revisions, address them directly and keep the discussion focused on the requested outcome.

## Completion criteria

An issue is considered complete only when all required acceptance criteria are met. For bounty-eligible work, the final change should be clearly tied to the issue and should not leave obvious gaps in the implementation or documentation.

A contribution is generally considered complete when:

- the requested behavior has been implemented or documented;
- the issue acceptance criteria are satisfied;
- the change is limited to the intended scope;
- the PR is ready for review and clearly describes the result;
- reviewer feedback has been addressed before merge.

## API and Swagger requirements

For API-related bounty issues, Swagger/OpenAPI updates are part of the definition of done when applicable.

The following rules apply:

- API endpoints that change behavior must be reflected in the relevant Swagger definitions when the endpoint is part of the public contract.
- New endpoints should include request/response documentation when appropriate.
- Existing endpoints that change inputs, output shapes, validation, or auth requirements should be updated so the API docs stay accurate.
- Undocumented endpoints may not be considered complete if they materially affect the API surface or user-facing behavior.

In practice, the definition of done for API issues includes:

- matching controller or DTO updates with Swagger metadata;
- clear documentation for request payloads, responses, and status codes where applicable;
- validation of how the endpoint is exposed through the generated API documentation.

If an API issue does not require Swagger because the change is internal-only or not exposed externally, note that in the PR or issue discussion.

## Expected standards

We value thoughtful, reviewable contributions over broad changes. Contributors should aim for:

- clarity over cleverness;
- focused work over broad refactors;
- documented behavior over assumptions;
- correctness over speed.

If you are unsure whether an issue is a good fit, ask in the issue comments before claiming it.

## Questions

If you have questions about issue labels, bounty eligibility, or contribution requirements, please open a discussion or ask in the relevant issue thread before starting work.
