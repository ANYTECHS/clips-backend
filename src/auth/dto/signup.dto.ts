import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SignupDto {
  @ApiProperty({
    description: 'User full display name (2 to 50 characters)',
    example: 'John Doe',
    minLength: 2,
    maxLength: 50,
    required: true,
  })
  @IsString({ message: 'Name must be a string' })
  @MinLength(2, { message: 'Name must be at least 2 characters long' })
  @MaxLength(50, { message: 'Name cannot exceed 50 characters' })
  name: string;

  @ApiProperty({
    description: 'Valid user email address used as unique account identifier',
    example: 'john@example.com',
    format: 'email',
    required: true,
  })
  @IsEmail({}, { message: 'Invalid email format' })
  email: string;

  @ApiProperty({
    description: 'User password (minimum 8 characters, maximum 32 characters)',
    example: 'SecurePass123!',
    minLength: 8,
    maxLength: 32,
    required: true,
  })
  @IsString({ message: 'Password must be a string' })
  @MinLength(8, { message: 'Password is too short (min 8 characters)' })
  @MaxLength(32, { message: 'Password is too long (max 32 characters)' })
  password: string;
}
