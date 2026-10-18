import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AuthUserDto {
  @ApiProperty({ example: 1, description: 'User ID' })
  id: number;

  @ApiProperty({ example: 'John Doe', description: 'User full name' })
  name: string;

  @ApiProperty({ example: 'john@example.com', description: 'User email' })
  email: string;

  @ApiPropertyOptional({ example: true, description: 'Whether email is verified' })
  emailVerified?: boolean;
}

export class AuthTokensDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'JWT access token',
  })
  accessToken: string;

  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'JWT refresh token',
  })
  refreshToken: string;
}

export class AuthSuccessResponseDto {
  @ApiProperty({ type: AuthUserDto })
  user: AuthUserDto;

  @ApiProperty({ type: AuthTokensDto })
  tokens: AuthTokensDto;

  @ApiPropertyOptional({
    example: 'csrf-token-value',
    description: 'CSRF token (login / OAuth)',
  })
  csrfToken?: string;
}

export class MessageResponseDto {
  @ApiProperty({
    example: 'If that email exists, a magic link has been sent.',
    description: 'Human-readable status message',
  })
  message: string;
}

export class MfaSetupResponseDto {
  @ApiProperty({
    example: 'JBSWY3DPEHPK3PXP',
    description: 'TOTP secret for authenticator apps',
  })
  secret: string;

  @ApiProperty({
    example: 'otpauth://totp/ClipCash:john@example.com?secret=JBSWY3DPEHPK3PXP&issuer=ClipCash',
    description: 'otpauth URI',
  })
  otpauthUrl: string;

  @ApiProperty({
    example: 'data:image/png;base64,...',
    description: 'QR code as data URL',
  })
  qrCode: string;
}

export class MfaStatusResponseDto {
  @ApiProperty({ example: true, description: 'Whether MFA is enabled' })
  enabled: boolean;
}

export class EnableMfaDto {
  @ApiProperty({
    description: '6-digit TOTP code from authenticator app',
    example: '123456',
    minLength: 6,
    maxLength: 6,
  })
  code: string;
}
