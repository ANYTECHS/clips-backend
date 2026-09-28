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
    description: 'Bank account number (will be encrypted, rotates stored secret)',
    example: '1234567890',
  })
  @IsOptional()
  @IsString()
  accountNumber?: string;

  @ApiPropertyOptional({
    description: 'Bank routing number (will be encrypted, rotates stored secret)',
    example: '021000021',
  })
  @IsOptional()
  @IsString()
  routingNumber?: string;

  @ApiPropertyOptional({
    description: 'SWIFT/BIC code (will be encrypted, rotates stored secret)',
    example: 'CHASUS33',
  })
  @IsOptional()
  @IsString()
  swiftCode?: string;

  @ApiPropertyOptional({
    description: 'IBAN (will be encrypted, rotates stored secret)',
    example: 'GB29NWBK60161331926819',
  })
  @IsOptional()
  @IsString()
  iban?: string;

  @ApiPropertyOptional({
    description: 'Set as default payout method',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
