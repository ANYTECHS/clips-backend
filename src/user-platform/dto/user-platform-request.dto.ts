import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateUserPlatformDto {
  @ApiProperty({
    description: 'Social platform identifier',
    example: 'youtube',
    minLength: 1,
  })
  @IsString()
  @IsNotEmpty()
  platform: string;

  @ApiPropertyOptional({
    description: 'Username on the connected platform',
    example: 'creator123',
  })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({
    description: 'OAuth access token; encrypted before storage and never returned',
    example: 'oauth-access-token',
    writeOnly: true,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  accessToken?: string;

  @ApiPropertyOptional({
    description: 'OAuth refresh token; encrypted before storage and never returned',
    example: 'oauth-refresh-token',
    writeOnly: true,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  refreshToken?: string;

  @ApiPropertyOptional({
    description: 'Stellar public address for this platform connection',
    example: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  stellarAddress?: string;
}

export class UpdateUserPlatformDto {
  @ApiPropertyOptional({
    description: 'Social platform identifier',
    example: 'youtube',
    minLength: 1,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  platform?: string;

  @ApiPropertyOptional({
    description: 'Username on the connected platform',
    example: 'creator123',
  })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({
    description: 'OAuth access token; encrypted before storage and never returned',
    example: 'oauth-access-token',
    writeOnly: true,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  accessToken?: string;

  @ApiPropertyOptional({
    description: 'OAuth refresh token; encrypted before storage and never returned',
    example: 'oauth-refresh-token',
    writeOnly: true,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  refreshToken?: string;
}