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
    description:
      'User password meeting strength requirements:\n' +
      '- Minimum 10 characters long\n' +
      '- Minimum zxcvbn password score of 3 (scale 0-4)\n' +
      '- Requires diverse characters (uppercase, lowercase, numbers, symbols)\n' +
      '- Common words, dictionary phrases, and easily guessable patterns are rejected\n\n' +
      'Validation failure returns a structured JSON string in error message:\n' +
      '`{"score": 1, "feedback": ["This is a very common password"], "suggestions": "Add another word or two"}`',
    example: 'Str0ngP@ssw0rd!2026',
    minLength: 10,
    maxLength: 32,
    required: true,
  })
  @IsString({ message: 'Password must be a string' })
  @MinLength(8, { message: 'Password is too short (min 8 characters)' })
  @MaxLength(32, { message: 'Password is too long (max 32 characters)' })
  @MinLength(10, { message: 'Password must be at least 10 characters long' })
  @MaxLength(32, { message: 'Password is too long (max 32 characters)' })
  @IsStrongPassword()
  password: string;
}
