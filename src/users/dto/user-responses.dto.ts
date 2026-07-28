import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';

export class UserResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'user@example.com' })
  email: string;

  @ApiPropertyOptional({ example: 'Jane Doe' })
  name?: string | null;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatars/1.jpg' })
  picture?: string | null;

  @ApiPropertyOptional({ example: '2026-07-26T12:00:00.000Z' })
  emailVerified?: Date | null;

  @ApiPropertyOptional({ example: 'GC6X********UTZF3' })
  stellarPublicKey?: string | null;

  @ApiPropertyOptional({ example: 'custodial' })
  walletType?: string | null;

  @ApiProperty()
  createdAt: Date;

  @Exclude()
  password?: string | null;

  @Exclude()
  mfaSecret?: string | null;

  @Exclude()
  encryptedStellarSecret?: string | null;
}
