import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import {
  ApiProperty,
  ApiPropertyOptional,
  ApiExtraModels,
} from '@nestjs/swagger';
import { TrimString } from '../../common/decorators/trim-string.decorator';
import { IsValidPlan } from '../../common/validators/decorators';
import { IsSupportedCurrency } from '../../common/validators/decorators';
import {
  SUBSCRIPTION_PLANS,
  BILLING_INTERVALS,
  BillingInterval,
} from '../subscriptions.constants';
import { CURRENCY_ENUM } from '../../common/validators/is-supported-currency.validator';

/**
 * Request body for creating a new subscription.
 *
 * Issue #1372 — plan identifiers are validated against the server-side
 * allowlist. Users cannot submit arbitrary prices; pricing and duration are
 * determined entirely by backend configuration.
 */
@ApiExtraModels()
export class CreateSubscriptionDto {
  /**
   * Subscription plan identifier. Must be one of the supported plans defined
   * in SUBSCRIPTION_PLANS. Accepted values: basic, pro, elite, agency.
   * Case-insensitive.
   */
  @ApiProperty({
    enum: SUBSCRIPTION_PLANS,
    example: 'pro',
    description:
      'Subscription plan identifier. ' +
      `Supported values: ${SUBSCRIPTION_PLANS.join(', ')}. ` +
      'Plan pricing and duration are set by backend configuration; ' +
      'users cannot supply or override prices.',
  })
  @TrimString()
  @IsString({ message: 'plan must be a string' })
  @IsNotEmpty({ message: 'plan is required' })
  @IsValidPlan()
  plan: string;

  /**
   * Billing interval. Optional at creation time — defaults to monthly when
   * omitted. The interval is stored on the record and used by the billing
   * pipeline to schedule renewals; it does not affect the initial payment
   * amount.
   */
  @ApiPropertyOptional({
    enum: BILLING_INTERVALS,
    example: 'monthly',
    description:
      'Billing interval. ' +
      `Supported values: ${BILLING_INTERVALS.join(', ')}. ` +
      'Defaults to monthly when omitted.',
  })
  @IsOptional()
  @TrimString()
  @IsEnum(BILLING_INTERVALS, {
    message: `billingInterval must be one of: ${BILLING_INTERVALS.join(', ')}`,
  })
  billingInterval?: BillingInterval;

  /**
   * Payment currency. Must be one of the supported ISO 4217 codes.
   * Optional — defaults to USD when omitted. The currency is used to
   * select the correct payout pipeline; it does not alter plan pricing.
   */
  @ApiPropertyOptional({
    enum: CURRENCY_ENUM,
    example: 'USD',
    description:
      'Payment currency. ' +
      `Supported values: ${CURRENCY_ENUM.join(', ')}. ` +
      'Defaults to USD when omitted.',
  })
  @IsOptional()
  @TrimString()
  @IsString({ message: 'currency must be a string' })
  @IsSupportedCurrency()
  currency?: string;
}

/**
 * Request body for updating an existing subscription.
 *
 * All fields are optional — only the fields supplied are changed.
 * Partial updates are accepted so that, for example, a billing interval
 * change does not require the caller to re-send the plan.
 */
@ApiExtraModels()
export class UpdateSubscriptionDto {
  /**
   * New subscription plan. When supplied it must be a known plan identifier.
   * Plan pricing and duration are determined by backend configuration.
   */
  @ApiPropertyOptional({
    enum: SUBSCRIPTION_PLANS,
    example: 'elite',
    description:
      'New plan identifier. ' +
      `Supported values: ${SUBSCRIPTION_PLANS.join(', ')}. ` +
      'Pricing is controlled by backend configuration.',
  })
  @IsOptional()
  @TrimString()
  @IsString({ message: 'plan must be a string' })
  @IsValidPlan()
  plan?: string;

  /**
   * New billing interval. When supplied it must be a supported value.
   */
  @ApiPropertyOptional({
    enum: BILLING_INTERVALS,
    example: 'yearly',
    description:
      'New billing interval. ' +
      `Supported values: ${BILLING_INTERVALS.join(', ')}.`,
  })
  @IsOptional()
  @TrimString()
  @IsEnum(BILLING_INTERVALS, {
    message: `billingInterval must be one of: ${BILLING_INTERVALS.join(', ')}`,
  })
  billingInterval?: BillingInterval;

  /**
   * New payment currency. Must be a supported ISO 4217 code when supplied.
   */
  @ApiPropertyOptional({
    enum: CURRENCY_ENUM,
    example: 'EUR',
    description:
      'New payment currency. ' +
      `Supported values: ${CURRENCY_ENUM.join(', ')}.`,
  })
  @IsOptional()
  @TrimString()
  @IsString({ message: 'currency must be a string' })
  @IsSupportedCurrency()
  currency?: string;
}

/**
 * Response shape for a subscription plan record.
 */
export class SubscriptionPlanResponseDto {
  @ApiProperty({ example: 1, description: 'Subscription ID' })
  id: number;

  @ApiProperty({
    enum: SUBSCRIPTION_PLANS,
    example: 'pro',
    description: 'Active subscription plan',
  })
  plan: string;

  @ApiProperty({
    example: 'active',
    enum: ['active', 'cancelled', 'expired', 'pending'],
    description: 'Current subscription status',
  })
  status: string;

  @ApiProperty({
    example: 'stellar',
    enum: ['stellar', 'stripe'],
    description: 'Payment method used for this subscription',
  })
  paymentMethod: string;

  @ApiPropertyOptional({
    enum: BILLING_INTERVALS,
    example: 'monthly',
    description: 'Billing interval',
  })
  billingInterval?: BillingInterval;

  @ApiPropertyOptional({
    enum: CURRENCY_ENUM,
    example: 'USD',
    description: 'Payment currency',
  })
  currency?: string;

  @ApiProperty({
    example: '2026-07-01T00:00:00.000Z',
    description: 'Subscription start date',
  })
  startDate: Date;

  @ApiPropertyOptional({
    example: '2026-08-01T00:00:00.000Z',
    description: 'Subscription end date',
    nullable: true,
  })
  endDate?: Date | null;

  @ApiProperty({
    example: '2026-07-01T00:00:00.000Z',
    description: 'Creation timestamp',
  })
  createdAt: Date;
}
