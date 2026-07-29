import { IsEmail, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MagicLinkRequestDto {
  @ApiProperty({
    description: 'Email address to send the passwordless login link to',
    description: 'Email address to receive the magic link',
    example: 'john@example.com',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
