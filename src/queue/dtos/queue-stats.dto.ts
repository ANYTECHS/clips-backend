import { ApiProperty } from '@nestjs/swagger';

/**
 * QueueJobCountDto represents the count of jobs in each state.
 */
export class QueueJobCountDto {
  @ApiProperty({
    type: Number,
    description: 'Number of jobs waiting to be processed',
    example: 10,
  })
  waiting: number;

  @ApiProperty({
    type: Number,
    description: 'Number of jobs currently being processed',
    example: 2,
  })
  active: number;

  @ApiProperty({
    type: Number,
    description: 'Number of completed jobs',
    example: 150,
  })
  completed: number;

  @ApiProperty({
    type: Number,
    description: 'Number of failed jobs',
    example: 5,
  })
  failed: number;

  @ApiProperty({
    type: Number,
    description: 'Number of delayed jobs',
    example: 3,
  })
  delayed: number;

  @ApiProperty({
    type: Number,
    description: 'Number of prioritized jobs',
    example: 1,
  })
  prioritized: number;
}

/**
 * QueueHealthDto represents the health status of a single queue.
 */
export class QueueHealthDto {
  @ApiProperty({
    type: String,
    description: 'Queue name',
    example: 'clip-generation',
  })
  queue: string;

  @ApiProperty({
    type: String,
    enum: ['healthy', 'degraded', 'unhealthy'],
    description: 'Overall health status of the queue',
    example: 'healthy',
  })
  status: 'healthy' | 'degraded' | 'unhealthy';

  @ApiProperty({
    type: QueueJobCountDto,
    description: 'Job counts by state',
  })
  jobs: QueueJobCountDto;

  @ApiProperty({
    type: Number,
    description: 'Total number of jobs across all states',
    example: 171,
  })
  totalJobs: number;

  @ApiProperty({
    type: Number,
    description:
      'Failure rate as a percentage (0-100). Calculated as (failed / (completed + failed)) * 100',
    example: 3.2,
  })
  failureRate: number;

  @ApiProperty({
    type: Number,
    description: 'Average retry count for jobs in this queue',
    example: 1.2,
  })
  avgRetryCount: number;

  @ApiProperty({
    type: String,
    description: 'ISO 8601 timestamp when this health check was performed',
    example: '2026-06-27T10:30:45.123Z',
  })
  timestamp: string;
}

/**
 * QueueHealthResponseDto represents the health metrics for all queues.
 */
export class QueueHealthResponseDto {
  @ApiProperty({
    type: String,
    enum: ['healthy', 'degraded', 'unhealthy'],
    description: 'Overall system health based on all queues',
    example: 'healthy',
  })
  status: 'healthy' | 'degraded' | 'unhealthy';

  @ApiProperty({
    type: [QueueHealthDto],
    description: 'Health metrics for each queue',
  })
  queues: QueueHealthDto[];

  @ApiProperty({
    type: Number,
    description: 'Total jobs across all queues',
    example: 500,
  })
  totalJobsAcrossQueues: number;

  @ApiProperty({
    type: Number,
    description: 'System-wide failure rate as a percentage',
    example: 2.8,
  })
  systemWideFailureRate: number;

  @ApiProperty({
    type: String,
    description: 'ISO 8601 timestamp when this health check was performed',
    example: '2026-06-27T10:30:45.123Z',
  })
  timestamp: string;
}

/**
 * QueueStatisticsDto represents detailed statistics about queue performance.
 */
export class QueueStatisticsDto {
  @ApiProperty({
    type: String,
    description: 'Queue name',
    example: 'clip-generation',
  })
  queue: string;

  @ApiProperty({
    type: QueueJobCountDto,
    description: 'Current job counts by state',
  })
  jobCounts: QueueJobCountDto;

  @ApiProperty({
    type: Number,
    description: 'Total jobs processed (completed + failed) since server start',
    example: 1000,
  })
  totalProcessed: number;

  @ApiProperty({
    type: Number,
    description: 'Success count (completed jobs)',
    example: 950,
  })
  successCount: number;

  @ApiProperty({
    type: Number,
    description: 'Failure count (failed jobs)',
    example: 50,
  })
  failureCount: number;

  @ApiProperty({
    type: Number,
    description: 'Failure rate as a percentage (0-100)',
    example: 5.0,
  })
  failureRate: number;

  @ApiProperty({
    type: Number,
    description: 'Average time to process a job in seconds',
    example: 12.5,
  })
  avgProcessingTimeSeconds: number;

  @ApiProperty({
    type: Number,
    description: 'Average number of retries per job',
    example: 0.8,
  })
  avgRetryCount: number;

  @ApiProperty({
    type: Object,
    additionalProperties: { type: Number },
    description: 'Count of failures by reason',
    example: { timeout: 10, 'out_of_memory': 5, 'network_error': 3 },
  })
  failureReasonCounts: Record<string, number>;

  @ApiProperty({
    type: String,
    description: 'ISO 8601 timestamp when this statistics snapshot was taken',
    example: '2026-06-27T10:30:45.123Z',
  })
  timestamp: string;
}

/**
 * QueueStatisticsResponseDto represents statistics for all queues.
 */
export class QueueStatisticsResponseDto {
  @ApiProperty({
    type: [QueueStatisticsDto],
    description: 'Statistics for each queue',
  })
  queues: QueueStatisticsDto[];

  @ApiProperty({
    type: String,
    description: 'ISO 8601 timestamp when this statistics snapshot was taken',
    example: '2026-06-27T10:30:45.123Z',
  })
  timestamp: string;
}
