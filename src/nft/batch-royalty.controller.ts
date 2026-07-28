import {
  Controller,
  Post,
  Body,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBadRequestResponse,
  ApiInternalServerErrorResponse,
} from '@nestjs/swagger';
import { BatchRoyaltyService } from './batch-royalty.service';
import { LoginGuard } from '../auth/guards/login.guard';
import { Auth } from '../auth/decorators/auth.decorator';
import { Public } from '../auth/decorators/public.decorator';

class BatchRoyaltyQueryDto {
  tokenIds: (string | number)[];
}

@ApiTags('nft')
@ApiInternalServerErrorResponse({ description: 'Internal server error' })
@Controller('nft')
@UseGuards(LoginGuard)
@Auth()
export class BatchRoyaltyController {
  private readonly logger = new Logger(BatchRoyaltyController.name);

  constructor(private readonly batchRoyaltyService: BatchRoyaltyService) {}

  @Public()
  @Post('batch-royalty')
  @ApiOperation({
    summary: 'Batch query NFT royalty info',
    description:
      'Fetch royalty information for multiple NFT tokens in a single request. Maximum batch size: 100 tokens.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        tokenIds: {
          type: 'array',
          items: { type: 'number' },
          example: [1, 2, 3],
        },
      },
      required: ['tokenIds'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Batch royalty info returned',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          tokenId: { type: 'string' },
          recipient: { type: 'string' },
          feeNumerator: { type: 'number' },
          feeDenominator: { type: 'number' },
          royaltyPercentage: { type: 'string' },
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid request body — tokenIds array required',
  })
  async getBatchRoyalty(@Body() body: BatchRoyaltyQueryDto) {
    if (!body.tokenIds || !Array.isArray(body.tokenIds)) {
      throw new BadRequestException(
        'Request body must contain a "tokenIds" array',
      );
    }

    this.logger.log(`Batch royalty query for ${body.tokenIds.length} tokens`);

    return this.batchRoyaltyService.getBatchRoyaltyInfo(body.tokenIds);
  }
}
