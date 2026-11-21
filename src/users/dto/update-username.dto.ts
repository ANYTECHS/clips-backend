import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length, Matches } from 'class-validator';

export class UpdateUsernameDto {
  @ApiProperty({ example: 'clip_master', minLength: 3, maxLength: 30, pattern: '^[a-zA-Z0-9_.]+$' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(3, 30)
  @Matches(/^[a-zA-Z0-9_.]+$/, { message: 'username may only contain letters, numbers, underscores and dots' })
  username: string;
}
