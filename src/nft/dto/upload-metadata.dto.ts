import { IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/** Body for POST /nfts/upload-metadata — upload clip NFT metadata to IPFS before minting. */
export class UploadClipMetadataDto {
  @ApiProperty({
    description: 'Clip ID whose metadata should be uploaded to IPFS',
    example: 42,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  clipId: number;
}
