import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { LoginDto } from '../../../src/auth/dto/login.dto';
import { SignupDto } from '../../../src/auth/dto/signup.dto';
import { CreateClipDto } from '../../../src/clips/dto/create-clip.dto';
import { CreatePayoutDto } from '../../../src/payouts/dto/request-payout.dto';
import { CreatePayoutMethodDto } from '../../../src/payouts/dto/create-payout-method.dto';
import { MintNftDto } from '../../../src/nft/dto/mint-nft.dto';

// ---------------------------------------------------------------------------
// Helper: validate a plain object as a given DTO class
// ---------------------------------------------------------------------------
async function validateDto<T extends object>(
  cls: new () => T,
  plain: Record<string, unknown>,
): Promise<string[]> {
  const instance = plainToInstance(cls, plain);
  const errors = await validate(instance as object);
  return errors.flatMap((e) => Object.values(e.constraints ?? {}));
}

// ---------------------------------------------------------------------------
// LoginDto
// ---------------------------------------------------------------------------
describe('LoginDto validation', () => {
  it('passes with valid credentials', async () => {
    const errs = await validateDto(LoginDto, {
      email: 'user@example.com',
      password: 'SecurePass123!',
    });
    expect(errs).toHaveLength(0);
  });

  it('fails with invalid email', async () => {
    const errs = await validateDto(LoginDto, {
      email: 'not-an-email',
      password: 'SecurePass123!',
    });
    expect(errs.some((e) => /valid email/i.test(e))).toBe(true);
  });

  it('fails with password shorter than 8 characters', async () => {
    const errs = await validateDto(LoginDto, {
      email: 'user@example.com',
      password: 'short',
    });
    expect(errs.some((e) => /8 characters/i.test(e))).toBe(true);
  });

  it('fails with TOTP code that is not exactly 6 digits', async () => {
    const errs = await validateDto(LoginDto, {
      email: 'user@example.com',
      password: 'SecurePass123!',
      totpCode: '12345', // 5 digits — invalid
    });
    expect(errs.some((e) => /6 digits/i.test(e) || /6/i.test(e))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SignupDto
// ---------------------------------------------------------------------------
describe('SignupDto validation', () => {
  it('passes with valid data', async () => {
    const errs = await validateDto(SignupDto, {
      name: 'John Doe',
      email: 'john@example.com',
      password: 'C0rrect-Horse-Battery-Staple!',
    });
    // password validator is custom; only check structural errors here
    const structuralErrors = errs.filter(
      (e) => !/strong/i.test(e) && !/zxcvbn/i.test(e) && !/score/i.test(e),
    );
    expect(structuralErrors).toHaveLength(0);
  });

  it('fails when name is missing', async () => {
    const errs = await validateDto(SignupDto, {
      email: 'john@example.com',
      password: 'C0rrect-Horse-Battery-Staple!',
    });
    expect(errs.some((e) => /name/i.test(e))).toBe(true);
  });

  it('fails when name is shorter than 2 characters', async () => {
    const errs = await validateDto(SignupDto, {
      name: 'J',
      email: 'john@example.com',
      password: 'C0rrect-Horse-Battery-Staple!',
    });
    expect(errs.some((e) => /2 characters/i.test(e))).toBe(true);
  });

  it('fails when email is invalid', async () => {
    const errs = await validateDto(SignupDto, {
      name: 'John Doe',
      email: 'not-an-email',
      password: 'C0rrect-Horse-Battery-Staple!',
    });
    expect(errs.some((e) => /email/i.test(e))).toBe(true);
  });

  it('fails when password is shorter than 10 characters', async () => {
    const errs = await validateDto(SignupDto, {
      name: 'John Doe',
      email: 'john@example.com',
      password: 'short',
    });
    expect(errs.some((e) => /10 characters/i.test(e))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CreateClipDto
// ---------------------------------------------------------------------------
describe('CreateClipDto validation', () => {
  const base = {
    videoId: 'vid-123',
    inputPath: '/tmp/source.mp4',
    outputPath: '/tmp/clip.mp4',
    startTime: 0,
    endTime: 30,
    positionRatio: 0.5,
  };

  it('passes with valid data', async () => {
    const errs = await validateDto(CreateClipDto, base);
    expect(errs).toHaveLength(0);
  });

  it('fails when videoId is missing', async () => {
    const errs = await validateDto(CreateClipDto, { ...base, videoId: '' });
    expect(errs.some((e) => /videoId/i.test(e))).toBe(true);
  });

  it('fails when positionRatio exceeds 1', async () => {
    const errs = await validateDto(CreateClipDto, { ...base, positionRatio: 1.5 });
    expect(errs.some((e) => /positionRatio/i.test(e))).toBe(true);
  });

  it('fails when positionRatio is negative', async () => {
    const errs = await validateDto(CreateClipDto, { ...base, positionRatio: -0.1 });
    expect(errs.some((e) => /positionRatio/i.test(e))).toBe(true);
  });

  it('fails when royaltyBps exceeds 1500', async () => {
    const errs = await validateDto(CreateClipDto, { ...base, royaltyBps: 2000 });
    expect(errs.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// CreatePayoutDto
// ---------------------------------------------------------------------------
describe('CreatePayoutDto validation', () => {
  it('passes with valid data', async () => {
    const errs = await validateDto(CreatePayoutDto, {
      amount: 50,
      currency: 'USD',
      method: 'stellar',
    });
    expect(errs).toHaveLength(0);
  });

  it('fails when amount is zero', async () => {
    const errs = await validateDto(CreatePayoutDto, {
      amount: 0,
      currency: 'USD',
      method: 'stellar',
    });
    expect(errs.some((e) => /0\.01/i.test(e) || /amount/i.test(e))).toBe(true);
  });

  it('fails with invalid method', async () => {
    const errs = await validateDto(CreatePayoutDto, {
      amount: 50,
      currency: 'USD',
      method: 'crypto',
    });
    expect(errs.some((e) => /method/i.test(e) || /fiat|stellar/i.test(e))).toBe(true);
  });

  it('fails when currency is missing', async () => {
    const errs = await validateDto(CreatePayoutDto, {
      amount: 50,
      method: 'stellar',
    });
    expect(errs.some((e) => /currency/i.test(e))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CreatePayoutMethodDto
// ---------------------------------------------------------------------------
describe('CreatePayoutMethodDto validation', () => {
  it('passes with valid bank_account type', async () => {
    const errs = await validateDto(CreatePayoutMethodDto, {
      type: 'bank_account',
      accountNumber: '1234567890',
      routingNumber: '021000021',
      bankName: 'Chase Bank',
      accountHolderName: 'John Doe',
      country: 'US',
      currency: 'USD',
    });
    expect(errs).toHaveLength(0);
  });

  it('fails when type is not in allowed list', async () => {
    const errs = await validateDto(CreatePayoutMethodDto, {
      type: 'paypal',
    });
    expect(errs.some((e) => /type/i.test(e))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// MintNftDto
// ---------------------------------------------------------------------------
describe('MintNftDto validation', () => {
  it('passes with minimal valid data', async () => {
    const errs = await validateDto(MintNftDto, {
      clipId: 1,
      creatorWallet: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
    });
    expect(errs).toHaveLength(0);
  });

  it('fails when clipId is zero', async () => {
    const errs = await validateDto(MintNftDto, {
      clipId: 0,
      creatorWallet: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
    });
    expect(errs.some((e) => /clipId/i.test(e))).toBe(true);
  });

  it('fails when creatorWallet is empty', async () => {
    const errs = await validateDto(MintNftDto, {
      clipId: 1,
      creatorWallet: '',
    });
    expect(errs.some((e) => /creatorWallet/i.test(e))).toBe(true);
  });

  it('fails when royaltyBps exceeds 1500', async () => {
    const errs = await validateDto(MintNftDto, {
      clipId: 1,
      creatorWallet: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
      royaltyBps: 2000,
    });
    expect(errs.some((e) => /royaltyBps/i.test(e) || /1500/i.test(e))).toBe(true);
  });

  it('fails when metadataUri is not a valid URL', async () => {
    const errs = await validateDto(MintNftDto, {
      clipId: 1,
      creatorWallet: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
      metadataUri: 'not-a-url',
    });
    expect(errs.some((e) => /metadataUri/i.test(e) || /url/i.test(e))).toBe(true);
  });
});
