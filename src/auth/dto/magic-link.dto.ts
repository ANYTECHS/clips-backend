import { IsEmail, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MagicLinkRequestDto {
  @ApiProperty({
    description: 'User email address to receive passwordless login magic link',
    description: 'Registered user email address to receive passwordless login magic link',
    example: 'creator@example.com',
    format: 'email',
    required: true,
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;
}
