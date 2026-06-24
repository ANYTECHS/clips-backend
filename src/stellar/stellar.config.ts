import { Injectable } from '@nestjs/common';

/**
 * All Stellar-related configuration read from environment variables.
 *
 * STELLAR_HORIZON_URL        — Horizon server URL (default: testnet)
 * STELLAR_RECEIVER_ADDRESS   — ClipCash platform account that receives payments
 * STELLAR_ASSET_CODE         — Asset code to accept (e.g. "XLM" or "USDC")
 * STELLAR_ASSET_ISSUER       — Issuer address for non-native assets (empty = XLM)
 * STELLAR_POLL_INTERVAL_MS   — How often to poll when streaming is unavailable (default: 10 000)
 *
 * Plan → amount mapping (in asset units, as strings for exact decimal comparison):
 * STELLAR_PLAN_BASIC_AMOUNT  — e.g. "5"
 * STELLAR_PLAN_PRO_AMOUNT    — e.g. "15"
 * STELLAR_PLAN_ELITE_AMOUNT  — e.g. "30"
 */
@Injectable()
export class StellarConfig {
  readonly horizonUrl: string;
  readonly receiverAddress: string;
  readonly assetCode: string;
  readonly assetIssuer: string;
  readonly pollIntervalMs: number;

  /** Map of plan name → expected payment amount string */
  readonly planAmounts: Record<string, string>;

  constructor() {
    this.horizonUrl =
      process.env.STELLAR_HORIZON_URL ?? 'https://horizon-testnet.stellar.org';
    this.receiverAddress = process.env.STELLAR_RECEIVER_ADDRESS ?? '';
    this.assetCode = process.env.STELLAR_ASSET_CODE ?? 'XLM';
    this.assetIssuer = process.env.STELLAR_ASSET_ISSUER ?? '';
    this.pollIntervalMs = parseInt(
      process.env.STELLAR_POLL_INTERVAL_MS ?? '10000',
      10,
    );
    this.planAmounts = {
      basic: process.env.STELLAR_PLAN_BASIC_AMOUNT ?? '5',
      pro: process.env.STELLAR_PLAN_PRO_AMOUNT ?? '15',
      elite: process.env.STELLAR_PLAN_ELITE_AMOUNT ?? '30',
    };
  }
}
