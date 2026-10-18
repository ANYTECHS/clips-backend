import {
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
  Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    description: 'User email address',
    example: 'john@example.com',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @ApiProperty({
    description: 'User password',
    example: 'SecurePass123!',
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password: string;

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
