import {
  IsNotEmpty,
  IsString,
  IsStrongPassword,
  MinLength,
} from 'class-validator';
import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsValidPassword,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_REQUIREMENTS,
} from '../validators/password-policy';

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
    description:
      'New password meeting strength requirements:\n' +
      '- Minimum 10 characters long\n' +
      '- Minimum zxcvbn password score of 3 (scale 0-4)\n' +
      '- Must include mixed characters (uppercase, lowercase, numbers, symbols)\n' +
      '- Weak sequences and common phrases are rejected\n\n' +
      'Validation failure returns a structured JSON string in error message:\n' +
      '`{"score": 1, "feedback": ["This is a very common password"], "suggestions": "Add another word or two"}`',
    description: `New password: ${PASSWORD_REQUIREMENTS}. Never returned in responses.`,
    example: 'NewStr0ngP@ssw0rd!2026',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
    format: 'password',
    writeOnly: true,
    required: true,
  })
  @IsValidPassword()
  newPassword: string;
}
