import {
  BadRequestException,
  Controller,
  UseGuards,
  Get,
  Delete,
  Query,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import { Auth } from '../auth/decorators/auth.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { EarningsService } from './earnings.service';
import type { Request, Response } from 'express';
import { Currency } from './earnings.types';

interface RequestWithUser extends Request {
  user: { userId: number };
}

@Auth()
@Controller('earnings')
export class EarningsController {
  constructor(private readonly earningsService: EarningsService) {}

  @Get('export')
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
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    res.send(content);
  }

  @Get()
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
  async deleteEarning(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
  ) {
    return this.earningsService.softDelete(
      parseInt(id, 10),
      req.user.userId,
    );
  }

  @Public()
  @Get('leaderboard')
  async getLeaderboard(@Query('limit') limit = '10') {
    const limitNum = Math.min(parseInt(limit, 10) || 10, 100);
    return this.earningsService.getLeaderboard(limitNum);
  }

  @Get('by-platform')
  async getEarningsByPlatform(@Req() req: RequestWithUser) {
    return this.earningsService.getEarningsByPlatform(req.user.userId);
  }
}
