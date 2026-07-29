import { IsInt, IsString, IsNotEmpty, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** @deprecated Use CreateMintPreparationDto */
export type PrepareMintDto = CreateMintPreparationDto;

export class CreateMintPreparationDto {
  @ApiProperty({
    description: 'Clip ID to prepare for minting',
    example: 42,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  clipId: number;

  @ApiProperty({
    description: 'Stellar wallet address that will sign the mint transaction',
    example: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
  })
  @IsString()
  @IsNotEmpty()
  walletAddress: string;

  /**
   * Ed25519 signature over the canonical mint-authorization challenge message:
   *   "ClipCash mint authorization for clip <clipId> by <walletAddress>"
   *
   * When provided the backend verifies the signature before building the XDR,
   * ensuring the caller controls the private key for `walletAddress`.
   *
   * Encoding: 128-char lowercase hex or standard/URL-safe base64.
   * Produced by Freighter: stellarSdk.sign(challenge, privateKey)
   *       or Albedo:       albedo.signMessage({ message: challenge })
   */
  @ApiPropertyOptional({
    description:
      'Ed25519 signature (hex or base64) over the challenge message ' +
      '"ClipCash mint authorization for clip <clipId> by <walletAddress>". ' +
      'When supplied the server verifies wallet ownership before building the XDR. ' +
      'Omit during testing; required for production mints.',
    example:
      'a3f2c1d4e5b6a7f8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2' +
      'c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4',
  })
  @IsOptional()
  @IsString()
  walletSignature?: string;
}
