import { ForbiddenException } from '@nestjs/common';
import { CLIP_GENERATION_QUEUE } from '../clips/clip-generation.queue';
import { CLIP_POSTING_QUEUE } from '../clips/clip-posting.queue';
import { NFT_MINT_QUEUE } from '../clips/nft-mint.queue';
import { EMAIL_DELIVERY_QUEUE } from '../auth/email-delivery.queue';
import { ANOMALY_DETECTION_QUEUE } from '../earnings/anomaly-detection.queue';
import { PAYOUT_RETRY_QUEUE } from '../payouts/payout-retry.queue';

/**
 * Job Priority Levels.
 *
 * BullMQ uses integer priorities where LOWER integers indicate HIGHER priority:
 * - 1: CRITICAL (processed first: urgent payouts, security events)
 * - 2: HIGH (processed quickly: standard payouts, user-facing clip generation)
 * - 3: NORMAL (default priority: standard async tasks, clip posting, emails)
 * - 4: LOW (background analytics, anomaly detection, cleanup)
 */
export enum JobPriorityLevel {
  CRITICAL = 'critical',
  HIGH = 'high',
  NORMAL = 'normal',
  LOW = 'low',
}

export enum JobPriorityNumeric {
  CRITICAL = 1,
  HIGH = 2,
  NORMAL = 3,
  LOW = 4,
}

export const JOB_PRIORITY_NUMERIC: Record<JobPriorityLevel, number> = {
  [JobPriorityLevel.CRITICAL]: JobPriorityNumeric.CRITICAL, // 1
  [JobPriorityLevel.HIGH]: JobPriorityNumeric.HIGH,         // 2
  [JobPriorityLevel.NORMAL]: JobPriorityNumeric.NORMAL,     // 3
  [JobPriorityLevel.LOW]: JobPriorityNumeric.LOW,           // 4
};

export const NUMERIC_TO_JOB_PRIORITY: Record<number, JobPriorityLevel> = {
  [JobPriorityNumeric.CRITICAL]: JobPriorityLevel.CRITICAL,
  [JobPriorityNumeric.HIGH]: JobPriorityLevel.HIGH,
  [JobPriorityNumeric.NORMAL]: JobPriorityLevel.NORMAL,
  [JobPriorityNumeric.LOW]: JobPriorityLevel.LOW,
};

export const DEFAULT_JOB_PRIORITY = JobPriorityLevel.NORMAL;
export const DEFAULT_JOB_PRIORITY_NUMERIC = JobPriorityNumeric.NORMAL;

export const JOB_PRIORITY_VALUES = Object.values(JobPriorityLevel) as readonly JobPriorityLevel[];

/**
 * Priorities that require administrative privileges to assign.
 * Regular users attempting to assign these will receive a 403 Forbidden.
 */
export const ADMIN_ONLY_PRIORITIES: readonly JobPriorityLevel[] = [
  JobPriorityLevel.CRITICAL,
] as const;

export interface QueuePriorityBehavior {
  /** The default numeric priority assigned to jobs in this queue (lower = higher priority) */
  defaultPriority: number;
  /** Human-readable default priority level name */
  defaultLevel: JobPriorityLevel;
  /** Whether jobs in this queue allow custom per-job priority overrides */
  allowJobPriorityOverride: boolean;
  /** Highest priority allowed on this queue (lowest numeric value, e.g., 1 for critical) */
  maxPriorityLevel: number;
}

/**
 * Queue-specific priority configuration:
 * - Payout processing has critical/high priority over ordinary background processing.
 * - Clip generation is high priority for fast creator feedback.
 * - Clip posting and emails are normal priority.
 * - Anomaly detection and NFT minting are low/normal background workloads.
 */
export const QUEUE_PRIORITY_BEHAVIOR: Record<string, QueuePriorityBehavior> = {
  [PAYOUT_RETRY_QUEUE]: {
    defaultPriority: JobPriorityNumeric.CRITICAL,
    defaultLevel: JobPriorityLevel.CRITICAL,
    allowJobPriorityOverride: true,
    maxPriorityLevel: JobPriorityNumeric.CRITICAL,
  },
  [CLIP_GENERATION_QUEUE]: {
    defaultPriority: JobPriorityNumeric.HIGH,
    defaultLevel: JobPriorityLevel.HIGH,
    allowJobPriorityOverride: true,
    maxPriorityLevel: JobPriorityNumeric.CRITICAL,
  },
  [CLIP_POSTING_QUEUE]: {
    defaultPriority: JobPriorityNumeric.NORMAL,
    defaultLevel: JobPriorityLevel.NORMAL,
    allowJobPriorityOverride: true,
    maxPriorityLevel: JobPriorityNumeric.HIGH,
  },
  [EMAIL_DELIVERY_QUEUE]: {
    defaultPriority: JobPriorityNumeric.NORMAL,
    defaultLevel: JobPriorityLevel.NORMAL,
    allowJobPriorityOverride: true,
    maxPriorityLevel: JobPriorityNumeric.HIGH,
  },
  [NFT_MINT_QUEUE]: {
    defaultPriority: JobPriorityNumeric.LOW,
    defaultLevel: JobPriorityLevel.LOW,
    allowJobPriorityOverride: true,
    maxPriorityLevel: JobPriorityNumeric.HIGH,
  },
  [ANOMALY_DETECTION_QUEUE]: {
    defaultPriority: JobPriorityNumeric.LOW,
    defaultLevel: JobPriorityLevel.LOW,
    allowJobPriorityOverride: false,
    maxPriorityLevel: JobPriorityNumeric.NORMAL,
  },
};

/**
 * Converts a JobPriorityLevel or priority input to the integer expected by BullMQ.
 * Returns the mapped number (1-4), or the provided fallback.
 */
export function toBullMQPriority(
  priority?: JobPriorityLevel | number | string,
  fallback: number = DEFAULT_JOB_PRIORITY_NUMERIC,
): number {
  if (priority === undefined || priority === null) {
    return fallback;
  }

  if (typeof priority === 'number') {
    if (priority >= 1 && priority <= 4) {
      return priority;
    }
    return fallback;
  }

  const normalized = String(priority).toLowerCase().trim() as JobPriorityLevel;
  if (JOB_PRIORITY_NUMERIC[normalized] !== undefined) {
    return JOB_PRIORITY_NUMERIC[normalized];
  }

  return fallback;
}

/**
 * Converts an integer priority or string to a standardized JobPriorityLevel enum.
 */
export function toJobPriorityLevel(
  priority?: number | string,
  fallback: JobPriorityLevel = DEFAULT_JOB_PRIORITY,
): JobPriorityLevel {
  if (priority === undefined || priority === null) {
    return fallback;
  }

  if (typeof priority === 'number') {
    return NUMERIC_TO_JOB_PRIORITY[priority] ?? fallback;
  }

  const normalized = String(priority).toLowerCase().trim() as JobPriorityLevel;
  if (Object.values(JobPriorityLevel).includes(normalized)) {
    return normalized;
  }

  return fallback;
}

/**
 * Type guard for JobPriorityLevel.
 */
export function isValidJobPriority(priority: unknown): priority is JobPriorityLevel {
  return (
    typeof priority === 'string' &&
    Object.values(JobPriorityLevel).includes(priority as JobPriorityLevel)
  );
}

/**
 * Asserts that the authenticated user is authorized to assign the requested priority level.
 * Throws ForbiddenException (403) if a non-admin requests an admin-only priority level.
 */
export function assertAuthorizedJobPriority(
  priority?: JobPriorityLevel | string,
  user?: { role?: string } | null,
): void {
  if (!priority) return;

  const normalized = String(priority).toLowerCase().trim() as JobPriorityLevel;
  if (ADMIN_ONLY_PRIORITIES.includes(normalized)) {
    if (user?.role !== 'admin') {
      throw new ForbiddenException(
        `Unauthorized priority level: '${normalized}' is reserved for administrators`,
      );
    }
  }
}

/**
 * Returns default numeric priority for a queue.
 */
export function getQueueDefaultPriority(queueName: string): number {
  return (
    QUEUE_PRIORITY_BEHAVIOR[queueName]?.defaultPriority ??
    DEFAULT_JOB_PRIORITY_NUMERIC
  );
}

/**
 * Returns priority behavior definition for a queue.
 */
export function getQueuePriorityBehavior(
  queueName: string,
): QueuePriorityBehavior {
  return (
    QUEUE_PRIORITY_BEHAVIOR[queueName] ?? {
      defaultPriority: DEFAULT_JOB_PRIORITY_NUMERIC,
      defaultLevel: DEFAULT_JOB_PRIORITY,
      allowJobPriorityOverride: true,
      maxPriorityLevel: JobPriorityNumeric.HIGH,
    }
  );
}
