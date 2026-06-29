import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SignupDto {
  @ApiProperty({
    description: 'User full name',
    example: 'John Doe',
    minLength: 2,
    maxLength: 50,
  })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name: string;

  @ApiProperty({
    description: 'User email address',
    example: 'john@example.com',
  })
  @IsEmail({}, { message: 'Invalid email format' })
  email: string;

  @ApiProperty({
    description: 'User password (min 8 characters)',
    example: 'SecurePass123!',
    minLength: 8,
    maxLength: 32,
  })
  @IsString()
  @MinLength(8, { message: 'Password is too short (min 8 characters)' })
  @MaxLength(32, { message: 'Password is too long (max 32 characters)' })
  password: string;
}
