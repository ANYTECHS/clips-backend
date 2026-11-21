import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiBadRequestResponse,
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

// ---------------------------------------------------------------------------
// Shared Swagger examples used across event endpoints
// ---------------------------------------------------------------------------

const EVENT_TYPE_DESCRIPTIONS: Record<string, string> = {
  Initialized:
    'Contract was initialised. Payload: { owner, creator_royalty_bps, platform_royalty_bps }',
  Mint:
    'NFT was minted. Payload: { token_id, owner, clip_id, metadata_uri, creator_royalty_bps }',
  Transfer:
    'NFT ownership transferred. Payload: { token_id, from, to, sale_price, royalty_amount }',
  Burn:
    'NFT was permanently burned. Payload: { token_id, owner }',
  Frozen:
    'NFT was frozen by an admin. Payload: { token_id, admin, frozen: true }',
  Unfrozen:
    'NFT freeze was lifted. Payload: { token_id, admin, frozen: false }',
  RoyaltyClaimed:
    'Creator claimed accrued royalties. Payload: { token_id, recipient, amount, asset }',
  RoyaltyUpdated:
    'Royalty configuration updated. Payload: { updated_by, old_creator_bps, new_creator_bps, old_platform_bps, new_platform_bps }',
  MetadataRefreshed:
    'Token metadata URI was updated. Payload: { token_id, updated_by, new_metadata_uri }',
  PauseScheduled:
    'A 24-hour pause timelock was started. Payload: { requested_by, requested_at, scheduled_for, reason }',
  Paused:
    'Contract pause became active after the timelock elapsed. Payload: { paused_by, activated_at }',
  Unpaused:
    'Contract was unpaused (or a pending schedule was cancelled). Payload: { unpaused_by, unpaused_at }',
  OwnershipTransferred:
    'Contract ownership was transferred. Payload: { previous_owner, new_owner }',
  RoyaltyPaid:
    'Royalties distributed during a transfer. Payload: { token_id, from, to, creator, creator_royalty, platform, platform_royalty, sale_price }',
  Refunded:
    'A payment was refunded. Payload: { token_id, recipient, amount }',
};

const EVENTS_DESCRIPTION =
  'Returns paginated indexed Soroban NFT contract events.\n\n' +
  '**Supported event types and their payloads:**\n\n' +
  SOROBAN_NFT_EVENT_TYPES.map(
    (t) => `- \`${t}\` — ${EVENT_TYPE_DESCRIPTIONS[t] ?? ''}`,
  ).join('\n');

@ApiTags('blockchain', 'soroban', 'NFTs')
@ApiInternalServerErrorResponse({ description: 'Internal server error' })
@Controller()
export class BlockchainController {
  constructor(
    private readonly indexerService: SorobanIndexerService,
    private readonly contractPauseService: ContractPauseService,
  ) {}

  // ---------------------------------------------------------------------------
  // Events — GET /blockchain/events
  // ---------------------------------------------------------------------------

  @Get('blockchain/events')
  @ApiOperation({
    summary: 'List indexed Soroban NFT contract events',
    description:
      'Returns indexed Soroban NFT events with optional event-type filtering and ' +
      'pagination. Duplicate on-chain events are stored once.\n\n' +
      EVENTS_DESCRIPTION,
  })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Filter by event type. Leave empty to return all types.',
    enum: [...SOROBAN_NFT_EVENT_TYPES],
  })
  @ApiQuery({ name: 'tokenId', required: false, type: Number, description: 'Filter by on-chain token ID.' })
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

  // ---------------------------------------------------------------------------
  // Events — GET /soroban/events
  // ---------------------------------------------------------------------------

  @Get('soroban/events')
  @ApiOperation({
    summary: 'List indexed Soroban contract events',
    description:
      'Alias for `GET /blockchain/events`. Returns the same indexed event feed ' +
      'with optional event-type and token filters.\n\n' +
      EVENTS_DESCRIPTION,
  })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Filter by event type. Leave empty to return all types.',
    enum: [...SOROBAN_NFT_EVENT_TYPES],
  })
  @ApiQuery({ name: 'tokenId', required: false, type: Number, description: 'Filter by on-chain token ID.' })
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

  // ---------------------------------------------------------------------------
  // Events — GET /nfts/:tokenId/events
  // ---------------------------------------------------------------------------

  @Get('nfts/:tokenId/events')
  @ApiOperation({
    summary: 'List indexed events for a specific NFT token',
    description:
      'Returns all indexed Soroban events associated with a single token ID, ' +
      'ordered by ledger descending. Supports optional event-type filtering and pagination.\n\n' +
      '**Events you can expect for a token:**\n\n' +
      '- `Mint` — the initial minting event\n' +
      '- `Transfer` — every ownership transfer with royalty breakdown\n' +
      '- `Frozen` / `Unfrozen` — admin freeze state changes\n' +
      '- `RoyaltyClaimed` — each royalty claim by the creator\n' +
      '- `RoyaltyPaid` — royalties distributed during a transfer\n' +
      '- `MetadataRefreshed` — metadata URI updates\n' +
      '- `Burn` — permanent destruction of the token',
  })
  @ApiParam({
    name: 'tokenId',
    type: Number,
    example: 42,
    description: 'On-chain integer token ID.',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Filter by event type.',
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
  // Contract Pause — /blockchain/* routes (Issue #1048)
  // ---------------------------------------------------------------------------

  @Post('blockchain/pause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Schedule a Soroban contract pause (24-hour timelock)',
    description:
      'Schedules a contract pause that becomes activatable after a 24-hour delay. ' +
      'Requires admin authorization via adminAddress matching ADMIN_STELLAR_ADDRESS. ' +
      'Activation is confirmed when the indexer observes a `Paused` event on-chain.',
  })
  @ApiBody({ type: SchedulePauseDto })
  @ApiOkResponse({ description: 'Pause scheduled successfully', type: ContractPauseStatusDto })
  @ApiForbiddenResponse({ description: 'Caller is not the configured admin' })
  @ApiBadRequestResponse({ description: 'A pause is already pending or active' })
  async schedulePause(@Body() dto: SchedulePauseDto): Promise<ContractPauseStatusDto> {
    return this.contractPauseService.schedulePause(dto.adminAddress, dto.reason);
  }

  @Delete('blockchain/pause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel a pending contract pause',
    description:
      'Cancels a scheduled pause that has not yet been activated on-chain. ' +
      'Requires admin authorization.',
  })
  @ApiBody({ type: CancelPauseDto })
  @ApiOkResponse({ description: 'Pause cancelled successfully', type: ContractPauseStatusDto })
  @ApiForbiddenResponse({ description: 'Caller is not the configured admin' })
  @ApiNotFoundResponse({ description: 'No pending pause exists to cancel' })
  async cancelPause(@Body() dto: CancelPauseDto): Promise<ContractPauseStatusDto> {
    return this.contractPauseService.cancelPause(dto.adminAddress);
  }

  @Get('blockchain/pause/status')
  @ApiOperation({
    summary: 'Get contract pause status',
    description:
      'Returns the current pause state including whether a pause is scheduled, ' +
      'when it becomes active, and whether the contract is currently paused.',
  })
  @ApiOkResponse({ description: 'Current pause status', type: ContractPauseStatusDto })
  async getPauseStatus(): Promise<ContractPauseStatusDto> {
    return this.contractPauseService.getPauseStatus();
  }

  // ---------------------------------------------------------------------------
  // Contract Pause — /admin/soroban/* routes
  // ---------------------------------------------------------------------------

  @Post('admin/soroban/pause')
  @HttpCode(HttpStatus.OK)
  @ApiTags('Admin')
  @ApiOperation({
    summary: 'Admin: schedule a Soroban contract pause (24-hour timelock)',
    description:
      'Schedules a contract pause that becomes activatable after a 24-hour delay. ' +
      'Requires admin authorization via adminAddress matching ADMIN_STELLAR_ADDRESS.',
  })
  @ApiBody({ type: SchedulePauseDto })
  @ApiOkResponse({ description: 'Pause scheduled', type: ContractPauseStatusDto })
  @ApiForbiddenResponse({ description: 'Caller is not the configured admin' })
  @ApiBadRequestResponse({ description: 'A pause is already pending or active' })
  async adminSchedulePause(@Body() dto: SchedulePauseDto): Promise<ContractPauseStatusDto> {
    return this.contractPauseService.schedulePause(dto.adminAddress, dto.reason);
  }

  @Post('admin/soroban/unpause')
  @HttpCode(HttpStatus.OK)
  @ApiTags('Admin')
  @ApiOperation({
    summary: 'Admin: cancel / unpause the Soroban contract',
    description:
      'Cancels a pending pause schedule or requests an on-chain unpause. ' +
      'Requires admin authorization via adminAddress matching ADMIN_STELLAR_ADDRESS.',
  })
  @ApiBody({ type: CancelPauseDto })
  @ApiOkResponse({ description: 'Pause cancelled / unpause initiated', type: ContractPauseStatusDto })
  @ApiForbiddenResponse({ description: 'Caller is not the configured admin' })
  @ApiNotFoundResponse({ description: 'No pending or active pause to cancel' })
  async adminUnpause(@Body() dto: CancelPauseDto): Promise<ContractPauseStatusDto> {
    return this.contractPauseService.cancelPause(dto.adminAddress);
  }

  @Get('admin/soroban/pause-status')
  @ApiTags('Admin')
  @ApiOperation({
    summary: 'Admin: get Soroban contract pause status',
    description:
      'Returns the current pause state including whether a pause is scheduled, ' +
      'when it becomes active, and whether the contract is currently paused.',
  })
  @ApiOkResponse({ description: 'Current pause status', type: ContractPauseStatusDto })
  async adminGetPauseStatus(): Promise<ContractPauseStatusDto> {
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
