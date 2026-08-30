/**
 * ClipsController — HTTP endpoints for clip management.
 *
 * Issue #850: Uses the reusable @Auth() decorator at the class level so every
 *             endpoint is automatically protected by JwtAuthGuard and
 *             documented with @ApiBearerAuth() — no per-method duplication.
 *
 * Issue #866: List endpoint delegates to ClipsService.listClips() which uses
 *             selective `select` (no broad `include`) to prevent N+1 patterns.
 */
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { Auth } from '../auth/decorators/auth.decorator';
import {
  QueueRateLimitGuard,
  QueueRateLimit,
} from '../common/guards/queue-rate-limit.guard';
import { ClipsService } from './clips.service';
import type { ClipSortField, SortOrder } from './clips.service';
import { ClipPublishService } from './clip-publish.service';
import type { ClipGenerationJob } from './clip-generation.processor';
import { ClipResponseDto } from './dto/clip-response.dto';
import type { BulkUpdateClipsDto } from './dto/bulk-update-clips.dto';
import { BulkDeleteClipsDto } from './dto/bulk-delete-clips.dto';
import { UpdateClipRoyaltyDto } from './dto/update-clip-royalty.dto';
import { DEFAULT_CLIP_ROYALTY_BPS } from './dto/create-clip.dto';

/**
 * All clip endpoints require a valid JWT.
 * Protected via the @Auth() composite decorator (issue #850).
 */
@ApiTags('clips')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Unauthorized — JWT token required' })
@ApiInternalServerErrorResponse({ description: 'Internal server error' })
@Auth()
@Controller('clips')
export class ClipsController {
  constructor(
    private readonly clipsService: ClipsService,
    private readonly clipPublishService: ClipPublishService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // Generate
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * POST /clips/generate
   *
   * Enqueue a clip-generation job for a video.
   * Rate-limited to 5 active jobs per user.
   */
  @Post('generate')
  @UseGuards(QueueRateLimitGuard)
  @QueueRateLimit({ queue: 'clip-generation', maxJobs: 5 })
  @ApiOperation({
    summary: 'Generate clips from a video',
    description:
      'Enqueues a clip-generation job with automatic retry + exponential backoff. ' +
      'Returns the BullMQ job ID immediately; processing happens asynchronously.',
  })
  @ApiResponse({
    status: 201,
    description: 'Clip generation job queued successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({ status: 429, description: 'Too many active jobs (max 5)' })
  generate(@Body() dto: ClipGenerationJob) {
    return this.clipsService.enqueueClip(dto);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // List & Fetch
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * GET /clips
   *
   * Issue #866: list endpoint uses selective `select` in the service layer
   * (no broad `include`) — prevents N+1 and oversized payloads.
   * Documented trade-off: full relations (video, clipPosts, earnings) are
   * only available on GET /clips/:id.
   */
  @Get()
  @ApiOperation({
    summary: 'List clips (paginated)',
    description:
      'Returns a paginated list of clips. Uses selective field loading — ' +
      'full relations (video, clipPosts, earnings) are only available on ' +
      'GET /clips/:id. Sort by viralityScore to surface the best clips first.',
  })
  @ApiOkResponse({
    description: 'Paginated list of clips returned successfully',
    type: ClipResponseDto,
    isArray: true,
  })
  @ApiQuery({ name: 'videoId', required: false, description: 'Filter to a specific source video' })
  @ApiQuery({
    name: 'sort',
    required: false,
    description: 'Combined sort: field:order (e.g. viralityScore:desc, createdAt:asc)',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    description: 'Sort field: viralityScore | createdAt | duration',
  })
  @ApiQuery({ name: 'order', required: false, description: 'asc | desc' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (1-based, default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Results per page (1–100, default: 20)' })
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

    // Combined sort format: "field:order"
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

  /**
   * GET /clips/:id
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get a single clip by ID' })
  @ApiParam({ name: 'id', description: 'Clip ID', type: Number })
  @ApiOkResponse({ description: 'Clip found', type: ClipResponseDto })
  @ApiNotFoundResponse({ description: 'Clip not found' })
  async findOne(@Param('id') id: string) {
    const clip = await this.clipsService.findById(Number(id));
    if (!clip) throw new NotFoundException(`Clip ${id} not found`);
    return clip;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Bulk operations
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * POST /clips/bulk-update
   *
   * Update selected, postStatus, caption, or royaltyBps for multiple clips
   * in a single transaction.
   */
  @Post('bulk-update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Bulk update clips',
    description:
      'Bulk update selected and/or postStatus for multiple clips in one transaction. ' +
      'Returns update statistics including notFoundIds for invalid clip IDs.',
  })
  @ApiResponse({ status: 200, description: 'Clips updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  bulkUpdate(@Body() dto: BulkUpdateClipsDto, @Req() req: Request) {
    const userId: number = Number(
      (req as any).user?.id ?? (req.headers['x-user-id'] as string) ?? 0,
    );
    return this.clipsService.bulkUpdate(userId, dto);
  }

  /**
   * POST /clips/bulk-delete
   *
   * Permanently deletes the specified clips (and their Cloudinary assets)
   * after verifying ownership. Clips not owned by the caller are skipped.
   *
   * Closes #739
   */
  @Post('bulk-delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Bulk delete rejected/unwanted clips',
    description:
      'Permanently deletes the specified clips (and their Cloudinary assets) ' +
      'after verifying ownership. Clips not owned by the caller are silently skipped.',
  })
  @ApiResponse({
    status: 200,
    description: 'Deletion summary',
    schema: { example: { deleted: 3, skipped: 0, skippedIds: [] } },
  })
  @ApiBadRequestResponse({ description: 'Invalid request body' })
  @ApiForbiddenResponse({ description: 'None of the clips belong to the user' })
  bulkDelete(@Body() dto: BulkDeleteClipsDto, @Req() req: Request) {
    const userId: number = Number(
      (req as any).user?.id ?? (req.headers['x-user-id'] as string) ?? 0,
    );
    return this.clipsService.bulkDeleteRejected(userId, dto.clipIds);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Per-clip mutations
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * POST /clips/:id/regenerate
   *
   * Re-cuts a single clip using its original start/end timestamps and
   * uploads a fresh version to Cloudinary. Preserves viralityScore and title.
   *
   * Closes #734
   */
  @Post(':id/regenerate')
  @UseGuards(QueueRateLimitGuard)
  @QueueRateLimit({ queue: 'clip-generation', maxJobs: 5 })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Regenerate a clip',
    description:
      'Re-runs FFmpeg with the original timestamps, uploads a new version to ' +
      'Cloudinary and updates clipUrl + thumbnail. viralityScore and title are preserved.',
  })
  @ApiParam({ name: 'id', description: 'Clip ID', type: Number })
  @ApiResponse({ status: 200, description: 'Updated clip record with new clipUrl and thumbnail' })
  @ApiNotFoundResponse({ description: 'Clip not found' })
  @ApiForbiddenResponse({ description: 'Clip does not belong to the requesting user' })
  @ApiResponse({ status: 429, description: 'Too many active jobs' })
  regenerate(@Param('id') id: string, @Req() req: Request) {
    const userId: number = Number(
      (req as any).user?.id ?? (req.headers['x-user-id'] as string) ?? 0,
    );
    return this.clipsService.regenerate(userId, Number(id));
  }

  /**
   * PATCH /clips/:id/caption
   *
   * Update the auto-generated caption for a clip.
   */
  @Patch(':id/caption')
  @ApiOperation({
    summary: 'Update clip caption',
    description:
      'Update the auto-generated caption for a clip. Useful for customizing social media posts.',
  })
  @ApiParam({ name: 'id', description: 'Clip ID', type: Number })
  @ApiResponse({ status: 200, description: 'Caption updated' })
  @ApiBadRequestResponse({ description: 'caption is required and must be a string' })
  @ApiNotFoundResponse({ description: 'Clip not found' })
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

  /**
   * PATCH /clips/:id/royalty
   *
   * Configure creator royalty (0–1500 BPS) for a clip before minting.
   * 100 BPS = 1%. Default: 1000 (10%) when royaltyBps is omitted.
   */
  @Patch(':id/royalty')
  @ApiOperation({
    summary: 'Update clip NFT royalty BPS',
    description:
      'Configure creator royalty (0–1500 BPS) for a clip before minting. ' +
      '100 BPS = 1%. Defaults to 1000 (10%) when omitted.',
  })
  @ApiParam({ name: 'id', description: 'Clip ID', type: Number })
  @ApiOkResponse({
    description: 'Royalty BPS updated',
    schema: { example: { id: 42, royaltyBps: 1000 } },
  })
  @ApiBadRequestResponse({ description: 'royaltyBps must be 0–1500' })
  @ApiForbiddenResponse({ description: 'Clip does not belong to the requesting user' })
  @ApiNotFoundResponse({ description: 'Clip not found' })
  async updateRoyalty(
    @Param('id') id: string,
    @Body() dto: UpdateClipRoyaltyDto,
    @Req() req: Request,
  ) {
    const userId: number = Number(
      (req as any).user?.id ?? (req.headers['x-user-id'] as string) ?? 0,
    );
    return this.clipsService.updateRoyalty(
      Number(id),
      userId,
      dto.royaltyBps ?? DEFAULT_CLIP_ROYALTY_BPS,
    );
  }
}
