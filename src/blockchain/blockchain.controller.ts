import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import {
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { SorobanIndexerService } from './soroban-indexer.service';
import { SOROBAN_NFT_EVENT_TYPES } from './event-types';
import {
  BlockchainEventsQueryDto,
  BlockchainEventsResponseDto,
} from './dto/blockchain-events.dto';

@ApiTags('blockchain', 'soroban', 'nfts')
@ApiInternalServerErrorResponse({ description: 'Internal server error' })
@Controller()
export class BlockchainController {
  constructor(private readonly indexerService: SorobanIndexerService) {}

  @Get('blockchain/events')
  @ApiOperation({
    summary: 'List indexed Soroban NFT contract events',
    description:
      'Returns indexed Soroban NFT events with event-type filtering and pagination. Duplicate on-chain events are stored once.',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Supported event type filter',
    enum: [...SOROBAN_NFT_EVENT_TYPES],
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
    return this.queryEvents(query);
  }

  @Get('soroban/events')
  @ApiOperation({
    summary: 'List indexed Soroban contract events',
    description:
      'Returns the same indexed event feed as GET /blockchain/events, with optional event-type and token filters.',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Supported event type filter',
    enum: [...SOROBAN_NFT_EVENT_TYPES],
  })
  @ApiQuery({ name: 'tokenId', required: false, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiOkResponse({
    description: 'Paginated indexed events',
    type: BlockchainEventsResponseDto,
  })
  async listSorobanEvents(
    @Query() query: BlockchainEventsQueryDto,
  ): Promise<BlockchainEventsResponseDto> {
    return this.queryEvents(query);
  }

  @Get('nfts/:tokenId/events')
  @ApiOperation({
    summary: 'List indexed events for an NFT',
    description:
      'Returns paginated Soroban events associated with the token ID.',
  })
  @ApiParam({ name: 'tokenId', type: Number, example: 42 })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Supported event type filter',
    enum: [...SOROBAN_NFT_EVENT_TYPES],
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiOkResponse({
    description: 'Paginated indexed events for the token',
    type: BlockchainEventsResponseDto,
  })
  async listNftEvents(
    @Param('tokenId', ParseIntPipe) tokenId: number,
    @Query() query: BlockchainEventsQueryDto,
  ): Promise<BlockchainEventsResponseDto> {
    return this.queryEvents({ ...query, tokenId });
  }

  private queryEvents(query: BlockchainEventsQueryDto) {
    return this.indexerService.listEvents({
      type: query.type,
      tokenId: query.tokenId,
      page: query.page,
      limit: query.limit,
    });
  }
}
