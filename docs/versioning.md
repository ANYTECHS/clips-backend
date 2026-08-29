# Versioning Guide

This document defines how ClipCash backend versions releases, documents breaking changes, and keeps Swagger/OpenAPI aligned with the public API.

## Semantic Versioning (SemVer)

We follow SemVer `MAJOR.MINOR.PATCH`:

| Change type | Version bump | Examples |
|-------------|--------------|----------|
| **MAJOR** | Breaking API or data-contract change | Removing/renaming endpoints; changing required request fields; changing response shapes clients depend on; incompatible auth behavior |
| **MINOR** | Backward-compatible feature | New endpoints, optional fields, new query params with safe defaults, additive Swagger tags |
| **PATCH** | Backward-compatible fix | Bug fixes, performance, docs-only, internal refactors that preserve API behavior |

Pre-release labels (optional): `1.1.0-rc.1`, `1.1.0-beta.2`.

Source of truth for the package version: `package.json` `"version"`.
Source of truth for human-readable history: `CHANGELOG.md`.

## Breaking changes

A change is **breaking** when a correctly integrated client must change code to keep working.

Document every breaking change in `CHANGELOG.md` under `### Breaking`:

```markdown
### Breaking

- `GET /payouts/:id` no longer returns soft-deleted payouts; clients receive `404` (use admin recovery endpoints).
```

Migration notes should include:

1. What changed (endpoint, field, status code).
2. Why (security, correctness, schema).
3. How to migrate (new field/endpoint, header, version).

Breaking API changes require a **MAJOR** bump and an OpenAPI/Swagger update in the same release.

## Feature releases (MINOR)

- New capabilities that do not break existing clients.
- Prefer additive DTO fields (`required: false`) and new routes over mutating existing ones.
- List under `### Added` / `### Changed` in `CHANGELOG.md`.

## Patch releases (PATCH)

- Fixes and internal improvements that preserve request/response contracts.
- Refactors (e.g. VideoService helpers) belong here when Swagger DTOs and runtime behavior are unchanged.
- List under `### Fixed` / `### Changed` as appropriate.

## Release workflow

1. **Develop** on a feature branch; keep API behavior intentional and tested.
2. **Update** `CHANGELOG.md` `[Unreleased]` with Added / Changed / Fixed / Breaking entries.
3. **Bump** `package.json` version according to SemVer rules above.
4. **Move** `[Unreleased]` notes into a dated section, e.g. `## [1.2.0] - 2026-09-15`.
5. **Verify** OpenAPI:
   - Swagger UI (`/api/docs`) and exported `openapi.json` reflect the new surface.
   - `.setVersion(...)` in `main.ts` matches the public API major.minor (or full SemVer if desired).
6. **Tag** the release in git: `git tag -a v1.2.0 -m "v1.2.0"`.
7. **Publish** / deploy per environment process; announce breaking changes to API consumers.

## API versioning strategy

### Current approach

- Single public API documented as OpenAPI version `1.0` (see Swagger `DocumentBuilder.setVersion`).
- Backward-compatible evolution preferred within a major version.
- Soft deletes, auth, and error envelopes should remain stable unless a major bump documents otherwise.

### Breaking API changes and Swagger

When a breaking change ships:

1. Bump SemVer **MAJOR** (e.g. `1.x` → `2.0.0`).
2. Update `DocumentBuilder.setVersion` and regenerate/export OpenAPI.
3. Update DTO `@ApiProperty` / `@ApiResponse` decorators so schemas match runtime.
4. Call out the break in `CHANGELOG.md` and release notes.
5. Do **not** leave stale Swagger examples that show removed fields or old status codes.

### Non-breaking API changes

- Add optional properties and new operations freely under a MINOR bump.
- Update Swagger examples when response structures gain fields so docs stay accurate.
- Refactors that preserve DTOs do not require Swagger schema changes.

## Related docs

- [CHANGELOG.md](../CHANGELOG.md)
- [Logging / correlation IDs](./logging.md)
- [Soft deletes](./soft-deletes.md)
