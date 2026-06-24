import { IsInt, IsString, IsNotEmpty, Min } from 'class-validator';
import { Type } from 'class-transformer';

/** @deprecated Use CreateMintPreparationDto */
export type PrepareMintDto = CreateMintPreparationDto;

export class CreateMintPreparationDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  clipId: number;

  @IsString()
  @IsNotEmpty()
  walletAddress: string;
}
