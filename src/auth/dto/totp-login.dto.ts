import { IsOptional, IsString, Length } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class TotpLoginDto {
  @ApiPropertyOptional({
    description: '6-digit Time-based One-Time Password (TOTP) for MFA verification',
    example: '123456',
    minLength: 6,
    maxLength: 6,
  })
  @IsOptional()
  @IsString({ message: 'TOTP code must be a string' })
  @Length(6, 6, { message: 'TOTP code must be 6 digits' })
  totpCode?: string;
}
