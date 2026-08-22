import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';

export class RefreshMetadataDto {
  @ApiProperty({ example: 'GADMIN6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3' })
  @IsString()
  @IsNotEmpty()
  adminAddress!: string;

  @ApiProperty({ example: 'Updated Clip Title' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 'Updated clip description and analytics' })
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiProperty({ example: 'ipfs://QmNewMetadataHash' })
  @IsString()
  @IsNotEmpty()
  contentUri!: string;

  @ApiProperty({ example: 'Clip creator' })
  @IsString()
  @IsNotEmpty()
  creator!: string;

  @ApiProperty({ example: 10 })
  @IsInt()
  @Min(0)
  royaltyPercent!: number;

  @ApiProperty({ example: false })
  @IsBoolean()
  isSoulbound!: boolean;

  @ApiProperty({ example: 1700000000 })
  @IsInt()
  @Min(0)
  createdAt!: number;

  @ApiProperty({ example: 95 })
  @IsInt()
  @Min(0)
  @Max(100)
  viralityScore!: number;

  @ApiProperty({ example: 30 })
  @IsInt()
  @Min(0)
  originalDuration!: number;
}

export class RefreshMetadataResponseDto {
  @ApiProperty({ example: 'mock-xdr' })
  xdr!: string;

  @ApiProperty({ example: 'refresh_metadata' })
  action!: string;

  @ApiProperty({ example: '42' })
  tokenId!: string;

  @ApiProperty({ example: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4' })
  contractId!: string;

  @ApiProperty({ example: 'testnet' })
  network!: string;
}

export class MetadataRefreshCooldownErrorDto {
  @ApiProperty({ example: 429 })
  statusCode!: number;

  @ApiProperty({ example: 'Metadata refresh is subject to a 30-day cooldown.' })
  message!: string;

  @ApiProperty({ example: 'Too Many Requests' })
  error!: string;
}
