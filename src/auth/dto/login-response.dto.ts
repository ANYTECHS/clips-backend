import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TokenResponseDto } from './token-response.dto';

export class LoginUserResponseDto {
  @ApiProperty({ example: 42 })
  id: number;

  @ApiProperty({ example: 'user@example.com' })
  email: string;

  @ApiPropertyOptional({ example: 'Jane Doe', nullable: true })
  name: string | null;

  @ApiPropertyOptional({
    example: 'https://example.com/avatar.png',
    nullable: true,
  })
  picture: string | null;

  @ApiProperty({ example: false })
  mfaEnabled: boolean;

  @ApiProperty({ example: true })
  emailVerified: boolean;
}

export class LoginResponseDto {
  @ApiProperty({ type: LoginUserResponseDto })
  user: LoginUserResponseDto;

  @ApiProperty({ type: TokenResponseDto })
  tokens: TokenResponseDto;

  @ApiProperty({ example: 'abc123def456' })
  csrfToken: string;
}
