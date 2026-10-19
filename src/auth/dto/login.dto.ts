import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, IsOptional, Length } from 'class-validator';

/**
 * DTO for user login with email and password.
 *
 * Supports optional TOTP/MFA code for two-factor authentication.
 *
 * @example
 * {
 *   "email": "user@example.com",
 *   "password": "SecurePass123!",
 *   "totpCode": "123456"
 * }
 */
export class LoginDto {
  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
    type: String,
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @ApiProperty({
    description: 'User password',
    example: 'SecurePass123!',
    type: String,
    minLength: 8,
  })
  @IsString({ message: 'Password must be a string' })
  @IsNotEmpty({ message: 'Password is required' })
  password: string;

  @ApiProperty({
    description: 'Optional TOTP/MFA code (6 digits, required if MFA is enabled)',
    example: '123456',
    type: String,
    required: false,
    minLength: 6,
    maxLength: 6,
  })
  @IsOptional()
  @IsString({ message: 'TOTP code must be a string' })
  @Length(6, 6, { message: 'TOTP code must be exactly 6 digits' })
  totpCode?: string;
}

/**
 * Response DTO for successful login.
 */
export class LoginResponseDto {
  @ApiProperty({
    description: 'JWT access token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken: string;

  @ApiProperty({
    description: 'JWT refresh token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  refreshToken: string;

  @ApiProperty({
    description: 'Token type',
    example: 'Bearer',
  })
  tokenType: string;

  @ApiProperty({
    description: 'Token expiration time in seconds',
    example: 3600,
  })
  expiresIn: number;

  @ApiProperty({
    description: 'CSRF token (set in cookie and returned for reference)',
    example: 'abc123...',
  })
  csrfToken: string;
}
