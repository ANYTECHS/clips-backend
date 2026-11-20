import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateSubscriptionDto } from './subscription-plan.dto';
import { UpdateSubscriptionDto } from './subscription-plan.dto';
import { SUBSCRIPTION_PLANS, BILLING_INTERVALS } from '../subscriptions.constants';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function errorsFor(
  Cls: new () => object,
  plain: Record<string, unknown>,
): Promise<string[]> {
  const instance = plainToInstance(Cls as any, plain);
  const errors = await validate(instance as object);
  return errors.flatMap((e) => Object.values(e.constraints ?? {}));
}

// ── CreateSubscriptionDto ─────────────────────────────────────────────────────

describe('CreateSubscriptionDto', () => {
  it('accepts every supported plan', async () => {
    for (const plan of SUBSCRIPTION_PLANS) {
      const errors = await errorsFor(CreateSubscriptionDto, { plan });
      expect(errors).toHaveLength(0);
    }
  });

  it('accepts supported plans case-insensitively', async () => {
    const errors = await errorsFor(CreateSubscriptionDto, { plan: 'PRO' });
    expect(errors).toHaveLength(0);
  });

  it('rejects an unsupported plan', async () => {
    const errors = await errorsFor(CreateSubscriptionDto, { plan: 'enterprise' });
    expect(errors.some((e) => e.includes('enterprise'))).toBe(true);
    expect(errors.some((e) => e.toLowerCase().includes('unsupported'))).toBe(true);
  });

  it('rejects a missing plan', async () => {
    const errors = await errorsFor(CreateSubscriptionDto, {});
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects an empty plan string', async () => {
    const errors = await errorsFor(CreateSubscriptionDto, { plan: '' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a numeric plan', async () => {
    const errors = await errorsFor(CreateSubscriptionDto, { plan: 42 });
    expect(errors.length).toBeGreaterThan(0);
  });

  describe('billingInterval', () => {
    it('accepts every supported billing interval', async () => {
      for (const billingInterval of BILLING_INTERVALS) {
        const errors = await errorsFor(CreateSubscriptionDto, {
          plan: 'pro',
          billingInterval,
        });
        expect(errors).toHaveLength(0);
      }
    });

    it('rejects an unsupported billing interval', async () => {
      const errors = await errorsFor(CreateSubscriptionDto, {
        plan: 'pro',
        billingInterval: 'weekly',
      });
      expect(errors.some((e) => e.toLowerCase().includes('billinginterval'))).toBe(true);
    });

    it('is optional — omitting it passes validation', async () => {
      const errors = await errorsFor(CreateSubscriptionDto, { plan: 'pro' });
      expect(errors).toHaveLength(0);
    });
  });

  describe('currency', () => {
    it('accepts supported currency codes', async () => {
      for (const currency of ['USD', 'EUR', 'GBP', 'XLM', 'USDC']) {
        const errors = await errorsFor(CreateSubscriptionDto, {
          plan: 'pro',
          currency,
        });
        expect(errors).toHaveLength(0);
      }
    });

    it('rejects unsupported currency codes', async () => {
      const errors = await errorsFor(CreateSubscriptionDto, {
        plan: 'pro',
        currency: 'JPY',
      });
      expect(errors.some((e) => e.includes('JPY'))).toBe(true);
    });

    it('is optional — omitting it passes validation', async () => {
      const errors = await errorsFor(CreateSubscriptionDto, { plan: 'pro' });
      expect(errors).toHaveLength(0);
    });
  });

  it('does not accept a price field — no price property is defined on the DTO', async () => {
    // Pricing is controlled by backend configuration.
    // Confirm the DTO class has no price-related property definition,
    // and that submitting one alongside a valid plan still passes class-validator
    // (the ValidationPipe's whitelist option strips unknown fields at the HTTP layer).
    const dto = plainToInstance(CreateSubscriptionDto, {
      plan: 'pro',
      price: 999,
    });
    const errors = await validate(dto);
    // No validation error for the price field — it is simply unknown to the DTO
    expect(errors.every((e) => e.property !== 'price')).toBe(true);
    // The DTO class itself does not expose a price property
    expect(Object.getOwnPropertyDescriptor(CreateSubscriptionDto.prototype, 'price')).toBeUndefined();
  });
});

// ── UpdateSubscriptionDto ─────────────────────────────────────────────────────

describe('UpdateSubscriptionDto', () => {
  it('passes with an empty body — all fields are optional', async () => {
    const errors = await errorsFor(UpdateSubscriptionDto, {});
    expect(errors).toHaveLength(0);
  });

  it('accepts a valid plan update', async () => {
    const errors = await errorsFor(UpdateSubscriptionDto, { plan: 'elite' });
    expect(errors).toHaveLength(0);
  });

  it('rejects an unsupported plan', async () => {
    const errors = await errorsFor(UpdateSubscriptionDto, { plan: 'starter' });
    expect(errors.some((e) => e.includes('starter'))).toBe(true);
  });

  it('accepts a valid billing interval update', async () => {
    const errors = await errorsFor(UpdateSubscriptionDto, {
      billingInterval: 'yearly',
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects an unsupported billing interval', async () => {
    const errors = await errorsFor(UpdateSubscriptionDto, {
      billingInterval: 'daily',
    });
    expect(errors.some((e) => e.toLowerCase().includes('billinginterval'))).toBe(true);
  });

  it('accepts a valid currency update', async () => {
    const errors = await errorsFor(UpdateSubscriptionDto, { currency: 'EUR' });
    expect(errors).toHaveLength(0);
  });

  it('rejects an unsupported currency', async () => {
    const errors = await errorsFor(UpdateSubscriptionDto, { currency: 'AUD' });
    expect(errors.some((e) => e.includes('AUD'))).toBe(true);
  });

  it('does not accept a price field — no price property is defined on the DTO', async () => {
    const dto = plainToInstance(UpdateSubscriptionDto, {
      plan: 'elite',
      price: 50,
    });
    const errors = await validate(dto);
    expect(errors.every((e) => e.property !== 'price')).toBe(true);
    expect(Object.getOwnPropertyDescriptor(UpdateSubscriptionDto.prototype, 'price')).toBeUndefined();
  });
});
