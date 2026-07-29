import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class BatchMintClipItemDto {
  @ApiProperty({
    description: 'Unique clip ID to mint',
    example: '101',
  })
  @IsNotEmpty()
  @IsString()
  clipId!: string;

  @ApiPropertyOptional({
    description: 'Optional pre-uploaded IPFS metadata URI for this clip',
    example: 'ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
  })
  @IsOptional()
  @IsString()
  metadataUri?: string;

  @ApiPropertyOptional({
    description: 'Whether the clip NFT is soulbound (non-transferable)',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isSoulbound?: boolean;
}

export class BatchMintDto {
  @ApiProperty({
    description: 'Stellar wallet address of the creator / recipient',
    example: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
  })
  @IsNotEmpty()
  @IsString()
  creatorWallet!: string;

  @ApiProperty({
    description: 'Array of clips to mint in batch (max 50 clips per call)',
    type: [BatchMintClipItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchMintClipItemDto)
  clips!: BatchMintClipItemDto[];

  @ApiPropertyOptional({
    description: 'Royalty rate in basis points (1 BPS = 0.01%). Range 0 - 10000',
    example: 500,
    default: 1000,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  royaltyBps?: number;
}

export class BatchMintPartialFailureDto {
  @ApiProperty({
    description: 'Clip ID that failed during processing',
    example: '102',
  })
  clipId!: string;

  @ApiProperty({
    description: 'Reason for clip processing failure',
    example: 'Posted clips cannot be minted',
  })
  reason!: string;
}

export class BatchMintResponseDto {
  @ApiProperty({
    description: 'Overall success status of batch operation',
    example: true,
  })
  success!: boolean;

  @ApiProperty({
    description: 'Total number of successfully minted clips',
    example: 2,
  })
  mintedCount!: number;

  @ApiProperty({
    description: 'List of minted token IDs / mint addresses',
    example: ['101', '103'],
    type: [String],
  })
  tokenIds!: string[];

  @ApiPropertyOptional({
    description: 'List of clips that failed during batch execution (partial failure response)',
    type: [BatchMintPartialFailureDto],
  })
  partialFailures?: BatchMintPartialFailureDto[];
}
