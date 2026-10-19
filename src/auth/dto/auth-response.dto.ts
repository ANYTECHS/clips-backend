import { ApiProperty, ApiExtraModels } from '@nestjs/swagger';
import { DeviceInfoDto } from './device-info.dto';

/**
 * Successful authentication response.
 * Includes access token, refresh token, user info, and device information.
 */
@ApiExtraModels(DeviceInfoDto)
export class AuthResponseDto {
  @ApiProperty({
    description: 'JWT access token for API requests',
    example:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOjEsImVtYWlsIjoiay4uLiIsImVtYWlsVmVyaWZpZWQiOnRydWUsImlhdCI6MTcxMDI3MTIwMCwiZXhwIjoxNzEwMjc0ODAwfQ...',
  })
  accessToken: string;

  @ApiProperty({
    description: 'Refresh token for obtaining a new access token',
    example: 'refresh_token_opaque_value_32bytes',
  })
  refreshToken: string;

  @ApiProperty({
    description: 'User ID',
    example: 42,
  })
  userId: number;

  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
  })
  email: string;

  @ApiProperty({
    description: 'Whether user email is verified',
    example: true,
  })
  emailVerified: boolean;

  @ApiProperty({
    description: 'Expiration time of the access token (Unix timestamp in seconds)',
    example: 1710274800,
  })
  expiresIn: number;

  @ApiProperty({
    description: 'Device information for session binding and security auditing',
    type: DeviceInfoDto,
  })
  device?: DeviceInfoDto;

  @ApiProperty({
    description: 'Whether multi-factor authentication (TOTP) is enabled on this account',
    example: false,
  })
  mfaEnabled: boolean;
}
