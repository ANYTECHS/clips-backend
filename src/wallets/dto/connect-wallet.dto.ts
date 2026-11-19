import {
  IsString,
  IsNotEmpty,
  IsIn,
  IsOptional,
  MaxLength,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DEFAULT_CHAIN, SUPPORTED_CHAINS, SupportedChain } from '../chain.constants';
import {
  chainDisplayName,
  validateAddressForChain,
} from '@clipcash/shared';

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
 * Custom class-validator constraint that validates the `publicKey` field
 * against the format expected for the selected `chain`.
 */
@ValidatorConstraint({ name: 'publicKeyForChain', async: false })
export class PublicKeyForChainValidator implements ValidatorConstraintInterface {
  validate(value: string, args: ValidationArguments): boolean {
    const object = args.object as CreateWalletConnectionDto;
    const chain = (object.chain ?? DEFAULT_CHAIN) as SupportedChain;
    return typeof value === 'string' && validateAddressForChain(value, chain);
  }

  defaultMessage(args: ValidationArguments): string {
    const object = args.object as CreateWalletConnectionDto;
    const chain = (object.chain ?? DEFAULT_CHAIN) as SupportedChain;
    // Never echo the submitted value (may be a secret key pasted by mistake).
    return `${args.property} must be a valid ${chainDisplayName(chain)} address`;
  }
}

/**
 * Issue #1365 — wallet connection request validation.
 *
 * This DTO only validates the *shape* of the request (address format for the
 * selected chain, supported chain/wallet type, presence and size of the
 * signature + signed nonce). Cryptographic signature verification is a
 * separate security operation performed by the wallet service and must not be
 * moved into class-validator constraints.
 */
export class CreateWalletConnectionDto {
  @ApiProperty({
    description:
      'The wallet address (e.g., Stellar G address, Solana base58, or 0x EVM address)',
    example: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7',
  })
  @IsString()
  @IsNotEmpty({ message: 'address must not be empty' })
  @Validate(PublicKeyForChainValidator)
  address: string;

  @ApiPropertyOptional({
    description: `The blockchain network. Defaults to "${DEFAULT_CHAIN}" when omitted.`,
    enum: SUPPORTED_CHAINS,
    default: DEFAULT_CHAIN,
    example: DEFAULT_CHAIN,
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
    example: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7',
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
  @MaxLength(1024)
  signature: string;

  @ApiProperty({
    description:
      'The plaintext nonce/message that was signed (proves key ownership)',
    example: 'Connect ClipCash wallet 1719266696836',
  })
  @IsString()
  @IsNotEmpty({ message: 'signedMessage must not be empty' })
  @MaxLength(512)
  signedMessage: string;
}

export class WalletConnectionResponseDto {
  @ApiProperty({ example: 'b3f1c2a0-1234-4cde-9f00-abcdef123456' })
  id: string;

  @ApiProperty({ example: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7' })
  address: string;

  @ApiProperty({ enum: SUPPORTED_CHAINS, example: DEFAULT_CHAIN })
  chain: string;

  @ApiProperty({ enum: SUPPORTED_WALLET_TYPES, example: 'freighter' })
  type: string;

  @ApiProperty({ example: '2026-11-19T12:00:00.000Z', format: 'date-time' })
  createdAt: string;
}
