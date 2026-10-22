import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({
    description: 'Password reset token received via email',
    example: 'd3b07384d113edec49eaa6238ad5ff00',
    required: true,
  })
  @IsString({ message: 'Token must be a string' })
  @IsNotEmpty({ message: 'Reset token is required' })
  token: string;

  @ApiProperty({
    description: 'New password meeting security requirements (min 8 characters)',
    example: 'NewSecurePass123!',
    minLength: 8,
    required: true,
  })
  @IsString({ message: 'Password must be a string' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
    description:
      'New password meeting strength requirements:\n' +
      '- Minimum 10 characters long\n' +
      '- Minimum zxcvbn password score of 3 (scale 0-4)\n' +
      '- Must include mixed characters (uppercase, lowercase, numbers, symbols)\n' +
      '- Weak sequences and common phrases are rejected\n\n' +
      'Validation failure returns a structured JSON string in error message:\n' +
      '`{"score": 1, "feedback": ["This is a very common password"], "suggestions": "Add another word or two"}`',
    example: 'NewStr0ngP@ssw0rd!2026',
    minLength: 10,
    required: true,
  })
  @IsString({ message: 'Password must be a string' })
  @MinLength(10, { message: 'Password must be at least 10 characters long' })
  @IsStrongPassword()
  newPassword: string;
}
