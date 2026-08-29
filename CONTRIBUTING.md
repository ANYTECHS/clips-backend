# Contributing to Clips Backend

Welcome to the **Clips Backend** project (powering ClipCash)! We are excited to welcome contributions from the open-source and Web3 developer community. Whether you are improving backend video processing, enhancing Soroban smart contracts on the Stellar network, optimizing database queries, or updating documentation, your help is appreciated.

This guide provides everything you need to know about finding and claiming bounty-eligible tasks, understanding issue labels, contribution standards, pull request workflows, review expectations, and API documentation requirements.

---

## Table of Contents

1. [Bounty Labels & Issue Categorization](#1-bounty-labels--issue-categorization)
2. [Eligibility Requirements](#2-eligibility-requirements)
3. [How to Claim an Issue](#3-how-to-claim-an-issue)
4. [Pull Request (PR) Requirements](#4-pull-request-pr-requirements)
5. [Review & Feedback Process](#5-review--feedback-process)
6. [Completion Criteria & Payout Eligibility](#6-completion-criteria--payout-eligibility)
7. [Swagger / OpenAPI Integration & Definition of Done](#7-swagger--openapi-integration--definition-of-done)
8. [Development & Testing Workflow](#8-development--testing-workflow)
9. [Community & Questions](#9-community--questions)

---

## 1. Bounty Labels & Issue Categorization

Bounty-eligible tasks are identified directly on GitHub issues using specific labels. Understanding these labels will help you pick issues that match your skills and reward goals:

| Label | Description & Significance |
| :--- | :--- |
| `bounty` / `bounty-eligible` | Explicitly designated for external contribution with a financial reward / bounty payout upon successful completion and merge. |
| `stellar` / `Stellar Wave` | Blockchain, Soroban smart contract, Stellar SDK, wallet connection, or cryptographic payout work sponsored under Stellar development waves. |
| `grantfox` | Tasks supported and tracked through GrantFox ecosystem funding. |
| `good-first-issue` | Beginner-friendly tasks with a well-scoped objective, ideal for onboarding new contributors. |
| `documentation` | Contributor documentation, architectural guides, setup documentation, or developer onboarding improvements. |
| `api` | Backend REST endpoints, DTO validation, controller logic, and OpenAPI / Swagger schema specifications. |
| `video` / `ffmpeg` | Core media workflows, Cloudinary asset uploads, BullMQ queue background processing, and FFmpeg clipping utilities. |
| `security` / `devops` | Authentication, rate limiting, encryption, Docker, CI/CD workflows, and infrastructure hardening. |

> [!NOTE]
> If an issue contains multiple labels (e.g., `stellar` + `api` + `bounty`), ensure you read the full issue description carefully. The task may require cross-cutting changes such as updating Soroban contract bindings, NestJS services, controller endpoints, and Swagger definitions.

---

## 2. Eligibility Requirements

Before picking up an issue or submitting work, please verify that you satisfy the following eligibility criteria:

- **Valid GitHub Account:** You must have an active GitHub account in good standing.
- **Independence:** Core maintainers and direct repository admins are not eligible for public bounty payouts.
- **Issue Assignment:** You must officially claim the issue and receive maintainer assignment **before** starting significant work or opening a PR. Unsolicited PRs on unassigned issues may not be prioritized.
- **Scope Comprehension:** Review the entire issue description, acceptance criteria, and any related codebase components to ensure you have the necessary technical capabilities (e.g., NestJS, TypeScript, PostgreSQL/Prisma, Stellar SDK/Rust Soroban).
- **Code of Conduct:** Maintain professional, constructive, and respectful interactions across issue comments and PR discussions.

---

## 3. How to Claim an Issue

To ensure a smooth workflow and avoid duplicate effort between contributors:

1. **Find an Open Issue:** Browse the repository issues filtered by `bounty`, `stellar`, or `good-first-issue`.
2. **Verify Availability:** Check that the issue is open, has no assigned assignee, and does not have an active PR linked in the comments.
3. **Declare Your Intent:** Leave a clear comment on the issue stating your interest and a brief summary of your proposed implementation plan:
   - *Example:* `I would like to work on this issue. I plan to implement the requested endpoint using the Prisma service and add the required Swagger OpenAPI decorators and unit tests.`
   - Alternatively, comment `/try` or `/claim` where supported.
4. **Wait for Assignment:** Wait for a repository maintainer to acknowledge your comment and assign the issue to you.
5. **Timeline & Deadlines:** Once assigned, you are expected to submit a draft or ready-for-review PR within **48–72 hours** (or the timeline specified in the issue). If you encounter blockers, communicate early in the issue thread. Inactive assignments may be reassigned to other waiting contributors.

---

## 4. Pull Request (PR) Requirements

All submissions must meet high-quality engineering standards:

### Branching & Commits
- Fork the repository and create a dedicated feature branch from `main`:
  ```bash
  git checkout -b feat/issue-884-bounty-labels-guide
  # or
  git checkout -b fix/issue-123-wallet-auth
  ```
- Use clear, descriptive, and conventional commit messages (e.g., `feat(api): add stellar wallet verification endpoint`, `docs: update CONTRIBUTING with bounty guide`).

### PR Scope & Atomic Diffs
- **Keep diffs clean and scoped:** Restrict changes solely to what is requested in the issue. Do not include unrelated formatting changes, large refactors, or dead code.
- **Do NOT mock assertions:** Write real, verifiable tests against actual business logic, services, and cryptographic utilities. Never mock test assertions just to force tests to pass.
- **Preserve existing tests:** Do not delete, disable, or weaken existing test assertions.

### PR Content & Issue Linking
- Reference the issue number in the PR title or description using GitHub keywords (e.g., `Fixes #884` or `Closes #884`).
- Fill out the PR description thoroughly:
  - **Summary:** High-level overview of changes.
  - **Implementation Details:** Key design decisions or architecture changes.
  - **Verification / Testing:** Commands run and evidence of passing unit/e2e tests.
  - **Payout Routing (for Bounties):** Include your payout addresses in the PR description:
    ```markdown
    ## Payout Routing
    - **EVM (Base/Arbitrum/Polygon/ETH):** `<YOUR_EVM_ADDRESS>`
    - **Stellar:** `<YOUR_STELLAR_ADDRESS>`
    ```

---

## 5. Review & Feedback Process

Every pull request goes through peer review prior to merge:

1. **Automated CI Checks:** Ensure all automated lint checks, TypeScript builds, and test suites pass.
2. **Maintainer Review:** At least one core maintainer will review your code for correctness, security, architectural consistency, and test coverage.
3. **Addressing Feedback:** If changes or revisions are requested, respond promptly to comments and push updates directly to your branch.
4. **Final Approval:** Once all reviews are approved and discussions are resolved, the maintainers will squash and merge your branch into `main`.

---

## 6. Completion Criteria & Payout Eligibility

A bounty task is considered **fully complete** and eligible for payout when:

- [x] All specific tasks and acceptance criteria listed in the original issue are satisfied.
- [x] All unit, integration, or E2E tests covering new and modified code pass cleanly.
- [x] **For all API-related tasks:** OpenAPI / Swagger documentation is completely updated and validated (see Section 7).
- [x] The Pull Request has received official maintainer approval.
- [x] The Pull Request has been merged into the `main` branch.
- [x] The contributor's payout addresses are provided in the PR description for reward distribution.

---

## 7. Swagger / OpenAPI Integration & Definition of Done

API documentation is a first-class requirement across Clips Backend.

### Mandatory Documentation Rule
Whenever an issue involves creating a new REST endpoint or modifying an existing one (changes to path, method, headers, query params, request payload DTO, response body DTO, or error status codes), **Swagger/OpenAPI documentation MUST be updated.**

### Definition of Done (DoD) for API Issues
Swagger updates are an explicit component of the **Definition of Done**:
- Every controller method must be annotated with appropriate NestJS Swagger decorators (`@ApiTags`, `@ApiOperation`, `@ApiResponse`, `@ApiParam`, `@ApiQuery`, `@ApiBearerAuth`).
- Every request and response DTO class must have `@ApiProperty()` or `@ApiPropertyOptional()` on all fields with clear descriptions, types, and example values.
- Status codes (e.g., `200`, `201`, `400`, `401`, `403`, `404`, `500`) must have corresponding `@ApiResponse` annotations describing the outcome and payload structure.

### Policy on Undocumented Endpoints
> [!IMPORTANT]
> **Undocumented Endpoints Are Incomplete:** Any pull request that adds or changes API endpoints without complete and accurate Swagger documentation **will not be approved or merged**, and bounty rewards will not be released until documentation is properly in place.

### Example Swagger Implementation

```typescript
// Controller Example
@ApiTags('Clips')
@Controller('clips')
export class ClipsController {
  @Post('generate')
  @ApiOperation({
    summary: 'Generate viral clips from uploaded video',
    description: 'Triggers the background AI clipping pipeline for a processed video asset.'
  })
  @ApiResponse({ status: 201, description: 'Clip generation queued successfully.', type: ClipResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid video ID or processing options.' })
  @ApiResponse({ status: 401, description: 'Unauthorized caller.' })
  async generateClips(@Body() dto: GenerateClipsDto): Promise<ClipResponseDto> {
    return this.clipsService.generate(dto);
  }
}

// DTO Example
export class GenerateClipsDto {
  @ApiProperty({
    description: 'Unique UUID identifier of the uploaded video',
    example: 'd3b07384-d113-4e20-b384-386d49931bfe'
  })
  @IsUUID()
  videoId: string;

  @ApiPropertyOptional({
    description: 'Target duration in seconds for each clip segment',
    example: 30,
    default: 30
  })
  @IsOptional()
  @IsInt()
  targetDurationSeconds?: number;
}
```

---

## 8. Development & Testing Workflow

Follow these steps to run and test your changes locally:

### 1. Installation
```bash
git clone https://github.com/<your-username>/clips-backend.git
cd clips-backend
npm install
```

### 2. Environment Configuration
```bash
cp .env.example .env
# Fill in database and redis configuration
```

### 3. Linting & Formatting
```bash
# Check and fix code linting
npm run lint

# Format code with Prettier
npm run format
```

### 4. Running Tests & Exporting OpenAPI Spec
```bash
# Run unit tests
npm test

# Export and verify OpenAPI definition
npm run openapi:export
```

---

## 9. Community & Questions

If you have questions about issue requirements, scope clarification, or technical architecture:
- Comment directly on the relevant GitHub issue.
- Open a discussion in [GitHub Discussions](https://github.com/ANYTECHS/clips-backend/discussions).

Thank you for building with us and contributing to **ClipCash / Clips Backend**!
