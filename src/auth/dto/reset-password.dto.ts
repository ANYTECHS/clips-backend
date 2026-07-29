import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsStrongPassword } from '../validators/decorators';

export class ResetPasswordDto {
  @ApiProperty({
    description: 'Password reset token received via email',
    example: 'a1b2c3d4e5f6...',
    description: 'Password reset token from email link',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsString()
  @IsNotEmpty()
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
    description: 'New password (min 8 characters)',
    example: 'SecurePass123!',
    example: 'NewSecurePass123!',
    minLength: 8,
  })
  @IsString()
  @MinLength(10, { message: 'Password must be at least 10 characters long' })
  @IsStrongPassword()
  newPassword: string;
}
