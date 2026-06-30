import { IsString, IsNotEmpty, IsIn, Matches, Length, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DEFAULT_CHAIN, SUPPORTED_CHAINS } from '../chain.constants';

/** Stellar ED25519 public key: starts with G, exactly 56 Base32 characters */
const STELLAR_PUBLIC_KEY_REGEX = /^G[A-Z2-7]{55}$/;

/** @deprecated Use CreateWalletConnectionDto */
export type ConnectWalletDto = CreateWalletConnectionDto;

export class CreateWalletConnectionDto {
  @ApiProperty({
    description: 'The wallet address (e.g., Stellar G address)',
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

  @ApiProperty({ description: 'The wallet provider type', example: 'freighter' })
  @IsString()
  @IsNotEmpty()
  @IsIn(['freighter', 'lobstr', 'albedo'])
  type: string;

  @ApiProperty({
    description:
      'Stellar ED25519 public key — must start with G and be exactly 56 Base32 characters',
    example: 'GABC...XYZ',
  })
  @IsString()
  @IsNotEmpty({ message: 'publicKey must not be empty' })
  @Length(56, 56, { message: 'publicKey must be exactly 56 characters' })
  @Matches(STELLAR_PUBLIC_KEY_REGEX, {
    message: 'publicKey must be a valid Stellar address (G-prefix, Base32, 56 chars)',
  })
  publicKey: string;

  @ApiProperty({
    description: 'Base64-encoded signature of signedMessage produced by the wallet',
    example: 'abc123==',
  })
  @IsString()
  @IsNotEmpty({ message: 'signature must not be empty' })
  signature: string;

  @ApiProperty({
    description: 'The plaintext nonce/message that was signed (proves key ownership)',
    example: 'Connect ClipCash wallet 1719266696836',
  })
  @IsString()
  @IsNotEmpty({ message: 'signedMessage must not be empty' })
  signedMessage: string;
}
