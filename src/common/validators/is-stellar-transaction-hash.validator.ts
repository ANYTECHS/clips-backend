import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

/**
 * Stellar transaction hashes are SHA-256 digests represented as 64 lowercase
 * hexadecimal characters.  This validator enforces that format only — it does
 * not make a network call to check whether the transaction exists on-chain.
 * Keep existence checks in the service layer (e.g. StellarPayoutVerificationService).
 */
export const STELLAR_TX_HASH_REGEX = /^[0-9a-f]{64}$/;

@ValidatorConstraint({ name: 'isStellarTransactionHash', async: false })
export class IsStellarTransactionHashConstraint
  implements ValidatorConstraintInterface
{
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || value.length === 0) {
      return false;
    }
    return STELLAR_TX_HASH_REGEX.test(value);
  }

  defaultMessage(args: ValidationArguments): string {
    const value = args.value;
    if (typeof value !== 'string' || value.length === 0) {
      return 'transactionHash must not be empty';
    }
    return 'transactionHash must be a 64-character lowercase hexadecimal string';
  }
}
