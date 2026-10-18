import { ApiProperty } from '@nestjs/swagger';

export class TokenResponseDto {
  @ApiProperty({
    description: 'Short-lived JWT access token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken: string;

  @ApiProperty({
    description: 'Opaque refresh token, rotated on every use',
    example: 'a1b2c3d4e5f6...',
  })
  refreshToken: string;
}
