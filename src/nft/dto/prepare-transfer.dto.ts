import {
  IsInt,
  IsString,
  IsNotEmpty,
  Min,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Request body for POST /nfts/prepare-transfer
 *
 * Builds an unsigned Soroban `transfer_with_royalty` XDR that the caller
 * can sign and submit on-chain. The response includes a full royalty
 * breakdown so the frontend can display the fee before the user signs.
 */
export class PrepareTransferDto {
  @ApiProperty({
    description: 'Unique numeric NFT token ID (derived from clip ID)',
    example: '101',
    required: true,
  })
  @IsNotEmpty({ message: 'tokenId is required' })
  tokenId: string | number;

  @ApiPropertyOptional({
    description: 'Current owner Stellar wallet address transferring the NFT',
    example: 'GBWMCCCVJ6DGYOC2QOXWZKQ4X6ZJ4X6QWXZ7WJZV2L22XZ3456789ABC',
  })
  @IsOptional()
  @IsString()
  fromAddress?: string;

  @ApiPropertyOptional({
    description: 'Stellar wallet address of the current NFT owner (sender alias)',
    example: 'GBWMCCCVJ6DGYOC2QOXWZKQ4X6ZJ4X6QWXZ7WJZV2L22XZ3456789ABC',
  })
  @IsOptional()
  @IsString()
  fromWallet?: string;

  @ApiPropertyOptional({
    description: 'Buyer/recipient Stellar wallet address receiving the NFT',
    example: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  })
  @IsOptional()
  @IsString()
  toAddress?: string;

  @ApiPropertyOptional({
    description: 'Stellar wallet address of the new NFT owner (recipient alias)',
    example: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  })
  @IsOptional()
  @IsString()
  toWallet?: string;

  @ApiProperty({
    description:
      'Secondary sale price in smallest currency units (e.g. stroops: 10000000 = 1 XLM). ' +
      'Pass 0 for a gifted/free transfer (no royalty charged).',
    example: '100000000',
    required: true,
  })
  @IsNotEmpty({ message: 'salePrice is required' })
  salePrice: string | number;

  @ApiPropertyOptional({
    description: 'Optional contract ID of payment token',
    example: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
  })
  @IsOptional()
  @IsString()
  paymentTokenContractId?: string;

  @ApiPropertyOptional({
    description:
      'Royalty rate in basis points (0–10 000) to apply to this transfer. ' +
      'When omitted the on-chain per-token or default rate is used.',
    example: 1000,
    minimum: 0,
    maximum: 10000,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  royaltyBpsOverride?: number;
}

export class RoyaltyBreakdownResponse {
  @ApiProperty({ example: 'GBWMCCCVJ6DGYOC2QOXWZKQ4X6ZJ4X6QWXZ7WJZV2L22XZ3456789ABC' })
  creatorWallet: string;

  @ApiProperty({ example: 1000, description: 'Creator royalty in basis points (1000 bps = 10%)' })
  creatorRoyaltyBps: number;

  @ApiProperty({ example: '10000000', description: 'Calculated creator royalty amount' })
  creatorRoyaltyAmount: string;

  @ApiProperty({ example: 'GDPLATFORMWALLETADDRESS123456789012345678901234567890123456' })
  platformWallet: string;

  @ApiProperty({ example: 100, description: 'Platform royalty in basis points (100 bps = 1%)' })
  platformRoyaltyBps: number;

  @ApiProperty({ example: '1000000', description: 'Calculated platform royalty amount' })
  platformRoyaltyAmount: string;

  @ApiProperty({ example: '11000000', description: 'Total royalties deducted from sale price' })
  totalRoyaltyAmount: string;
}

export class RoyaltyPaidEventResponse {
  @ApiProperty({ example: 'RoyaltyPaid', description: 'Event identifier emitted on-chain' })
  name: string;

  @ApiProperty({
    example: {
      tokenId: '101',
      from: 'GBWMCCCVJ6DGYOC2QOXWZKQ4X6ZJ4X6QWXZ7WJZV2L22XZ3456789ABC',
      to: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      creator: 'GBWMCCCVJ6DGYOC2QOXWZKQ4X6ZJ4X6QWXZ7WJZV2L22XZ3456789ABC',
      creatorRoyalty: '10000000',
      platform: 'GDPLATFORMWALLETADDRESS123456789012345678901234567890123456',
      platformRoyalty: '1000000',
      salePrice: '100000000',
    },
    description: 'Structured event data for on-chain Soroban event emission',
  })
  data: Record<string, any>;
}

export class PrepareTransferResponseDto {
  @ApiProperty({
    description: 'Transaction XDR ready for client wallet signature',
    example: 'AAAAAgAAAAA...',
  })
  xdr: string;

  @ApiProperty({ example: '101' })
  tokenId: string;

  @ApiProperty({ example: 'GBWMCCCVJ6DGYOC2QOXWZKQ4X6ZJ4X6QWXZ7WJZV2L22XZ3456789ABC' })
  from: string;

  @ApiProperty({ example: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' })
  to: string;

  @ApiProperty({ example: '100000000', description: 'Gross secondary sale price' })
  salePrice: string;

  @ApiProperty({ example: '89000000', description: 'Net proceeds payable to seller after royalty deductions' })
  sellerProceeds: string;

  @ApiProperty({ type: RoyaltyBreakdownResponse, description: 'Detailed royalty distribution breakdown' })
  royaltyBreakdown: RoyaltyBreakdownResponse;

  @ApiProperty({ type: RoyaltyPaidEventResponse, description: 'Soroban RoyaltyPaid event specification' })
  event: RoyaltyPaidEventResponse;
}
