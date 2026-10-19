import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsStrongPassword } from '../validators/decorators';

export class ResetPasswordDto {
  @ApiProperty({
    description: 'Password reset token received via email',
    example: 'a1b2c3d4e5f6...',
  })
  @IsString()
  @IsNotEmpty()
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MinLength, Matches } from 'class-validator';

/**
 * DTO for resetting a password with a valid reset token.
 *
 * The token is provided via the email link sent from the forgot password flow.
 * Password must meet security requirements:
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character (!@#$%^&*(),.?":{}|<>)
 *
 * @example
 * {
 *   "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
 *   "password": "NewSecurePass123!"
 * }
 */
export class ResetPasswordDto {
  @ApiProperty({
    description: 'Password reset token from email link',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    type: String,
  })
  @IsString({ message: 'Token must be a string' })
  @IsNotEmpty({ message: 'Reset token is required' })
  token: string;

  @ApiProperty({
    description:
      'New password. Must be at least 10 characters long and score at least 3 out of 4 ' +
      'on the zxcvbn strength scale (0 = very weak, 4 = very strong). ' +
      'Requests that fail this check return 400 with a JSON-encoded message containing ' +
      '`score`, `feedback`, and `suggestions` fields, e.g. ' +
      '`{"score":1,"feedback":["Add numbers","Add special characters"],"suggestions":"Password is too weak. Add numbers, Add special characters"}`.',
    example: 'N3w-C0rrect-Horse-Battery!',
    minLength: 10,
  })
  @IsString()
  @MinLength(10, { message: 'Password must be at least 10 characters long' })
  @IsStrongPassword()
  newPassword: string;
      'New password (min 8 chars, must include uppercase, lowercase, number, and special character)',
    example: 'NewSecurePass123!',
    type: String,
    minLength: 8,
  })
  @IsString({ message: 'Password must be a string' })
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>])[A-Za-z\d!@#$%^&*(),.?":{}|<>]{8,}$/,
    {
      message:
        'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
    },
  )
  password: string;
}

/**
 * Response DTO for successful password reset.
 */
export class ResetPasswordResponseDto {
  @ApiProperty({
    description: 'Success message confirming password reset',
    example:
      'Password has been reset successfully. You can now log in with your new password.',
  })
  message: string;

  @ApiProperty({
    description: 'Request correlation ID for tracking',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  requestId: string;
}
