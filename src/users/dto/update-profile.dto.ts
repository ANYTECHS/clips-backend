import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Partial profile update. Every field is optional; omitted fields are left
 * untouched. Unknown fields are rejected by the global ValidationPipe
 * (whitelist + forbidNonWhitelisted).
 */
export class UpdateProfileDto {
  @ApiPropertyOptional({
    description: 'Unique username (3-30 chars: letters, numbers, underscore, dot)',
    example: 'john_doe',
    minLength: 3,
    maxLength: 30,
    pattern: '^[a-zA-Z0-9_.]+$',
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-zA-Z0-9_.]+$/, {
    message: 'username may only contain letters, numbers, underscores and dots',
  })
  username?: string;

  @ApiPropertyOptional({
    description: 'Display name',
    example: 'John Doe',
    minLength: 1,
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  displayName?: string;

  @ApiPropertyOptional({
    description: 'Profile description',
    example: 'Clip creator and streamer',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @ApiPropertyOptional({
    description: 'Profile image URL (https)',
    example: 'https://cdn.example.com/avatar.png',
    maxLength: 2048,
  })
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  picture?: string;
}
