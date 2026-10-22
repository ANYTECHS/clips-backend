import { Controller, Get, Query, Inject, Optional } from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { StellarService } from '../stellar/stellar.service';
import { AdminContractService } from './admin-contract.service';
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
    summary: 'Get configured Soroban NFT contract information',
    description:
      'Returns the configured contract ID and public network connection details. This endpoint is read-only.',
  })
  @ApiOkResponse({
    description: 'Configured Soroban contract information',
    schema: {
      example: {
        contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4',
        network: 'testnet',
        rpcUrl: 'https://soroban-testnet.stellar.org',
        networkPassphrase: 'Test SDF Network ; September 2015',
        explorerUrl:
          'https://stellar.expert/explorer/testnet/contract/CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4',
      },
    },
  })
  getContractInfo(): {
    contractId: string;
    network: string;
    rpcUrl: string;
    networkPassphrase: string;
    explorerUrl: string;
  } {
    const contractId =
      process.env.SOROBAN_NFT_CONTRACT_ID?.trim() ||
      'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4';
    const network = this.stellarService.network.toLowerCase();
    const explorerNetwork = network === 'public' ? 'public' : 'testnet';

    return {
      contractId,
      network,
      rpcUrl: this.stellarService.rpcUrl,
      networkPassphrase: this.stellarService.networkPassphrase,
      explorerUrl: `https://stellar.expert/explorer/${explorerNetwork}/contract/${contractId}`,
    };
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
