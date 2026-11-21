import { ValidateBy, ValidationOptions } from 'class-validator';

/**
 * Issue #1363 — scheduled publishing validation.
 *
 * Timezone policy: schedules must be ISO-8601 date-times with an explicit
 * timezone designator (`Z` or `±HH:MM`). They are normalised to UTC.
 * Timing rules: at least SCHEDULE_MIN_LEAD_MS in the future and no more than
 * SCHEDULE_MAX_HORIZON_DAYS ahead. Past timestamps are rejected.
 */
export const SCHEDULE_MIN_LEAD_MS = 60_000;
export const SCHEDULE_MAX_HORIZON_DAYS = 90;

const ISO_WITH_TZ =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

export type ScheduleValidationError =
  | 'format'
  | 'past'
  | 'too_soon'
  | 'too_far';

export function validateSchedule(
  value: unknown,
  now: number = Date.now(),
): ScheduleValidationError | null {
  if (typeof value !== 'string' || !ISO_WITH_TZ.test(value)) return 'format';
  const ts = Date.parse(value);
  if (Number.isNaN(ts)) return 'format';
  if (ts <= now) return 'past';
  if (ts - now < SCHEDULE_MIN_LEAD_MS) return 'too_soon';
  if (ts - now > SCHEDULE_MAX_HORIZON_DAYS * 86_400_000) return 'too_far';
  return null;
}

/** Normalises a validated schedule to a UTC Date for queueing. */
export function toUtcSchedule(value: string): Date {
  return new Date(Date.parse(value));
}

const MESSAGES: Record<ScheduleValidationError, (p: string) => string> = {
  format: (p) =>
    `${p} must be an ISO-8601 date-time with timezone (e.g. 2026-01-01T12:00:00Z)`,
  past: (p) => `${p} must not be in the past`,
  too_soon: (p) =>
    `${p} must be at least ${SCHEDULE_MIN_LEAD_MS / 1000} seconds in the future`,
  too_far: (p) =>
    `${p} must be within ${SCHEDULE_MAX_HORIZON_DAYS} days from now`,
};

export function IsValidSchedule(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isValidSchedule',
      validator: {
        validate: (value: unknown) => validateSchedule(value) === null,
        defaultMessage: (args) =>
          MESSAGES[validateSchedule(args?.value) ?? 'format'](
            args?.property ?? 'scheduledAt',
          ),
      },
    },
    validationOptions,
  );
}
