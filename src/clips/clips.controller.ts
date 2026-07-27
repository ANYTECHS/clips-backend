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
  ApiBody,
  ApiUnauthorizedResponse,
  ApiInternalServerErrorResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiForbiddenResponse,
  ApiTooManyRequestsResponse,
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
import {
  QueueRateLimitGuard,
  QueueRateLimit,
} from '../common/guards/queue-rate-limit.guard';
import { DEFAULT_CLIP_ROYALTY_BPS } from './dto/create-clip.dto.js';

// ── Shared schema fragments ──────────────────────────────────────────────────

const ClipSchema = {
  type: 'object',
  properties: {
    id: { type: 'number', example: 101 },
    videoId: { type: 'number', example: 7 },
    title: { type: 'string', example: 'The best 30 seconds of your video' },
    caption: {
      type: 'string',
      example: 'Check this out! 🔥 #viral #clips',
    },
    clipUrl: {
      type: 'string',
      example: 'https://res.cloudinary.com/demo/video/upload/v1/clips/clip-101.mp4',
    },
    thumbnail: {
      type: 'string',
      example: 'https://res.cloudinary.com/demo/image/upload/v1/clips/thumb-101.jpg',
    },
    startTime: { type: 'number', example: 45.2 },
    endTime: { type: 'number', example: 75.6 },
    duration: { type: 'number', example: 30 },
    viralityScore: { type: 'number', example: 87, nullable: true },
    selected: { type: 'boolean', example: true },
    postStatus: {
      oneOf: [
        { type: 'string', example: 'posted' },
        {
          type: 'object',
          example: { tiktok: true, instagram: false },
        },
      ],
      nullable: true,
    },
    nftStatus: {
      type: 'string',
      enum: ['none', 'minting', 'minted', 'failed'],
      example: 'none',
      nullable: true,
    },
    royaltyBps: {
      type: 'number',
      example: 1000,
      description: 'NFT royalty in basis points (1000 = 10%)',
    },
    mintAddress: { type: 'string', nullable: true, example: null },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const ErrorSchema = (message: string) => ({
  type: 'object',
  properties: {
    statusCode: { type: 'number' },
    message: { type: 'string', example: message },
    error: { type: 'string' },
  },
});

// ─────────────────────────────────────────────────────────────────────────────

@ApiTags('clips')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({
  description: 'Missing or invalid JWT token',
  schema: ErrorSchema('Unauthorized'),
})
@ApiInternalServerErrorResponse({
  description: 'Unexpected server error',
  schema: ErrorSchema('Internal server error'),
})
@UseGuards(LoginGuard)
@Controller('clips')
export class ClipsController {
  constructor(
    private readonly clipsService: ClipsService,
    private readonly clipPublishService: ClipPublishService,
  ) {}

  // ── POST /clips/generate ───────────────────────────────────────────────────

  @Post('generate')
  @UseGuards(QueueRateLimitGuard)
  @QueueRateLimit({ queue: 'clip-generation', maxJobs: 5 })
  @ApiOperation({
    summary: 'Generate clips from a video',
    description:
      'Enqueues a clip-generation job. The job runs FFmpeg + AI virality analysis asynchronously. ' +
      'Returns immediately with the BullMQ job ID. Poll the job-status endpoint to track progress. ' +
      'Each user is limited to 5 active generation jobs; excess requests are delayed or rejected (429).',
  })
  @ApiBody({
    description: 'Clip generation parameters',
    schema: {
      type: 'object',
      required: ['videoId', 'inputPath', 'outputPath', 'startTime', 'endTime', 'positionRatio'],
      properties: {
        videoId: { type: 'string', example: '7', description: 'Source video ID' },
        inputPath: {
          type: 'string',
          example: '/tmp/uploads/video-7.mp4',
          description: 'Local path or CDN URL of the source video',
        },
        outputPath: {
          type: 'string',
          example: '/tmp/clips/clip-101.mp4',
          description: 'Destination path for the generated clip',
        },
        startTime: { type: 'number', example: 45.2, description: 'Start offset in seconds (≥ 0)' },
        endTime: {
          type: 'number',
          example: 75.6,
          description: 'End offset in seconds (> startTime; duration must be 5–300 s)',
        },
        positionRatio: {
          type: 'number',
          example: 0.3,
          description: 'startTime / totalDuration — used for AI virality scoring',
        },
        title: { type: 'string', example: 'Epic montage moment', description: 'Optional clip title' },
        transcript: {
          type: 'string',
          example: 'And here is where everything changes…',
          description: 'Optional transcript for AI caption generation',
        },
        royaltyBps: {
          type: 'number',
          example: 1000,
          description: 'NFT royalty BPS (0–1500). Defaults to 1000 (10%) when omitted.',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Job enqueued. Processing is asynchronous.',
    schema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', example: 'bfb23d4c-1a2b-4c3d-8e9f-000111222333' },
        delayed: { type: 'boolean', example: false },
        delayMs: { type: 'number', example: 0, nullable: true },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Validation error (e.g. endTime ≤ startTime, duration out of range)',
    schema: ErrorSchema('endTime must be greater than startTime'),
  })
  @ApiTooManyRequestsResponse({
    description: 'User has reached the 5-job limit for clip-generation',
    schema: ErrorSchema('Too many active clip-generation jobs'),
  })
  generate(@Body() dto: ClipGenerationJob) {
    return this.clipsService.enqueueClip(dto);
  }

  // ── GET /clips ─────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({
    summary: 'List clips',
    description:
      'Returns a paginated list of clips. Default sort is `viralityScore:desc`. ' +
      'Use `videoId` to scope the list to one video. ' +
      'Combine `page` + `limit` for pagination (limit 1–100, default page=1 limit=20).',
  })
  @ApiQuery({
    name: 'videoId',
    required: false,
    type: 'string',
    description: 'Filter clips to a specific video ID',
    example: '7',
  })
  @ApiQuery({
    name: 'sort',
    required: false,
    type: 'string',
    description: 'Compound sort: `field:order` — e.g. `viralityScore:desc`, `createdAt:asc`',
    example: 'viralityScore:desc',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['viralityScore', 'createdAt', 'duration'],
    description: '(Legacy) Sort field',
  })
  @ApiQuery({
    name: 'order',
    required: false,
    enum: ['asc', 'desc'],
    description: '(Legacy) Sort direction',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: 'number',
    description: 'Page number (1-based, default: 1)',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: 'number',
    description: 'Items per page (1–100, default: 20)',
    example: 20,
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of clips',
    schema: {
      type: 'object',
      properties: {
        data: { type: 'array', items: ClipSchema },
        meta: {
          type: 'object',
          properties: {
            total: { type: 'number', example: 250 },
            page: { type: 'number', example: 1 },
            limit: { type: 'number', example: 20 },
            totalPages: { type: 'number', example: 13 },
          },
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Non-integer page or limit values',
    schema: ErrorSchema('page and limit must be integers'),
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

  // ── GET /clips/:id ─────────────────────────────────────────────────────────

  @Get(':id')
  @ApiOperation({
    summary: 'Get a clip by ID',
    description: 'Returns full clip details including metadata, URLs, virality score, and NFT status.',
  })
  @ApiParam({ name: 'id', description: 'Clip ID', type: 'string', example: '101' })
  @ApiResponse({
    status: 200,
    description: 'Clip found',
    schema: ClipSchema,
  })
  @ApiNotFoundResponse({
    description: 'No clip with the given ID',
    schema: ErrorSchema('Clip 101 not found'),
  })
  async findOne(@Param('id') id: string) {
    const clip = await this.clipsService.findById(id);
    if (!clip) throw new NotFoundException(`Clip ${id} not found`);
    return clip;
  }

  // ── POST /clips/bulk-update ────────────────────────────────────────────────

  @Post('bulk-update')
  @ApiOperation({
    summary: 'Bulk update clips',
    description:
      'Atomically update `selected`, `postStatus`, `caption`, or `royaltyBps` across multiple clips in a single database transaction. ' +
      'Only clips owned by the authenticated user are updated. ' +
      'Returns `notFoundIds` for any clip IDs that did not match.',
  })
  @ApiBody({
    description: 'Clip IDs and the fields to update',
    schema: {
      type: 'object',
      required: ['clipIds', 'updates'],
      properties: {
        clipIds: {
          type: 'array',
          items: { type: 'number' },
          example: [101, 102, 103],
          description: 'IDs of clips to update',
        },
        updates: {
          type: 'object',
          description: 'At least one field is required',
          properties: {
            selected: { type: 'boolean', example: true },
            postStatus: {
              oneOf: [{ type: 'string', example: 'posted' }, { type: 'object' }],
              description: 'New post status value',
            },
            caption: { type: 'string', example: 'New caption text #viral' },
            royaltyBps: {
              type: 'number',
              example: 500,
              description: 'NFT royalty BPS (0–1500)',
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Update statistics',
    schema: {
      type: 'object',
      properties: {
        updatedCount: { type: 'number', example: 3 },
        updates: {
          type: 'object',
          example: { selected: true },
        },
        notFoundIds: {
          type: 'array',
          items: { type: 'number' },
          example: [],
        },
        allClipsProcessed: { type: 'boolean', example: false },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'No update fields provided',
    schema: ErrorSchema('At least one of selected, postStatus, royaltyBps, or caption must be provided'),
  })
  @ApiForbiddenResponse({
    description: 'None of the clip IDs belong to this user',
    schema: ErrorSchema('None of the provided clipIds belong to this user or exist'),
  })
  bulkUpdate(@Body() dto: BulkUpdateClipsDto, @Req() req: Request) {
    const userId: number = Number(
      (req as any).user?.id ?? (req.headers['x-user-id'] as string) ?? 0,
    );
    return this.clipsService.bulkUpdate(userId, dto);
  }

  // ── POST /clips/bulk-delete ────────────────────────────────────────────────

  @Post('bulk-delete')
  @ApiOperation({
    summary: 'Bulk delete clips',
    description:
      'Permanently deletes the specified clips and removes their assets from Cloudinary. ' +
      'Only clips owned by the authenticated user may be deleted. ' +
      'Returns count of deleted clips and any IDs that were not found.',
  })
  @ApiBody({
    description: 'Array of clip IDs to delete',
    schema: {
      type: 'object',
      required: ['clipIds'],
      properties: {
        clipIds: {
          type: 'array',
          items: { type: 'number' },
          example: [104, 105],
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Deletion results',
    schema: {
      type: 'object',
      properties: {
        deletedCount: { type: 'number', example: 2 },
        notFoundIds: { type: 'array', items: { type: 'number' }, example: [] },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'clipIds is missing or not an array',
    schema: ErrorSchema('clipIds must be an array of numbers'),
  })
  @ApiForbiddenResponse({
    description: 'Clip belongs to another user',
    schema: ErrorSchema('You do not have permission to delete clip 104'),
  })
  bulkDelete(@Body() dto: BulkDeleteClipsDto, @Req() req: Request) {
    const userId: number = Number(
      (req as any).user?.id ?? (req.headers['x-user-id'] as string) ?? 0,
    );
    return this.clipsService.bulkDeleteRejected(userId, dto.clipIds);
  }

  // ── POST /clips/:id/regenerate ─────────────────────────────────────────────

  @Post(':id/regenerate')
  @UseGuards(QueueRateLimitGuard)
  @QueueRateLimit({ queue: 'clip-generation', maxJobs: 5 })
  @ApiOperation({
    summary: 'Regenerate a clip',
    description:
      'Re-queues an FFmpeg cut job for an existing clip using its original start/end timestamps. ' +
      'Useful when the original generation failed or produced a poor result.',
  })
  @ApiParam({ name: 'id', description: 'Clip ID to regenerate', type: 'string', example: '101' })
  @ApiResponse({
    status: 200,
    description: 'Regeneration job enqueued',
    schema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', example: 'bfb23d4c-aaaa-bbbb-cccc-000111222333' },
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Clip not found',
    schema: ErrorSchema('Clip 101 not found'),
  })
  @ApiForbiddenResponse({
    description: 'Clip belongs to another user',
    schema: ErrorSchema('You do not have permission to regenerate this clip'),
  })
  @ApiTooManyRequestsResponse({
    description: 'User has reached the clip-generation rate limit',
    schema: ErrorSchema('Too many active clip-generation jobs'),
  })
  regenerate(@Param('id') id: string, @Req() req: Request) {
    const userId: number = Number(
      (req as any).user?.id ?? (req.headers['x-user-id'] as string) ?? 0,
    );
    return this.clipsService.regenerate(userId, Number(id));
  }

  // ── PATCH /clips/:id/caption ───────────────────────────────────────────────

  @Patch(':id/caption')
  @ApiOperation({
    summary: 'Update clip caption',
    description:
      'Replaces the clip caption used when publishing to social platforms. ' +
      'The caption is also stored in NFT metadata if the clip is later minted.',
  })
  @ApiParam({ name: 'id', description: 'Clip ID', type: 'string', example: '101' })
  @ApiBody({
    description: 'New caption string',
    schema: {
      type: 'object',
      required: ['caption'],
      properties: {
        caption: {
          type: 'string',
          example: 'This moment changed everything 🔥 #viral #trending',
          description: 'Updated caption for social posting and NFT metadata',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Caption updated',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'number', example: 101 },
        caption: {
          type: 'string',
          example: 'This moment changed everything 🔥 #viral #trending',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Caption is missing or not a string',
    schema: ErrorSchema('caption is required and must be a string'),
  })
  @ApiNotFoundResponse({
    description: 'Clip not found',
    schema: ErrorSchema('Clip 101 not found'),
  })
  @ApiForbiddenResponse({
    description: 'Clip belongs to another user',
    schema: ErrorSchema('You do not have permission to update this clip'),
  })
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

  // ── PATCH /clips/:id/royalty ───────────────────────────────────────────────

  @Patch(':id/royalty')
  @ApiOperation({
    summary: 'Update clip NFT royalty BPS',
    description:
      'Sets the creator royalty (in Basis Points) that will be embedded in the Soroban NFT contract on mint. ' +
      '1 BPS = 0.01%; allowed range 0–1500 (0–15%). ' +
      'This field becomes immutable once minting starts or completes.',
  })
  @ApiParam({ name: 'id', description: 'Clip ID', type: 'string', example: '101' })
  @ApiBody({
    description: 'Royalty BPS value',
    type: UpdateClipRoyaltyDto,
    examples: {
      ten_percent: {
        summary: '10% royalty (default)',
        value: { royaltyBps: 1000 },
      },
      five_percent: {
        summary: '5% royalty',
        value: { royaltyBps: 500 },
      },
      zero: {
        summary: 'No royalty',
        value: { royaltyBps: 0 },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Royalty updated',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'number', example: 101 },
        royaltyBps: { type: 'number', example: 1000 },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'royaltyBps out of range (0–1500), or minting already started',
    schema: ErrorSchema('Cannot change royalty after minting has started or completed'),
  })
  @ApiNotFoundResponse({
    description: 'Clip not found',
    schema: ErrorSchema('Clip 101 not found'),
  })
  @ApiForbiddenResponse({
    description: 'Clip belongs to another user',
    schema: ErrorSchema('You do not have permission to update this clip'),
  })
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
