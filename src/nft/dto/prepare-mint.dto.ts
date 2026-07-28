import { IsInt, IsString, IsNotEmpty, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/** @deprecated Use CreateMintPreparationDto */
export type PrepareMintDto = CreateMintPreparationDto;

export class CreateMintPreparationDto {
  @ApiProperty({
    description: 'Clip ID to prepare for minting',
    example: 42,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  clipId: number;

  @ApiProperty({
    description: 'Stellar wallet address that will sign the mint transaction',
    example: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
  })
  @IsString()
  @IsNotEmpty()
  walletAddress: string;
}
