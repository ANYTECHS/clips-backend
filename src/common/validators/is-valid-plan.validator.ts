import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import {
  SUBSCRIPTION_PLANS,
  SubscriptionPlan,
} from '../../subscriptions/subscriptions.constants';

export { SUBSCRIPTION_PLANS, SubscriptionPlan };

/**
 * Normalise an arbitrary string to the lowercase form used in
 * SUBSCRIPTION_PLANS (all plan identifiers are lowercase).
 */
export function normalizePlanIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Returns true when `value` is a recognised subscription plan identifier
 * after normalisation.
 */
export function isValidPlan(value: string): value is SubscriptionPlan {
  return SUBSCRIPTION_PLANS.includes(
    normalizePlanIdentifier(value) as SubscriptionPlan,
  );
}

@ValidatorConstraint({ name: 'isValidPlan', async: false })
export class IsValidPlanConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return false;
    }
    return isValidPlan(value);
  }

  defaultMessage(args: ValidationArguments): string {
    const value = args.value;
    if (typeof value !== 'string') {
      return 'plan must be a string';
    }
    return (
      `Unsupported plan: "${value.trim()}". ` +
      `Supported plans: ${SUBSCRIPTION_PLANS.join(', ')}`
    );
  }
}
