import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  Query,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiParam,
  ApiUnauthorizedResponse,
  ApiInternalServerErrorResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Auth } from '../auth/decorators/auth.decorator';
import { EarningsService } from './earnings.service';
import { EarningsAggregationService } from './earnings-aggregation.service';
import { EarningsExportService } from './earnings-export.service';
import { LeaderboardService, LeaderboardResponse } from './leaderboard.service';
import { Currency } from './earnings.types';
import { ValidationErrorResponseDto } from '../common/dtos/validation-error-response.dto';

interface AuthRequest extends Request {
  user: { userId: number };
}

/**
 * EarningsController exposes all earnings-related endpoints.
 *
 * Responsibilities are split across three injected services:
 *  - EarningsService        — CRUD (create earning, cache invalidation)
 *  - EarningsAggregationService — totals, dashboards, leaderboards, period queries
 *  - EarningsExportService  — CSV/tax-report exports
 */
@ApiTags('earnings')
@ApiBearerAuth('access-token')
@Auth()
@Controller('earnings')
export class EarningsController {
  constructor(
    private readonly earningsService: EarningsService,
    private readonly earningsAggregationService: EarningsAggregationService,
    private readonly earningsExportService: EarningsExportService,
    private readonly leaderboardService: LeaderboardService,
  ) {}

  // ── Aggregation ─────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({
    summary: 'Get user earnings total (cached)',
    description: 'Returns the cached total earnings for the authenticated user.',
  })
  @ApiResponse({
    status: 200,
    description: 'Cached user earnings total',
    schema: {
      type: 'object',
      properties: {
        total: { type: 'number', example: 2500.5 },
        currency: { type: 'string', example: 'USD' },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async getEarningsTotal(@Req() req: AuthRequest) {
    return this.earningsService.getUserTotalEarningsCached(req.user.userId);
  }

  @Get('dashboard')
  @ApiOperation({
    summary: 'Get earnings dashboard',
    description:
      'Returns total earned, pending payout, paid-out, breakdown by source, and ' +
      'paginated history. All amounts are converted to the requested target currency.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)', example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 20)', example: 20 })
  @ApiQuery({ name: 'currency', required: false, enum: Currency, description: 'Target currency (default: USD)' })
  @ApiResponse({
    status: 200,
    description: 'Earnings dashboard data',
    schema: {
      type: 'object',
      properties: {
        totalEarned: { type: 'number', example: 1250.5 },
        currency: { type: 'string', example: 'USD' },
        pendingPayout: { type: 'number', example: 50.0 },
        paidOut: { type: 'number', example: 200.0 },
        breakdown: {
          type: 'object',
          properties: {
            royalties: { type: 'number', example: 800.0 },
            subscriptions: { type: 'number', example: 450.5 },
          },
        },
        history: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              date: { type: 'string', format: 'date-time' },
              amount: { type: 'number' },
              currency: { type: 'string' },
              type: { type: 'string', enum: ['royalty', 'subscription', 'payout'] },
            },
          },
        },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async getEarningsDashboard(
    @Req() req: AuthRequest,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('currency') currency?: Currency,
  ) {
    return this.earningsAggregationService.getEarningsDashboard(
      req.user.userId,
      page ?? 1,
      limit ?? 20,
      currency ?? Currency.USD,
    );
  }

  @Get('total')
  @ApiOperation({
    summary: 'Get user total earnings',
    description: 'Returns total earned, total paid out, and available balance for the authenticated user.',
  })
  @ApiQuery({ name: 'currency', required: false, enum: Currency, description: 'Target currency (default: USD)' })
  @ApiResponse({
    status: 200,
    description: 'User earnings summary',
    schema: {
      type: 'object',
      properties: {
        total: { type: 'number', example: 1250.5 },
        currency: { type: 'string', example: 'USD' },
        breakdown: {
          type: 'object',
          properties: {
            royalties: { type: 'number', example: 800.0 },
            subscriptions: { type: 'number', example: 450.5 },
          },
        },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async getUserTotalEarnings(
    @Req() req: AuthRequest,
    @Query('currency') currency?: Currency,
  ) {
    return this.earningsAggregationService.getUserTotalEarnings(
      req.user.userId,
      currency ?? Currency.USD,
    );
  }

  @Get('by-period')
  @ApiOperation({
    summary: 'Get earnings by date range',
    description: 'Returns aggregated earnings and individual records within a date range.',
  })
  @ApiQuery({ name: 'startDate', required: true, type: String, description: 'ISO 8601 date (e.g. 2025-01-01)', example: '2025-01-01' })
  @ApiQuery({ name: 'endDate', required: true, type: String, description: 'ISO 8601 date (e.g. 2025-12-31)', example: '2025-12-31' })
  @ApiQuery({ name: 'currency', required: false, enum: Currency, description: 'Target currency (default: USD)' })
  @ApiResponse({
    status: 200,
    description: 'Earnings within the specified date range',
    schema: {
      type: 'object',
      properties: {
        startDate: { type: 'string', format: 'date-time' },
        endDate: { type: 'string', format: 'date-time' },
        total: { type: 'number', example: 450.5 },
        currency: { type: 'string', example: 'USD' },
        breakdown: {
          type: 'object',
          properties: {
            royalties: { type: 'number', example: 300.0 },
            subscriptions: { type: 'number', example: 150.5 },
          },
        },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              amount: { type: 'number' },
              currency: { type: 'string' },
              source: { type: 'string', nullable: true },
              date: { type: 'string', format: 'date-time' },
              clipTitle: { type: 'string', nullable: true },
            },
          },
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid date range',
    type: ValidationErrorResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async getEarningsByPeriod(
    @Req() req: AuthRequest,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('currency') currency?: Currency,
  ) {
    if (!startDate || !endDate) {
      throw new BadRequestException('startDate and endDate are required');
    }
    return this.earningsAggregationService.getEarningsByPeriod(
      req.user.userId,
      new Date(startDate),
      new Date(endDate),
      currency ?? Currency.USD,
    );
  }

  @Get('by-platform')
  @ApiOperation({
    summary: 'Get earnings broken down by platform',
    description: 'Returns earnings grouped by source platform (tiktok, instagram, etc.).',
  })
  @ApiQuery({ name: 'from', required: false, type: String, description: 'ISO 8601 start date (e.g. 2026-01-01)' })
  @ApiQuery({ name: 'to', required: false, type: String, description: 'ISO 8601 end date (e.g. 2026-08-24)' })
  @ApiQuery({ name: 'currency', required: false, enum: Currency, description: 'Target currency (default: USD)' })
  @ApiResponse({
    status: 200,
    description: 'Platform earnings breakdown',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              platform: { type: 'string', example: 'tiktok' },
              amount: { type: 'number', example: 500.0 },
              currency: { type: 'string', example: 'USD' },
            },
          },
        },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async getEarningsByPlatform(
    @Req() req: AuthRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('currency') currency?: string,
  ) {
    if (currency) {
      const targetCurrency = currency.toUpperCase() as Currency;
      if (!Object.values(Currency).includes(targetCurrency)) {
        throw new BadRequestException(`Unsupported currency: ${currency}`);
      }
    }
    return this.earningsAggregationService.getEarningsByPlatform(
      req.user.userId,
      from,
      to,
      currency,
    );
  }

  // ── Export ───────────────────────────────────────────────────────────────

  @Get('export')
  @ApiOperation({
    summary: 'Export earnings as CSV',
    description:
      'Downloads a CSV file containing earnings records. ' +
      'Optionally filter by date range.',
  })
  @ApiQuery({ name: 'startDate', required: false, type: String, description: 'Filter start date (ISO 8601)', example: '2025-01-01' })
  @ApiQuery({ name: 'endDate', required: false, type: String, description: 'Filter end date (ISO 8601)', example: '2025-12-31' })
  @ApiQuery({ name: 'format', required: false, type: String, description: 'Export format — only "csv" is supported', example: 'csv' })
  @ApiResponse({ status: 200, description: 'CSV file attachment' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiBadRequestResponse({ description: 'Unsupported export format' })
  async exportEarnings(
    @Req() req: AuthRequest,
    @Res() res: Response,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('format') format?: string,
  ) {
    if (format && format !== 'csv') {
      throw new BadRequestException(
        `Unsupported export format "${format}". Only "csv" is supported.`,
      );
    }

    const { filename, content } = await this.earningsExportService.exportEarningsCsv(
      req.user.userId,
      { startDate, endDate },
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  }

  // ── Leaderboard ─────────────────────────────────────────────────────────

  @Get('leaderboard')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get top creators leaderboard',
    description:
      'Returns the top earning creators who have opted in to the leaderboard. ' +
      'Only includes users with showOnLeaderboard=true and at least one earning.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of top creators to return (default: 100, max: 500)',
    type: 'number',
    example: 100,
  })
  @ApiResponse({
    status: 200,
    description: 'Top creators leaderboard',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              rank: { type: 'number', example: 1 },
              userId: { type: 'number', example: 123 },
              username: { type: 'string', example: 'creator123' },
              totalEarnings: { type: 'number', example: 5000 },
            },
          },
        },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiInternalServerErrorResponse({ description: 'Internal server error' })
  async getLeaderboard(
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ): Promise<LeaderboardResponse> {
    return this.leaderboardService.getLeaderboard(limit);
  }

  @Get('leaderboard/rank')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Get user's rank on the leaderboard",
    description:
      "Returns the authenticated user's rank, total earnings, and leaderboard visibility setting.",
  })
  @ApiResponse({
    status: 200,
    description: 'User rank information',
    schema: {
      type: 'object',
      properties: {
        rank: { type: 'number', nullable: true, example: 5 },
        totalEarnings: { type: 'number', example: 2500 },
        showOnLeaderboard: { type: 'boolean', example: true },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async getUserRank(@Req() req: AuthRequest) {
    return this.leaderboardService.getUserRank(req.user.userId);
  }

  @Post('leaderboard/visibility')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update leaderboard visibility',
    description: 'Enable or disable leaderboard visibility for the authenticated user.',
  })
  @ApiResponse({
    status: 200,
    description: 'Leaderboard visibility updated',
    schema: {
      type: 'object',
      properties: {
        showOnLeaderboard: { type: 'boolean', example: true },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async updateLeaderboardVisibility(
    @Req() req: AuthRequest,
    @Body() body: { showOnLeaderboard: boolean },
  ) {
    return this.leaderboardService.setLeaderboardVisibility(
      req.user.userId,
      body.showOnLeaderboard,
    );
  }

  // ── Record management ────────────────────────────────────────────────────

  @Delete(':earningId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Soft-delete an earning record',
    description:
      'Marks the earning record as deleted (soft delete). Only the owning user can delete their earnings.',
  })
  @ApiParam({ name: 'earningId', type: Number, description: 'Earning record ID' })
  @ApiResponse({ status: 200, description: 'Earning deleted successfully' })
  @ApiBadRequestResponse({ description: 'Earning not found or does not belong to user' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async deleteEarning(
    @Req() req: AuthRequest,
    @Param('earningId', ParseIntPipe) earningId: number,
  ) {
    return this.earningsAggregationService.softDelete(earningId, req.user.userId);
  }
}
