import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/** Body for POST /nfts/:id/burn */
export class BurnNftDto {
  @ApiProperty({
    description:
      "The NFT owner's Stellar wallet address. Must match the on-chain " +
      'token owner — the returned transaction requires this wallet to sign it.',
    example: 'GC6X2Y3ZQZFXBABKHOKSAVHOJ7NDGQBZC7XT2M6RCFPEHVGT7JXOTUZF',
  })
  @IsString()
  @IsNotEmpty()
  walletAddress: string;
}

/** Success response for POST /nfts/:id/burn — an unsigned XDR for the owner to sign. */
export class BurnNftResponseDto {
  @ApiProperty({
    description: 'Unsigned Soroban transaction XDR calling burn(owner, token_id)',
    example: 'AAAAAgAAAAA...',
  })
  xdr: string;

  @ApiProperty({ description: 'Token ID being burned (= clip ID)', example: 42 })
  tokenId: number;

  @ApiProperty({
    description: 'Owner wallet that must sign this transaction',
    example: 'GC6X2Y3ZQZFXBABKHOKSAVHOJ7NDGQBZC7XT2M6RCFPEHVGT7JXOTUZF',
  })
  owner: string;

  @ApiProperty({
    description: 'Soroban NFT contract ID',
    example: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4',
  })
  contractId: string;

  @ApiProperty({ description: 'Stellar network', example: 'testnet' })
  network: string;
}

/** 403 body when the caller does not own the NFT being burned. */
export class BurnForbiddenDto {
  @ApiProperty({ example: 403 })
  statusCode: number;

  @ApiProperty({ example: 'You do not own this clip' })
  message: string;

  @ApiProperty({ example: 'Forbidden' })
  error: string;
}

/** 404 body when the clip/token to burn cannot be found. */
export class BurnNotFoundDto {
  @ApiProperty({ example: 404 })
  statusCode: number;

  @ApiProperty({ example: 'Clip with ID 42 not found' })
  message: string;

  @ApiProperty({ example: 'Not Found' })
  error: string;
}
