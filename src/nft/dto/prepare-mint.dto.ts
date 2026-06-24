import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class PrepareMintDto {
  @IsInt()
  @Min(1)
  clipId: number;

  @IsString()
  @IsNotEmpty()
  walletAddress: string;
}
