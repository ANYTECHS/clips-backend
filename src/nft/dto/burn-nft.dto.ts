import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';

export class BurnNftDto {
  @ApiProperty({ description: 'Stellar address of the token owner (signer)', example: 'GABC...' })
  @IsString()
  @Matches(/^G[A-Z2-7]{55}$/, { message: 'walletAddress must be a valid Stellar public key' })
  walletAddress: string;

  @ApiPropertyOptional({
    description: 'Refund unclaimed escrowed royalties to the royalty recipient',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  refundRoyalties?: boolean;
}
