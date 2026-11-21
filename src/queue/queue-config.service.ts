import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { BullRootModuleOptions } from '@nestjs/bullmq';
import {
  DEFAULT_JOB_PRIORITY_NUMERIC,
  JobPriorityLevel,
  QueuePriorityBehavior,
  assertAuthorizedJobPriority,
  getQueuePriorityBehavior,
  toBullMQPriority,
} from './job-priority';

export interface QueueRuntimeConfig {
  prefix: string;
  defaultAttempts: number;
  defaultBackoffDelayMs: number;
  removeOnComplete: number;
  removeOnFail: number;
  defaultPriority: number;
}

@Injectable()
export class QueueConfigService {
  constructor(private readonly config: ConfigService) {}

  get connection(): BullRootModuleOptions['connection'] {
    const tlsEnabled = this.getBoolean('QUEUE_REDIS_TLS', false);
    const queuePort =
      this.config.get<string>('QUEUE_REDIS_PORT') ??
      this.config.get<string>('REDIS_PORT');

    return {
      host:
        this.config.get<string>('QUEUE_REDIS_HOST') ||
        this.config.get<string>('REDIS_HOST', 'localhost'),
      port: this.parseInteger('QUEUE_REDIS_PORT', queuePort, 6379, 1),
      username: this.config.get<string>('QUEUE_REDIS_USERNAME') || undefined,
      password:
        this.config.get<string>('QUEUE_REDIS_PASSWORD') ||
        this.config.get<string>('REDIS_PASSWORD') ||
        undefined,
      db: this.getInteger('QUEUE_REDIS_DB', 0, 0),
      ...(tlsEnabled ? { tls: {} } : {}),
    };
  }

  get runtime(): QueueRuntimeConfig {
    return {
      prefix: this.config.get<string>('QUEUE_PREFIX', 'clips'),
      defaultAttempts: this.getInteger('QUEUE_DEFAULT_ATTEMPTS', 3, 1),
      defaultBackoffDelayMs: this.getInteger(
        'QUEUE_DEFAULT_BACKOFF_DELAY_MS',
        1000,
        0,
      ),
      removeOnComplete: this.getInteger('QUEUE_REMOVE_ON_COMPLETE', 1000, 0),
      removeOnFail: this.getInteger('QUEUE_REMOVE_ON_FAIL', 5000, 0),
      defaultPriority: this.getInteger(
        'QUEUE_DEFAULT_PRIORITY',
        DEFAULT_JOB_PRIORITY_NUMERIC,
        1,
      ),
    };
  }

  get bullOptions(): BullRootModuleOptions {
    const runtime = this.runtime;

    return {
      connection: this.connection,
      prefix: runtime.prefix,
      defaultJobOptions: {
        attempts: runtime.defaultAttempts,
        backoff: {
          type: 'exponential',
          delay: runtime.defaultBackoffDelayMs,
        },
        removeOnComplete: runtime.removeOnComplete,
        removeOnFail: runtime.removeOnFail,
        priority: runtime.defaultPriority,
      },
    };
  }

  /**
   * Resolves the effective priority for a job in a given queue.
   * If a per-job override is provided, it is converted to a BullMQ integer priority.
   * Otherwise, queue-specific environment override or default behavior is used.
   */
  getQueuePriority(
    queueName: string,
    overridePriority?: JobPriorityLevel | number | string,
  ): number {
    const behavior = this.getQueueBehavior(queueName);

    if (overridePriority !== undefined && overridePriority !== null && behavior.allowJobPriorityOverride) {
      return toBullMQPriority(overridePriority, behavior.defaultPriority);
    }

    const envKey = `QUEUE_PRIORITY_${queueName.replace(/-/g, '_').toUpperCase()}`;
    const rawEnv = this.config.get<string>(envKey);
    if (rawEnv !== undefined && rawEnv.trim() !== '') {
      return this.parseInteger(envKey, rawEnv, behavior.defaultPriority, 1);
    }

    return behavior.defaultPriority;
  }

  /**
   * Returns queue-specific priority behavior configuration.
   */
  getQueueBehavior(queueName: string): QueuePriorityBehavior {
    return getQueuePriorityBehavior(queueName);
  }

  /**
   * Verifies that the caller has sufficient privileges for the requested priority level.
   * Rejects non-admin assignment of critical priority with 403 Forbidden.
   */
  validatePriorityAuthorization(
    priority?: JobPriorityLevel | string,
    user?: { role?: string } | null,
  ): void {
    assertAuthorizedJobPriority(priority, user);
  }

  private getBoolean(key: string, fallback: boolean): boolean {
    const value = this.config.get<string>(key);
    if (value === undefined) return fallback;
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  }

  private getInteger(key: string, fallback: number, minimum: number): number {
    const raw = this.config.get<string>(key);
    return this.parseInteger(key, raw, fallback, minimum);
  }

  private parseInteger(
    key: string,
    raw: string | undefined,
    fallback: number,
    minimum: number,
  ): number {
    if (raw === undefined || raw.trim() === '') return fallback;

    const value = Number(raw);
    if (!Number.isInteger(value) || value < minimum) {
      throw new Error(
        `${key} must be an integer greater than or equal to ${minimum}`,
      );
    }

    return value;
  }
}
