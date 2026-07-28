import {
  IsInt,
  IsString,
  IsNotEmpty,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Request body for PATCH /nfts/:id/royalty
 *
 * Updates the per-token royalty stored on-chain via the Soroban
 * `set_royalty(caller, token_id, bps, recipient)` contract function.
 *
 * Only the original token creator may update the royalty.
 * The combined creator + platform fee must not exceed 1500 bps (15%).
 */
export class UpdateNftRoyaltyDto {
  @ApiProperty({
    description:
      'New royalty value in basis points (0–1500). ' +
      '100 bps = 1%, 1000 bps = 10%, 1500 bps = 15% (maximum). ' +
      'Combined with the platform fee the total must not exceed 1500 bps.',
    example: 1000,
    minimum: 0,
    maximum: 1500,
  })
  @IsInt()
  @Min(0)
  @Max(1500)
  @Type(() => Number)
  royaltyBps: number;

  @ApiProperty({
    description:
      'Stellar wallet address that will receive royalty payments on secondary sales.',
    example: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
  })
  @IsString()
  @IsNotEmpty()
  recipient: string;
}
