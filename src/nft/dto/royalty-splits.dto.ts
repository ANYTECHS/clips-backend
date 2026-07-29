import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/** A single royalty recipient share, in basis points. */
export class RoyaltyShareDto {
  @ApiProperty({
    description: 'Stellar wallet address receiving this share',
    example: 'GC6X2Y3ZQZFXBABKHOKSAVHOJ7NDGQBZC7XT2M6RCFPEHVGT7JXOTUZF',
  })
  @IsString()
  @IsNotEmpty()
  recipient: string;

  @ApiProperty({
    description: 'Share of the royalty in basis points (1 BPS = 0.01%)',
    example: 9000,
    minimum: 0,
    maximum: 10000,
  })
  @IsInt()
  @Min(0)
  @Max(10000)
  bps: number;
}

/** GET /nfts/:id/royalties response — the full multi-recipient split. */
export class RoyaltySplitsResponseDto {
  @ApiProperty({ description: 'Token ID (= clip ID)', example: 42 })
  tokenId: number;

  @ApiProperty({
    description: 'Configured royalty recipients and their basis-point shares',
    type: [RoyaltyShareDto],
    example: [
      {
        recipient: 'GC6X2Y3ZQZFXBABKHOKSAVHOJ7NDGQBZC7XT2M6RCFPEHVGT7JXOTUZF',
        bps: 9000,
      },
      {
        recipient: 'GDPLATFORM7XT2M6RCFPEHVGT7JXOTUZFAAAAAAAAAAAAAAAAAAAAAA',
        bps: 1000,
      },
    ],
  })
  shares: RoyaltyShareDto[];

  @ApiProperty({
    description: 'Sum of all shares, in basis points (must be <= 10000)',
    example: 10000,
  })
  totalBps: number;
}

/** Body for PATCH /nfts/:id/royalties */
export class UpdateRoyaltySplitsDto {
  @ApiProperty({
    description:
      "The NFT owner's Stellar wallet address — must match the on-chain token " +
      'owner, since the returned transaction requires this wallet to sign it.',
    example: 'GC6X2Y3ZQZFXBABKHOKSAVHOJ7NDGQBZC7XT2M6RCFPEHVGT7JXOTUZF',
  })
  @IsString()
  @IsNotEmpty()
  walletAddress: string;

  @ApiProperty({
    description:
      'Royalty recipients and their basis-point shares. Combined total must not exceed 10000 (100%).',
    type: [RoyaltyShareDto],
    example: [
      {
        recipient: 'GC6X2Y3ZQZFXBABKHOKSAVHOJ7NDGQBZC7XT2M6RCFPEHVGT7JXOTUZF',
        bps: 9000,
      },
      {
        recipient: 'GDPLATFORM7XT2M6RCFPEHVGT7JXOTUZFAAAAAAAAAAAAAAAAAAAAAA',
        bps: 1000,
      },
    ],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RoyaltyShareDto)
  shares: RoyaltyShareDto[];
}

/** Success response for PATCH /nfts/:id/royalties — an unsigned XDR for the owner to sign. */
export class UpdateRoyaltySplitsResponseDto {
  @ApiProperty({
    description: 'Unsigned Soroban transaction XDR calling set_royalties(token_id, royalties)',
    example: 'AAAAAgAAAAA...',
  })
  xdr: string;

  @ApiProperty({ description: 'Token ID (= clip ID)', example: 42 })
  tokenId: number;

  @ApiProperty({ type: [RoyaltyShareDto] })
  shares: RoyaltyShareDto[];

  @ApiProperty({ description: 'Sum of all shares, in basis points', example: 10000 })
  totalBps: number;
}

/** 400 body when the combined royalty shares exceed 10000 BPS. */
export class RoyaltySplitsValidationErrorDto {
  @ApiProperty({ example: 400 })
  statusCode: number;

  @ApiProperty({
    example: 'Combined royalty shares (10500 bps) exceed the maximum of 10000 bps (100%).',
  })
  message: string;

  @ApiProperty({ example: 'Bad Request' })
  error: string;
}
