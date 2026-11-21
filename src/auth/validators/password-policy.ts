import { applyDecorators } from '@nestjs/common';
import { IsStrongPassword } from './decorators';
import { IsString, Matches, MaxLength, MinLength, IsNotEmpty } from 'class-validator';

/** Central password policy shared by every auth endpoint. */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;
/** Requires at least one lowercase, one uppercase, one digit and one symbol. */
export const PASSWORD_PATTERN =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;
export const PASSWORD_REQUIREMENTS = `${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters, including uppercase, lowercase, a number and a special character, with a zxcvbn strength score of at least 3`;

/**
 * Applies the shared password policy (length, character classes, zxcvbn). Messages never interpolate `$value`,
 * so submitted passwords are never echoed back in validation errors.
 */
export function IsValidPassword(): PropertyDecorator {
  return applyDecorators(
    IsString({ message: 'Password must be a string' }),
    IsNotEmpty({ message: 'Password is required' }),
    MinLength(PASSWORD_MIN_LENGTH, {
      message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
    }),
    MaxLength(PASSWORD_MAX_LENGTH, {
      message: `Password must be at most ${PASSWORD_MAX_LENGTH} characters`,
    }),
    Matches(PASSWORD_PATTERN, {
      message:
        'Password must contain uppercase, lowercase, a number and a special character',
    }),
    // zxcvbn score >= 3; error payload contains feedback only, never the value.
    IsStrongPassword(),
  );
}
