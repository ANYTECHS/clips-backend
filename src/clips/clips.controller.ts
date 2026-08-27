import {
  Controller,
  Post,
  Param,
  Body,
  UseGuards,
  Req,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
/**
 * ClipsController — HTTP endpoints for clip management.
 *
 * Issue #747: PATCH /clips/:id/royalty-bps
 *   Lets creators set a custom royalty percentage (0–15%) on a clip
 *   before minting it as an NFT on the Stellar Soroban network.
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
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
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { ClipsService } from './clips.service';
import { SetRoyaltyBpsDto, SetRoyaltyBpsResponseDto } from './dto/set-royalty-bps.dto';
import { LoginGuard } from '../auth/guards/login.guard';
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { ClipsService } from './clips.service';
import { BulkDeleteClipsDto } from './dto/bulk-delete-clips.dto';
import { LoginGuard } from '../auth/guards/login.guard.js';
  ApiQuery,
  ApiParam,
  ApiUnauthorizedResponse,
  ApiInternalServerErrorResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { ClipsService } from './clips.service.js';
import type { ClipSortField, SortOrder } from './clips.service.js';
import { CreateClipDto } from './dto/create-clip.dto.js';
import type { BulkUpdateClipsDto } from './dto/bulk-update-clips.dto.js';
import { UpdateClipRoyaltyDto } from './dto/update-clip-royalty.dto.js';
import { LoginGuard } from '../auth/guards/login.guard.js';
import { BulkDeleteClipsDto } from './dto/bulk-delete-clips.dto.js';
import { PublishClipDto } from './dto/publish-clip.dto.js';
import { ClipPublishService } from './clip-publish.service.js';
import type { ClipGenerationJob } from './clip-generation.processor';
import { ClipResponseDto } from './dto/clip-response.dto.js';
import {
  QueueRateLimitGuard,
  QueueRateLimit,
} from '../common/guards/queue-rate-limit.guard';
import { DEFAULT_CLIP_ROYALTY_BPS } from './dto/create-clip.dto.js';

@ApiTags('clips')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Unauthorized' })
@UseGuards(LoginGuard)
@Controller('clips')
export class ClipsController {
  constructor(private readonly clipsService: ClipsService) {}

  /**
   * POST /clips/:id/regenerate
   *
   * Re-cuts the clip using its original startTime/endTime, uploads a fresh
   * version to Cloudinary, and updates clipUrl + thumbnail in the DB.
   * viralityScore and title are preserved.
   * POST /clips/bulk-delete
   * Deletes a batch of clips owned by the authenticated user and removes their
   * Cloudinary assets.
   * Deletes a batch of clips owned by the authenticated user.
   * Also removes the associated Cloudinary assets.
   *
   * Closes #739
   */
  @Post('bulk-delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Bulk delete rejected/unwanted clips',
    description:
      'Permanently deletes the specified clips (and their Cloudinary assets) ' +
      'after verifying ownership. Clips not owned by the caller are skipped.',
      'after verifying ownership. Clips not owned by the caller are silently skipped.',
  })
  @ApiResponse({
    status: 200,
    description: 'Deletion summary',
    schema: { example: { deleted: 3, skipped: 0, skippedIds: [] } },
    schema: {
      example: { deleted: 3, skipped: 0, skippedIds: [] },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid request body' })
  @ApiForbiddenResponse({ description: 'None of the clips belong to the user' })
  async bulkDelete(
    @Body() dto: BulkDeleteClipsDto,
    @Req() req: any,
  ): Promise<{ deleted: number; skipped: number; skippedIds: number[] }> {
    const userId = Number(req.user?.id ?? 0);
    return this.clipsService.bulkDeleteClips(dto.clipIds, userId);
  }

  /**
   * POST /clips/:id/regenerate
   * Re-cuts a single clip using its original timestamps and uploads a fresh
   * version to Cloudinary. Preserves viralityScore and title.
   * Re-cuts a single clip using its original start/end timestamps and
   * uploads a fresh version to Cloudinary. Preserves viralityScore and title.
   *
   * Closes #734
   */
  @Post(':id/regenerate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Regenerate a single clip',
    description:
      'Re-runs FFmpeg with the original timestamps, uploads a new version to ' +
      'Cloudinary and updates clipUrl + thumbnail. viralityScore and title are preserved.',
  })
  @ApiParam({ name: 'id', description: 'Clip ID', type: Number })
  @ApiResponse({
    status: 200,
    description: 'Updated clip record with new clipUrl and thumbnail',
    schema: {
      example: {
        id: 42,
        clipUrl: 'https://res.cloudinary.com/demo/video/upload/clip-42-regen-1234567890.mp4',
        thumbnail: 'https://res.cloudinary.com/demo/image/upload/clip-42-regen-1234567890-thumb.jpg',
        status: 'ready',
        viralityScore: 0.87,
        title: 'Epic moment #42',
        startTime: 12.5,
        endTime: 42.0,
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Clip not found' })
  @ApiForbiddenResponse({ description: 'Clip does not belong to the requesting user' })
  @ApiResponse({ status: 200, description: 'Updated clip record' })
  @ApiResponse({
    status: 200,
    description: 'Updated clip record',
  })
  @ApiNotFoundResponse({ description: 'Clip not found' })
  @ApiForbiddenResponse({ description: 'Clip does not belong to the user' })
  async regenerate(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    const userId = Number(req.user?.id ?? 0);
    return this.clipsService.regenerateClip(id, userId);
  }

  /**
   * POST /clips/bulk-delete
   *
   * Deletes a batch of clips owned by the authenticated user and removes
   * their Cloudinary assets. Clips not owned by the caller are skipped.
   *
   * Closes #739
   */
  @Post('bulk-delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Bulk delete rejected/unwanted clips',
    description:
      'Permanently deletes the specified clips (and their Cloudinary assets) ' +
      'after verifying ownership. Clips not owned by the caller are skipped.',
  })
  @ApiResponse({
    status: 200,
    description: 'Deletion summary',
    schema: { example: { deleted: 3, skipped: 0, skippedIds: [] } },
  })
  @ApiBadRequestResponse({ description: 'Invalid request body' })
  @ApiForbiddenResponse({ description: 'None of the clips belong to the user' })
  async bulkDelete(@Body() dto: BulkDeleteClipsDto, @Req() req: any) {
    const userId = Number(req.user?.id ?? 0);
    return this.clipsService.bulkDeleteClips(dto.clipIds, userId);
   * PATCH /clips/:id/royalty-bps
   *
   * Issue #747: Set (or reset) the royalty basis points for a clip.
   *
   * - Range: 0–1500 (0–15%)
   * - Default: 1000 (10%) when body is empty or royaltyBps is omitted
   * - Caller must own the clip
   * - The stored value is passed to the Soroban mint instruction
   */
  @Patch(':id/royalty-bps')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set royalty BPS for a clip (Issue #747)',
    description:
      'Stores a custom royalty percentage for the clip in basis points (BPS). ' +
      '100 BPS = 1%. Allowed range: 0–1500 (0–15%). ' +
      'Defaults to 1000 (10%) when royaltyBps is omitted. ' +
      'The value is included in the Soroban mint transaction when the clip is minted as an NFT.',
  })
  @ApiParam({ name: 'id', description: 'Clip ID', example: 42 })
  @ApiOkResponse({
    description: 'Royalty BPS stored successfully',
    type: SetRoyaltyBpsResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'royaltyBps is out of range (must be 0–1500)',
  })
  @ApiForbiddenResponse({ description: 'Caller does not own the clip' })
  @ApiNotFoundResponse({ description: 'Clip not found' })
  async setRoyaltyBps(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetRoyaltyBpsDto,
    @Req() req: Request,
  ): Promise<SetRoyaltyBpsResponseDto> {
    const userId = Number((req as any).user?.id ?? 0);
    return this.clipsService.setRoyaltyBps(id, userId, dto.royaltyBps);
  }

  /**
   * GET /clips/:id/royalty-bps
   *
   * Returns the current royalty BPS for the clip.
   */
  @Get(':id/royalty-bps')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get royalty BPS for a clip (Issue #747)',
    description: 'Returns the currently configured royalty basis points for the clip.',
  })
  @ApiParam({ name: 'id', description: 'Clip ID', example: 42 })
  @ApiOkResponse({
    description: 'Current royalty BPS returned',
    type: SetRoyaltyBpsResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Clip not found' })
  async getRoyaltyBps(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<SetRoyaltyBpsResponseDto> {
    return this.clipsService.getRoyaltyBps(id);
@ApiInternalServerErrorResponse({ description: 'Internal server error' })
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
    description:
      'Enqueue a clip-generation job with automatic retry + exponential backoff. Returns the BullMQ job ID immediately; processing happens asynchronously.',
  })
  @ApiResponse({
    status: 201,
    description: 'Clip generation job queued successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 429, description: 'Too many active jobs' })
  generate(@Body() dto: ClipGenerationJob) {
    return this.clipsService.enqueueClip(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List clips',
    description:
      'List clips sorted by viralityScore descending by default. Supports filtering by videoId and custom sorting.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of clips returned successfully',
    type: ClipResponseDto,
    isArray: true,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiQuery({
    name: 'videoId',
    required: false,
    description: 'Filter to a specific source video',
  })
  @ApiQuery({
    name: 'sort',
    required: false,
    description:
      'Sort format: field:order (e.g., viralityScore:desc, createdAt:asc)',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    description: 'Legacy: viralityScore | createdAt | duration',
  })
  @ApiQuery({
    name: 'order',
    required: false,
    description: 'Legacy: asc | desc',
  })
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
  @ApiResponse({
    status: 200,
    description: 'Clip found and returned',
    type: ClipResponseDto,
  })
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
    description:
      'Bulk update selected and/or postStatus for multiple clips in one transaction. Returns update statistics including notFoundIds for invalid clip IDs.',
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
    description:
      'Re-run FFmpeg cut for a single clip using original timestamps.',
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
    description:
      'Update the auto-generated caption for a clip. Useful for customizing social media posts.',
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

  @Patch(':id/royalty')
  @ApiOperation({
    summary: 'Update clip NFT royalty BPS',
    description:
      'Configure creator royalty (0–1500 BPS) for a clip before minting. Defaults to 1000 (10%) when omitted.',
  })
  @ApiParam({ name: 'id', description: 'Clip ID' })
  @ApiResponse({
    status: 200,
    description: 'Royalty updated',
    schema: {
      example: { id: 42, royaltyBps: 1000 },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid royaltyBps (must be 0–1500)',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Clip not found' })
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
