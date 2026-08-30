import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { SorobanIndexerService } from './soroban-indexer.service';
import {
  BlockchainEventsQueryDto,
  BlockchainEventsResponseDto,
} from './dto/blockchain-events.dto';

@ApiTags('blockchain')
@ApiInternalServerErrorResponse({ description: 'Internal server error' })
@Controller('blockchain')
export class BlockchainController {
  constructor(private readonly indexerService: SorobanIndexerService) {}

  @Get('events')
  @ApiOperation({
    summary: 'List indexed Soroban NFT contract events',
    description:
      'Returns Mint, Transfer, RoyaltyPaid, Burn, and RoyaltyClaimed events ' +
      'indexed from the configured Soroban NFT contract. Supports event-type ' +
      'filtering and pagination. Duplicate on-chain events are stored once.',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Event type filter (Mint, Transfer, RoyaltyPaid, Burn, RoyaltyClaimed)',
  })
  @ApiQuery({ name: 'tokenId', required: false, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiOkResponse({
    description: 'Paginated indexed events',
    type: BlockchainEventsResponseDto,
  })
  async listEvents(
    @Query() query: BlockchainEventsQueryDto,
  ): Promise<BlockchainEventsResponseDto> {
    return this.indexerService.listEvents({
      type: query.type,
      tokenId: query.tokenId,
      page: query.page,
      limit: query.limit,
    });
  }
}
