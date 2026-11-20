import { Controller, Get, HttpCode, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AdminGuard } from '../common/guards/admin.guard';
import { FEE_ESTIMATE_DISCLAIMER, SorobanService } from './soroban.service';

const feeSchema = {
  type: 'object',
  properties: {
    operation: { type: 'string', example: 'mint' },
    estimatedFee: { type: 'number', example: 120100 },
    unit: { type: 'string', example: 'stroops' },
    network: { type: 'string', example: 'testnet' },
    timestamp: { type: 'string', format: 'date-time' },
    limitations: { type: 'string', example: FEE_ESTIMATE_DISCLAIMER },
  },
};

const freezeSchema = {
  type: 'object',
  properties: { tokenId: { type: 'number', example: 1 }, frozen: { type: 'boolean' } },
};

@ApiTags('soroban')
@Controller('soroban')
export class SorobanController {
  constructor(private readonly soroban: SorobanService) {}

  @Get('contract-info')
  @ApiOperation({ summary: 'Get NFT contract metadata' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', example: 'ClipCash NFT' },
        symbol: { type: 'string', example: 'CLIP' },
        version: { type: 'string', example: '1.0.0' },
        owner: { type: 'string', nullable: true },
        platformFee: { type: 'number', description: 'Basis points', example: 250 },
      },
    },
  })
  contractInfo() {
    return this.soroban.getContractInfo();
  }

  @Get('fees/mint')
  @ApiOperation({ summary: 'Estimate mint fee', description: FEE_ESTIMATE_DISCLAIMER })
  @ApiOkResponse({ schema: feeSchema })
  @ApiServiceUnavailableResponse({ description: 'Fee estimation failed' })
  mintFee() {
    return this.soroban.estimateFee('mint');
  }

  @Get('fees/transfer')
  @ApiOperation({ summary: 'Estimate transfer fee', description: FEE_ESTIMATE_DISCLAIMER })
  @ApiOkResponse({ schema: feeSchema })
  @ApiServiceUnavailableResponse({ description: 'Fee estimation failed' })
  transferFee() {
    return this.soroban.estimateFee('transfer');
  }
}

@ApiTags('nft-freeze')
@Controller()
export class NftFreezeController {
  constructor(private readonly soroban: SorobanService) {}

  @Get('nfts/:tokenId/freeze-status')
  @ApiOperation({ summary: 'Get NFT freeze status' })
  @ApiParam({ name: 'tokenId', type: Number })
  @ApiOkResponse({ schema: freezeSchema })
  @ApiNotFoundResponse({ description: 'NFT not found' })
  status(@Param('tokenId', ParseIntPipe) tokenId: number) {
    return this.soroban.getFreezeStatus(tokenId);
  }

  @Post('admin/nfts/:tokenId/freeze')
  @HttpCode(200)
  @UseGuards(AdminGuard)
  @ApiHeader({ name: 'x-admin-secret', required: true, description: 'Admin secret key' })
  @ApiOperation({ summary: 'Freeze an NFT (admin only) — blocks transfers' })
  @ApiParam({ name: 'tokenId', type: Number })
  @ApiOkResponse({ schema: freezeSchema })
  @ApiUnauthorizedResponse({ description: 'Missing admin credentials' })
  @ApiForbiddenResponse({ description: 'Not an authorized admin' })
  @ApiNotFoundResponse({ description: 'NFT not found' })
  @ApiConflictResponse({ description: 'NFT already frozen' })
  freeze(@Param('tokenId', ParseIntPipe) tokenId: number) {
    return this.soroban.setFrozen(tokenId, true);
  }

  @Post('admin/nfts/:tokenId/unfreeze')
  @HttpCode(200)
  @UseGuards(AdminGuard)
  @ApiHeader({ name: 'x-admin-secret', required: true, description: 'Admin secret key' })
  @ApiOperation({ summary: 'Unfreeze an NFT (admin only)' })
  @ApiParam({ name: 'tokenId', type: Number })
  @ApiOkResponse({ schema: freezeSchema })
  @ApiUnauthorizedResponse({ description: 'Missing admin credentials' })
  @ApiForbiddenResponse({ description: 'Not an authorized admin' })
  @ApiNotFoundResponse({ description: 'NFT not found' })
  @ApiConflictResponse({ description: 'NFT is not frozen' })
  unfreeze(@Param('tokenId', ParseIntPipe) tokenId: number) {
    return this.soroban.setFrozen(tokenId, false);
  }
}
