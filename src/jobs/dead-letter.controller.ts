import { Controller, Get, Post, Param, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { Auth } from '../auth/decorators/auth.decorator';
import { DeadLetterService } from './dead-letter.service';

@ApiTags('admin-queues')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Unauthorized' })
@ApiForbiddenResponse({ description: 'Forbidden — admin access required' })
@ApiInternalServerErrorResponse({ description: 'Internal server error' })
@Controller('admin/queues/dead-letter')
@Auth('admin')
export class DeadLetterController {
  constructor(private readonly deadLetterService: DeadLetterService) {}

  @Get()
  @ApiOperation({
    summary: 'Inspect dead-letter (permanently failed) jobs',
    description:
      'Lists retained failed jobs across all queues. Failed jobs are kept (removeOnFail: false) for manual investigation instead of being silently removed.',
  })
  @ApiQuery({
    name: 'queue',
    required: false,
    description: 'Queue filter: clip-generation, clip-posting, nft-mint. Omit for all queues.',
    example: 'clip-generation',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Max jobs to return (default 50).',
    example: 50,
  })
  @ApiResponse({ status: 200, description: 'Dead-letter jobs returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin only' })
  async list(
    @Query('queue') queue?: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = limit ? Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200) : 50;
    return this.deadLetterService.listFailed(queue, parsed);
  }

  @Post('retry/:jobId')
  @ApiOperation({
    summary: 'Replay a dead-letter job',
    description: 'Moves a failed job back to the waiting state for another attempt.',
  })
  @ApiParam({ name: 'jobId', description: 'Failed job ID to replay' })
  @ApiResponse({ status: 200, description: 'Job replay initiated' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin only' })
  @ApiNotFoundResponse({ description: 'Failed job not found in dead letter' })
  async retry(@Param('jobId') jobId: string, @Query('queue') queue?: string) {
    return this.deadLetterService.retry(jobId, queue);
  }
}
