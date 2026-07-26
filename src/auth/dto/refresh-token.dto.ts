import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiPropertyOptional({
    description:
      'Refresh token (optional when sent via httpOnly cookie)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  @IsOptional()
  refreshToken?: string;
}
