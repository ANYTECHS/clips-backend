import { Logger } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';

/**
 * Standardized BullMQ processor error handling (Issue #1235).
 *
 * All processors must:
 *  - wrap errors consistently via {@link wrapProcessorError}
 *  - log with structured context via {@link logProcessorFailure}
 *  - distinguish retryable vs final failures via {@link isFinalAttempt}
 *  - record `final_failure` metrics only once via {@link handleFailedEvent}
 *  - throw {@link UnrecoverableError} for permanent (non-retryable) failures
 *
 * Failed jobs are retained (`removeOnFail: false`) so they can be inspected
 * via `GET /jobs/failed` and retried via `POST /jobs/retry/:jobId`.
 */

export interface ProcessorFailureContext {
  queue: string;
  jobId?: string | number;
  attemptsMade?: number;
  maxAttempts?: number;
  extra?: Record<string, unknown>;
}

/** Resolve configured max attempts for a job (defaults to 1). */
export function getMaxAttempts(job: Pick<Job, 'opts'>): number {
  return job.opts?.attempts ?? 1;
}

/** True when the job has exhausted all configured attempts. */
export function isFinalAttempt(job: Pick<Job, 'opts' | 'attemptsMade'>): boolean {
  return job.attemptsMade >= getMaxAttempts(job);
}

/**
 * Compute the expected exponential backoff delay for log messages.
 * Mirrors BullMQ `backoff: { type: 'exponential', delay }` behaviour:
 * `delay * 2^(attemptsMade - 1)`.
 */
export function computeBackoffDelayMs(
  job: Pick<Job, 'opts' | 'attemptsMade'>,
  defaultDelayMs = 1000,
): number {
  const backoff = job.opts?.backoff;
  if (backoff == null) return 0;
  if (typeof backoff === 'number') return backoff;
  const base = backoff.delay ?? defaultDelayMs;
  return base * Math.pow(2, Math.max(0, job.attemptsMade - 1));
}

/** Error messages that must never be retried (validation / permanent). */
const PERMANENT_ERROR_PATTERNS = [
  'invalid date',
  'validation failed',
  'bad request',
  'not found',
  'unauthorized',
  'forbidden',
  'cancelled by user',
  'aborted',
  'permanently failed',
  'no retries remain',
];

/** Heuristic: should this error skip retries and fail permanently? */
export function isPermanentFailure(error: unknown): boolean {
  if (error instanceof UnrecoverableError) return true;
  const message = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase();
  return PERMANENT_ERROR_PATTERNS.some((p) => message.includes(p));
}

/**
 * Wrap an unknown throw into an Error with a consistent `[queue:jobId]` prefix.
 * Permanent failures are converted to {@link UnrecoverableError} so BullMQ
 * moves the job straight to `failed` without further retries.
 */
export function wrapProcessorError(
  queue: string,
  job: Pick<Job, 'id'> | undefined,
  error: unknown,
  context?: Record<string, unknown>,
): Error {
  const jobId = job?.id ?? 'unknown';
  const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  const wrapped = `[${queue}:${String(jobId)}] ${message}`;
  if (context && Object.keys(context).length > 0) {
    // Attach structured context without mutating the original error stack.
    const withContext = new Error(`${wrapped} ${JSON.stringify(context)}`);
    if (error instanceof Error && error.stack) withContext.stack = error.stack;
    return isPermanentFailure(error) ? new UnrecoverableError(withContext.message) : withContext;
  }
  if (isPermanentFailure(error)) return new UnrecoverableError(wrapped);
  return error instanceof Error ? new Error(wrapped) : new Error(wrapped);
}

/**
 * Structured failure log. Emits one JSON-friendly line so log aggregators can
 * filter on `queue`, `jobId`, `isFinal`, and `attemptsMade`.
 */
export function logProcessorFailure(
  logger: Pick<Logger, 'warn' | 'error'>,
  queue: string,
  job: Pick<Job, 'id' | 'opts' | 'attemptsMade' | 'data' | 'failedReason'>,
  error: Error,
  defaultBackoffDelayMs = 1000,
): void {
  const maxAttempts = getMaxAttempts(job);
  const isFinal = isFinalAttempt(job);
  const context: ProcessorFailureContext = {
    queue,
    jobId: job.id,
    attemptsMade: job.attemptsMade,
    maxAttempts,
    extra: {
      reason: job.failedReason ?? error.message,
      isFinal,
    },
  };

  if (!isFinal) {
    const backoffMs = computeBackoffDelayMs(job, defaultBackoffDelayMs);
    logger.warn(
      `[RETRY] ${queue} job ${String(job.id)} failed on attempt ${job.attemptsMade}/${maxAttempts} — ` +
        `reason: ${error.message} — retrying in ~${Math.round(backoffMs / 1000)}s ` +
        JSON.stringify(context),
    );
    return;
  }

  logger.error(
    `[FINAL FAILURE] ${queue} job ${String(job.id)} exhausted all ${maxAttempts} attempts — ` +
      `reason: ${error.message} ` +
      JSON.stringify(context),
    error.stack,
  );
}

export interface FailureMetrics {
  recordJobFailure?: (queue: string, reason: string) => void;
  recordJobCompletion?: (jobId: string, queue: string, status: 'success' | 'failure') => void;
}

/**
 * Shared `@OnWorkerEvent('failed')` implementation.
 * Logs retry vs final states and records `final_failure` metrics exactly once.
 * Processors may still persist domain state (e.g. clip status) after calling this.
 */
export function handleFailedEvent(
  logger: Pick<Logger, 'warn' | 'error'>,
  metrics: FailureMetrics | undefined,
  queue: string,
  job: Pick<Job, 'id' | 'opts' | 'attemptsMade' | 'data' | 'failedReason'>,
  error: Error,
  defaultBackoffDelayMs = 1000,
): void {
  logProcessorFailure(logger, queue, job, error, defaultBackoffDelayMs);
  if (isFinalAttempt(job)) {
    metrics?.recordJobFailure?.(queue, 'final_failure');
  }
}

/**
 * Shared `process()` catch-block helper: records failure metrics, logs with
 * structure, then re-throws a consistently wrapped error.
 */
export function handleProcessingError(
  logger: Pick<Logger, 'error'>,
  metrics: FailureMetrics | undefined,
  queue: string,
  job: Pick<Job, 'id' | 'opts' | 'attemptsMade' | 'data' | 'failedReason'>,
  jobMetricId: string,
  error: unknown,
): never {
  const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  metrics?.recordJobCompletion?.(jobMetricId, queue, 'failure');
  metrics?.recordJobFailure?.(queue, message);
  const wrapped = wrapProcessorError(queue, job, error);
  logger.error(
    `[${queue}] job ${String(job.id)} failed — reason: ${wrapped.message} ` +
      JSON.stringify({ queue, jobId: job.id, attemptsMade: job.attemptsMade } satisfies ProcessorFailureContext),
    error instanceof Error ? error.stack : undefined,
  );
  throw wrapped;
}
