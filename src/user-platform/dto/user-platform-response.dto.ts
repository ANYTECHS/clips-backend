import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Safe representation of a UserPlatform record.
 * accessToken/refreshToken are encrypted at rest and must never be
 * serialized into an API response.
 */
export class UserPlatformResponseDto {
  @ApiProperty({ description: 'UserPlatform record ID', example: 1 })
  id: number;

  @ApiProperty({ description: 'ID of the user who owns this connection', example: 42 })
  userId: number;

  @ApiProperty({ description: 'Connected platform name', example: 'youtube' })
  platform: string;

  @ApiPropertyOptional({ description: 'Username on the connected platform', example: 'creator123' })
  username?: string | null;

  @ApiProperty({ description: 'When the platform was connected', example: '2026-01-15T10:00:00.000Z' })
  connectedAt: Date;

  @ApiProperty({ description: 'When the connection was last updated', example: '2026-02-01T09:30:00.000Z' })
  updatedAt: Date;
}

export function toUserPlatformResponseDto(platform: {
  id: number;
  userId: number;
  platform: string;
  username?: string | null;
  connectedAt: Date;
  updatedAt: Date;
}): UserPlatformResponseDto {
  return {
    id: platform.id,
    userId: platform.userId,
    platform: platform.platform,
    username: platform.username,
    connectedAt: platform.connectedAt,
    updatedAt: platform.updatedAt,
  };
}
