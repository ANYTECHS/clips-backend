import { IsOptional, IsString, Length } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class TotpLoginDto {
  @ApiPropertyOptional({
    description: 'TOTP code for MFA (6 digits)',
    example: '123456',
    minLength: 6,
    maxLength: 6,
  })
  @IsOptional()
  @IsString()
  @Length(6, 6, { message: 'TOTP code must be 6 digits' })
  totpCode?: string;
}
