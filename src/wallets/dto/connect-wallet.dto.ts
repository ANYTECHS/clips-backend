import { IsString, IsNotEmpty, IsIn, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SUPPORTED_CHAINS, DEFAULT_CHAIN } from '../chain.constants';

/** @deprecated Use CreateWalletConnectionDto */
export type ConnectWalletDto = CreateWalletConnectionDto;

export class CreateWalletConnectionDto {
  @ApiProperty({ description: 'The wallet address (e.g., Stellar G address)' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiPropertyOptional({
    description: `The blockchain network. Defaults to "${DEFAULT_CHAIN}" when omitted.`,
    enum: SUPPORTED_CHAINS,
    default: DEFAULT_CHAIN,
  })
  @IsOptional()
  @IsString()
  @IsIn([...SUPPORTED_CHAINS], {
    message: `chain must be one of: ${SUPPORTED_CHAINS.join(', ')}`,
  })
  chain?: string;

  @ApiProperty({ description: 'The wallet provider type', example: 'freighter' })
  @IsString()
  @IsNotEmpty()
  @IsIn(['freighter', 'lobstr', 'albedo'])
  type: string;
}
