import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

/**
 * DTO for requesting a password reset email.
 *
 * Used by the forgot password endpoint to send a password reset link
 * to the user's registered email address.
 *
 * @example
 * {
 *   "email": "user@example.com"
 * }
 */
export class ForgotPasswordDto {
  @ApiProperty({
    description: 'Email address of the account to reset',
    example: 'user@example.com',
    type: String,
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;
}

/**
 * Response DTO for forgot password request.
 *
 * Returns a generic success message to prevent user enumeration attacks.
 * The message is the same whether the email exists or not.
 */
export class ForgotPasswordResponseDto {
  @ApiProperty({
    description:
      'Generic success message (same response regardless of email existence)',
    example:
      'If an account with that email exists, a password reset link has been sent.',
  })
  message: string;

  @ApiProperty({
    description: 'Request correlation ID for tracking',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  requestId: string;
}
