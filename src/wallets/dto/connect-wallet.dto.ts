import { IsString, IsNotEmpty, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** @deprecated Use CreateWalletConnectionDto */
export type ConnectWalletDto = CreateWalletConnectionDto;

export class CreateWalletConnectionDto {
  @ApiProperty({ description: 'The wallet address (e.g., Stellar G address)' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiProperty({ description: 'The blockchain network', example: 'stellar' })
  @IsString()
  @IsNotEmpty()
  @IsIn(['stellar'])
  chain: string;

  @ApiProperty({ description: 'The wallet provider type', example: 'freighter' })
  @IsString()
  @IsNotEmpty()
  @IsIn(['freighter', 'lobstr', 'albedo'])
  type: string;
}
