import { Controller, Get, Query, Inject, Optional } from '@nestjs/common';
import {
  ApiResponse,
  ApiBadGatewayResponse,
  ApiInternalServerErrorResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { StellarService } from '../stellar/stellar.service';
import { AdminContractService } from './admin-contract.service';
import { SorobanPauseInfoDto, SorobanPauseReasonDto } from './dto/soroban-pause.dto';
import { ContractInfoDto } from './dto/contract-info.dto';
import {
  SorobanPauseInfoDto,
  SorobanPauseReasonDto,
} from './dto/soroban-pause.dto';
import { SorobanFeeEstimationService } from './soroban-fee-estimation.service';
import {
  EstimateMintFeeQueryDto,
  EstimateTransferFeeQueryDto,
  SorobanFeeEstimateDto,
  SorobanFeeEstimationErrorDto,
} from './dto/soroban-fee-estimate.dto';

@ApiTags('soroban')
@ApiInternalServerErrorResponse({ description: 'Soroban RPC request failed' })
@Controller('soroban')
export class SorobanContractController {
  constructor(
    private readonly stellarService: StellarService,
    private readonly adminContractService: AdminContractService,
    @Optional()
    @Inject(SorobanFeeEstimationService)
    private readonly feeEstimationService?: SorobanFeeEstimationService,
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

  @Get('fees/mint')
  @ApiOperation({
    summary: 'Estimate Soroban NFT mint transaction fee',
    description:
      'Simulates the Soroban mint transaction against the latest ledger to calculate the approximate ' +
      'transaction fee in stroops before user signs. Fee estimates are approximate; actual costs may ' +
      'vary before submission due to surge pricing, ledger state changes, or resource consumption fluctuations.',
  })
  @ApiOkResponse({
    description:
      'Estimated mint fee in stroops with resource breakdown and limitations disclaimer',
    type: SorobanFeeEstimateDto,
  })
  @ApiBadGatewayResponse({
    description: 'Soroban RPC node returned an error during simulation',
    type: SorobanFeeEstimationErrorDto,
  })
  @ApiInternalServerErrorResponse({
    description:
      'Soroban fee estimation failed due to an unexpected server or network error',
    type: SorobanFeeEstimationErrorDto,
  })
  estimateMintFee(
    @Query() query?: EstimateMintFeeQueryDto,
  ): Promise<SorobanFeeEstimateDto> {
    if (!this.feeEstimationService) {
      throw new Error('SorobanFeeEstimationService is not available');
    }
    return this.feeEstimationService.estimate_mint_fee(query);
  }

  @Get('fees/transfer')
  @ApiOperation({
    summary: 'Estimate Soroban NFT transfer transaction fee',
    description:
      'Simulates the Soroban transfer transaction against the latest ledger to calculate the approximate ' +
      'transaction fee in stroops before user signs. Fee estimates are approximate; actual costs may ' +
      'vary before submission due to surge pricing, ledger state changes, or resource consumption fluctuations.',
  })
  @ApiOkResponse({
    description:
      'Estimated transfer fee in stroops with resource breakdown and limitations disclaimer',
    type: SorobanFeeEstimateDto,
  })
  @ApiBadGatewayResponse({
    description: 'Soroban RPC node returned an error during simulation',
    type: SorobanFeeEstimationErrorDto,
  })
  @ApiInternalServerErrorResponse({
    description:
      'Soroban fee estimation failed due to an unexpected server or network error',
    type: SorobanFeeEstimationErrorDto,
  })
  estimateTransferFee(
    @Query() query?: EstimateTransferFeeQueryDto,
  ): Promise<SorobanFeeEstimateDto> {
    if (!this.feeEstimationService) {
      throw new Error('SorobanFeeEstimationService is not available');
    }
    return this.feeEstimationService.estimate_transfer_fee(query);
  }
}
