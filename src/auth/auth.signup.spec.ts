import { validate } from 'class-validator';
import { SignupDto } from './dto/signup.dto';

describe('SignupDto password validation', () => {
  const validSignup = (password: string): SignupDto =>
    Object.assign(new SignupDto(), {
      name: 'Test User',
      email: 'test@example.com',
      password,
    });

  it('accepts a password meeting the complete password policy', async () => {
    const errors = await validate(validSignup('C1ip$Cash#Secure2026!Str0ng'));

    expect(errors).toHaveLength(0);
  });

  it('rejects a password shorter than the minimum length', async () => {
    const errors = await validate(validSignup('Short1!'));

    expect(errors.some((error) => error.property === 'password')).toBe(true);
  });

  it('rejects a weak password even when it meets the length and character rules', async () => {
    const errors = await validate(validSignup('Password123!Password123!'));

    expect(errors.some((error) => error.property === 'password')).toBe(true);
  });
});
