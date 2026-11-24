import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import {
  Counter,
  Gauge,
  Histogram,
} from 'prom-client';

/**
 * QueueMetricsService collects and exposes BullMQ queue metrics (Issue #1274).
 *
 * Metrics tracked:
 *   - Job counts by queue and state (waiting, active, completed, failed, delayed, prioritized)
 *   - Job processing time (duration histogram)
 *   - Job failure rate (ratio 0.0 to 1.0)
 *   - Job throughput (completed jobs per minute)
 *   - Queue depth (waiting + delayed jobs)
 *   - Active job count
 *   - Total job count
 *   - Job completions and failures
 *   - Worker memory usage (rss, heap total, heap used, external)
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

  // Gauge: active jobs currently being processed
  private readonly activeJobs = new Gauge({
    name: 'clipcash_queue_active_jobs',
    help: 'Number of active jobs currently being processed by workers',
    labelNames: ['queue'],
  });

  // Gauge: queue depth (waiting + delayed jobs)
  private readonly queueDepth = new Gauge({
    name: 'clipcash_queue_depth',
    help: 'Total queue depth (waiting and delayed jobs) awaiting execution',
    labelNames: ['queue'],
  });

  // Gauge: total cumulative jobs across all states
  private readonly totalJobs = new Gauge({
    name: 'clipcash_queue_total_jobs',
    help: 'Total cumulative jobs in queue across all states',
    labelNames: ['queue'],
  });

  // Gauge: job failure rate ratio
  private readonly failureRate = new Gauge({
    name: 'clipcash_queue_failure_rate',
    help: 'Job failure rate ratio (failed / (completed + failed)) by queue (0.0 to 1.0)',
    labelNames: ['queue'],
  });

  // Gauge: job throughput (completed jobs per minute)
  private readonly jobThroughput = new Gauge({
    name: 'clipcash_queue_job_throughput_per_minute',
    help: 'Job throughput measured in completed jobs per minute',
    labelNames: ['queue'],
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

  // Counter: jobs cleaned up by queue and type
  private readonly jobsCleaned = new Counter({
    name: 'clipcash_queue_jobs_cleaned_total',
    help: 'Total number of jobs cleaned up by queue and job type',
    labelNames: ['queue', 'job_type'],
  });

  // Gauge: worker process memory usage
  private readonly workerMemoryUsage = new Gauge({
    name: 'clipcash_queue_worker_memory_bytes',
    help: 'Worker process memory usage in bytes',
    labelNames: ['type'],
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
   * @param counts Job counts by state (waiting, active, completed, failed, delayed, prioritized)
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
    const waiting = counts.waiting ?? 0;
    const active = counts.active ?? 0;
    const completed = counts.completed ?? 0;
    const failed = counts.failed ?? 0;
    const delayed = counts.delayed ?? 0;
    const prioritized = counts.prioritized ?? 0;

    this.jobCount.set({ queue, state: 'waiting' }, waiting);
    this.jobCount.set({ queue, state: 'active' }, active);
    this.jobCount.set({ queue, state: 'completed' }, completed);
    this.jobCount.set({ queue, state: 'failed' }, failed);
    this.jobCount.set({ queue, state: 'delayed' }, delayed);
    this.jobCount.set({ queue, state: 'prioritized' }, prioritized);

    this.activeJobs.set({ queue }, active);
    this.queueDepth.set({ queue }, waiting + delayed);
    this.totalJobs.set({ queue }, waiting + active + completed + failed + delayed + prioritized);

    const totalProcessed = completed + failed;
    this.failureRate.set({ queue }, totalProcessed > 0 ? failed / totalProcessed : 0);
  }

  /**
   * Record active jobs count explicitly.
   */
  recordActiveJobs(queue: string, count: number): void {
    this.activeJobs.set({ queue }, count);
  }

  /**
   * Record queue depth (waiting + delayed jobs) explicitly.
   */
  recordQueueDepth(queue: string, depth: number): void {
    this.queueDepth.set({ queue }, depth);
  }

  /**
   * Record total jobs count explicitly.
   */
  recordTotalJobs(queue: string, count: number): void {
    this.totalJobs.set({ queue }, count);
  }

  /**
   * Record failure rate ratio explicitly.
   */
  recordFailureRate(queue: string, rate: number): void {
    this.failureRate.set({ queue }, Math.max(0, Math.min(1, rate)));
  }

  /**
   * Record throughput (jobs completed per minute).
   */
  recordThroughput(queue: string, throughputPerMinute: number): void {
    this.jobThroughput.set({ queue }, Math.max(0, throughputPerMinute));
  }

  /**
   * Record worker process memory usage.
   */
  recordWorkerMemoryUsage(usage: NodeJS.MemoryUsage): void {
    this.workerMemoryUsage.set({ type: 'rss' }, usage.rss);
    this.workerMemoryUsage.set({ type: 'heapTotal' }, usage.heapTotal);
    this.workerMemoryUsage.set({ type: 'heapUsed' }, usage.heapUsed);
    this.workerMemoryUsage.set({ type: 'external' }, usage.external);
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
   * Record jobs cleaned up by queue and job type.
   *
   * @param queue Queue name
   * @param jobType Job type ('completed' or 'failed')
   * @param count Number of jobs cleaned up
   */
  recordJobsCleaned(queue: string, jobType: 'completed' | 'failed', count: number): void {
    this.jobsCleaned.inc({ queue, job_type: jobType }, count);
  }

  /**
   * Get all metrics registered in this service.
   * Returns the metrics in Prometheus format.
   *
   * @returns Prometheus-formatted metrics objects
   */
  getMetrics(): {
    jobCount: Gauge;
    activeJobs: Gauge;
    queueDepth: Gauge;
    totalJobs: Gauge;
    failureRate: Gauge;
    jobThroughput: Gauge;
    jobDuration: Histogram;
    jobFailures: Counter;
    jobCompletions: Counter;
    jobRetryRate: Gauge;
    jobFailureReasons: Gauge;
    jobsCleaned: Counter;
    workerMemoryUsage: Gauge;
  } {
    return {
      jobCount: this.jobCount,
      activeJobs: this.activeJobs,
      queueDepth: this.queueDepth,
      totalJobs: this.totalJobs,
      failureRate: this.failureRate,
      jobThroughput: this.jobThroughput,
      jobDuration: this.jobDuration,
      jobFailures: this.jobFailures,
      jobCompletions: this.jobCompletions,
      jobRetryRate: this.jobRetryRate,
      jobFailureReasons: this.jobFailureReasons,
      jobsCleaned: this.jobsCleaned,
      workerMemoryUsage: this.workerMemoryUsage,
    };
  }

  /**
   * Clear job start time tracking (useful for testing or cleanup).
   */
  clearJobStartTimes(): void {
    this.jobStartTimes.clear();
  }
}
