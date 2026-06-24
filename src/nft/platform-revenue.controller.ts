import { Controller, Get, Logger } from '@nestjs/common';
import { PlatformRevenueService } from './platform-revenue.service';
import { Auth } from '../auth/decorators/auth.decorator';
import { Public } from '../auth/decorators/public.decorator';

/**
 * Controller for querying platform revenue from the NFT smart contract.
 * The get_platform_revenue endpoint is public for transparency.
 */
@Controller('platform')
@Auth()
export class PlatformRevenueController {
  private readonly logger = new Logger(PlatformRevenueController.name);

  constructor(
    private readonly platformRevenueService: PlatformRevenueService,
  ) {}

  /**
   * GET /platform/revenue
   * 
   * Returns the total accumulated platform fees from all NFT royalty payments.
   * This is a public endpoint - no authentication required for transparency.
   * 
   * Response:
   * {
   *   "totalFeesStroops": "50000000",
   *   "totalFeesXLM": "5.0000000",
   *   "lastUpdated": "2026-04-28T10:30:00.000Z"
   * }
   */
  @Public()
  @Get('revenue')
  async getPlatformRevenue() {
    this.logger.log('Fetching platform revenue from smart contract');
    return this.platformRevenueService.getPlatformRevenue();
  }
}
