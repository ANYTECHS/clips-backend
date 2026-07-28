import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsStrongPassword } from '../validators/decorators';

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
    description:
      'User password. Must be at least 10 characters long and score at least 3 out of 4 ' +
      'on the zxcvbn strength scale (0 = very weak, 4 = very strong). ' +
      'Requests that fail this check return 400 with a JSON-encoded message containing ' +
      '`score`, `feedback`, and `suggestions` fields, e.g. ' +
      '`{"score":1,"feedback":["Add numbers","Add special characters"],"suggestions":"Password is too weak. Add numbers, Add special characters"}`.',
    example: 'C0rrect-Horse-Battery-Staple!',
    minLength: 10,
    maxLength: 32,
  })
  @IsString()
  @MinLength(10, { message: 'Password must be at least 10 characters long' })
  @MaxLength(32, { message: 'Password is too long (max 32 characters)' })
  @IsStrongPassword()
  password: string;
}
