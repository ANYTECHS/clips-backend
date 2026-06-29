import {
  Controller,
  Post,
  Body,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { BatchRoyaltyService } from './batch-royalty.service';
import { Auth } from '../auth/decorators/auth.decorator';
import { Public } from '../auth/decorators/public.decorator';

class BatchRoyaltyQueryDto {
  tokenIds: (string | number)[];
}

/**
 * Controller for batch querying royalty information from the NFT smart contract.
 * Allows frontends to fetch royalty data for multiple tokens in a single API call.
 */
@Controller('nft')
@Auth()
export class BatchRoyaltyController {
  private readonly logger = new Logger(BatchRoyaltyController.name);

  constructor(private readonly batchRoyaltyService: BatchRoyaltyService) {}

  /**
   * POST /nft/batch-royalty
   * 
   * Fetch royalty information for multiple NFT tokens in a single request.
   * This is a public endpoint - no authentication required.
   * 
   * Request Body:
   * {
   *   "tokenIds": [1, 2, 3, 4, 5]
   * }
   * 
   * Response:
   * [
   *   {
   *     "tokenId": "1",
   *     "recipient": "GABC...",
   *     "feeNumerator": 500,
   *     "feeDenominator": 10000,
   *     "royaltyPercentage": "5.00%"
   *   },
   *   {
   *     "tokenId": "2",
   *     "recipient": "GDEF...",
   *     "feeNumerator": 1000,
   *     "feeDenominator": 10000,
   *     "royaltyPercentage": "10.00%"
   *   },
   *   ...
   * ]
   * 
   * Notes:
   * - Maximum batch size: 100 tokens
   * - Results are returned in the same order as input
   * - Non-existent tokens return zero values (recipient = zero address, fees = 0)
   * - Results are cached for 5 minutes
   */
  @Public()
  @Post('batch-royalty')
  async getBatchRoyalty(@Body() body: BatchRoyaltyQueryDto) {
    if (!body.tokenIds || !Array.isArray(body.tokenIds)) {
      throw new BadRequestException(
        'Request body must contain a "tokenIds" array',
      );
    }

    this.logger.log(
      `Batch royalty query for ${body.tokenIds.length} tokens`,
    );

    return this.batchRoyaltyService.getBatchRoyaltyInfo(body.tokenIds);
  }
}
