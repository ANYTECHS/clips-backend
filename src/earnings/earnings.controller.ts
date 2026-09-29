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
  ApiNotFoundResponse,
  ApiServiceUnavailableResponse,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Auth } from '../auth/decorators/auth.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { EarningsService } from './earnings.service';
import { EarningsAggregationService } from './earnings-aggregation.service';
import { EarningsExportService } from './earnings-export.service';
import { DailyEarningsAggregationService } from './daily-earnings-aggregation.service';
import { LeaderboardService, LeaderboardResponse } from './leaderboard.service';
import { Currency } from './earnings.types';
import { ValidationErrorResponseDto } from '../common/dtos/validation-error-response.dto';
import { DailyEarningsQueryDto } from './dto/daily-earnings-query.dto';
import { DailyEarningsResponseDto } from './dto/daily-earnings-response.dto';
import {
  LeaderboardQueryDto,
  LeaderboardResponseDto,
  LeaderboardVisibilityDto,
} from './dto/leaderboard.dto';

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
    private readonly dailyEarningsAggregationService: DailyEarningsAggregationService,
    private readonly leaderboardService: LeaderboardService,
  ) {}

  // ── Aggregation ─────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({
    summary: 'Get user earnings total (cached)',
    description:
      'Returns the cached total earnings for the authenticated user. ' +
      'Also used as the REST companion for live dashboard totals; ' +
      'subscribe to WebSocket namespace `/earnings` for `earnings.updated` events ' +
      'with payload `{ event, userId, currency, amount, total }` (JWT via handshake.auth.token).',
    summary: 'Get user earnings total',
    description:
      'Returns total earnings for the authenticated user. ' +
      'Frequently requested totals may be served from a short-lived cache; ' +
      'on cache miss or cache unavailability the value is loaded from PostgreSQL. ' +
      'The response shape is identical regardless of data source.',
  })
  @ApiResponse({
    status: 200,
    description: 'User earnings total',
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

  @Get('daily')
  @ApiOperation({
    summary: 'Get daily aggregated earnings',
    description:
      'Returns pre-aggregated DailyEarning rows for the authenticated user. ' +
      'Totals are produced by the midnight UTC BullMQ job and grouped by user and currency. ' +
      'Optional `from` / `to` (UTC) and `currency` filters narrow the result set.',
  })
  @ApiQuery({
    name: 'from',
    required: false,
    type: String,
    description: 'Inclusive start date (UTC, ISO 8601)',
    example: '2026-09-01',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    type: String,
    description: 'Inclusive end date (UTC, ISO 8601)',
    example: '2026-09-27',
  })
  @ApiQuery({
    name: 'currency',
    required: false,
    type: String,
    description: 'ISO 4217 currency filter',
    example: 'USD',
  })
  @ApiResponse({
    status: 200,
    description: 'Aggregated daily earnings',
    type: DailyEarningsResponseDto,
    schema: {
      example: {
        items: [
          {
            id: 1,
            date: '2026-09-26T00:00:00.000Z',
            currency: 'USD',
            totalAmount: 125.5,
            totalInBaseCurrency: 125.5,
            earningCount: 12,
            clipCount: 4,
          },
        ],
        filters: {
          from: '2026-09-01T00:00:00.000Z',
          to: '2026-09-27T00:00:00.000Z',
          currency: 'USD',
        },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async getDailyEarnings(
    @Req() req: AuthRequest,
    @Query() query: DailyEarningsQueryDto,
  ): Promise<DailyEarningsResponseDto> {
    return this.dailyEarningsAggregationService.getDailyEarnings(req.user.userId, {
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      currency: query.currency,
    });
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

  @Get('monthly')
  @ApiOperation({
    summary: 'Get monthly earnings summary',
    description:
      'Returns the MonthlyEarning summary for year/month (UTC). ' +
      'Generated automatically on the 1st of each month; falls back to live computation if not yet generated. ' +
      'Includes total, platform breakdown grouped by currency, and currency info.',
  })
  @ApiQuery({ name: 'year', required: true, type: Number, description: 'Full year, e.g. 2026', example: 2026 })
  @ApiQuery({ name: 'month', required: true, type: Number, description: 'Month 1-12', example: 9 })
  @ApiResponse({
    status: 200,
    description: 'Monthly summary with total, platformBreakdown, currency',
    schema: {
      type: 'object',
      properties: {
        userId: { type: 'number', example: 1 },
        year: { type: 'number', example: 2026 },
        month: { type: 'number', example: 9 },
        totalAmount: { type: 'number', example: 1250.5 },
        currency: { type: 'string', example: 'USD' },
        platformBreakdown: { type: 'object', example: { royalty: 800, subscription: 450.5 } },
        generated: { type: 'boolean', example: true },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid year/month' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async getMonthlySummary(
    @Req() req: AuthRequest,
    @Query('year') yearStr: string,
    @Query('month') monthStr: string,
  ) {
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    if (!Number.isInteger(year) || !Number.isInteger(month)) {
      throw new BadRequestException('year and month query params are required (e.g. ?year=2026&month=9)');
    }
    return this.earningsAggregationService.getMonthlySummary(
      req.user.userId,
      year,
      month,
    );
  }

  // ── Export ───────────────────────────────────────────────────────────────

  @Get('export')
  @ApiOperation({
    summary: 'Export earnings as CSV for tax reporting',
    description:
      'Downloads a CSV file of the authenticated user\'s earnings for an optional date range. ' +
      'Supported format: csv. Empty results still return a header-only CSV file. ' +
      'Columns: date, clipTitle, amount, currency, source, transactionId.',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    description: 'Filter start date (ISO 8601)',
    example: '2025-01-01',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    description: 'Filter end date (ISO 8601)',
    example: '2025-12-31',
  })
  @ApiQuery({
    name: 'format',
    required: false,
    type: String,
    description: 'Export format — only "csv" is supported',
    example: 'csv',
  })
  @ApiResponse({
    status: 200,
    description:
      'CSV file attachment (Content-Type: text/csv). Header-only when no earnings match.',
    content: {
      'text/csv': {
        schema: { type: 'string', example: 'date,clipTitle,amount,currency,source,transactionId\n' },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT (Bearer access-token)' })
  @ApiBadRequestResponse({
    description: 'Invalid date range or unsupported export format',
    schema: {
      examples: {
        invalidRange: {
          summary: 'startDate after endDate',
          value: {
            statusCode: 400,
            message: 'Invalid date range: startDate must be on or before endDate.',
            error: 'Bad Request',
          },
        },
        unsupportedFormat: {
          summary: 'Unsupported format',
          value: {
            statusCode: 400,
            message: 'Unsupported export format "pdf". Only "csv" is supported.',
            error: 'Bad Request',
          },
        },
      },
    },
  })
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
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get top creators earnings leaderboard',
    description:
      'Returns paginated top-earning creators who explicitly opted in via showOnLeaderboard=true. ' +
      'Soft-deleted earnings are excluded. By default display names are anonymized as "Creator #N" ' +
      'and earnings amounts are exact; set anonymizeEarnings=true to bucket amounts. ' +
      'Results are cached for ~1 hour.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated leaderboard of opted-in creators',
    type: LeaderboardResponseDto,
  })
  @ApiServiceUnavailableResponse({
    description: 'Leaderboard feature flag is disabled',
  })
  @ApiInternalServerErrorResponse({ description: 'Internal server error' })
  async getLeaderboard(
    @Query() query: LeaderboardQueryDto,
  ): Promise<LeaderboardResponse> {
    return this.leaderboardService.getLeaderboard({
      page: query.page,
      limit: query.limit,
      anonymize: query.anonymize,
      anonymizeEarnings: query.anonymizeEarnings,
    });
  }

  @Get('leaderboard/rank')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Get user's rank on the leaderboard",
    description:
      "Returns the authenticated user's rank, total earnings, and leaderboard visibility setting. " +
      'Rank is null when the user has not opted in or has zero earnings.',
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
    summary: 'Update leaderboard visibility (privacy opt-in)',
    description:
      'Enable or disable leaderboard participation for the authenticated user. ' +
      'Only users with showOnLeaderboard=true appear on GET /earnings/leaderboard.',
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
    @Body() body: LeaderboardVisibilityDto,
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
      'Sets deletedAt instead of permanently deleting the record. ' +
      'Soft-deleted earnings are excluded from normal queries and aggregations. ' +
      'Already-deleted or non-owned records return 404. ' +
      'Admins can restore via POST /admin/earnings/:earningId/restore.',
  })
  @ApiParam({ name: 'earningId', type: Number, description: 'Earning record ID' })
  @ApiResponse({ status: 200, description: 'Earning soft-deleted successfully' })
  @ApiNotFoundResponse({
    description: 'Earning not found, already soft-deleted, or does not belong to user',
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async deleteEarning(
    @Req() req: AuthRequest,
    @Param('earningId', ParseIntPipe) earningId: number,
  ) {
    return this.earningsAggregationService.softDelete(earningId, req.user.userId);
  }
}
