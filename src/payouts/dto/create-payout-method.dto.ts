import { IsString, IsOptional, IsBoolean, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePayoutMethodDto {
  @ApiProperty({
    description: 'Type of payout method',
    enum: ['bank_account', 'wire_transfer', 'ach'],
    example: 'bank_account',
  })
  @IsString()
  @IsIn(['bank_account', 'wire_transfer', 'ach'])
  type: string;

  @ApiPropertyOptional({
    description: 'Bank account number (will be encrypted)',
    example: '1234567890',
  })
  @IsOptional()
  @IsString()
  accountNumber?: string;

  @ApiPropertyOptional({
    description: 'Bank routing number (will be encrypted)',
    example: '021000021',
  })
  @IsOptional()
  @IsString()
  routingNumber?: string;

  @ApiPropertyOptional({
    description: 'SWIFT/BIC code for international transfers (will be encrypted)',
    example: 'CHASUS33',
  })
  @IsOptional()
  @IsString()
  swiftCode?: string;

  @ApiPropertyOptional({
    description: 'IBAN for international transfers (will be encrypted)',
    example: 'GB29NWBK60161331926819',
  })
  @IsOptional()
  @IsString()
  iban?: string;

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
    description: 'Currency code (ISO 4217)',
    example: 'USD',
    default: 'USD',
  })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({
    description: 'Set as default payout method',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
