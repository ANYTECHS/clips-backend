import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdatePayoutMethodDto {
  @ApiPropertyOptional({
    description: 'Name of the bank',
    example: 'Chase Bank',
  })
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional({
    description: 'Name of the account holder',
    example: 'John Doe',
  })
  @IsOptional()
  @IsString()
  accountHolderName?: string;

  @ApiPropertyOptional({
    description: 'Country code (ISO 3166-1 alpha-2)',
    example: 'US',
  })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({
    description: 'Set as default payout method',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
