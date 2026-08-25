import { Controller, Get, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { EarningsService } from './earnings.service';
import { Auth } from '../auth/decorators/auth.decorator';

interface AuthRequest extends Request {
  user: { userId: number };
}

@ApiTags('earnings')
@ApiBearerAuth()
@Auth()
@Controller('earnings')
export class EarningsController {
  constructor(private readonly earningsService: EarningsService) {}

  @Get()
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  async getEarnings(
    @Req() req: AuthRequest,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const filters: { startDate?: Date; endDate?: Date } = {};
    if (startDate) filters.startDate = new Date(startDate);
    if (endDate) filters.endDate = new Date(endDate);

    return this.earningsService.getEarnings(req.user.userId, filters);
  }

  @Get('aggregate')
  async aggregateEarnings(@Req() req: AuthRequest) {
    return this.earningsService.aggregateEarnings(req.user.userId);
  }
}
