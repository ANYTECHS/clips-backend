# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

For the full versioning and release process, see [docs/versioning.md](docs/versioning.md).

## [Unreleased]

### Added

- Changelog and SemVer / API versioning guide (`docs/versioning.md`).
- Soft-delete developer guide (`docs/soft-deletes.md`).
- Logging standardization guide (`docs/logging.md`) with correlation ID documentation in Swagger.
- VideoService helper modules for validation, metadata, stats, Claude detection, and viral-moment math.

### Changed

- `VideoService` orchestrates viral detection; focused helpers own validation, metadata, status updates, and processing.
- HTTP error responses include `requestId`; security audit filter uses `req.requestId`.
- Replaced remaining Nest-path `console.*` usage with NestJS / `AppLoggerService` logging.

## [1.0.0] - 2026-08-01

### Added

- Initial public ClipCash API surface documented via OpenAPI / Swagger (`1.0`).
