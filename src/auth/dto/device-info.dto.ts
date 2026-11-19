import { ApiProperty } from '@nestjs/swagger';

/**
 * Device information captured during authentication.
 * Used for device fingerprinting and security auditing.
 */
export class DeviceInfoDto {
  @ApiProperty({
    description: 'User agent string of the device',
    example: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  })
  userAgent?: string;

  @ApiProperty({
    description: 'Hashed device fingerprint for session binding',
    example: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
  })
  deviceFingerprint?: string;

  @ApiProperty({
    description: 'Client IP address (when available)',
    example: '192.0.2.1',
  })
  ipAddress?: string;

  @ApiProperty({
    description: 'Device platform (e.g., Windows, macOS, Linux, iOS, Android)',
    example: 'Windows',
  })
  platform?: string;

  @ApiProperty({
    description: 'Browser name and version',
    example: 'Chrome 120.0',
  })
  browser?: string;
}
