import { Controller, Get, Logger } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiInternalServerErrorResponse,
} from '@nestjs/swagger';
import { PlatformRevenueService } from './platform-revenue.service';
import { LoginGuard } from '../auth/guards/login.guard';
import { Auth } from '../auth/decorators/auth.decorator';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('platform')
@ApiInternalServerErrorResponse({ description: 'Internal server error' })
@Controller('platform')
@UseGuards(LoginGuard)
@Auth()
export class PlatformRevenueController {
  private readonly logger = new Logger(PlatformRevenueController.name);

  constructor(
    private readonly platformRevenueService: PlatformRevenueService,
  ) {}

  @Public()
  @Get('revenue')
  @ApiOperation({
    summary: 'Get platform revenue',
    description:
      'Returns total accumulated platform fees from all NFT royalty payments (public)',
  })
  @ApiResponse({
    status: 200,
    description: 'Platform revenue data',
    schema: {
      type: 'object',
      properties: {
        totalFeesStroops: { type: 'string', example: '50000000' },
        totalFeesXLM: { type: 'string', example: '5.0000000' },
        lastUpdated: {
          type: 'string',
          format: 'date-time',
          example: '2026-04-28T10:30:00.000Z',
        },
      },
    },
  })
  async getPlatformRevenue() {
    this.logger.log('Fetching platform revenue from smart contract');
    return this.platformRevenueService.getPlatformRevenue();
  }
}
