import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

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

  @ApiPropertyOptional({
    description:
      'Refund the currently unclaimed royalty balance to the configured royalty recipient during burn. The contract must recalculate the balance atomically when the transaction is submitted.',
    example: true,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  refundRoyalties?: boolean;
}

/** Success response for POST /nfts/:id/burn — an unsigned XDR for the owner to sign. */
export class BurnNftResponseDto {
  @ApiProperty({
    description:
      'Unsigned Soroban transaction XDR calling burn(owner, token_id, refund_royalties)',
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

  @ApiProperty({
    description: 'Whether the transaction requests an atomic royalty refund',
    example: true,
  })
  refundRoyalties: boolean;

  @ApiProperty({
    description: 'Configured royalty recipient, or null when no refund is requested',
    nullable: true,
    example: 'GC6X2Y3ZQZFXBABKHOKSAVHOJ7NDGQBZC7XT2M6RCFPEHVGT7JXOTUZF',
  })
  refundRecipient: string | null;

  @ApiProperty({
    description:
      'Estimated refund in stroops. The contract recalculates the eligible amount at submission.',
    example: '12500000',
  })
  refundAmount: string;
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
