import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { SUPPORTED_PLATFORMS } from '../../common/validators/is-valid-platform.validator';
import {
  IsStellarAddress,
  IsValidPlatform,
} from '../../common/validators/decorators';
import {
  STELLAR_ADDRESS_DESCRIPTION,
  STELLAR_ADDRESS_EXAMPLE,
} from '../../common/validators/is-stellar-address.validator';

export class CreateUserPlatformDto {
  @ApiProperty({
    description: 'Social platform identifier',
    example: 'youtube',
    enum: SUPPORTED_PLATFORMS,
  })
  @IsString()
  @IsNotEmpty()
  @IsValidPlatform()
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
    description: STELLAR_ADDRESS_DESCRIPTION,
    example: STELLAR_ADDRESS_EXAMPLE,
  })
  @IsOptional()
  @IsString()
  @IsStellarAddress()
  stellarAddress?: string;
}

export class UpdateUserPlatformDto {
  @ApiPropertyOptional({
    description: 'Social platform identifier',
    example: 'youtube',
    enum: SUPPORTED_PLATFORMS,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @IsValidPlatform()
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