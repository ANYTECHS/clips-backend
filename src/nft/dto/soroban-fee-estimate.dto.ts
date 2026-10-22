import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Breakdown of estimated fees between classic transaction base fee and Soroban resource fee.
 */
export class SorobanFeeBreakdownDto {
  @ApiProperty({
    example: '100',
    description: 'Classic Stellar network base fee in stroops.',
  })
  baseFeeStroops!: string;

  @ApiProperty({
    example: '15350',
    description:
      'Soroban smart contract resource fee (CPU, memory, storage) in stroops.',
  })
  resourceFeeStroops!: string;

  @ApiPropertyOptional({
    example: 1250000,
    description: 'Estimated CPU instructions required for execution.',
  })
  cpuInstructions?: number;

  @ApiPropertyOptional({
    example: 45000,
    description: 'Estimated memory consumption in bytes.',
  })
  memoryBytes?: number;
}

/**
 * Response DTO returning estimated Soroban transaction fee in stroops (Issue #1091).
 */
export class SorobanFeeEstimateDto {
  @ApiProperty({
    example: 'mint',
    description:
      'Contract operation evaluated for fee estimation (mint | transfer).',
  })
  operation!: 'mint' | 'transfer';

  @ApiProperty({
    example: '15450',
    description:
      'Approximate estimated transaction fee in stroops (1 XLM = 10,000,000 stroops).',
  })
  estimatedFee!: string;

  @ApiProperty({
    example: 'stroops',
    description: 'Unit of denomination for estimatedFee (always "stroops").',
  })
  unit!: string;

  @ApiProperty({
    example: 'testnet',
    description:
      'Stellar network where the fee simulation was conducted (e.g. testnet, public).',
  })
  network!: string;

  @ApiProperty({
    example: '2026-10-22T09:30:00.000Z',
    description: 'ISO-8601 timestamp when this fee estimate was computed.',
  })
  timestamp!: string;

  @ApiProperty({
    example:
      'Fee estimates are approximate and calculated via ledger simulation. Actual costs may vary at submission time due to network congestion, ledger base fee spikes, or contract state changes before signing.',
    description:
      'Disclaimer detailing estimation limitations and reasons why fees may change prior to transaction submission.',
  })
  limitations!: string;

  @ApiPropertyOptional({
    example: '0.0015450',
    description: 'Approximate fee formatted in XLM for user display.',
  })
  estimatedFeeXlm?: string;

  @ApiPropertyOptional({
    type: SorobanFeeBreakdownDto,
    description: 'Detailed resource and base fee breakdown.',
  })
  breakdown?: SorobanFeeBreakdownDto;
}

/**
 * Optional query parameters for estimating mint fees.
 */
export class EstimateMintFeeQueryDto {
  @ApiPropertyOptional({
    example: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
    description:
      'Destination or minter wallet address. If omitted, a standard address is used.',
  })
  @IsOptional()
  @IsString()
  walletAddress?: string;

  @ApiPropertyOptional({
    example: 101,
    description: 'Clip ID to simulate minting. Defaults to sample clip ID.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  clipId?: number;

  @ApiPropertyOptional({
    example: 'default',
    description: 'Target collection ID. Defaults to "default".',
  })
  @IsOptional()
  @IsString()
  collectionId?: string;
}

/**
 * Optional query parameters for estimating transfer fees.
 */
export class EstimateTransferFeeQueryDto {
  @ApiPropertyOptional({
    example: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
    description:
      'Sender wallet address. If omitted, a sample sender address is used.',
  })
  @IsOptional()
  @IsString()
  fromWallet?: string;

  @ApiPropertyOptional({
    example: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
    description:
      'Recipient wallet address. If omitted, a sample recipient address is used.',
  })
  @IsOptional()
  @IsString()
  toWallet?: string;

  @ApiPropertyOptional({
    example: 42,
    description:
      'Token ID to simulate transferring. Defaults to sample token ID.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  tokenId?: number;
}

/**
 * Response DTO describing fee estimation failure (Issue #1091).
 */
export class SorobanFeeEstimationErrorDto {
  @ApiProperty({
    example: 502,
    description:
      'HTTP status code (e.g. 502 Bad Gateway or 500 Internal Server Error).',
  })
  statusCode!: number;

  @ApiProperty({
    example: 'Bad Gateway',
    description: 'HTTP error title.',
  })
  error!: string;

  @ApiProperty({
    example:
      'Soroban fee estimation failed: Simulation returned an error: HostError: Error(Contract, #1)',
    description:
      'Detailed explanation of why the simulation or fee estimation failed.',
  })
  message!: string;

  @ApiProperty({
    example: 'testnet',
    description: 'Network where the estimation failed.',
  })
  network!: string;

  @ApiProperty({
    example: '2026-10-22T09:30:00.000Z',
    description: 'ISO-8601 timestamp of the failure.',
  })
  timestamp!: string;
}
