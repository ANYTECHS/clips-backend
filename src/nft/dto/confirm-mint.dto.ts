import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Body for POST /nfts/confirm-mint
 * Called after the frontend submits a signed Soroban mint transaction.
 */
export class ConfirmMintDto {
  @ApiProperty({ description: 'Clip ID that was minted', example: 42 })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  clipId: number;

  @ApiProperty({
    description: 'On-chain mint address / contract token identifier',
    example: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4',
  })
  @IsString()
  @IsNotEmpty()
  mintAddress: string;
}
