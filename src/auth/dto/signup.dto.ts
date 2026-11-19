import { IsEmail, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsValidPassword,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_REQUIREMENTS,
} from '../validators/password-policy';

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
    description: `User password: ${PASSWORD_REQUIREMENTS}. Never returned in responses.`,
    example: 'Str0ngP@ssw0rd!2026',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
    format: 'password',
    writeOnly: true,
    required: true,
  })
  @IsValidPassword()
  password: string;
}
