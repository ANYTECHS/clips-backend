import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';

/**
 * Supported OAuth providers.
 */
export enum OAuthProvider {
  GOOGLE = 'google',
  TWITTER = 'twitter',
  FACEBOOK = 'facebook',
  GITHUB = 'github',
}

/**
 * DTO for OAuth callback handling.
 *
 * Contains the authorization code and state returned by the OAuth provider.
 */
export class OAuthCallbackDto {
  @ApiProperty({
    description: 'Authorization code from OAuth provider',
    example: 'auth_code_12345',
    type: String,
  })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({
    description: 'State parameter for CSRF protection',
    example: 'random_state_string',
    type: String,
    required: false,
  })
  @IsOptional()
  @IsString()
  state?: string;
}

/**
 * Response DTO for successful OAuth authentication.
 */
export class OAuthResponseDto {
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
    description: 'User ID (created or existing)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  userId: string;

  @ApiProperty({
    description: 'Whether this is a new user registration',
    example: false,
  })
  isNewUser: boolean;
}
