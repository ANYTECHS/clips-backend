import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
} from 'prom-client';

/**
 * QueueMetricsService collects and exposes BullMQ queue metrics.
 *
 * Metrics tracked:
 *   - Job counts by queue and state (waiting, active, completed, failed)
 *   - Job processing time (duration histogram)
 *   - Job failure rate
 *   - Job completion time by queue
 *   - Worker memory usage (rss, heap total, heap used)
 */
@Injectable()
export class QueueMetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueMetricsService.name);

  // Gauge: current job count by queue and state
  private readonly jobCount = new Gauge({
    name: 'clipcash_queue_job_count',
    help: 'Current number of jobs in queue by state',
    labelNames: ['queue', 'state'],
  });

  // Histogram: job processing duration (from start to completion)
  private readonly jobDuration = new Histogram({
    name: 'clipcash_queue_job_duration_seconds',
    help: 'Job processing duration in seconds',
    labelNames: ['queue', 'status'],
    buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 300, 600, 1800, 3600], // up to 1 hour
  });

  // Counter: total job failures by queue
  private readonly jobFailures = new Counter({
    name: 'clipcash_queue_job_failures_total',
    help: 'Total number of failed jobs by queue',
    labelNames: ['queue', 'reason'],
  });

  // Counter: total job completions by queue
  private readonly jobCompletions = new Counter({
    name: 'clipcash_queue_job_completions_total',
    help: 'Total number of completed jobs by queue',
    labelNames: ['queue'],
  });

  // Gauge: job retry count average by queue
  private readonly jobRetryRate = new Gauge({
    name: 'clipcash_queue_job_retry_count',
    help: 'Average retry count for jobs by queue',
    labelNames: ['queue'],
  });

  // Gauge: failure reason counts by queue and reason
  private readonly jobFailureReasons = new Gauge({
    name: 'clipcash_queue_failure_reason_count',
    help: 'Number of failed jobs by queue and failure reason (sampled from last 100 failed jobs)',
    labelNames: ['queue', 'reason'],
  });

  // Map to track job start times for duration calculation
  private readonly jobStartTimes = new Map<string, number>();

  constructor() {
    this.logger.log('QueueMetricsService initialized');
  }

  onModuleInit(): void {
    this.logger.log('QueueMetricsService started');
  }

  onModuleDestroy(): void {
    this.logger.log('QueueMetricsService destroyed');
  }

  /**
   * Record job counts for a queue.
   * Called periodically to update gauge metrics.
   *
   * @param queue Queue name
   * @param counts Job counts by state (waiting, active, completed, failed, delayed)
   */
  recordQueueCounts(
    queue: string,
    counts: {
      waiting?: number;
      active?: number;
      completed?: number;
      failed?: number;
      delayed?: number;
      prioritized?: number;
    },
  ): void {
    this.jobCount.set({ queue, state: 'waiting' }, counts.waiting ?? 0);
    this.jobCount.set({ queue, state: 'active' }, counts.active ?? 0);
    this.jobCount.set({ queue, state: 'completed' }, counts.completed ?? 0);
    this.jobCount.set({ queue, state: 'failed' }, counts.failed ?? 0);
    this.jobCount.set({ queue, state: 'delayed' }, counts.delayed ?? 0);
    this.jobCount.set({ queue, state: 'prioritized' }, counts.prioritized ?? 0);
  }

  /**
   * Record job start time for later duration calculation.
   *
   * @param jobId Unique job ID (queue:jobId or custom identifier)
   */
  recordJobStart(jobId: string): void {
    this.jobStartTimes.set(jobId, Date.now());
  }

  /**
   * Record job completion and duration.
   *
   * @param jobId Job identifier (should match recordJobStart call)
   * @param queue Queue name
   * @param status 'success' or 'failure'
   */
  recordJobCompletion(jobId: string, queue: string, status: 'success' | 'failure'): void {
    const startTime = this.jobStartTimes.get(jobId);
    if (startTime) {
      const durationSeconds = (Date.now() - startTime) / 1000;
      this.jobDuration.observe({ queue, status }, durationSeconds);
      this.jobStartTimes.delete(jobId);
    }

    if (status === 'success') {
      this.jobCompletions.inc({ queue });
    }
  }

  /**
   * Record job failure with reason.
   *
   * @param queue Queue name
   * @param reason Failure reason (e.g., 'timeout', 'error', 'cancelled')
   */
  recordJobFailure(queue: string, reason: string = 'unknown'): void {
    this.jobFailures.inc({ queue, reason });
  }

  /**
   * Record average retry count for a queue.
   * Called periodically to update gauge metrics.
   *
   * @param queue Queue name
   * @param avgRetries Average number of retries
   */
  recordAvgRetryCount(queue: string, avgRetries: number): void {
    this.jobRetryRate.set({ queue }, avgRetries);
  }

  /**
   * Record failure reason counts for a queue (sampled from failed job list).
   *
   * @param queue Queue name
   * @param reason Normalised failure reason string
   * @param count Number of jobs with this reason in the current sample
   */
  recordFailureReasonCount(queue: string, reason: string, count: number): void {
    this.jobFailureReasons.set({ queue, reason }, count);
  }

  /**
   * Get all metrics registered in this service.
   * Returns the metrics in Prometheus format.
   *
   * @returns Prometheus-formatted metrics string
   */
  getMetrics(): {
    jobCount: Gauge;
    jobDuration: Histogram;
    jobFailures: Counter;
    jobCompletions: Counter;
    jobRetryRate: Gauge;
    jobFailureReasons: Gauge;
  } {
    return {
      jobCount: this.jobCount,
      jobDuration: this.jobDuration,
      jobFailures: this.jobFailures,
      jobCompletions: this.jobCompletions,
      jobRetryRate: this.jobRetryRate,
      jobFailureReasons: this.jobFailureReasons,
    };
  }

  /**
   * Clear job start time tracking (useful for testing or cleanup).
   */
  clearJobStartTimes(): void {
    this.jobStartTimes.clear();
  }
}
