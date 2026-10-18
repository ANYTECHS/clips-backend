import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiPropertyOptional({
    description:
      'Opaque refresh token. Optional when the token is supplied via the refresh_token cookie instead.',
    example: 'a1b2c3d4e5f6...',
  })
  @IsString()
  @IsOptional()
  refreshToken?: string;
}
