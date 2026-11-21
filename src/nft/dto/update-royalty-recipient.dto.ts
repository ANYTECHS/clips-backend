import { IsStellarAddress } from '../../common/validators/decorators';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class UpdateRoyaltyRecipientDto {
  @ApiProperty({
    description: 'New Stellar wallet address for future royalty payments',
    example: 'GBVP7D2V6...WXYZ',
  })
  @IsString()
  @IsNotEmpty()
  @IsStellarAddress()
  newRecipient!: string;

  @ApiPropertyOptional({
    description: 'Current recipient wallet address authorizing the change',
    example: 'GC6XOTK6L...UTZF3',
  })
  @IsString()
  @IsOptional()
  currentRecipient?: string;
}

export class UpdateRoyaltyRecipientResponseDto {
  @ApiProperty({ example: '42', description: 'NFT token ID' })
  tokenId!: string;

  @ApiProperty({ example: 'GBVP7D2V6...WXYZ', description: 'Updated royalty recipient wallet address' })
  newRecipient!: string;

  @ApiProperty({ example: true, description: 'Success flag' })
  updated!: boolean;
}
