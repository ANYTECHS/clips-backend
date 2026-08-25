import {
  IsString,
  IsNotEmpty,
  IsIn,
  Matches,
  Length,
  IsOptional,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DEFAULT_CHAIN, SUPPORTED_CHAINS, SupportedChain } from '../chain.constants';

/** Stellar ED25519 public key: starts with G, exactly 56 Base32 characters */
const STELLAR_PUBLIC_KEY_REGEX = /^G[A-Z2-7]{55}$/;

/** Solana public keys are base58-encoded 32-byte Ed25519 keys (32–44 chars) */
const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Base / EVM addresses: 0x-prefixed 40-character hex */
const EVM_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

/**
 * Wallet provider types supported per chain:
 *  - Stellar: freighter, lobstr, albedo
 *  - Solana:  phantom, solflare, backpack
 *  - Base/EVM: metamask, coinbase, walletconnect
 */
export const SUPPORTED_WALLET_TYPES = [
  // Stellar
  'freighter',
  'lobstr',
  'albedo',
  // Solana
  'phantom',
  'solflare',
  'backpack',
  // EVM / Base
  'metamask',
  'coinbase',
  'walletconnect',
] as const;

export type SupportedWalletType = (typeof SUPPORTED_WALLET_TYPES)[number];

/** @deprecated Use CreateWalletConnectionDto */
export type ConnectWalletDto = CreateWalletConnectionDto;

/**
 * Validates that `address` matches the format expected for the given `chain`.
 */
function validateAddressForChain(address: string, chain: SupportedChain): boolean {
  switch (chain) {
    case 'stellar':
      return STELLAR_PUBLIC_KEY_REGEX.test(address);
    case 'solana':
      return SOLANA_ADDRESS_REGEX.test(address);
    case 'base':
      return EVM_ADDRESS_REGEX.test(address);
    default:
      return false;
  }
}

/**
 * Returns a human-readable chain label for validation error messages.
 */
function chainDisplayName(chain: SupportedChain): string {
  switch (chain) {
    case 'stellar':
      return 'Stellar (G-prefix, Base32, 56 chars)';
    case 'solana':
      return 'Solana (base58, 32–44 chars)';
    case 'base':
      return 'Base (0x-prefixed hex, 42 chars)';
    default:
      return chain;
  }
}

/**
 * Custom class-validator constraint that validates the `publicKey` field
 * against the format expected for the selected `chain`.
 */
@ValidatorConstraint({ name: 'publicKeyForChain', async: false })
export class PublicKeyForChainValidator implements ValidatorConstraintInterface {
  validate(publicKey: string, args: ValidationArguments): boolean {
    const object = args.object as CreateWalletConnectionDto;
    const chain = (object.chain ?? DEFAULT_CHAIN) as SupportedChain;
    return validateAddressForChain(publicKey, chain);
  }

  defaultMessage(args: ValidationArguments): string {
    const object = args.object as CreateWalletConnectionDto;
    const chain = (object.chain ?? DEFAULT_CHAIN) as SupportedChain;
    return `publicKey must be a valid ${chainDisplayName(chain)} address`;
  }
}

export class CreateWalletConnectionDto {
  @ApiProperty({
    description:
      'The wallet address (e.g., Stellar G address, Solana base58, or 0x EVM address)',
    example: 'GABC...XYZ',
  })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiPropertyOptional({
    description: `The blockchain network. Defaults to "${DEFAULT_CHAIN}" when omitted.`,
    enum: SUPPORTED_CHAINS,
    default: DEFAULT_CHAIN,
  })
  @IsOptional()
  @IsString()
  @IsIn([...SUPPORTED_CHAINS], {
    message: `chain must be one of: ${SUPPORTED_CHAINS.join(', ')}`,
  })
  chain?: string;

  @ApiProperty({
    description: 'The wallet provider type',
    example: 'freighter',
    enum: SUPPORTED_WALLET_TYPES,
  })
  @IsString()
  @IsNotEmpty()
  @IsIn([...SUPPORTED_WALLET_TYPES], {
    message: `type must be one of: ${SUPPORTED_WALLET_TYPES.join(', ')}`,
  })
  type: string;

  @ApiProperty({
    description:
      'Public key for the wallet — format depends on chain: ' +
      'Stellar G-prefix Base32 (56 chars), Solana base58 (32–44 chars), or 0x hex (42 chars)',
    example: 'GABC...XYZ',
  })
  @IsString()
  @IsNotEmpty({ message: 'publicKey must not be empty' })
  @Validate(PublicKeyForChainValidator)
  publicKey: string;

  @ApiProperty({
    description:
      'Base64-encoded signature of signedMessage produced by the wallet',
    example: 'abc123==',
  })
  @IsString()
  @IsNotEmpty({ message: 'signature must not be empty' })
  signature: string;

  @ApiProperty({
    description:
      'The plaintext nonce/message that was signed (proves key ownership)',
    example: 'Connect ClipCash wallet 1719266696836',
  })
  @IsString()
  @IsNotEmpty({ message: 'signedMessage must not be empty' })
  signedMessage: string;
}
