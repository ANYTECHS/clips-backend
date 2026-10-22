import { Controller, Get } from '@nestjs/common';
import {
  ApiResponse,
  ApiInternalServerErrorResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { StellarService } from '../stellar/stellar.service';
import { AdminContractService } from './admin-contract.service';
import { SorobanPauseInfoDto, SorobanPauseReasonDto } from './dto/soroban-pause.dto';
import { ContractInfoDto } from './dto/contract-info.dto';

@ApiTags('soroban')
@ApiInternalServerErrorResponse({ description: 'Soroban RPC request failed' })
@Controller('soroban')
export class SorobanContractController {
  constructor(
    private readonly stellarService: StellarService,
    private readonly adminContractService: AdminContractService,
  ) {}

  @Get('contract/info')
  @ApiOperation({
    summary: 'Get Soroban NFT contract metadata',
    description:
      'Reads the contract name, symbol, version, owner, and platform fee using contract_info(). This endpoint is read-only.',
  })
  @ApiResponse({
    status: 200,
    description: 'Current contract metadata',
    type: ContractInfoDto,
  })
  getContractInfo(): Promise<ContractInfoDto> {
    return this.adminContractService.getContractMetadata();
  }

  @Get('contract/version')
  @ApiOperation({
    summary: 'Get the deployed Soroban NFT contract version',
    description:
      'Reads the contract version() view from the configured contract. This endpoint is read-only.',
  })
  @ApiOkResponse({
    description: 'On-chain contract version',
    schema: {
      example: {
        contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4',
        version: '1.1.0',
      },
    },
  })
  getContractVersion(): Promise<{ contractId: string; version: string }> {
    return this.adminContractService.getContractVersion();
  }

  @Get('pause')
  @ApiOperation({
    summary: 'Get Soroban contract pause status and reason',
    description:
      'Reads is_paused() and pause_reason() from the configured NFT contract. The reason is an empty string when none is set.',
  })
  @ApiOkResponse({
    description: 'Current on-chain pause status and reason',
    type: SorobanPauseInfoDto,
  })
  getPauseInfo(): Promise<SorobanPauseInfoDto> {
    return this.adminContractService.getPauseInfo();
  }

  @Get('pause/reason')
  @ApiOperation({
    summary: 'Get the Soroban contract pause reason',
    description:
      'Reads pause_reason() from the configured NFT contract. Returns an empty string when no reason is set.',
  })
  @ApiOkResponse({
    description: 'Current on-chain pause reason',
    type: SorobanPauseReasonDto,
  })
  async getPauseReason(): Promise<SorobanPauseReasonDto> {
    return { reason: await this.adminContractService.getPauseReason() };
  }
}