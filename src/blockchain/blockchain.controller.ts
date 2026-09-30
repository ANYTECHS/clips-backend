import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { SorobanIndexerService } from './soroban-indexer.service';
import { ContractPauseService } from './contract-pause.service';
import { SOROBAN_NFT_EVENT_TYPES } from './event-types';
import {
  BlockchainEventsQueryDto,
  BlockchainEventsResponseDto,
} from './dto/blockchain-events.dto';
import {
  CancelPauseDto,
  ContractPauseStatusDto,
  SchedulePauseDto,
} from './dto/contract-pause.dto';

@ApiTags('blockchain', 'soroban', 'nfts')
@ApiInternalServerErrorResponse({ description: 'Internal server error' })
@Controller()
export class BlockchainController {
  constructor(
    private readonly indexerService: SorobanIndexerService,
    private readonly contractPauseService: ContractPauseService,
  ) {}

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Contract Pause (Issue #1048)
  // ---------------------------------------------------------------------------

  /**
   * Schedule a contract pause with a 24-hour timelock.
   *
   * Only the admin configured via ADMIN_STELLAR_ADDRESS may call this endpoint.
   * A second call is rejected if a pending or active pause already exists.
   */
  @Post('blockchain/pause')
  @ApiOperation({
    summary: 'Schedule a Soroban contract pause (24-hour timelock)',
    description:
      'Schedules a contract pause that becomes activatable after a 24-hour delay. ' +
      'Requires admin authorization via adminAddress matching ADMIN_STELLAR_ADDRESS. ' +
      'Activation is confirmed when the indexer observes a Paused event on-chain.',
  })
  @ApiBody({ type: SchedulePauseDto })
  @ApiOkResponse({
    description: 'Pause scheduled successfully',
    type: ContractPauseStatusDto,
  })
  @ApiForbiddenResponse({
    description: 'Caller is not the configured admin',
  })
  async schedulePause(
    @Body() dto: SchedulePauseDto,
  ): Promise<ContractPauseStatusDto> {
    return this.contractPauseService.schedulePause(dto.adminAddress, dto.reason);
  }

  /**
   * Cancel a pending pause before its timelock expires.
   */
  @Delete('blockchain/pause')
  @ApiOperation({
    summary: 'Cancel a pending contract pause',
    description:
      'Cancels a scheduled pause that has not yet been activated on-chain. ' +
      'Requires admin authorization.',
  })
  @ApiBody({ type: CancelPauseDto })
  @ApiOkResponse({
    description: 'Pause cancelled successfully',
    type: ContractPauseStatusDto,
  })
  @ApiForbiddenResponse({
    description: 'Caller is not the configured admin',
  })
  @ApiNotFoundResponse({
    description: 'No pending pause exists to cancel',
  })
  async cancelPause(
    @Body() dto: CancelPauseDto,
  ): Promise<ContractPauseStatusDto> {
    return this.contractPauseService.cancelPause(dto.adminAddress);
  }

  /**
   * Returns the current pause status: whether paused, pending, timelock window, etc.
   */
  @Get('blockchain/pause/status')
  @ApiOperation({
    summary: 'Get contract pause status',
    description:
      'Returns the current pause state including whether a pause is scheduled, ' +
      'when it becomes active, and whether the contract is currently paused.',
  })
  @ApiOkResponse({
    description: 'Current pause status',
    type: ContractPauseStatusDto,
  })
  async getPauseStatus(): Promise<ContractPauseStatusDto> {
    return this.contractPauseService.getPauseStatus();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private queryEvents(query: BlockchainEventsQueryDto) {
    return this.indexerService.listEvents({
      type: query.type,
      tokenId: query.tokenId,
      page: query.page,
      limit: query.limit,
    });
  }
}
