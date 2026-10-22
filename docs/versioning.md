# Project Versioning & Changelog Guide

This guide establishes the versioning strategy, changelog standards, and release workflows for the ClipCash backend service. It ensures predictable contract evolution, seamless consumer upgrades, and continuous alignment between runtime code, documentation, and the public OpenAPI / Swagger specifications.

---

## 1. Semantic Versioning (SemVer) Strategy

ClipCash adheres strictly to [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html) (`MAJOR.MINOR.PATCH`):

| Segment             | Change Type          | Trigger Criteria                                                                                                | Examples in Backend                                                                                                                                                                |
| ------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MAJOR** (`X.0.0`) | **Breaking Changes** | Incompatible API changes, modified request/response shapes, removed endpoints, or breaking auth contracts.      | Removing or renaming route paths; changing a previously optional DTO field to required; altering error response structures; changing Soroban contract invocation arguments.        |
| **MINOR** (`1.X.0`) | **Feature Releases** | Additive, backward-compatible functionality that introduces new features without disrupting existing consumers. | Adding new endpoints; introducing optional request fields (`required: false`); adding new query filters with safe defaults; new background queue workers; adding new Swagger tags. |
| **PATCH** (`1.0.X`) | **Patch Releases**   | Backward-compatible bug fixes, performance improvements, security hotfixes, and internal refactors.             | Fixing validation errors; patching circuit breaker thresholds; internal database query optimizations; updating non-breaking dependencies; documentation edits.                     |

### Source of Truth

- **Application Version:** Declared in root `package.json` under `"version"`.
- **OpenAPI Specification Version:** Configured in `src/main.ts` and `scripts/export-openapi.ts` via `DocumentBuilder.setVersion()`.
- **Human-Readable History:** Maintained in `CHANGELOG.md` following [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## 2. Breaking Changes Protocol

A change is classified as **breaking** when any existing, correctly implemented API consumer or client application must modify its codebase or integration logic to prevent failure after deployment.

### Examples of Breaking Changes

- Removing or renaming an existing REST endpoint (e.g., changing `/payouts/:id` to `/payouts/details/:id`).
- Altering existing response structures (e.g., nesting data inside an unexpected envelope or renaming property keys).
- Adding new mandatory parameters or body fields (`@IsNotEmpty()` without defaults).
- Changing HTTP status codes for expected operational outcomes (e.g., returning `404` instead of `200` with an empty array).
- Changing authentication or authorization behavior (e.g., enforcing new permission scopes or token formats).

### Deprecation & Migration Process

When introducing a breaking change:

1. **Deprecation Phase (Preferred):**
   - Mark the affected endpoint or field as deprecated in Swagger using `@ApiOperation({ deprecated: true })` or `@ApiProperty({ deprecated: true })`.
   - Provide sunset headers (`Sunset` and `Link`) in HTTP responses where applicable.
   - Maintain the deprecated behavior alongside the new behavior across at least one MINOR cycle.
2. **Migration Guide:** Every breaking change must include migration documentation in `CHANGELOG.md` under `### Breaking` detailing:
   - **What changed:** Specific endpoint, parameter, or response field.
   - **Why it changed:** Security requirement, data integrity, architectural improvement.
   - **How to migrate:** Code snippet showing before and after requests/responses.

Example Changelog entry:

```markdown
### Breaking

- `GET /payouts/:id`: Soft-deleted payouts now return `404 Not Found` instead of `{ status: "deleted" }`.
  - **Migration:** Consumers tracking archived payouts must query `GET /payouts/archive` with admin credentials.
```

---

## 3. Feature Releases (MINOR)

Feature releases deliver new capabilities to clients without invalidating prior integrations:

- **Additive DTOs:** New request body properties must be declared optional (`@IsOptional()`, `@ApiPropertyOptional()`).
- **Default Fallbacks:** New query parameters must define safe, backwards-compatible default values.
- **Idempotent Background Jobs:** New BullMQ queues or job processors must preserve existing job payload schemas.
- **Additive Database Migrations:** Prisma schema migrations must introduce nullable columns or columns with database defaults so existing queries continue running during zero-downtime rollouts.

---

## 4. Patch Releases (PATCH)

Patch releases focus strictly on stabilization and maintenance:

- Bug fixes that restore intended behavior without mutating contract schemas.
- Internal service refactoring that preserves existing DTO contracts and response payload structures.
- Dependency security updates and patch bumps.
- Performance optimizations (e.g., indexing Prisma models, adjusting Redis connection pools).

---

## 5. Release Workflow Checklist

Before releasing a new version of the ClipCash backend, follow this systematic workflow:

```
[Feature Branch] --> [CI Tests & Lint] --> [Changelog & Version Bump] --> [OpenAPI Export] --> [PR & Merge] --> [Git Tag] --> [Deploy]
```

1. **Verify Automated Tests:**
   Ensure all unit, integration, and E2E test suites pass locally and in CI:
   ```bash
   npm run test
   npm run test:e2e
   npm run lint
   ```
2. **Review Open PRs:** Verify that all changes intended for the release adhere to SemVer rules.
3. **Update `CHANGELOG.md`:**
   - Move relevant items from `[Unreleased]` into a newly versioned section: `## [X.Y.Z] - YYYY-MM-DD`.
   - Ensure entries are properly categorized under `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`, or `Breaking`.
4. **Bump Version in `package.json`:**
   ```bash
   npm version <major|minor|patch> --no-git-tag-version
   ```
5. **Synchronize OpenAPI / Swagger Documentation:**
   - Update `DocumentBuilder.setVersion('X.Y')` in `src/main.ts` and `scripts/export-openapi.ts`.
   - Export the fresh OpenAPI schema:
     ```bash
     npm run openapi:export
     ```
   - Commit the updated `openapi.json`.
6. **Tag the Release in Git:**
   ```bash
   git commit -am "chore(release): vX.Y.Z"
   git tag -a vX.Y.Z -m "Release vX.Y.Z"
   git push origin main --tags
   ```
7. **Deploy & Announce:** Deploy to target environment and publish release notes detailing user-facing changes and migration notes.

---

## 6. Swagger & API Versioning Integration

### API Versioning Strategy

- **Current Approach:** The ClipCash backend currently exposes a unified public API surface represented by OpenAPI version `1.0` (accessible via `/api/docs`).
- **Semantic Evolution:** Additive, non-breaking modifications evolve the existing specification within the current major version.
- **Major Evolution:** A breaking contract change necessitates bumping the API version (e.g., `1.0` to `2.0`), updating routing namespaces if versioned URL prefixes (e.g., `/api/v2`) are introduced, and publishing updated OpenAPI definitions.

### How Breaking API Changes Affect Swagger

- **Client SDK Breakage:** External tools (TypeScript generators, mobile clients, SDK builders) rely on `openapi.json`. Any breaking schema change invalidates downstream SDK types.
- **Schema Alignment:** Swagger UI (`/api/docs`) and exported `openapi.json` must strictly represent active runtime behavior. Outdated decorators, obsolete status codes, or phantom fields are treated as documentation bugs.
- **Decorator Synchronization:**
  - `@ApiOperation()` must accurately describe operation semantics and note deprecation where applicable.
  - `@ApiProperty()` / `@ApiPropertyOptional()` must match class-validator constraints (`min`, `max`, `enum`, `required`).
  - `@ApiResponse()` must document both standard success payloads (200, 201) and error responses (400, 401, 403, 404, 429, 500, 502).

### Enforcing OpenAPI Synchronization

1. When modifying or introducing DTOs and endpoints, ensure decorators are updated in the corresponding controller and DTO files.
2. Run `npm run openapi:export` to synchronize the static `openapi.json` artifact.
3. Validate that the exported schema reflects:
   - The correct API version.
   - The updated endpoints, tags, and security schemes.
   - Updated request body and response component definitions.

---

## 7. Related Documentation

- [CHANGELOG.md](../CHANGELOG.md) - Project version history and change logs.
- [Swagger Guide](./swagger.md) - Comprehensive API documentation standards.
- [API Contract](./api-contract.md) - Architectural contracts and conventions.
- [Error Codes](./error-codes.md) - Standardized HTTP and contract error codes.
