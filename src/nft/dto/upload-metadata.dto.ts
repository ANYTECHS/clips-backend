import { IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Body for POST /nfts/upload-metadata — upload clip NFT metadata to IPFS before minting. */
export class UploadClipMetadataDto {
  @ApiPropertyOptional({
    description: 'NFT collection slug. Defaults to viral-clips.',
    example: 'viral-clips',
  })
  @IsOptional()
  @IsString({ message: 'collectionId must be a string' })
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      'collectionId must be a lowercase slug (letters, numbers and hyphens), e.g. viral-clips',
  })
  collectionId?: string;

  @ApiProperty({
    description: 'Clip ID whose metadata should be uploaded to IPFS',
    example: 42,
    minimum: 1,
  })
  @IsInt({ message: 'clipId must be a whole number' })
  @Min(1, { message: 'clipId must be a positive number' })
  @Type(() => Number)
  clipId: number;
}
