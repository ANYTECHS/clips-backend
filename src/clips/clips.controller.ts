import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  NotFoundException,
  BadRequestException,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { ClipsService } from './clips.service.js';
import type { ClipSortField, SortOrder } from './clips.service.js';
import { CreateClipDto } from './dto/create-clip.dto.js';
import type { BulkUpdateClipsDto } from './dto/bulk-update-clips.dto.js';
import { LoginGuard } from '../auth/guards/login.guard.js';
import { BulkDeleteClipsDto } from './dto/bulk-delete-clips.dto.js';
import { PublishClipDto } from './dto/publish-clip.dto.js';
import { ClipPublishService } from './clip-publish.service.js';
import type { ClipGenerationJob } from './clip-generation.processor';
import { QueueRateLimitGuard, QueueRateLimit } from '../common/guards/queue-rate-limit.guard';

@ApiTags('clips')
@ApiBearerAuth('access-token')
@UseGuards(LoginGuard)
@Controller('clips')
export class ClipsController {
  constructor(
    private readonly clipsService: ClipsService,
    private readonly clipPublishService: ClipPublishService,
  ) {}

  @Post('generate')
  @UseGuards(QueueRateLimitGuard)
  @QueueRateLimit({ queue: 'clip-generation', maxJobs: 5 })
  @ApiOperation({
    summary: 'Generate a clip',
    description: 'Enqueue a clip-generation job with automatic retry + exponential backoff. Returns the BullMQ job ID immediately; processing happens asynchronously.',
  })
  @ApiResponse({ status: 201, description: 'Clip generation job queued successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 429, description: 'Too many active jobs' })
  generate(@Body() dto: ClipGenerationJob) {
    return this.clipsService.enqueueClip(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List clips',
    description: 'List clips sorted by viralityScore descending by default. Supports filtering by videoId and custom sorting.',
  })
  @ApiResponse({ status: 200, description: 'List of clips returned successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiQuery({ name: 'videoId', required: false, description: 'Filter to a specific source video' })
  @ApiQuery({ name: 'sort', required: false, description: 'Sort format: field:order (e.g., viralityScore:desc, createdAt:asc)' })
  @ApiQuery({ name: 'sortBy', required: false, description: 'Legacy: viralityScore | createdAt | duration' })
  @ApiQuery({ name: 'order', required: false, description: 'Legacy: asc | desc' })
  list(
    @Query('videoId') videoId?: string,
    @Query('sort') sort?: string,
    @Query('sortBy') sortBy?: ClipSortField,
    @Query('order') order?: SortOrder,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedPage = page !== undefined ? parseInt(page, 10) : 1;
    const parsedLimit = limit !== undefined ? parseInt(limit, 10) : 20;

    if (isNaN(parsedPage) || isNaN(parsedLimit)) {
      throw new BadRequestException('page and limit must be integers');
    }

    let finalSortBy = sortBy;
    let finalOrder = order;

    if (sort) {
      const [field, dir] = sort.split(':');
      if (field) finalSortBy = field as ClipSortField;
      if (dir) finalOrder = dir as SortOrder;
    }

    return this.clipsService.listClips({
      videoId,
      sortBy: finalSortBy,
      order: finalOrder,
      page: parsedPage,
      limit: parsedLimit,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get clip by ID' })
  @ApiParam({ name: 'id', description: 'Clip ID' })
  @ApiResponse({ status: 200, description: 'Clip found and returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Clip not found' })
  async findOne(@Param('id') id: string) {
    const clip = await this.clipsService.findById(id);
    if (!clip) throw new NotFoundException(`Clip ${id} not found`);
    return clip;
  }

  @Post('bulk-update')
  @ApiOperation({
    summary: 'Bulk update clips',
    description: 'Bulk update selected and/or postStatus for multiple clips in one transaction. Returns update statistics including notFoundIds for invalid clip IDs.',
  })
  @ApiResponse({ status: 200, description: 'Clips updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  bulkUpdate(@Body() dto: BulkUpdateClipsDto, @Req() req: Request) {
    const userId: number = Number(
      (req as any).user?.id ?? (req.headers['x-user-id'] as string) ?? 0,
    );
    return this.clipsService.bulkUpdate(userId, dto);
  }

  @Post('bulk-delete')
  @ApiOperation({ summary: 'Bulk delete rejected clips' })
  @ApiResponse({ status: 200, description: 'Clips deleted successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  bulkDelete(@Body() dto: BulkDeleteClipsDto, @Req() req: Request) {
    const userId: number = Number(
      (req as any).user?.id ?? (req.headers['x-user-id'] as string) ?? 0,
    );
    return this.clipsService.bulkDeleteRejected(userId, dto.clipIds);
  }

  @Post(':id/regenerate')
  @UseGuards(QueueRateLimitGuard)
  @QueueRateLimit({ queue: 'clip-generation', maxJobs: 5 })
  @ApiOperation({
    summary: 'Regenerate a clip',
    description: 'Re-run FFmpeg cut for a single clip using original timestamps.',
  })
  @ApiParam({ name: 'id', description: 'Clip ID' })
  @ApiResponse({ status: 200, description: 'Clip regeneration started' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Clip not found' })
  @ApiResponse({ status: 429, description: 'Too many active jobs' })
  regenerate(@Param('id') id: string, @Req() req: Request) {
    const userId: number = Number(
      (req as any).user?.id ?? (req.headers['x-user-id'] as string) ?? 0,
    );
    return this.clipsService.regenerate(userId, Number(id));
  }

  @Patch(':id/caption')
  @ApiOperation({
    summary: 'Update clip caption',
    description: 'Update the auto-generated caption for a clip. Useful for customizing social media posts.',
  })
  @ApiParam({ name: 'id', description: 'Clip ID' })
  @ApiResponse({ status: 200, description: 'Caption updated' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Clip not found' })
  async updateCaption(
    @Param('id') id: string,
    @Body('caption') caption: string,
    @Req() req: Request,
  ) {
    if (!caption || typeof caption !== 'string') {
      throw new BadRequestException('caption is required and must be a string');
    }
    const userId: number = Number(
      (req as any).user?.id ?? (req.headers['x-user-id'] as string) ?? 0,
    );
    return this.clipsService.updateCaption(Number(id), userId, caption);
  }
}
