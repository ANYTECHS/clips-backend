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
} from '@nestjs/swagger';
import { JobsService } from './jobs.service';
import { JobProgressResponseDto } from './dto/job-progress-response.dto';

@ApiTags('jobs')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Unauthorized' })
@ApiInternalServerErrorResponse({ description: 'Internal server error' })
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get('failed')
  @ApiOperation({
    summary: 'List failed jobs',
    description:
      'Lists failed jobs in the specified queue. Useful for monitoring and debugging.',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    description:
      'Queue type (default: clip-generation). Supported: clip-generation, clip-posting, nft-mint',
    example: 'clip-generation',
  })
  @ApiResponse({ status: 200, description: 'List of failed jobs returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getFailedJobs(@Query('type') type: string) {
    return this.jobsService.getFailedJobs(type || 'clip-generation');
  }

  @Get(':jobId/progress')
  @ApiOperation({
    summary: 'Get current job progress',
    description:
      'Returns the current BullMQ progress percentage and stage for the specified job. Supports clip-generation jobs and other queue-backed jobs.',
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
    description: 'Current job progress response',
    type: JobProgressResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Job not found' })
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
      'Retries a specific failed job by its ID. Optionally specify the queue type to narrow the search.',
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
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async retryJob(@Param('jobId') jobId: string, @Query('type') type?: string) {
    return this.jobsService.retryJob(jobId, type);
  }
}
