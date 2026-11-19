import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsNumber, Min, Max } from 'class-validator';

export class UpdateMetadataDto {
  @ApiPropertyOptional({ example: 'Updated Clip Title', description: 'Updated NFT title' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'Updated clip description and attributes', description: 'Updated NFT description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 'ipfs://QmNewMetadataHash', description: 'New IPFS or HTTPS metadata URI' })
  @IsString()
  @IsNotEmpty()
  contentUri!: string;

  @ApiPropertyOptional({ example: 95, description: 'Updated virality score (0-100)' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(100)
  viralityScore?: number;
}

export class UpdateMetadataResponseDto {
  @ApiProperty({ example: '42', description: 'NFT token ID' })
  tokenId!: string;

  @ApiProperty({ example: true, description: 'Update success status' })
  updated!: boolean;

  @ApiProperty({ example: 'ipfs://QmNewMetadataHash', description: 'Updated content URI' })
  contentUri!: string;
}

export class MetadataUpdateLimitErrorDto {
  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({ example: 'Metadata can only be updated once per NFT.' })
  message!: string;

  @ApiProperty({ example: 'Bad Request' })
  error!: string;
}
