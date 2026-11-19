import { Controller, Get, Post, Query, Param } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiUnauthorizedResponse,
  ApiInternalServerErrorResponse,
  ApiServiceUnavailableResponse,
} from '@nestjs/swagger';
import { JobsService } from './jobs.service';
import {
  FailedJobResponseDto,
  JobProgressResponseDto,
} from './dto/job-progress-response.dto';

/**
 * Queue observability endpoints (Issue #1235).
 *
 * - `failed` jobs have exhausted all BullMQ attempts and are retained
 *   (`removeOnFail: false`) for inspection.
 * - Retryable failures are retried automatically with exponential backoff;
 *   only final failures are returned here.
 * - Queue/Redis outages surface as 503 so API consumers can distinguish
 *   asynchronous processing failures from transport failures.
 */
@ApiTags('jobs')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Unauthorized — missing or invalid JWT' })
@ApiInternalServerErrorResponse({ description: 'Internal server error while reading queue state' })
@ApiServiceUnavailableResponse({
  description:
    'Queue backend (Redis/BullMQ) unavailable. Retry the request; the underlying job may still be queued.',
})
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get('failed')
  @ApiOperation({
    summary: 'List failed jobs',
    description:
      'Lists jobs that exhausted all retry attempts in the specified queue. ' +
      'Each entry includes `failedReason` (consistent `[queue:jobId] message` format), ' +
      '`attemptsMade`, and timestamps. Failed jobs are retained and can be retried via `POST /jobs/retry/:jobId`.',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    description:
      'Queue type (default: clip-generation). Supported: clip-generation, clip-posting, nft-mint',
    example: 'clip-generation',
  })
  @ApiResponse({
    status: 200,
    description: 'List of permanently failed jobs (all retries exhausted). Empty array when no failures.',
    type: [FailedJobResponseDto],
  })
  @ApiResponse({ status: 400, description: 'Unsupported queue type' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Failed to read failed jobs from the queue backend' })
  @ApiResponse({
    status: 503,
    description: 'Queue backend unavailable (Redis/BullMQ connection failure)',
  })
  async getFailedJobs(@Query('type') type: string) {
    return this.jobsService.getFailedJobs(type || 'clip-generation');
  }

  @Get(':jobId/progress')
  @ApiOperation({
    summary: 'Get current job progress',
    description:
      'Returns the current BullMQ progress percentage, stage, and lifecycle state for the specified job. ' +
      'Supports clip-generation jobs and other queue-backed jobs. ' +
      '`state=failed` indicates all attempts are exhausted; see `failedReason` for the consistent error message. ' +
      '`state=delayed` indicates a retry is scheduled with exponential backoff.',
  })
  @ApiParam({
    name: 'jobId',
    description: 'BullMQ job ID to inspect',
    example: 'clip-123',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Queue type to search (optional). Searches all supported queues if omitted.',
    example: 'clip-generation',
  })
  @ApiResponse({
    status: 200,
    description: 'Current job progress response, including failed-job states',
    type: JobProgressResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Unsupported queue type' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Job not found in the searched queue(s)' })
  @ApiResponse({ status: 500, description: 'Failed to read job state from the queue backend' })
  @ApiResponse({
    status: 503,
    description: 'Queue backend unavailable (Redis/BullMQ connection failure)',
  })
  async getJobProgress(
    @Param('jobId') jobId: string,
    @Query('type') type?: string,
  ): Promise<JobProgressResponseDto> {
    return this.jobsService.getJobProgress(jobId, type);
  }

  @Post('retry/:jobId')
  @ApiOperation({
    summary: 'Retry failed job',
    description:
      'Retries a specific failed job by its ID. Optionally specify the queue type to narrow the search. ' +
      'Only jobs in `failed` state can be retried; other states return 400. ' +
      'Retry resets the BullMQ attempt counter according to the queue retry policy.',
  })
  @ApiParam({
    name: 'jobId',
    description: 'Job ID to retry',
    example: 'job_abc123',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    description:
      'Queue type to search (optional). Searches all queues if omitted.',
    example: 'clip-generation',
  })
  @ApiResponse({ status: 200, description: 'Job retry initiated' })
  @ApiResponse({ status: 400, description: 'Job is not in failed state (only failed jobs can be retried)' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Job not found in the searched queue(s)' })
  @ApiResponse({ status: 500, description: 'Failed to retry the job due to a queue backend error' })
  @ApiResponse({
    status: 503,
    description: 'Queue backend unavailable (Redis/BullMQ connection failure)',
  })
  async retryJob(@Param('jobId') jobId: string, @Query('type') type?: string) {
    return this.jobsService.retryJob(jobId, type);
  }
}
