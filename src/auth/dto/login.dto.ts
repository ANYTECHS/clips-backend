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
    description: 'User email address used during registration',
    example: 'john@example.com',
    format: 'email',
    required: true,
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @ApiProperty({
    description: 'User account password (minimum 8 characters)',
    example: 'SecurePass123!',
    minLength: 8,
    required: true,
  })
  @IsString({ message: 'Password must be a string' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password: string;

  @ApiPropertyOptional({
    description: 'Optional 6-digit TOTP code if Multi-Factor Authentication is enabled',
    example: '123456',
    minLength: 6,
    maxLength: 6,
  })
  @IsOptional()
  @IsString({ message: 'TOTP code must be a string' })
  @Length(6, 6, { message: 'TOTP code must be 6 digits' })
  totpCode?: string;
}
