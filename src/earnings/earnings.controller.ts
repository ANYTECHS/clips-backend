import {
  BadRequestException,
  Controller,
  Get,
  Delete,
  Query,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiParam,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiInternalServerErrorResponse,
} from '@nestjs/swagger';
import { Auth } from '../auth/decorators/auth.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { EarningsService } from './earnings.service';
import type { Request, Response } from 'express';
import { Currency } from './earnings.types';

interface RequestWithUser extends Request {
  user: { userId: number };
}

@ApiTags('earnings')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Unauthorized' })
@ApiInternalServerErrorResponse({ description: 'Internal server error' })
@Auth()
@Controller('earnings')
export class EarningsController {
  constructor(private readonly earningsService: EarningsService) {}

  @Get('metrics')
  @ApiOperation({
    summary: 'Get earnings dashboard metrics',
    description:
      'Returns aggregated earnings metrics for the authenticated user',
  })
  @ApiQuery({
    name: 'currency',
    required: false,
    enum: Currency,
    description: 'Currency for metrics (default: USD)',
  })
  @ApiResponse({
    status: 200,
    description: 'Dashboard metrics retrieved successfully',
  })
  @ApiBadRequestResponse({ description: 'Invalid currency parameter' })
  async getDashboardMetrics(
    @Req() req: RequestWithUser,
    @Query('currency') currency: Currency = Currency.USD,
  ) {
    return this.earningsService.getDashboardMetrics(req.user.userId, currency);
  }

  @Get('export')
  @ApiOperation({
    summary: 'Export earnings to CSV',
    description: 'Exports earnings data as a downloadable CSV file',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Start date filter (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'End date filter (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'format',
    required: false,
    description: 'Export format (default: csv)',
    example: 'csv',
  })
  @ApiResponse({ status: 200, description: 'CSV file downloaded' })
  @ApiBadRequestResponse({ description: 'Invalid export format or parameters' })
  async exportEarnings(
    @Req() req: RequestWithUser,
    @Res() res: Response,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('format') format = 'csv',
  ) {
    if (format !== 'csv') {
      throw new BadRequestException('Only format=csv is supported');
    }

    const { filename, content } = await this.earningsService.exportEarningsCsv(
      req.user.userId,
      { startDate, endDate },
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  }

  @Get()
  @ApiOperation({
    summary: 'Get earnings list',
    description: 'Returns paginated earnings data for the authenticated user',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Items per page (default: 20)',
  })
  @ApiQuery({
    name: 'currency',
    required: false,
    enum: Currency,
    description: 'Currency filter (default: USD)',
  })
  @ApiResponse({
    status: 200,
    description: 'Earnings list retrieved successfully',
  })
  @ApiBadRequestResponse({ description: 'Invalid pagination parameters' })
  async getEarnings(
    @Req() req: RequestWithUser,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('currency') currency: Currency = Currency.USD,
  ) {
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;

    return this.earningsService.getEarningsDashboard(
      req.user.userId,
      pageNum,
      limitNum,
      currency,
    );
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete an earning record',
    description: 'Soft-deletes an earning record by ID',
  })
  @ApiParam({ name: 'id', description: 'Earning record ID', type: 'number' })
  @ApiResponse({ status: 200, description: 'Earning record deleted' })
  @ApiBadRequestResponse({ description: 'Invalid earning ID' })
  @ApiNotFoundResponse({ description: 'Earning record not found' })
  async deleteEarning(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.earningsService.softDelete(parseInt(id, 10), req.user.userId);
  }

  @Public()
  @Get('leaderboard')
  @ApiOperation({
    summary: 'Get earnings leaderboard',
    description: 'Returns top earners leaderboard (public)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of top earners (default: 10, max: 100)',
  })
  @ApiResponse({
    status: 200,
    description: 'Leaderboard retrieved successfully',
  })
  async getLeaderboard(@Query('limit') limit = '10') {
    const limitNum = Math.min(parseInt(limit, 10) || 10, 100);
    return this.earningsService.getLeaderboard(limitNum);
  }

  @Get('by-platform')
  @ApiOperation({
    summary: 'Get earnings by platform',
    description: 'Returns earnings breakdown by social platform',
  })
  @ApiResponse({
    status: 200,
    description: 'Platform earnings retrieved successfully',
  })
  async getEarningsByPlatform(@Req() req: RequestWithUser) {
    return this.earningsService.getEarningsByPlatform(req.user.userId);
  }
  @Get('summary')
  @ApiOperation({
    summary: 'Get earnings summary',
    description: 'Returns a summary of total earnings',
  })
  @ApiQuery({
    name: 'currency',
    required: false,
    enum: Currency,
    description: 'Currency for summary (default: USD)',
  })
  @ApiResponse({
    status: 200,
    description: 'Earnings summary retrieved successfully',
  })
  @ApiBadRequestResponse({ description: 'Invalid currency parameter' })
  async getEarningsSummary(
    @Req() req: RequestWithUser,
    @Query('currency') currency: Currency = Currency.USD,
  ) {
    return this.earningsService.getEarningsSummary(req.user.userId, currency);
  }
}
