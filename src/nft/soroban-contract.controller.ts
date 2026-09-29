import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { StellarService } from '../stellar/stellar.service';
import { AdminContractService } from './admin-contract.service';

@ApiTags('soroban')
@Controller('soroban/contract')
export class SorobanContractController {
  constructor(
    private readonly stellarService: StellarService,
    private readonly adminContractService: AdminContractService,
  ) {}

  @Get('info')
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

  @Get('version')
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
}