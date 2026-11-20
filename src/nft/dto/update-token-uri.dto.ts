import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

export class UpdateTokenUriDto {
  @ApiProperty({
    description: 'New IPFS or HTTPS metadata URI for the NFT token',
    example: 'ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
  })
  @IsNotEmpty()
  @IsString()
  uri!: string;
}

export class UpdateTokenUriResponseDto {
  @ApiProperty({
    description: 'Numeric token ID of the updated NFT',
    example: '42',
  })
  tokenId!: string;

  @ApiProperty({
    description: 'Updated custom token URI',
    example: 'ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
  })
  uri!: string;

  @ApiProperty({
    description: 'Whether the update completed successfully',
    example: true,
  })
  updated!: boolean;
}

export class TokenUriOwnershipErrorDto {
  @ApiProperty({ example: 403 })
  statusCode!: number;

  @ApiProperty({ example: 'Only the NFT owner can update token URI' })
  message!: string;

  @ApiProperty({ example: 'Forbidden' })
  error!: string;
}
