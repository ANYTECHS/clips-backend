import {
  IsInt,
  IsString,
  IsNotEmpty,
  Min,
  IsOptional,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Request body for POST /nfts/:id/transfer (Issue #843).
 * Token ID comes from the path parameter.
 */
export class TransferNftDto {
  @ApiProperty({
    description: 'Stellar wallet address of the current NFT owner (sender)',
    example: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
  })
  @IsString()
  @IsNotEmpty()
  fromWallet!: string;

  @ApiProperty({
    description: 'Stellar wallet address of the new NFT owner (recipient)',
    example: 'GBXXYQVNHHZSL3VQNNNQRXB2FHQWZYTQJ6JRYVJL7XP2KXFBH3TFQXAA',
  })
  @IsString()
  @IsNotEmpty()
  toWallet!: string;

  @ApiProperty({
    description:
      'Agreed sale price in stroops (1 XLM = 10_000_000 stroops). Pass 0 for a gift.',
    example: 5000000000,
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  @Type(() => Number)
  salePrice!: number;

  @ApiPropertyOptional({
    description:
      'Royalty rate in basis points (0–10 000). When omitted, on-chain / clip rate is used.',
    example: 1000,
    minimum: 0,
    maximum: 10000,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  @Type(() => Number)
  royaltyBpsOverride?: number;
}

export class TransferNftResponseDto {
  @ApiProperty({
    example: 'AAAAAgAAAA...',
    description: 'Unsigned Soroban transaction XDR ready for Freighter / wallet signing',
  })
  xdr!: string;

  @ApiProperty({ example: 'transfer_with_royalty' })
  action!: string;

  @ApiProperty({ example: '42' })
  tokenId!: string;

  @ApiProperty({ example: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4' })
  contractId!: string;

  @ApiProperty({ example: 'testnet' })
  network!: string;

  @ApiProperty({
    description: 'Royalty breakdown for the transfer',
    example: {
      salePrice: 5000000000,
      royaltyBps: 1000,
      royaltyAmount: 500000000,
      netToSeller: 4500000000,
    },
  })
  royaltyBreakdown!: {
    salePrice: number;
    royaltyBps: number;
    royaltyAmount: number;
    netToSeller: number;
  };
}

export class TransferOwnershipErrorDto {
  @ApiProperty({ example: 403 })
  statusCode!: number;

  @ApiProperty({ example: 'Caller does not own this NFT on-chain' })
  message!: string;

  @ApiProperty({ example: 'Forbidden' })
  error!: string;
}

export class TransferSoulboundErrorDto {
  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({ example: 'Soulbound NFTs cannot be transferred' })
  message!: string;

  @ApiProperty({ example: 'Bad Request' })
  error!: string;
}

export class TransferRecipientErrorDto {
  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({ example: 'Invalid recipient Stellar address' })
  message!: string;

  @ApiProperty({ example: 'Bad Request' })
  error!: string;
}
