/**
 * Canonical subscription plan identifiers.
 *
 * Issue #1372 — centralise subscription plan validation.
 *
 * These values are the only plan identifiers accepted through the API.
 * Pricing and duration for each plan are controlled exclusively by backend
 * configuration (StellarConfig.planAmounts, activateSubscription's
 * planDurations map, and the STELLAR_PLAN_*_AMOUNT env vars). Users cannot
 * submit or influence prices through any DTO.
 *
 * When adding a new plan, update:
 *   1. SUBSCRIPTION_PLANS (this file)
 *   2. StellarConfig.planAmounts     (src/stellar/stellar.config.ts)
 *   3. activateSubscription's planDurations map (stellar-payment.service.ts)
 *   4. PLAN_DURATION_DAYS            (src/stellar/stellar-payment.listener.ts)
 */
export const SUBSCRIPTION_PLANS = ['basic', 'pro', 'elite', 'agency'] as const;

export type SubscriptionPlan = (typeof SUBSCRIPTION_PLANS)[number];

/**
 * Supported billing intervals for subscription renewals.
 *
 * The interval is informational at the DTO level — actual renewal logic is
 * driven by backend configuration. Stored on the subscription record so the
 * UI can display it and the billing pipeline can act on it.
 */
export const BILLING_INTERVALS = ['monthly', 'yearly'] as const;

export type BillingInterval = (typeof BILLING_INTERVALS)[number];
